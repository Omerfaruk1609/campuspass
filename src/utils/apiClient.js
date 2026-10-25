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

// Sekmeler arası oturum senkronizasyonu için anahtar ve yayınlayıcı
export const AUTH_STORAGE_EVENT_KEY = "campuspass_auth_event";

export function broadcastAuthEvent(type, payload = {}) {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        AUTH_STORAGE_EVENT_KEY,
        JSON.stringify({ type, timestamp: Date.now(), ...payload })
      );
    } catch {
      // localStorage erişim kısıtlaması göz ardı edilir
    }
  }
}

/**
 * Cüzdan için SIWE (EIP-4361) oturumunu doğrular veya başlatır.
 * Hem obje parametrelerini ({ signer, walletAddress, chainId }) hem de doğrudan string cüzdan adresini destekler.
 */
export async function ensureSiweSession(optionsOrAddress, maybeSigner) {
  let walletAddress = null;
  let signer = maybeSigner || null;
  let chainId = MONAD_CHAIN_ID;
  let statement = "CampusPass islemleri icin cuzdaninizi dogrulayin.";
  let customFetch = null;

  if (typeof optionsOrAddress === "string") {
    walletAddress = optionsOrAddress;
  } else if (optionsOrAddress && typeof optionsOrAddress === "object") {
    walletAddress = optionsOrAddress.walletAddress || optionsOrAddress.account;
    signer = optionsOrAddress.signer || signer;
    chainId = optionsOrAddress.chainId || chainId;
    statement = optionsOrAddress.statement || statement;
    customFetch = optionsOrAddress.customFetch || customFetch;
  }

  if (!walletAddress) {
    throw new Error("SIWE kimlik doğrulaması için cüzdan adresi gereklidir.");
  }

  const checksumWallet = ethers.getAddress(walletAddress);

  // 1. İstemci önbelleğinde geçerli aktif oturum var mı?
  if (
    activeAuthState.authenticated &&
    activeAuthState.walletAddress &&
    activeAuthState.walletAddress.toLowerCase() === checksumWallet.toLowerCase() &&
    activeAuthState.csrfToken
  ) {
    return activeAuthState;
  }

  // 2. Sunucuda mevcut çerez geçerli mi? (Yeniden imza istememek için önce sunucu çerezini dene)
  try {
    const sessionCheck = await apiRequest("/auth/session", {
      method: "GET",
      customFetch,
    });
    if (
      sessionCheck.data?.authenticated &&
      sessionCheck.data?.walletAddress?.toLowerCase() === checksumWallet.toLowerCase() &&
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

  // 3. İmzacı temini: Eğer signer sağlanmadıysa tarayıcı MetaMask sağlayıcısından al
  let effectiveSigner = signer;
  if (!effectiveSigner && typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    effectiveSigner = await provider.getSigner();
  }

  if (!effectiveSigner) {
    throw new Error(
      "SIWE oturumu açmak için cüzdan imzası gereklidir. Lütfen cüzdanınızı bağlayın."
    );
  }

  // 4. Sunucudan tek kullanımlık nonce al
  const nonceRes = await apiRequest(
    `/auth/nonce?walletAddress=${encodeURIComponent(checksumWallet)}`,
    { method: "GET", customFetch }
  );
  const { nonce, domain, uri, issuedAt, expiresAt } = nonceRes.data;

  // 5. SIWE (EIP-4361) mesajını oluştur ve cüzdanda imzalat
  const siweMessage = buildClientSiweMessage({
    domain,
    address: checksumWallet,
    statement,
    uri,
    chainId,
    nonce,
    issuedAt,
    expirationTime: expiresAt,
  });

  const signature = await effectiveSigner.signMessage(siweMessage);

  // 6. Sunucuda doğrulat, nonce'u atomik tüket ve oturum oluştur
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

export const ensureOrganizerSiweSession = ensureSiweSession;
export const ensureStudentSiweSession = ensureSiweSession;

/**
 * Sunucuda mevcut geçerli bir SIWE oturumu olup olmadığını sorgular (Sayfa yenilendiğinde oturumu geri yükler).
 */
export async function checkServerSession({ customFetch = null } = {}) {
  try {
    const sessionCheck = await apiRequest("/auth/session", {
      method: "GET",
      customFetch,
    });
    if (
      sessionCheck.data?.authenticated &&
      sessionCheck.data?.walletAddress &&
      sessionCheck.data?.csrfToken
    ) {
      activeAuthState = {
        authenticated: true,
        walletAddress: ethers.getAddress(sessionCheck.data.walletAddress),
        csrfToken: sessionCheck.data.csrfToken,
        expiresAt: sessionCheck.data.expiresAt,
      };
      return activeAuthState;
    }
  } catch {
    // Oturum yok veya sunucuya erişilemiyor
  }
  return { authenticated: false, walletAddress: null, csrfToken: null };
}

export async function issueCertificateOnBackend({
  eventId,
  walletAddress,
  displayName = "",
  customFetch = null,
}) {
  const res = await apiRequest("/certificates", {
    method: "POST",
    body: {
      eventId: Number(eventId),
      walletAddress,
      displayName,
    },
    customFetch,
  });
  return {
    certificate: res.data,
    created: Boolean(res.created),
    idempotent: Boolean(res.idempotent),
  };
}

export async function fetchMyCertificatesFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/certificates/me", {
    method: "GET",
    customFetch,
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchWalletCertificatesFromBackend(
  walletAddress,
  { customFetch = null } = {}
) {
  const checksumWallet = ethers.getAddress(walletAddress);
  const res = await apiRequest(
    `/certificates/wallet/${encodeURIComponent(checksumWallet)}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchCertificateByIdFromBackend(
  certificateId,
  { customFetch = null } = {}
) {
  const cleanId = String(certificateId || "").trim().toUpperCase();
  const res = await apiRequest(
    `/certificates/${encodeURIComponent(cleanId)}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

export async function fetchCertificateVerificationFromBackend(
  certificateId,
  { customFetch = null } = {}
) {
  const cleanId = String(certificateId || "").trim().toUpperCase();
  const res = await apiRequest(
    `/certificates/${encodeURIComponent(cleanId)}/verify`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

/**
 * Faz 11 — Organizatör Analitik ve Yönetim Paneli API İstekleri
 */
export async function fetchOrganizerDashboardFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/organizer/dashboard", {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function fetchOrganizerEventsFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/organizer/events", {
    method: "GET",
    customFetch,
  });
  return {
    events: res.data || [],
    checkpoint: res.checkpoint || null,
  };
}

export async function fetchOrganizerEventAnalyticsFromBackend(
  eventId,
  { customFetch = null } = {}
) {
  const res = await apiRequest(`/organizer/events/${Number(eventId)}/analytics`, {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function fetchOrganizerEventParticipantsFromBackend(
  eventId,
  { page = 1, limit = 20, search = "", status = "ALL", customFetch = null } = {}
) {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  if (search) params.set("search", search);
  if (status && status !== "ALL") params.set("status", status);

  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const res = await apiRequest(
    `/organizer/events/${Number(eventId)}/participants${queryStr}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

export async function fetchOrganizerTimeseriesFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/organizer/analytics/timeseries", {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function downloadOrganizerEventCsv(
  eventId,
  { type = "participants", customFetch = null } = {}
) {
  const fetchFn = customFetch || globalThis.fetch;
  const url = `${API_BASE_URL}/organizer/events/${Number(eventId)}/export?type=${encodeURIComponent(type)}`;

  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      Accept: "text/csv, application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const msg = json?.error?.message || `CSV indirilemedi (HTTP ${response.status})`;
    throw new Error(msg);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  let fileName = `CampusPass_Etkinlik_${eventId}_${type}.csv`;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  if (match && match[1]) {
    fileName = match[1];
  }

  if (typeof globalThis.window !== "undefined" && globalThis.document) {
    const downloadUrl = URL.createObjectURL(blob);
    const a = globalThis.document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    globalThis.document.body.appendChild(a);
    a.click();
    globalThis.document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
  }

  return { fileName, blob };
}

export async function logoutOrganizerSiweSession({ customFetch = null } = {}) {
  try {
    await apiRequest("/auth/logout", { method: "POST", customFetch });
  } catch {
    // Sunucu erişilemezse bile yerel durumu temizle
  }
  clearActiveAuthState();
  broadcastAuthEvent("LOGOUT");
}

export const logoutSession = logoutOrganizerSiweSession;

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

// ============================================================================
// FAZ 12 — ÜNİVERSİTE TOPLULUK YÖNETİM SİSTEMİ İSTEMCİ API METOTLARI
// ============================================================================

export async function fetchCommunitiesFromBackend({
  search = "",
  category = "ALL",
  university = "ALL",
  page = 1,
  limit = 20,
} = {}) {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (category && category !== "ALL") params.append("category", category);
  if (university && university !== "ALL") params.append("university", university);
  params.append("page", String(page));
  params.append("limit", String(limit));

  const res = await apiRequest(`/communities?${params.toString()}`, {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function fetchCommunityProfileFromBackend(idOrSlug, { customFetch = null } = {}) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}`, {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function fetchCommunityEventsFromBackend(
  idOrSlug,
  { page = 1, limit = 20, customFetch = null } = {}
) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("limit", String(limit));

  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/events?${params.toString()}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

export async function createCommunityOnBackend(payload, { customFetch = null } = {}) {
  const res = await apiRequest("/communities", {
    method: "POST",
    body: payload,
    customFetch,
  });
  return res.data;
}

export async function joinCommunityOnBackend(idOrSlug, { customFetch = null } = {}) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}/join`, {
    method: "POST",
    body: {},
    customFetch,
  });
  return res.data;
}

export async function leaveCommunityOnBackend(idOrSlug, { customFetch = null } = {}) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}/leave`, {
    method: "POST",
    body: {},
    customFetch,
  });
  return res.data;
}

export async function fetchMyCommunitiesFromBackend({ customFetch = null } = {}) {
  const res = await apiRequest("/communities/me", {
    method: "GET",
    customFetch,
  });
  return res.data;
}

export async function fetchCommunityMembersFromBackend(
  idOrSlug,
  { status = "ACTIVE", search = "", page = 1, limit = 50, customFetch = null } = {}
) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (search) params.append("search", search);
  params.append("page", String(page));
  params.append("limit", String(limit));

  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/members?${params.toString()}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

export async function fetchCommunityApplicationsFromBackend(
  idOrSlug,
  { page = 1, limit = 50, customFetch = null } = {}
) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("limit", String(limit));

  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/applications?${params.toString()}`,
    {
      method: "GET",
      customFetch,
    }
  );
  return res.data;
}

export async function approveCommunityApplicationOnBackend(
  idOrSlug,
  memberId,
  { customFetch = null } = {}
) {
  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/applications/${encodeURIComponent(memberId)}/approve`,
    {
      method: "POST",
      body: {},
      customFetch,
    }
  );
  return res.data;
}

export async function rejectCommunityApplicationOnBackend(
  idOrSlug,
  memberId,
  { customFetch = null } = {}
) {
  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/applications/${encodeURIComponent(memberId)}/reject`,
    {
      method: "POST",
      body: {},
      customFetch,
    }
  );
  return res.data;
}

export async function removeCommunityMemberOnBackend(
  idOrSlug,
  memberId,
  { customFetch = null } = {}
) {
  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
      customFetch,
    }
  );
  return res.data;
}

export async function updateCommunityMemberRoleOnBackend(
  idOrSlug,
  memberId,
  role,
  { customFetch = null } = {}
) {
  const res = await apiRequest(
    `/communities/${encodeURIComponent(idOrSlug)}/members/${encodeURIComponent(memberId)}/role`,
    {
      method: "PATCH",
      body: { role },
      customFetch,
    }
  );
  return res.data;
}

export async function updateCommunityOnBackend(idOrSlug, payload, { customFetch = null } = {}) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}`, {
    method: "PATCH",
    body: payload,
    customFetch,
  });
  return res.data;
}

export async function linkEventToCommunityOnBackend(
  idOrSlug,
  { eventId, chainId, contractAddress },
  { customFetch = null } = {}
) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}/events/link`, {
    method: "POST",
    body: { eventId, chainId, contractAddress },
    customFetch,
  });
  return res.data;
}

export async function unlinkEventFromCommunityOnBackend(
  idOrSlug,
  { eventId, chainId, contractAddress },
  { customFetch = null } = {}
) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}/events/unlink`, {
    method: "DELETE",
    body: { eventId, chainId, contractAddress },
    customFetch,
  });
  return res.data;
}

export async function fetchCommunityAnalyticsFromBackend(idOrSlug, { customFetch = null } = {}) {
  const res = await apiRequest(`/communities/${encodeURIComponent(idOrSlug)}/analytics`, {
    method: "GET",
    customFetch,
  });
  return res.data;
}
