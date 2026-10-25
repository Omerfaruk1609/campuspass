/**
 * CampusPass — Faz 15 Bildirim Türleri ve Güvenlik Sabitleri (Frontend)
 */
export const NOTIFICATION_TYPES = {
  EVENT_REGISTRATION_CONFIRMED: "EVENT_REGISTRATION_CONFIRMED",
  EVENT_REGISTRATION_CANCELLED: "EVENT_REGISTRATION_CANCELLED",
  EVENT_UPDATED: "EVENT_UPDATED",
  EVENT_CANCELLED: "EVENT_CANCELLED",
  COMMUNITY_JOIN_REQUEST: "COMMUNITY_JOIN_REQUEST",
  COMMUNITY_MEMBERSHIP_APPROVED: "COMMUNITY_MEMBERSHIP_APPROVED",
  COMMUNITY_MEMBERSHIP_REJECTED: "COMMUNITY_MEMBERSHIP_REJECTED",
  COMMUNITY_ROLE_CHANGED: "COMMUNITY_ROLE_CHANGED",
  COMMUNITY_ANNOUNCEMENT: "COMMUNITY_ANNOUNCEMENT",
  EVENT_ANNOUNCEMENT: "EVENT_ANNOUNCEMENT",
  CERTIFICATE_ISSUED: "CERTIFICATE_ISSUED",
  SYSTEM_NOTIFICATION: "SYSTEM_NOTIFICATION",
};

export const NOTIFICATION_TYPE_LABELS = {
  EVENT_REGISTRATION_CONFIRMED: "Etkinlik Kaydı",
  EVENT_REGISTRATION_CANCELLED: "Kayıt İptali",
  EVENT_UPDATED: "Etkinlik Güncellemesi",
  EVENT_CANCELLED: "Etkinlik İptali",
  COMMUNITY_JOIN_REQUEST: "Topluluk Başvurusu",
  COMMUNITY_MEMBERSHIP_APPROVED: "Üyelik Onayı",
  COMMUNITY_MEMBERSHIP_REJECTED: "Üyelik Reddi",
  COMMUNITY_ROLE_CHANGED: "Rol Güncellemesi",
  COMMUNITY_ANNOUNCEMENT: "Topluluk Duyurusu",
  EVENT_ANNOUNCEMENT: "Etkinlik Duyurusu",
  CERTIFICATE_ISSUED: "Sertifika Verildi",
  SYSTEM_NOTIFICATION: "Sistem Bildirimi",
};

export const NOTIFICATION_TYPE_ICONS = {
  EVENT_REGISTRATION_CONFIRMED: "event_available",
  EVENT_REGISTRATION_CANCELLED: "event_busy",
  EVENT_UPDATED: "edit_calendar",
  EVENT_CANCELLED: "cancel",
  COMMUNITY_JOIN_REQUEST: "person_add",
  COMMUNITY_MEMBERSHIP_APPROVED: "how_to_reg",
  COMMUNITY_MEMBERSHIP_REJECTED: "person_remove",
  COMMUNITY_ROLE_CHANGED: "admin_panel_settings",
  COMMUNITY_ANNOUNCEMENT: "campaign",
  EVENT_ANNOUNCEMENT: "campaign",
  CERTIFICATE_ISSUED: "verified",
  SYSTEM_NOTIFICATION: "notifications",
};

export function sanitizeDestinationUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

export function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const now = Date.now();
  const past = new Date(dateInput).getTime();
  if (Number.isNaN(past)) return "";
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return "Az önce";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dakika önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} gün önce`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek} hafta önce`;
  return new Date(dateInput).toLocaleDateString("tr-TR");
}

export const formatNotificationRelativeTime = formatRelativeTime;
