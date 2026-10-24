import { ethers } from "ethers";
import { CONTRACT_ADDRESS, MONAD_CHAIN_ID } from "../data/events.js";
import { buildEventCompositeKey } from "./eventMetadata.js";

export const API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:3001/api";

export const PENDING_SYNC_STORAGE_KEY = "campuspass_pending_metadata_sync_v1";

// Bellekte tutulan aktif SIWE oturum durumu (HttpOnly çerez tarayıcı tarafından taşınır, CSRF token burada saklanır)
let activeAuthState = {
  authenticated: false,
  walletAddress: null,
  csrfToken: null,
  expiresAt: null,
};

export function getActiveAuthState() {
  return { ...activeAuthState };
}

export function clearActiveAuthState() {
  activeAuthState = {
    authenticated: false,
    walletAddress: null,
    csrfToken: null,
    expiresAt: null,
  };
}

/**
 * EIP-4361 (SIWE) mesajını istemci tarafında standart formatta oluşturur.
 */
export function buildClientSiweMessage({
  domain,
  address,
  statement = "CampusPass organizator yonetim oturumu icin cuzdaninizi dogrulayin.",
  uri,
  version = "1",
  chainId = MONAD_CHAIN_ID,
  nonce,
  issuedAt,
  expirationTime,
}) {
  const checksumAddr = ethers.getAddress(address);
  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    checksumAddr,
    "",
    statement,
    "",
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${Number(chainId)}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ];
  if (expirationTime) {
    lines.push(`Expiration Time: ${expirationTime}`);
  }
  return lines.join("\n");
}

/**
 * Backend API yanıt zarfını doğrular.
 */
export function validateApiResponseEnvelope(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Sunucudan geçersiz yanıt formatı alındı.");
  }
  if (payload.success !== true) {
    const errMsg =
      payload.error?.message || "Sunucu isteği reddetti.";
    const err = new Error(errMsg);
    err.code = payload.error?.code || "API_ERROR";
    err.details = payload.error?.details || null;
    throw err;
  }
  return payload;
}

/**
 * Backend'den gelen tekil metadata nesnesinin zorunlu alanlarını ve
 * (chainId, contractAddress, eventId) bütünlüğünü doğrular.
 */
export function validateServerMetadataRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const eventId = Number(record.eventId ?? record.id);
  const chainId = Number(record.chainId ?? MONAD_CHAIN_ID);
  const contractAddress = record.contractAddress || CONTRACT_ADDRESS;

  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return null;
  }
  if (!ethers.isAddress(contractAddress)) {
    return null;
  }

  const compositeKey = buildEventCompositeKey(chainId, contractAddress, eventId);
  return {
    ...record,
    compositeKey,
    chainId,
    contractAddress: ethers.getAddress(contractAddress),
    eventId,
    location: record.location || {
      campus: record.campus || "Merkez Kampüs",
      building: record.building || "Mühendislik Fakültesi",
      room: record.room || "Konferans Salonu",
    },
  };
}

async function apiRequest(
  endpointPath,
  { method = "GET", body = undefined, timeoutMs = 6000, customFetch = null } = {}
) {
  const fetchFn = customFetch || globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("Tarayıcı veya çalışma ortamında fetch desteği bulunamadı.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase()) &&
    activeAuthState.csrfToken
  ) {
    headers["X-CSRF-Token"] = activeAuthState.csrfToken;
  }

  try {
    const response = await fetchFn(`${API_BASE_URL}${endpointPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const msg =
        json?.error?.message ||
        `Sunucu hatası (HTTP ${response.status})`;
      const err = new Error(msg);
      err.status = response.status;
      err.code = json?.error?.code || "HTTP_ERROR";
      throw err;
    }

    return validateApiResponseEnvelope(json);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkBackendHealth({ customFetch = null } = {}) {
  try {
    const res = await apiRequest("/health", {
      method: "GET",
      timeoutMs: 3500,
      customFetch,
    });
    return {
      online: true,
      data: res.data,
    };
  } catch (err) {
    return {
      online: false,
      error: err.message,
    };
  }
}

export async function fetchEventsMetadataFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/events?limit=100", {
    method: "GET",
    customFetch,
  });

  const validatedMap = {};
  const rawMap = res.metadataMap || {};
  for (const [, record] of Object.entries(rawMap)) {
    const validated = validateServerMetadataRecord(record);
    if (validated) {
      validatedMap[validated.compositeKey] = validated;
    }
  }

  return {
    items: Array.isArray(res.data) ? res.data : [],
    metadataMap: validatedMap,
    pagination: res.pagination || null,
  };
}

export async function fetchStudentProfileFromBackend(
  walletAddress,
  { customFetch = null } = {}
) {
  const checksumWallet = ethers.getAddress(walletAddress);
  const [eventsRes, attendanceRes] = await Promise.all([
    apiRequest(`/students/${checksumWallet}/events`, {
      method: "GET",
      customFetch,
    }),
    apiRequest(`/students/${checksumWallet}/attendance`, {
      method: "GET",
      customFetch,
    }),
  ]);

  return {
    walletAddress: checksumWallet,
    registeredEvents: eventsRes.data?.registeredEvents || [],
    upcomingEvents: eventsRes.data?.upcomingEvents || [],
    pastEvents: eventsRes.data?.pastEvents || [],
    attendedEvents: attendanceRes.data?.attendedEvents || [],
    stats: eventsRes.data?.stats || attendanceRes.data?.stats,
    timeline: attendanceRes.data?.timeline || [],
  };
}

/**
 * Organizatör cüzdanı için SIWE (EIP-4361) oturumu açık değilse
 * nonce alır, cüzdanda mesajı imzalatır ve HttpOnly oturum çerezini + CSRF token'ı başlatır.
 */
export async function ensureOrganizerSiweSession({
  signer,
  walletAddress,
  chainId = MONAD_CHAIN_ID,
  customFetch = null,
}) {
  const checksumWallet = ethers.getAddress(walletAddress);

  // Mevcut oturum aynı cüzdana aitse ve geçerliyse yeniden imza isteme
  if (
    activeAuthState.authenticated &&
    activeAuthState.walletAddress &&
    activeAuthState.walletAddress.toLowerCase() === checksumWallet.toLowerCase() &&
    activeAuthState.csrfToken
  ) {
    return activeAuthState;
  }

  try {
    const sessionCheck = await apiRequest("/auth/session", {
      method: "GET",
      customFetch,
    });
    if (
      sessionCheck.data?.authenticated &&
      sessionCheck.data?.walletAddress?.toLowerCase() ===
        checksumWallet.toLowerCase() &&
      sessionCheck.data?.csrfToken
    ) {
      activeAuthState = {
        authenticated: true,
        walletAddress: checksumWallet,
        csrfToken: sessionCheck.data.csrfToken,
        expiresAt: sessionCheck.data.expiresAt,
      };
      return activeAuthState;
    }
  } catch {
    // Oturum kontrolü başarısızsa yeni SIWE akışı başlat
  }

  // 1. Sunucudan tek kullanımlık nonce al
  const nonceRes = await apiRequest(
    `/auth/nonce?walletAddress=${encodeURIComponent(checksumWallet)}`,
    { method: "GET", customFetch }
  );
  const { nonce, domain, uri, issuedAt, expiresAt } = nonceRes.data;

  // 2. SIWE (EIP-4361) mesajını oluştur ve cüzdanda imzalat
  const siweMessage = buildClientSiweMessage({
    domain,
    address: checksumWallet,
    uri,
    chainId,
    nonce,
    issuedAt,
    expirationTime: expiresAt,
  });

  const signature = await signer.signMessage(siweMessage);

  // 3. Sunucuda doğrulat, nonce'u atomik tüket ve oturum oluştur
  const verifyRes = await apiRequest("/auth/verify", {
    method: "POST",
    body: { message: siweMessage, signature },
    customFetch,
  });

  activeAuthState = {
    authenticated: true,
    walletAddress: verifyRes.data.walletAddress,
    csrfToken: verifyRes.data.csrfToken,
    expiresAt: verifyRes.data.expiresAt,
  };

  return activeAuthState;
}

export async function logoutOrganizerSiweSession({ customFetch = null } = {}) {
  try {
    await apiRequest("/auth/logout", { method: "POST", customFetch });
  } catch {
    // Sunucu erişilemezse bile yerel durumu temizle
  }
  clearActiveAuthState();
}

export async function saveMetadataToBackend({
  eventId,
  metadataInput,
  method = "POST",
  customFetch = null,
}) {
  const res = await apiRequest(`/events/${Number(eventId)}/metadata`, {
    method,
    body: metadataInput,
    customFetch,
  });
  return validateServerMetadataRecord(res.data);
}

export async function cancelEventOnBackend({
  eventId,
  cancelReason = "",
  customFetch = null,
}) {
  const res = await apiRequest(`/events/${Number(eventId)}/cancel`, {
    method: "POST",
    body: { cancelReason },
    customFetch,
  });
  return validateServerMetadataRecord(res.data);
}

export async function reactivateEventOnBackend({
  eventId,
  customFetch = null,
}) {
  const res = await apiRequest(`/events/${Number(eventId)}/reactivate`, {
    method: "POST",
    body: {},
    customFetch,
  });
  return validateServerMetadataRecord(res.data);
}

/**
 * Zincir üstü işlem onaylanıp API kaydı başarısız olduğunda kurtarma (retry) için
 * bekleyen metadata kayıtlarını yerel depoda saklar.
 */
export function readPendingSyncQueue() {
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      const raw = globalThis.window.localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    }
  } catch {
    // Yoksay
  }
  return {};
}

export function addPendingMetadataSync({
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  eventId,
  organizerAddress,
  metadataInput,
  reason = "",
}) {
  const key = buildEventCompositeKey(chainId, contractAddress, eventId);
  const queue = readPendingSyncQueue();
  queue[key] = {
    compositeKey: key,
    chainId: Number(chainId),
    contractAddress: ethers.getAddress(contractAddress),
    eventId: Number(eventId),
    organizerAddress: ethers.getAddress(organizerAddress),
    metadataInput,
    failedAt: new Date().toISOString(),
    reason,
  };
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      globalThis.window.localStorage.setItem(
        PENDING_SYNC_STORAGE_KEY,
        JSON.stringify(queue)
      );
    }
  } catch {
    // Yoksay
  }
  return queue[key];
}

export function removePendingMetadataSync(compositeKey) {
  const queue = readPendingSyncQueue();
  if (Object.prototype.hasOwnProperty.call(queue, compositeKey)) {
    delete queue[compositeKey];
    try {
      if (globalThis.window && globalThis.window.localStorage) {
        globalThis.window.localStorage.setItem(
          PENDING_SYNC_STORAGE_KEY,
          JSON.stringify(queue)
        );
      }
    } catch {
      // Yoksay
    }
  }
}
