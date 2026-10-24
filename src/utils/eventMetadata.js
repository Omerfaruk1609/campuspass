import { ethers } from "ethers";
import { CONTRACT_ADDRESS, MONAD_CHAIN_ID } from "../data/events.js";

export const METADATA_STORAGE_KEY = "campuspass_event_metadata_v1";
export const MAX_POSTER_SIZE_BYTES = 500 * 1024; // 500 KB maksimum afiş boyutu
export const ALLOWED_POSTER_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const EVENT_CATEGORIES = [
  "Yazılım",
  "Yapay Zekâ",
  "Blockchain",
  "Kariyer",
  "Sosyal",
  "Siber Güvenlik",
  "Diğer",
];

export const EVENT_STATUS_LABELS = {
  upcoming: "Yaklaşan",
  ongoing: "Devam Eden",
  completed: "Tamamlanan",
  cancelled: "İptal Edilen",
};

const DANGEROUS_TEXT_PATTERNS = [
  /<\s*script/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /on\w+\s*=/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
];

// Node.js / test ortamı için bellek içi yedek depo
const memoryMetadataStore = new Map();

/**
 * Etkinlik kimliğini (chainId, contractAddress, eventId) üçlüsüyle ilişkilendiren benzersiz anahtar üretir.
 */
export function buildEventCompositeKey(
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  eventId
) {
  const numChain = Number(chainId);
  const numEvent = Number(eventId);
  if (!Number.isSafeInteger(numChain) || numChain <= 0) {
    throw new Error("Geçersiz chainId.");
  }
  if (!Number.isSafeInteger(numEvent) || numEvent <= 0) {
    throw new Error("Geçersiz eventId.");
  }
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error("Geçersiz sözleşme adresi.");
  }
  return `${numChain}:${ethers.getAddress(contractAddress).toLowerCase()}:${numEvent}`;
}

/**
 * Metin alanlarını temizler ve XSS / zararlı kod kalıplarına karşı kontrol eder.
 */
export function sanitizeAndValidateText(value, fieldLabel, maxLength = 1000, required = true) {
  if (typeof value !== "string") {
    if (required) throw new Error(`${fieldLabel} alanı zorunludur.`);
    return "";
  }

  const trimmed = Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim();

  if (required && !trimmed) {
    throw new Error(`${fieldLabel} alanı boş bırakılamaz.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldLabel} en fazla ${maxLength} karakter olabilir.`);
  }

  for (const pattern of DANGEROUS_TEXT_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error(`${fieldLabel} alanında güvenlik açısından izin verilmeyen ifadeler tespit edildi.`);
    }
  }

  return trimmed;
}

/**
 * Afiş URL'sini veya Base64 Data URL'sini XSS ve boyut sınırlarına göre doğrular.
 * Not: data:image/svg+xml içerisine script gömülebildiği için güvenlik gereği reddedilir.
 */
export function validatePosterUrl(posterUrl) {
  if (!posterUrl || typeof posterUrl !== "string") {
    return "";
  }

  const trimmed = posterUrl.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new Error(
        "Afiş veri formatı geçersiz. Yalnızca PNG, JPEG veya WEBP formatında görseller kabul edilir (SVG kabul edilmez)."
      );
    }
    const base64Data = match[2];
    const approxBytes = Math.floor((base64Data.length * 3) / 4);
    if (approxBytes > MAX_POSTER_SIZE_BYTES) {
      throw new Error("Afiş görseli boyutu maksimum 500 KB sınırını aşıyor.");
    }
    return trimmed;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error("Afiş bağlantısı geçerli bir URL formatında değil.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Afiş bağlantısı yalnızca güvenli https:// (veya http://) protokolünü kullanabilir.");
  }

  for (const pattern of DANGEROUS_TEXT_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error("Afiş bağlantısında zararlı ifadeler tespit edildi.");
    }
  }

  return trimmed;
}

/**
 * Yüklenen afiş dosyasının MIME türünü ve boyutunu (<= 500 KB) kontrol eder.
 */
export function validatePosterFile(file) {
  if (!file) return true;
  if (!ALLOWED_POSTER_MIME_TYPES.includes(file.type)) {
    throw new Error(
      "Desteklenmeyen dosya türü. Lütfen yalnızca PNG, JPG/JPEG veya WEBP formatında bir afiş seçin."
    );
  }
  if (typeof file.size === "number" && file.size > MAX_POSTER_SIZE_BYTES) {
    throw new Error("Afiş dosya boyutu en fazla 500 KB olabilir.");
  }
  return true;
}

/**
 * Tarih (YYYY-MM-DD) ve saat (HH:mm) bilgisini Türkiye saat dilimi (UTC+03:00) ISO 8601 formatına çevirir.
 */
export function toTurkeyIsoTimestamp(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) {
    throw new Error("Etkinlik tarihi YYYY-AA-GG formatında olmalıdır.");
  }
  if (!/^\d{2}:\d{2}$/.test(String(timeStr || ""))) {
    throw new Error("Saat bilgisi SS:DD formatında olmalıdır.");
  }

  const iso = `${dateStr}T${timeStr}:00+03:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error("Geçersiz tarih veya saat değeri.");
  }
  return { iso, ms };
}

/**
 * Kayıt son tarihini (YYYY-MM-DDTHH:mm veya ISO dizesi) Türkiye saatine (+03:00) göre normalize eder.
 */
export function normalizeDeadlineTurkeyIso(deadlineInput) {
  if (!deadlineInput || typeof deadlineInput !== "string") {
    throw new Error("Kayıt son tarihi zorunludur.");
  }
  const trimmed = deadlineInput.trim();
  let iso = trimmed;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    iso = `${trimmed}:00+03:00`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = `${trimmed}T23:59:00+03:00`;
  }

  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error("Kayıt son tarihi geçerli bir tarih/saat formatında değil.");
  }
  return { iso, ms };
}

/**
 * Türkiye saatine (Europe/Istanbul) uygun okunabilir tarih/saat formatlar.
 */
export function formatTurkeyDateTime(isoString) {
  if (!isoString) return "-";
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return String(isoString);

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatTurkeyDateOnly(dateOrIso) {
  if (!dateOrIso) return "-";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso)
    ? `${dateOrIso}T12:00:00+03:00`
    : dateOrIso;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(dateOrIso);

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

/**
 * Gelişmiş etkinlik oluşturma ve düzenleme form verilerini doğrular.
 */
export function validateEventMetadataInput(input, { requireTitleAndCapacity = true } = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("Etkinlik veri paketi geçersiz.");
  }

  let title = "";
  let capacity = 0;

  if (requireTitleAndCapacity) {
    title = sanitizeAndValidateText(input.title, "Etkinlik başlığı", 120, true);
    capacity = Number(input.capacity);
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new Error("Etkinlik kapasitesi sıfırdan büyük bir tam sayı olmalıdır.");
    }
  }

  const description = sanitizeAndValidateText(
    input.description,
    "Etkinlik açıklaması",
    2000,
    true
  );
  const community = sanitizeAndValidateText(
    input.community,
    "Düzenleyen topluluk / kulüp",
    120,
    true
  );

  const category = String(input.category || "").trim();
  if (!EVENT_CATEGORIES.includes(category)) {
    throw new Error("Geçersiz etkinlik kategorisi seçildi.");
  }

  const campus = sanitizeAndValidateText(
    input.location?.campus ?? input.campus,
    "Kampüs adı",
    100,
    true
  );
  const building = sanitizeAndValidateText(
    input.location?.building ?? input.building,
    "Bina adı",
    100,
    true
  );
  const room = sanitizeAndValidateText(
    input.location?.room ?? input.room,
    "Salon / Amfi",
    100,
    true
  );

  const date = String(input.date || "").trim();
  const startTime = String(input.startTime || "").trim();
  const endTime = String(input.endTime || "").trim();

  const startObj = toTurkeyIsoTimestamp(date, startTime);
  const endObj = toTurkeyIsoTimestamp(date, endTime);

  if (endObj.ms <= startObj.ms) {
    throw new Error("Etkinlik bitiş saati, başlangıç saatinden sonra olmalıdır.");
  }

  const deadlineObj = normalizeDeadlineTurkeyIso(input.registrationDeadline);
  if (deadlineObj.ms > startObj.ms) {
    throw new Error(
      "Kayıt son tarihi, etkinliğin başlangıç tarih ve saatinden sonra olamaz."
    );
  }

  const posterUrl = validatePosterUrl(input.posterUrl || "");

  return {
    title,
    capacity,
    description,
    community,
    category,
    date,
    startTime,
    endTime,
    startAt: startObj.iso,
    endAt: endObj.iso,
    registrationDeadline: deadlineObj.iso,
    location: {
      campus,
      building,
      room,
    },
    posterUrl,
    cancelled: Boolean(input.cancelled),
    cancelReason: input.cancelReason
      ? sanitizeAndValidateText(input.cancelReason, "İptal gerekçesi", 300, false)
      : "",
  };
}

/**
 * Etkinlik durumunu (upcoming, ongoing, completed, cancelled) dinamik olarak hesaplar.
 */
export function computeEventStatus(metadata, onChainActive = true, nowMs = Date.now()) {
  if (!onChainActive || metadata?.cancelled) {
    return "cancelled";
  }

  const startMs = metadata?.startAt ? Date.parse(metadata.startAt) : NaN;
  const endMs = metadata?.endAt ? Date.parse(metadata.endAt) : NaN;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return "upcoming";
  }

  if (nowMs > endMs) {
    return "completed";
  }
  if (nowMs >= startMs && nowMs <= endMs) {
    return "ongoing";
  }
  return "upcoming";
}

/**
 * Kayıt son tarihinin geçip geçmediğini veya etkinliğin kayda kapalı olup olmadığını kontrol eder.
 */
export function checkRegistrationEligibility(mergedEvent, nowMs = Date.now()) {
  if (!mergedEvent) {
    return { canRegister: false, reason: "Etkinlik bulunamadı." };
  }
  if (!mergedEvent.active || mergedEvent.status === "cancelled") {
    return { canRegister: false, reason: "Bu etkinlik iptal edilmiş veya aktif değil." };
  }
  if (mergedEvent.status === "completed") {
    return { canRegister: false, reason: "Bu etkinlik tamamlanmıştır." };
  }
  if (mergedEvent.registeredCount >= mergedEvent.capacity) {
    return { canRegister: false, reason: "Etkinlik kontenjanı dolmuştur." };
  }

  const deadlineMs = mergedEvent.registrationDeadline
    ? Date.parse(mergedEvent.registrationDeadline)
    : NaN;

  if (!Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
    return {
      canRegister: false,
      deadlinePassed: true,
      reason: "Kayıt son tarihi geçmiştir.",
    };
  }

  return { canRegister: true, deadlinePassed: false, reason: "" };
}

/**
 * Organizatör metadata yetkilendirmesi için imzalanacak deterministik mesajı üretir.
 */
export function buildMetadataAuthMessage({
  action,
  chainId,
  contractAddress,
  eventId,
  organizer,
  timestamp,
}) {
  return [
    "CampusPass Etkinlik Yonetim Yetkilendirmesi",
    `Action: ${action}`,
    `ChainId: ${Number(chainId)}`,
    `Contract: ${ethers.getAddress(contractAddress)}`,
    `EventId: ${Number(eventId)}`,
    `Organizer: ${ethers.getAddress(organizer)}`,
    `Timestamp: ${Number(timestamp)}`,
  ].join("\n");
}

function readAllMetadataMap() {
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      const raw = globalThis.window.localStorage.getItem(METADATA_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
  } catch {
    // localStorage hatasında bellek içi depoya düş
  }
  return Object.fromEntries(memoryMetadataStore.entries());
}

function writeAllMetadataMap(mapObj) {
  for (const [k, v] of Object.entries(mapObj)) {
    memoryMetadataStore.set(k, v);
  }
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      globalThis.window.localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(mapObj));
    }
  } catch {
    // localStorage yazılamazsa bellek içi depo aktif kalır
  }
}

export function clearMetadataStoreForTesting() {
  memoryMetadataStore.clear();
  try {
    if (globalThis.window && globalThis.window.localStorage) {
      globalThis.window.localStorage.removeItem(METADATA_STORAGE_KEY);
    }
  } catch {
    // Yoksay
  }
}

/**
 * Yerel depodaki tüm metadata haritasını (silmeden) döndürür.
 */
export function getAllLocalMetadataMap() {
  return readAllMetadataMap();
}

/**
 * Backend API'den gelen doğrulanmış metadata kayıtlarını yerel önbellekle birleştirir.
 * Önceki fazlarda yerel depoda (localStorage) oluşturulmuş kayıtları asla sessizce silmez;
 * sunucuda karşılığı olmayan yerel kayıtları korur.
 */
export function hydrateMetadataStoreFromServerMap(serverMetadataMap = {}) {
  if (!serverMetadataMap || typeof serverMetadataMap !== "object") {
    return readAllMetadataMap();
  }
  const currentLocal = readAllMetadataMap();
  const merged = { ...currentLocal };

  for (const [compositeKey, serverRecord] of Object.entries(serverMetadataMap)) {
    if (serverRecord && typeof serverRecord === "object" && serverRecord.eventId) {
      merged[compositeKey] = serverRecord;
    }
  }

  writeAllMetadataMap(merged);
  return merged;
}

/**
 * Bağlı organizatöre ait olup henüz Backend PostgreSQL veritabanına aktarılmamış
 * yerel (localStorage) metadata kayıtlarını tespit eder.
 */
export function findUnmigratedLocalMetadata(
  organizerAddress,
  serverMetadataMap = {}
) {
  if (!organizerAddress || !ethers.isAddress(organizerAddress)) {
    return [];
  }
  const normalizedOrg = organizerAddress.toLowerCase();
  const localMap = readAllMetadataMap();
  const unmigrated = [];

  for (const [compositeKey, record] of Object.entries(localMap)) {
    if (!record || typeof record !== "object") continue;
    const recOrg = String(
      record.organizer || record.organizerAddress || ""
    ).toLowerCase();
    if (recOrg !== normalizedOrg) continue;

    if (!Object.prototype.hasOwnProperty.call(serverMetadataMap, compositeKey)) {
      unmigrated.push(record);
    }
  }

  return unmigrated;
}

export function getEventMetadata({
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  eventId,
}) {
  const key = buildEventCompositeKey(chainId, contractAddress, eventId);
  if (memoryMetadataStore.has(key)) {
    return memoryMetadataStore.get(key);
  }
  const map = readAllMetadataMap();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/**
 * Zincir üstü etkinlik oluşturulduktan sonra organizatör kontrolüyle ilk metadata kaydını oluşturur.
 */
export function saveInitialEventMetadata({
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  eventId,
  onChainOrganizer,
  callerAddress,
  metadataInput,
}) {
  if (!onChainOrganizer || !callerAddress) {
    throw new Error("Organizatör yetki bilgisi eksik.");
  }
  if (onChainOrganizer.toLowerCase() !== callerAddress.toLowerCase()) {
    throw new Error("Yetkisiz işlem: Yalnızca etkinliğin blokzincir üzerindeki organizatörü metadata kaydedebilir.");
  }

  const validated = validateEventMetadataInput(metadataInput, {
    requireTitleAndCapacity: false,
  });

  const key = buildEventCompositeKey(chainId, contractAddress, eventId);
  const record = {
    compositeKey: key,
    chainId: Number(chainId),
    contractAddress: ethers.getAddress(contractAddress),
    eventId: Number(eventId),
    organizer: ethers.getAddress(onChainOrganizer),
    ...validated,
    updatedAt: new Date().toISOString(),
  };

  const map = readAllMetadataMap();
  map[key] = record;
  writeAllMetadataMap(map);
  return record;
}

/**
 * Organizatörün kriptografik cüzdan imzasını ve zincir üstü organizatör adresini doğrulayarak
 * etkinlik metadata'sını günceller veya etkinliği iptal eder.
 */
export function updateEventMetadataAuthorized({
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  eventId,
  onChainOrganizer,
  callerAddress,
  signature,
  signedTimestamp,
  action = "UPDATE_METADATA",
  metadataInput,
}) {
  if (!onChainOrganizer || !callerAddress) {
    throw new Error("Organizatör cüzdan adresi belirtilmelidir.");
  }

  if (onChainOrganizer.toLowerCase() !== callerAddress.toLowerCase()) {
    throw new Error(
      "Yetkisiz erişim: Yalnızca etkinliğin blokzincir üzerindeki organizatörü değişiklik yapabilir."
    );
  }

  if (!signature || !signedTimestamp) {
    throw new Error("Metadata değişikliği için organizatör cüzdan imzası zorunludur.");
  }

  const authMsg = buildMetadataAuthMessage({
    action,
    chainId,
    contractAddress,
    eventId,
    organizer: onChainOrganizer,
    timestamp: signedTimestamp,
  });

  let recovered;
  try {
    recovered = ethers.verifyMessage(authMsg, signature);
  } catch {
    throw new Error("Organizatör imzası geçersiz veya çözümlenemedi.");
  }

  if (recovered.toLowerCase() !== onChainOrganizer.toLowerCase()) {
    throw new Error(
      "Kriptografik imza doğrulaması başarısız! İmza etkinliğin organizatörüne ait değil."
    );
  }

  const validated = validateEventMetadataInput(metadataInput, {
    requireTitleAndCapacity: false,
  });

  const key = buildEventCompositeKey(chainId, contractAddress, eventId);
  const record = {
    compositeKey: key,
    chainId: Number(chainId),
    contractAddress: ethers.getAddress(contractAddress),
    eventId: Number(eventId),
    organizer: ethers.getAddress(onChainOrganizer),
    ...validated,
    lastAuthSignature: signature,
    updatedAt: new Date().toISOString(),
  };

  const map = readAllMetadataMap();
  map[key] = record;
  writeAllMetadataMap(map);
  return record;
}

/**
 * Blokzincirdeki temel etkinlik verisi ile zincir dışı metadata'yı güvenli şekilde birleştirir.
 * Metadata yoksa varsayılan değerlerle tutarlı bir nesne döner.
 */
export function mergeOnChainEventWithMetadata(
  onChainEvent,
  {
    chainId = MONAD_CHAIN_ID,
    contractAddress = CONTRACT_ADDRESS,
    nowMs = Date.now(),
  } = {}
) {
  const stored = getEventMetadata({
    chainId,
    contractAddress,
    eventId: onChainEvent.id,
  });

  const fallbackMeta = {
    description:
      "Bu etkinlik Monad Testnet üzerinde oluşturulmuştur. Organizatör paneli üzerinden detaylı açıklama, konum ve program bilgilerini güncelleyebilirsiniz.",
    community: "Kampüs Topluluğu",
    category: "Blockchain",
    date: "2026-11-15",
    startTime: "14:00",
    endTime: "17:00",
    startAt: "2026-11-15T14:00:00+03:00",
    endAt: "2026-11-15T17:00:00+03:00",
    registrationDeadline: "2026-11-15T13:30:00+03:00",
    location: {
      campus: "Merkez Kampüs",
      building: "Mühendislik Fakültesi",
      room: "Konferans Salonu",
    },
    posterUrl: "",
    cancelled: false,
    cancelReason: "",
  };

  const meta = stored || fallbackMeta;
  const status = computeEventStatus(meta, onChainEvent.active, nowMs);

  const merged = {
    ...onChainEvent,
    compositeKey: buildEventCompositeKey(chainId, contractAddress, onChainEvent.id),
    hasCustomMetadata: Boolean(stored),
    description: meta.description,
    community: meta.community,
    category: meta.category,
    date: meta.date,
    startTime: meta.startTime,
    endTime: meta.endTime,
    startAt: meta.startAt,
    endAt: meta.endAt,
    registrationDeadline: meta.registrationDeadline,
    location: meta.location || fallbackMeta.location,
    posterUrl: meta.posterUrl || "",
    cancelled: Boolean(meta.cancelled),
    cancelReason: meta.cancelReason || "",
    status,
    statusLabel: EVENT_STATUS_LABELS[status] || "Yaklaşan",
    verifiedAttendanceCount: Number(onChainEvent.verifiedAttendanceCount ?? 0),
  };

  const eligibility = checkRegistrationEligibility(merged, nowMs);
  merged.canRegisterByTime = eligibility.canRegister;
  merged.deadlinePassed = Boolean(eligibility.deadlinePassed);
  merged.registrationBlockReason = eligibility.reason;

  return merged;
}

/**
 * Etkinlik arama, kategori/topluluk/durum filtreleme ve sıralama motoru.
 */
export function filterAndSortEvents(
  events,
  {
    searchQuery = "",
    category = "ALL",
    community = "ALL",
    timeFilter = "ALL", // ALL | UPCOMING | PAST | CANCELLED
    sortBy = "NEWEST", // NEWEST | DATE_ASC | DATE_DESC | FILL_DESC
  } = {}
) {
  const normalizedQuery = String(searchQuery || "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  const filtered = events.filter((ev) => {
    if (category && category !== "ALL" && ev.category !== category) {
      return false;
    }

    if (community && community !== "ALL" && ev.community !== community) {
      return false;
    }

    if (timeFilter === "UPCOMING") {
      if (ev.status !== "upcoming" && ev.status !== "ongoing") return false;
    } else if (timeFilter === "PAST") {
      if (ev.status !== "completed") return false;
    } else if (timeFilter === "CANCELLED") {
      if (ev.status !== "cancelled") return false;
    }

    if (normalizedQuery) {
      const searchable = [
        ev.title,
        ev.description,
        ev.community,
        ev.category,
        ev.location?.campus,
        ev.location?.building,
        ev.location?.room,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      if (!searchable.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy === "DATE_ASC") {
      return (Date.parse(a.startAt) || 0) - (Date.parse(b.startAt) || 0);
    }
    if (sortBy === "DATE_DESC") {
      return (Date.parse(b.startAt) || 0) - (Date.parse(a.startAt) || 0);
    }
    if (sortBy === "FILL_DESC") {
      const fillA = a.capacity > 0 ? a.registeredCount / a.capacity : 0;
      const fillB = b.capacity > 0 ? b.registeredCount / b.capacity : 0;
      return fillB - fillA;
    }
    // NEWEST (varsayılan: en yüksek eventId üstte)
    return b.id - a.id;
  });

  return sorted;
}
