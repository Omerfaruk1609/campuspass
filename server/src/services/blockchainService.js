import { ethers } from "ethers";
import { CAMPUS_PASS_ABI } from "../../../src/data/events.js";
import { env } from "../utils/env.js";
import { ApiError } from "../utils/errors.js";

/**
 * Blokzincir Okuma ve Doğrulama Servisi
 * - Salt-okunur RPC provider kullanır; asla private key gerektirmez.
 * - Organizatör yetkisini ve öğrenci kayıt/katılım durumunu canlı olarak doğrular.
 */
export function createBlockchainService({
  contract = null,
  provider = null,
  chainId = env.MONAD_CHAIN_ID,
  contractAddress = env.CONTRACT_ADDRESS_CHECKSUM,
  rpcUrl = env.MONAD_RPC_URL,
} = {}) {
  const normalizedContractAddress = ethers.getAddress(contractAddress).toLowerCase();
  const checksumContractAddress = ethers.getAddress(contractAddress);

  function getContractInstance() {
    if (contract) return contract;
    const activeProvider =
      provider ||
      new ethers.JsonRpcProvider(
        rpcUrl,
        {
          name: "monad-testnet",
          chainId: Number(chainId),
        },
        {
          staticNetwork: true,
        }
      );
    return new ethers.Contract(checksumContractAddress, CAMPUS_PASS_ABI, activeProvider);
  }

  async function getOnChainEvent(eventId) {
    const numId = Number(eventId);
    if (!Number.isSafeInteger(numId) || numId <= 0) {
      throw ApiError.badRequest("Geçersiz etkinlik kimliği (eventId).");
    }

    let rawEvent;
    try {
      const c = getContractInstance();
      rawEvent = await c.events(numId);
    } catch (err) {
      throw ApiError.badGateway(
        "Blokzincir düğümünden (RPC) etkinlik bilgisi okunamadı.",
        { reason: err.message }
      );
    }

    if (!rawEvent || Number(rawEvent.id) === 0) {
      return null;
    }

    return {
      id: Number(rawEvent.id),
      chainId: Number(chainId),
      contractAddress: checksumContractAddress,
      contractAddressNormalized: normalizedContractAddress,
      organizer: ethers.getAddress(rawEvent.organizer),
      organizerNormalized: ethers.getAddress(rawEvent.organizer).toLowerCase(),
      title: String(rawEvent.title),
      capacity: Number(rawEvent.capacity),
      registeredCount: Number(rawEvent.registeredCount),
      active: Boolean(rawEvent.active),
    };
  }

  async function verifyOnChainOrganizer(eventId, callerWalletAddress) {
    if (!callerWalletAddress || !ethers.isAddress(callerWalletAddress)) {
      throw ApiError.unauthorized("Geçerli bir oturum cüzdan adresi bulunamadı.");
    }

    const onChainEvent = await getOnChainEvent(eventId);
    if (!onChainEvent) {
      throw ApiError.notFound(`Etkinlik #${eventId} blokzincir üzerinde bulunamadı.`);
    }

    const normalizedCaller = ethers.getAddress(callerWalletAddress).toLowerCase();
    if (onChainEvent.organizerNormalized !== normalizedCaller) {
      throw ApiError.forbidden(
        "Yetkisiz işlem: Yalnızca blokzincir üzerindeki etkinlik organizatörü bu işlemi gerçekleştirebilir."
      );
    }

    return onChainEvent;
  }

  async function getAllOnChainEvents() {
    let nextId;
    try {
      const c = getContractInstance();
      nextId = Number(await c.nextEventId());
    } catch (err) {
      throw ApiError.badGateway(
        "Blokzincir üzerinden toplam etkinlik sayısı (nextEventId) okunamadı.",
        { reason: err.message }
      );
    }

    const total = nextId - 1;
    if (total <= 0) return [];

    const ids = Array.from({ length: total }, (_, idx) => idx + 1);
    const events = await Promise.all(ids.map((id) => getOnChainEvent(id)));
    return events.filter(Boolean);
  }

  async function getStudentEventOnChainState(eventId, walletAddress) {
    const checksumWallet = ethers.getAddress(walletAddress);
    try {
      const c = getContractInstance();
      const [isRegistered, isAttended] = await Promise.all([
        c.registered(eventId, checksumWallet),
        c.attended(eventId, checksumWallet),
      ]);
      return {
        isRegistered: Boolean(isRegistered),
        isAttended: Boolean(isAttended),
      };
    } catch (err) {
      throw ApiError.badGateway(
        "Blokzincir üzerinden öğrenci kayıt/katılım durumu okunamadı.",
        { reason: err.message }
      );
    }
  }

  return {
    chainId: Number(chainId),
    contractAddress: checksumContractAddress,
    contractAddressNormalized: normalizedContractAddress,
    getContractInstance,
    getOnChainEvent,
    verifyOnChainOrganizer,
    getAllOnChainEvents,
    getStudentEventOnChainState,
  };
}
