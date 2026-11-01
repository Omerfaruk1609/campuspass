/**
 * CampusPass — iCalendar (.ics) Etkinlik Takvim Entegrasyonu
 * RFC 5545 Standartlarına uygun VCALENDAR/VEVENT üretir.
 * 
 * Güvenlik & Gizlilik İlkesi:
 * Üretilen takvim dosyaları yalnızca genel etkinlik bilgilerini (başlık, açıklama,
 * tarih/saat, konum, topluluk adı, bağlantı) içerir.
 * Katılımcı cüzdan adresleri, profil isimleri, QR bilet imzaları veya
 * sunucu oturum bilgileri KESİNLİKLE takvim çıktısına eklenemez.
 */

/**
 * RFC 5545 metin kaçış kurallarını uygular:
 * Ters eğik çizgi, noktalı virgül, virgül ve satır sonları kaçırılır.
 */
export function escapeIcsText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * ISO tarih veya Date nesnesini UTC tabanlı iCalendar tarih formatına çevirir (YYYYMMDDTHHmmssZ).
 */
export function formatIcsDateTimeUtc(dateOrIso) {
  if (!dateOrIso) return null;
  const ms = typeof dateOrIso === "number" ? dateOrIso : Date.parse(dateOrIso);
  if (Number.isNaN(ms)) return null;

  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");

  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());

  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

/**
 * Etkinlik verilerinden başlangıç ve bitiş zamanlarını çözer.
 */
function resolveEventDates(event) {
  let startMs = NaN;
  let endMs = NaN;

  if (event.startAt) {
    startMs = Date.parse(event.startAt);
  } else if (event.date && event.startTime) {
    startMs = Date.parse(`${event.date}T${event.startTime}:00+03:00`);
  }

  if (event.endAt) {
    endMs = Date.parse(event.endAt);
  } else if (event.date && event.endTime) {
    endMs = Date.parse(`${event.date}T${event.endTime}:00+03:00`);
  }

  // Başlangıç tarihi bulunamazsa şu anın 1 saat sonrasına fallback yap
  if (Number.isNaN(startMs)) {
    startMs = Date.now() + 60 * 60 * 1000;
  }

  // Bitiş tarihi yoksa veya başlangıçtan önceyse başlangıçtan 2 saat sonrasına ayarla
  if (Number.isNaN(endMs) || endMs <= startMs) {
    endMs = startMs + 2 * 60 * 60 * 1000;
  }

  return {
    startUtc: formatIcsDateTimeUtc(startMs),
    endUtc: formatIcsDateTimeUtc(endMs),
  };
}

/**
 * Genel etkinlik verisinden standart RFC 5545 .ics metin akışı üretir.
 *
 * @param {object} event - Etkinlik nesnesi
 * @param {object} [options]
 * @param {string} [options.origin] - Etkinlik bağlantısının taban URL'i (varsayılan: window.location.origin)
 * @returns {string} CRLF (\r\n) ile ayrılmış .ics içeriği
 */
export function generateEventIcs(event, { origin = "" } = {}) {
  if (!event || typeof event !== "object") {
    throw new Error("Geçerli bir etkinlik nesnesi sağlanmalıdır.");
  }

  const eventId = event.id ?? event.eventId ?? "genel";
  const { startUtc, endUtc } = resolveEventDates(event);
  const nowUtc = formatIcsDateTimeUtc(Date.now());

  const baseUrl =
    origin ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://campuspass.edu");
  const eventUrl = `${baseUrl}/events/${eventId}`;

  // Konum metni
  let locationText = "";
  if (typeof event.location === "object" && event.location) {
    const parts = [
      event.location.campus,
      event.location.building,
      event.location.room,
    ].filter(Boolean);
    locationText = parts.join(", ");
  } else if (typeof event.location === "string") {
    locationText = event.location;
  }

  // Açıklama metni (Topluluk ve kategori bilgisi eklenir)
  const descriptionParts = [];
  if (event.community) {
    descriptionParts.push(`Düzenleyen: ${event.community}`);
  }
  if (event.category) {
    descriptionParts.push(`Kategori: ${event.category}`);
  }
  if (event.description) {
    descriptionParts.push(`\n${event.description}`);
  }
  descriptionParts.push(`\nEtkinlik Bağlantısı: ${eventUrl}`);

  const summary = escapeIcsText(event.title || "CampusPass Kampüs Etkinliği");
  const description = escapeIcsText(descriptionParts.join("\n"));
  const location = escapeIcsText(locationText || "Kampüs İçi");
  const isCancelled = Boolean(
    event.cancelled || event.status === "cancelled"
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusPass//Event Discovery Calendar//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:campuspass-event-${eventId}@campuspass.edu`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `URL:${eventUrl}`,
    `STATUS:${isCancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

/**
 * Tarayıcı ortamında .ics dosyasını dosya indirme olarak tetikler.
 *
 * @param {object} event - Etkinlik nesnesi
 * @param {object} [options]
 * @param {string} [options.filename] - İndirilecek dosya adı
 * @returns {string} Üretilen .ics metin akışı
 */
export function downloadEventIcs(event, { filename = "", origin = "" } = {}) {
  const icsContent = generateEventIcs(event, { origin });
  const eventId = event?.id ?? event?.eventId ?? "etkinlik";
  const defaultFilename = `campuspass-etkinlik-${eventId}.ics`;
  const finalFilename = filename || defaultFilename;

  if (
    typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    typeof window.Blob === "function" &&
    typeof window.URL?.createObjectURL === "function"
  ) {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = window.document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", finalFilename);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
  }

  return icsContent;
}
