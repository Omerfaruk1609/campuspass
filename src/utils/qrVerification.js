import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  getReadOnlyContract,
} from "../data/events.js";

export const QR_VERSION = "CP1";
export const QR_TTL_SECONDS = 180; // 3 dakika maksimum geçerlilik süresi
const USED_NONCES_STORAGE_KEY = "campuspass_used_qr_nonces_v1";
const NONCE_HEX_REGEX = /^0x[0-9a-fA-F]{32}$/;
const SIGNATURE_HEX_REGEX = /^0x[0-9a-fA-F]{130}$/;

// Tarayıcı localStorage erişilemediğinde (veya Node test ortamında) bellek içi yedek depo
const memoryUsedNonces = new Map();

/**
 * Kriptografik olarak güvenli, tek kullanımlık 128-bit hex nonce üretir.
 */
export function generateSecureNonce() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * İmzalanacak deterministik (canonical) mesaj metnini oluşturur.
 * Öğrenci cüzdanında (MetaMask vb.) imzalarken bu metni açıkça görür.
 */
export function buildCanonicalQrMessage({
  version,
  chainId,
  contractAddress,
  eventId,
  participant,
  nonce,
  issuedAt,
  expiresAt,
}) {
  return [
    "CampusPass Katilim Dogrulama",
    `Version: ${version}`,
    `ChainId: ${Number(chainId)}`,
    `Contract: ${ethers.getAddress(contractAddress)}`,
    `EventId: ${Number(eventId)}`,
    `Participant: ${ethers.getAddress(participant)}`,
    `Nonce: ${nonce.toLowerCase()}`,
    `IssuedAt: ${Number(issuedAt)}`,
    `ExpiresAt: ${Number(expiresAt)}`,
  ].join("\n");
}

/**
 * Öğrencinin cüzdan imzasıyla kısa ömürlü ve tek kullanımlık QR doğrulama paketi üretir.
 */
export async function createSignedQrTicket(eventId) {
  if (!globalThis.window || !globalThis.window.ethereum) {
    throw new Error("Cüzdan eklentisi bulunamadı.");
  }

  const provider = new ethers.BrowserProvider(globalThis.window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== MONAD_CHAIN_ID) {
    throw new Error("QR kod üretmek için Monad Testnet (10143) ağında olmalısınız.");
  }

  const signer = await provider.getSigner();
  const participant = ethers.getAddress(await signer.getAddress());

  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedAt = nowSeconds;
  const expiresAt = nowSeconds + QR_TTL_SECONDS;
  const nonce = generateSecureNonce();

  const payload = {
    version: QR_VERSION,
    chainId: MONAD_CHAIN_ID,
    contractAddress: ethers.getAddress(CONTRACT_ADDRESS),
    eventId: Number(eventId),
    participant,
    nonce,
    issuedAt,
    expiresAt,
  };

  const message = buildCanonicalQrMessage(payload);
  const signature = await signer.signMessage(message);

  const compactQrObject = {
    v: payload.version,
    c: payload.chainId,
    a: payload.contractAddress,
    e: payload.eventId,
    p: payload.participant,
    n: payload.nonce,
    iat: payload.issuedAt,
    exp: payload.expiresAt,
    sig: signature,
  };

  return {
    ...payload,
    signature,
    qrString: JSON.stringify(compactQrObject),
  };
}

/**
 * QR dizesini (JSON) ayrıştırır, şema ve tip doğrulamasından geçirir.
 */
export function parseQrString(rawString) {
  if (!rawString || typeof rawString !== "string") {
    throw new Error("QR veri içeriği boş veya geçersiz.");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawString.trim());
  } catch {
    throw new Error("QR kodu geçerli bir CampusPass JSON formatında değil.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("QR kod verisi geçerli bir JSON nesnesi değil.");
  }

  const version = parsed.v ?? parsed.version;
  const chainId = Number(parsed.c ?? parsed.chainId);
  const contractAddress = parsed.a ?? parsed.contractAddress;
  const eventId = Number(parsed.e ?? parsed.eventId);
  const participant = parsed.p ?? parsed.participant;
  const nonce = parsed.n ?? parsed.nonce;
  const issuedAt = Number(parsed.iat ?? parsed.issuedAt);
  const expiresAt = Number(parsed.exp ?? parsed.expiresAt);
  const signature = parsed.sig ?? parsed.signature;

  if (
    typeof version !== "string" ||
    !version ||
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    typeof contractAddress !== "string" ||
    !Number.isSafeInteger(eventId) ||
    eventId <= 0 ||
    typeof participant !== "string" ||
    typeof nonce !== "string" ||
    !Number.isSafeInteger(issuedAt) ||
    issuedAt <= 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    typeof signature !== "string"
  ) {
    throw new Error("QR kod içerisinde eksik veya hatalı tipte doğrulama alanları var.");
  }

  if (!ethers.isAddress(contractAddress)) {
    throw new Error("QR kod içindeki sözleşme adresi geçerli bir EVM adresi değil.");
  }

  if (!ethers.isAddress(participant)) {
    throw new Error("QR kod içindeki katılımcı adresi geçerli bir EVM adresi değil.");
  }

  if (!NONCE_HEX_REGEX.test(nonce)) {
    throw new Error("QR kod içindeki tek kullanımlık kod (nonce) 128-bit hex formatında değil.");
  }

  if (!SIGNATURE_HEX_REGEX.test(signature)) {
    throw new Error("QR kod içindeki kriptografik imza 65-bayt hex formatında değil.");
  }

  return {
    version,
    chainId,
    contractAddress: ethers.getAddress(contractAddress),
    eventId,
    participant: ethers.getAddress(participant),
    nonce: nonce.toLowerCase(),
    issuedAt,
    expiresAt,
    signature,
  };
}

function getUsedNoncesMap() {
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      const raw = globalThis.window.localStorage.getItem(USED_NONCES_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
  } catch {
    // localStorage erişilemezse bellek içi depoyu kullan
  }
  return Object.fromEntries(memoryUsedNonces.entries());
}

export function isNonceUsed(nonce) {
  if (typeof nonce !== "string" || !NONCE_HEX_REGEX.test(nonce)) return false;
  const key = nonce.toLowerCase();
  if (memoryUsedNonces.has(key)) return true;
  const map = getUsedNoncesMap();
  return Object.prototype.hasOwnProperty.call(map, key) && Boolean(map[key]);
}

export function markNonceUsed(nonce, txHash = true) {
  if (typeof nonce !== "string" || !NONCE_HEX_REGEX.test(nonce)) return;
  const key = nonce.toLowerCase();
  memoryUsedNonces.set(key, txHash);
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      const map = getUsedNoncesMap();
      map[key] = txHash;
      globalThis.window.localStorage.setItem(USED_NONCES_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // localStorage erişilemezse bellek içi kayıt aktif kalır
  }
}

export function clearUsedNonces() {
  memoryUsedNonces.clear();
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      globalThis.window.localStorage.removeItem(USED_NONCES_STORAGE_KEY);
    }
  } catch {
    // Yoksay
  }
}

/**
 * Algoritma 5.C — 5 Adımlı Güvenlik ve Blokzincir Doğrulaması
 */
export async function verifySignedQrTicket({
  rawQrString,
  expectedEventId,
  connectedAccount,
  expectedChainId = MONAD_CHAIN_ID,
  expectedContractAddress = CONTRACT_ADDRESS,
  contractInstance = null,
  nowSecondsOverride = null,
}) {
  const checks = [];
  let ticket = null;

  // 1. Format ve Bağlam (Ağ, Sözleşme, Etkinlik ID) Kontrolü
  try {
    ticket = parseQrString(rawQrString);

    const isVersionOk = ticket.version === QR_VERSION;
    const isChainOk = ticket.chainId === Number(expectedChainId);
    const isContractOk =
      ticket.contractAddress.toLowerCase() === expectedContractAddress.toLowerCase();
    const isEventMatch = ticket.eventId === Number(expectedEventId);

    if (!isVersionOk || !isChainOk || !isContractOk || !isEventMatch) {
      let detail = "QR kod bu etkinlik veya sözleşme ile eşleşmiyor.";
      if (!isVersionOk) detail = `Desteklenmeyen QR sürümü (${ticket.version}).`;
      else if (!isChainOk)
        detail = `Geçersiz ağ kimliği (${ticket.chainId}). Beklenen: ${expectedChainId}.`;
      else if (!isContractOk) detail = "QR kod farklı bir sözleşme adresi için üretilmiş.";
      else if (!isEventMatch)
        detail = `QR kod Etkinlik #${ticket.eventId} için üretilmiş, şu an Etkinlik #${expectedEventId} ekranındasınız.`;

      checks.push({
        id: "context",
        label: "QR Format, Ağ ve Etkinlik Eşleşmesi",
        passed: false,
        detail,
      });
      return { valid: false, ticket, checks };
    }

    checks.push({
      id: "context",
      label: "QR Format, Ağ ve Etkinlik Eşleşmesi",
      passed: true,
      detail: `Etkinlik #${ticket.eventId} • Chain ID (${expectedChainId}) doğrulandı.`,
    });
  } catch (err) {
    checks.push({
      id: "context",
      label: "QR Format, Ağ ve Etkinlik Eşleşmesi",
      passed: false,
      detail: err.message,
    });
    return { valid: false, ticket: null, checks };
  }

  // 2. Kriptografik Cüzdan İmzası Doğrulaması (Taklit / Spoofing / Tampering Koruması)
  try {
    const canonicalMsg = buildCanonicalQrMessage(ticket);
    const recoveredAddress = ethers.verifyMessage(canonicalMsg, ticket.signature);
    const signatureMatches =
      recoveredAddress.toLowerCase() === ticket.participant.toLowerCase();

    checks.push({
      id: "signature",
      label: "Kriptografik Cüzdan İmzası (EIP-191)",
      passed: signatureMatches,
      detail: signatureMatches
        ? `İmza doğrulandı: ${ticket.participant}`
        : "İmza geçersiz! QR verisi değiştirilmiş veya başka bir cüzdanla imzalanmış.",
    });

    if (!signatureMatches) {
      return { valid: false, ticket, checks };
    }
  } catch {
    checks.push({
      id: "signature",
      label: "Kriptografik Cüzdan İmzası (EIP-191)",
      passed: false,
      detail: "Kriptografik imza çözümlenemedi.",
    });
    return { valid: false, ticket, checks };
  }

  // 3. Süre (TTL Penceresi) ve Tek Kullanımlık Kod (Nonce Replay) Kontrolü
  const nowSeconds =
    nowSecondsOverride !== null ? Number(nowSecondsOverride) : Math.floor(Date.now() / 1000);
  const ttlSpan = ticket.expiresAt - ticket.issuedAt;
  const isInvalidWindow = ttlSpan <= 0 || ttlSpan > QR_TTL_SECONDS;
  const isExpired = nowSeconds > ticket.expiresAt;
  const isFuture = ticket.issuedAt > nowSeconds + 60;
  const nonceAlreadyUsed = isNonceUsed(ticket.nonce);

  if (isInvalidWindow || isExpired || isFuture || nonceAlreadyUsed) {
    let detail = "";
    if (nonceAlreadyUsed) {
      detail = "Bu tek kullanımlık QR kod (nonce) daha önce kullanılmış!";
    } else if (isInvalidWindow) {
      detail = `QR kod geçerlilik penceresi (${ttlSpan} sn) izin verilen maksimum süreyi (${QR_TTL_SECONDS} sn) aşıyor veya geçersiz.`;
    } else if (isExpired) {
      const expiredAgo = nowSeconds - ticket.expiresAt;
      detail = `QR kodun geçerlilik süresi ${expiredAgo} saniye önce dolmuş. Öğrenciden yeni QR kod üretmesini isteyin.`;
    } else {
      detail = "QR kod oluşturma zamanı gelecekte görünüyor (saat farkı hatası).";
    }

    checks.push({
      id: "freshness",
      label: "Süre (TTL) ve Tek Kullanımlık Nonce Kontrolü",
      passed: false,
      detail,
    });
    return { valid: false, ticket, checks };
  }

  const remainingSec = ticket.expiresAt - nowSeconds;
  checks.push({
    id: "freshness",
    label: "Süre (TTL) ve Tek Kullanımlık Nonce Kontrolü",
    passed: true,
    detail: `QR kod güncel (${remainingSec} sn geçerli) ve tek kullanımlık nonce ilk kez kullanılıyor.`,
  });

  // 4. Blokzincir Canlı Kontrolleri: Etkinlik Mevcut mu? İşlemi Yapan Organizatör mü?
  const contract = contractInstance || getReadOnlyContract();
  const [onChainEvent, isReg, isAtt] = await Promise.all([
    contract.events(ticket.eventId),
    contract.registered(ticket.eventId, ticket.participant),
    contract.attended(ticket.eventId, ticket.participant),
  ]);

  const eventExists = Number(onChainEvent.id) !== 0 && Boolean(onChainEvent.active);
  const isOrganizerAuthorized =
    Boolean(connectedAccount) &&
    onChainEvent.organizer.toLowerCase() === connectedAccount.toLowerCase();

  checks.push({
    id: "organizer",
    label: "Etkinlik Durumu ve Organizatör Yetkisi",
    passed: eventExists && isOrganizerAuthorized,
    detail: !eventExists
      ? "Etkinlik blokzincirde mevcut değil veya pasif."
      : isOrganizerAuthorized
      ? "Bağlı cüzdan bu etkinliğin yetkili organizatörüdür."
      : "Yetkisiz cüzdan! Yalnızca etkinliği oluşturan organizatör katılım doğrulayabilir.",
  });

  if (!eventExists || !isOrganizerAuthorized) {
    return { valid: false, ticket, checks };
  }

  // 5. Öğrenci Kayıtlı mı ve Katılım Daha Önce İşaretlenmiş mi?
  const isRegistered = Boolean(isReg);
  const isAlreadyAttended = Boolean(isAtt);

  checks.push({
    id: "onchain_status",
    label: "Blokzincir Kayıt ve Mükerrer Katılım Kontrolü",
    passed: isRegistered && !isAlreadyAttended,
    detail: !isRegistered
      ? "Bu cüzdan adresi etkinliğe kayıtlı değil (Not registered)."
      : isAlreadyAttended
      ? "Bu öğrencinin katılımı blokzincirde daha önce doğrulanmış (Already attended)."
      : "Öğrenci etkinliğe kayıtlı ve katılımı henüz işaretlenmemiş.",
  });

  const allPassed = checks.every((c) => c.passed);
  return {
    valid: allPassed,
    ticket,
    checks,
  };
}
