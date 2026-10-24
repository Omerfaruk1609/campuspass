import { ethers } from "ethers";
import deployment from "./deployment.json" with { type: "json" };

export const MONAD_CHAIN_ID = 10143;
export const MONAD_CHAIN_ID_HEX = "0x279f";
export const MONAD_RPC_URL = "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER_URL = "https://testnet.monadexplorer.com";

export const CONTRACT_ADDRESS = deployment.address;

export const CAMPUS_PASS_ABI = [
  "function nextEventId() view returns (uint256)",
  "function events(uint256) view returns (uint256 id, address organizer, string title, uint256 capacity, uint256 registeredCount, bool active)",
  "function registered(uint256, address) view returns (bool)",
  "function attended(uint256, address) view returns (bool)",
  "function createEvent(string title, uint256 capacity) returns (uint256)",
  "function registerForEvent(uint256 eventId)",
  "function markAttendance(uint256 eventId, address participant)",
  "event EventCreated(uint256 indexed eventId, address indexed organizer, string title, uint256 capacity)",
  "event UserRegistered(uint256 indexed eventId, address indexed participant)",
  "event AttendanceMarked(uint256 indexed eventId, address indexed participant)"
];

export const MONAD_NETWORK_PARAMS = {
  chainId: MONAD_CHAIN_ID_HEX,
  chainName: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: [MONAD_RPC_URL],
  blockExplorerUrls: [MONAD_EXPLORER_URL],
};

export function getReadOnlyContract() {
  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL, {
    name: "monad-testnet",
    chainId: MONAD_CHAIN_ID,
  });
  return new ethers.Contract(CONTRACT_ADDRESS, CAMPUS_PASS_ABI, provider);
}

export async function getSignerContract() {
  if (!window.ethereum) {
    throw new Error("EVM uyumlu bir cüzdan (MetaMask, Rabby vb.) bulunamadı.");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== MONAD_CHAIN_ID) {
    throw new Error(
      `Yanlış ağdasınız (Chain ID: ${network.chainId}). Lütfen Monad Testnet (10143) ağına geçin.`
    );
  }
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, CAMPUS_PASS_ABI, signer);
}

export async function switchToMonadTestnet() {
  if (!window.ethereum) {
    throw new Error("Cüzdan eklentisi bulunamadı.");
  }
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    // 4902: Ağ cüzdanda henüz ekli değilse otomatik ekle
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [MONAD_NETWORK_PARAMS],
      });
    } else {
      throw switchError;
    }
  }
}

export function shortenAddress(address) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function parseBlockchainError(error) {
  if (!error) return "Bilinmeyen bir hata oluştu.";

  if (error.code === "ACTION_REJECTED" || error.code === 4001) {
    return "İşlem cüzdan üzerinden kullanıcı tarafından reddedildi.";
  }

  const rawMessage =
    error.reason ||
    error.shortMessage ||
    error?.info?.error?.message ||
    error.message ||
    String(error);

  const errorMap = {
    "Title required": "Etkinlik başlığı boş bırakılamaz.",
    "Capacity must be positive": "Etkinlik kapasitesi sıfırdan büyük olmalıdır.",
    "Event does not exist": "Belirtilen etkinlik blokzincirde bulunamadı.",
    "Event is inactive": "Bu etkinlik şu anda aktif değil.",
    "Already registered": "Bu etkinliğe zaten kayıtlısınız.",
    "Event is full": "Etkinlik kontenjanı tamamen dolmuş.",
    "Not organizer": "Bu işlemi yalnızca etkinliği oluşturan organizatör yapabilir.",
    "Not registered": "Belirtilen cüzdan adresi bu etkinliğe kayıtlı değil.",
    "Already attended": "Bu katılımcının katılımı daha önce doğrulanmış.",
  };

  for (const [key, translated] of Object.entries(errorMap)) {
    if (rawMessage.includes(key)) {
      return translated;
    }
  }

  if (rawMessage.includes("insufficient funds")) {
    return "Cüzdanınızda işlem ücretini (gas) karşılamak için yeterli Testnet MON bulunmuyor.";
  }

  return rawMessage;
}
