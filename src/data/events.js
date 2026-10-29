import { ethers } from "ethers";
import deployment from "./deployment.json" with { type: "json" };

const envChainId =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_MONAD_CHAIN_ID
    ? Number(import.meta.env.VITE_MONAD_CHAIN_ID)
    : 10143;

export const MONAD_CHAIN_ID = envChainId;
export const MONAD_CHAIN_ID_HEX = "0x" + envChainId.toString(16);
export const MONAD_RPC_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MONAD_RPC_URL) ||
  "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_MONAD_EXPLORER_URL) ||
  "https://testnet.monadexplorer.com";

export const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONTRACT_ADDRESS) ||
  deployment.address;

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

let cachedReadOnlyProvider = null;
let cachedReadOnlyContract = null;

export function getReadOnlyProvider() {
  if (!cachedReadOnlyProvider) {
    cachedReadOnlyProvider = new ethers.JsonRpcProvider(
      MONAD_RPC_URL,
      {
        name: "monad-testnet",
        chainId: MONAD_CHAIN_ID,
      },
      { staticNetwork: true }
    );
  }
  return cachedReadOnlyProvider;
}

export function getReadOnlyContract() {
  if (!cachedReadOnlyContract) {
    cachedReadOnlyContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CAMPUS_PASS_ABI,
      getReadOnlyProvider()
    );
  }
  return cachedReadOnlyContract;
}

export async function callWithRetry(fn, maxRetries = 3, baseDelayMs = 300) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const errMsg = String(
        err?.info?.error?.message ||
        err?.error?.message ||
        err?.message ||
        ""
      );
      const isRateLimit =
        err?.info?.error?.code === -32011 ||
        err?.code === -32011 ||
        errMsg.includes("requests limited to") ||
        errMsg.includes("rate limit") ||
        errMsg.includes("limited to a 100 range") ||
        err?.status === 429;
      if (isRateLimit && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
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

  const nestedRpcMessage =
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.info?.payload?.error?.message ||
    "";
  const nestedRpcCode = error?.info?.error?.code ?? error?.error?.code;

  const rawMessage =
    error.reason ||
    error.shortMessage ||
    nestedRpcMessage ||
    error.message ||
    String(error);

  const fullDiagnostics = `${rawMessage} ${nestedRpcMessage} ${nestedRpcCode || ""} ${error.code || ""}`;

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

  if (fullDiagnostics.includes("insufficient funds")) {
    return "Cüzdanınızda işlem ücretini (gas) karşılamak için yeterli Testnet MON bulunmuyor.";
  }

  // 1. RPC rate limit veya blok sorgu aralığı sınırı (CALL_EXCEPTION veya missing revert data içine gömülmüş olabilir)
  if (
    fullDiagnostics.includes("-32011") ||
    fullDiagnostics.includes("requests limited to") ||
    fullDiagnostics.includes("limited to a 100 range") ||
    fullDiagnostics.includes("rate limit") ||
    fullDiagnostics.includes("429")
  ) {
    return "Monad Testnet RPC istek veya blok aralığı sınırı aşıldı (en fazla 15 istek/sn). Lütfen birkaç saniye sonra tekrar deneyin.";
  }

  // 2. RPC bağlantı ve ağ sunucusu erişim hataları
  if (
    fullDiagnostics.includes("ENOTFOUND") ||
    fullDiagnostics.includes("ECONNREFUSED") ||
    fullDiagnostics.includes("failed to detect network") ||
    fullDiagnostics.includes("fetch failed") ||
    fullDiagnostics.includes("Failed to fetch") ||
    error.code === "SERVER_ERROR" ||
    error.code === "NETWORK_ERROR"
  ) {
    return "Monad Testnet RPC sunucusuna bağlanılamadı. Lütfen internet bağlantınızı veya RPC URL'sini kontrol edin.";
  }

  // 3. Yanlış ağ / Chain ID uyumsuzluğu
  if (
    fullDiagnostics.includes("Yanlış ağdasınız") ||
    fullDiagnostics.includes("network mismatch") ||
    fullDiagnostics.includes("Chain ID")
  ) {
    return "Yanlış ağdasınız. Lütfen cüzdanınızdan Monad Testnet (Chain ID 10143) ağına geçin.";
  }

  // 4. SIWE / Oturum yetkilendirme hataları
  if (
    fullDiagnostics.includes("SESSION_REQUIRED") ||
    fullDiagnostics.includes("SIWE kimlik doğrulaması") ||
    fullDiagnostics.includes("Unauthorized")
  ) {
    return "SIWE oturumunuz bulunmuyor veya süresi dolmuş. Lütfen cüzdanınızla tekrar oturum açın.";
  }

  // 5. Akıllı sözleşme yokluğu, eksik deployment veya boş revert verisi (gerçek revert)
  if (
    rawMessage.includes("missing revert data") ||
    rawMessage.includes("could not decode result data") ||
    (error.code === "BAD_DATA" && String(error.value) === "0x") ||
    (error.code === "CALL_EXCEPTION" && (!error.data || error.data === "0x"))
  ) {
    return "Akıllı sözleşmeye ulaşılamadı veya belirtilen adreste sözleşme kodu bulunamadı. Lütfen ağın Monad Testnet (10143) olduğunu ve sözleşme adresini kontrol edin.";
  }

  return rawMessage;
}
