import { CONTRACT_ADDRESS, MONAD_CHAIN_ID } from "../data/events.js";
import { formatTurkeyDateTime } from "./eventMetadata.js";
import { generateQrMatrix } from "./qrMatrix.js";

export const A4_LANDSCAPE_WIDTH_PT = 841.89;
export const A4_LANDSCAPE_HEIGHT_PT = 595.28;

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Standart PDF Type1 (Helvetica) fontlarında WinAnsi/ASCII uyumluluğu için
 * Türkçe karakterleri PDF metin akışında okunaklı karşılıklarına dönüştürür
 * ve PDF parantez kaçışlarını uygular. (SVG ve tarayıcı önizlemesinde tam UTF-8 Türkçe kullanılır.)
 */
export function normalizePdfText(input) {
  const charMap = {
    ğ: "g",
    Ğ: "G",
    ü: "u",
    Ü: "U",
    ş: "s",
    Ş: "S",
    ı: "i",
    İ: "I",
    ö: "o",
    Ö: "O",
    ç: "c",
    Ç: "C",
    â: "a",
    Â: "A",
    î: "i",
    Î: "I",
    û: "u",
    Û: "U",
    "•": "-",
    "—": "-",
    "–": "-",
  };

  const mapped = String(input ?? "").replace(
    /[ğĞüÜşŞıİöÖçÇâÂîÎûÛ•—–]/g,
    (ch) => charMap[ch] || ch
  );

  // Yalnızca yazdırılabilir ASCII (32..126) karakterleri tut ve PDF string kaçışlarını uygula
  return mapped
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Uzun etkinlik başlıklarını A4 sertifika düzenini taşırmadan satırlara böler.
 */
export function wrapCertificateTitleLines(
  title,
  maxCharsPerLine = 44,
  maxLines = 2
) {
  const clean = String(title || "Kampüs Etkinliği")
    .trim()
    .replace(/\s+/g, " ");
  if (clean.length <= maxCharsPerLine) {
    return [clean];
  }

  const words = clean.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word.slice(0, maxCharsPerLine));
        currentLine = word.slice(maxCharsPerLine);
      }
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  const consumedWords = lines.join(" ").split(" ").filter(Boolean).length;
  const remainingText = words.slice(consumedWords).join(" ");
  if (remainingText) {
    if (remainingText.length > maxCharsPerLine) {
      lines.push(`${remainingText.slice(0, maxCharsPerLine - 1).trim()}…`);
    } else {
      lines.push(remainingText);
    }
  } else if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
}

/**
 * Sertifika doğrulama bağlantısını (/verify/:certificateId) oluşturur.
 */
export function buildVerificationUrl(certificateId, baseOrigin = null) {
  const cleanId = String(certificateId || "").trim().toUpperCase();
  const origin =
    baseOrigin ||
    (typeof globalThis !== "undefined" &&
    globalThis.window &&
    globalThis.window.location?.origin
      ? globalThis.window.location.origin
      : "https://campuspass.monad.xyz");
  return `${origin.replace(/\/+$/, "")}/verify/${encodeURIComponent(cleanId)}`;
}

/**
 * Prestijli yatay A4 (1123x794 px / 297x210 mm) üniversite sertifikası SVG çıktısını üretir.
 */
export function buildCertificateSvgMarkup(
  certificate,
  { baseOrigin = null, displayNameOverride = null } = {}
) {
  if (!certificate || !certificate.certificateId) {
    throw new Error("Geçerli bir sertifika nesnesi gereklidir.");
  }

  const verificationUrl = buildVerificationUrl(
    certificate.certificateId,
    baseOrigin
  );
  const qrMatrix = generateQrMatrix(verificationUrl);
  const qrSize = qrMatrix.length;
  const qrBoxSize = 132;
  const qrCellSize = qrBoxSize / (qrSize + 4);

  let qrRects = "";
  for (let r = 0; r < qrSize; r++) {
    for (let c = 0; c < qrSize; c++) {
      if (qrMatrix[r][c] === 1) {
        const x = ((c + 2) * qrCellSize).toFixed(2);
        const y = ((r + 2) * qrCellSize).toFixed(2);
        const s = (qrCellSize + 0.15).toFixed(2);
        qrRects += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#0b132b"/>`;
      }
    }
  }

  const titleLines = wrapCertificateTitleLines(certificate.eventTitle, 44, 2);
  const effectiveDisplayName =
    displayNameOverride !== null
      ? String(displayNameOverride || "").trim()
      : String(certificate.displayName || "").trim();

  const issuedFormatted = formatTurkeyDateTime(
    certificate.issuedAt || new Date().toISOString()
  );
  const eventDateFormatted = certificate.eventStartAt
    ? formatTurkeyDateTime(certificate.eventStartAt)
    : issuedFormatted;

  const chainId = Number(certificate.chainId || MONAD_CHAIN_ID);
  const contractAddress = certificate.contractAddress || CONTRACT_ADDRESS;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1123 794" width="100%" height="100%" role="img" aria-label="CampusPass Dijital Katılım Sertifikası - ${escapeXml(certificate.certificateId)}">
  <defs>
    <linearGradient id="cpNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b132b"/>
      <stop offset="100%" stop-color="#1c2541"/>
    </linearGradient>
    <linearGradient id="cpGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#b38728"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#aa771c"/>
    </linearGradient>
  </defs>

  <!-- Fildişi / Kırık Beyaz Akademik Zemin -->
  <rect width="1123" height="794" fill="#fcfbf7"/>

  <!-- Dış Lacivert Çerçeve ve Kontrollü Altın Çizgiler -->
  <rect x="24" y="24" width="1075" height="746" rx="8" fill="none" stroke="#0b132b" stroke-width="6"/>
  <rect x="36" y="36" width="1051" height="722" rx="4" fill="none" stroke="url(#cpGoldGrad)" stroke-width="2"/>
  <rect x="44" y="44" width="1035" height="706" rx="2" fill="none" stroke="#0b132b" stroke-width="1" stroke-opacity="0.35"/>

  <!-- Üst Akademik Başlık Bandı -->
  <path d="M 44 44 L 1079 44 L 1079 162 L 44 162 Z" fill="url(#cpNavyGrad)"/>
  <line x1="44" y1="162" x2="1079" y2="162" stroke="url(#cpGoldGrad)" stroke-width="4"/>

  <!-- Kurumsal Başlık -->
  <text x="561.5" y="88" text-anchor="middle" fill="#e6c665" font-family="Georgia, 'Times New Roman', serif" font-size="14" font-weight="bold" letter-spacing="3">
    CAMPUSPASS • BLOKZİNCİR DOĞRULAMALI ETKİNLİK KATILIM BELGESİ
  </text>
  <text x="561.5" y="132" text-anchor="middle" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="32" font-weight="bold" letter-spacing="2">
    DİJİTAL KATILIM SERTİFİKASI
  </text>

  <!-- Sunuş Metni -->
  <text x="561.5" y="206" text-anchor="middle" fill="#334155" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="15">
    Aşağıda cüzdan kimliği belirtilen katılımcının, organizatör tarafından blokzincir üzerinde (AttendanceMarked)
  </text>
  <text x="561.5" y="228" text-anchor="middle" fill="#334155" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="15">
    doğrulanmış olarak aşağıdaki kampüs etkinliğine katıldığı kriptografik olarak kayıt altına alınmıştır:
  </text>

  <!-- Etkinlik Başlığı (Çok Satırlı Taşma Korumalı) -->
  ${
    titleLines.length === 1
      ? `<text x="561.5" y="282" text-anchor="middle" fill="#0b132b" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="bold">${escapeXml(titleLines[0])}</text>`
      : `<text x="561.5" y="268" text-anchor="middle" fill="#0b132b" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-weight="bold">${escapeXml(titleLines[0])}</text>
         <text x="561.5" y="300" text-anchor="middle" fill="#0b132b" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-weight="bold">${escapeXml(titleLines[1])}</text>`
  }

  <!-- Topluluk & Etkinlik Tarihi -->
  <text x="561.5" y="334" text-anchor="middle" fill="#7c5812" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="15" font-weight="bold">
    ${escapeXml(certificate.community || "Kampüs Topluluğu")} • ${escapeXml(certificate.category || "Etkinlik")} • ${escapeXml(eventDateFormatted)} (TSİ)
  </text>

  <line x1="220" y1="352" x2="903" y2="352" stroke="#cbd5e1" stroke-width="1"/>

  <!-- Katılımcı Cüzdan Kimliği Kutusu -->
  <rect x="82" y="370" width="959" height="${effectiveDisplayName ? "102" : "76"}" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.2"/>
  <text x="561.5" y="395" text-anchor="middle" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold" letter-spacing="1.2">
    DOĞRULANAN KATILIMCI CÜZDAN ADRESİ (BİRİNCİL BLOKZİNCİR KİMLİĞİ)
  </text>
  <text x="561.5" y="424" text-anchor="middle" fill="#0b132b" font-family="'Courier New', Courier, monospace" font-size="20" font-weight="bold">
    ${escapeXml(certificate.participantAddress)}
  </text>
  ${
    effectiveDisplayName
      ? `<text x="561.5" y="454" text-anchor="middle" fill="#334155" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="14" font-weight="bold">
          Katılımcı Beyanı Gösterim Adı: ${escapeXml(effectiveDisplayName)} <tspan fill="#64748b" font-weight="normal" font-size="12">(Cüzdan sahibi beyanıdır, resmî kimlik doğrulaması değildir)</tspan>
        </text>`
      : ""
  }

  <!-- Sol Alt: Zincir Üstü Kanıt & Meta Veriler -->
  <g transform="translate(82, 492)">
    <text x="0" y="18" fill="#0b132b" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="13" font-weight="bold">
      BLOKZİNCİR VE DOĞRULAMA KANIT BİLGİLERİ
    </text>
    <line x1="0" y1="26" x2="730" y2="26" stroke="#c59b27" stroke-width="1.5"/>

    <text x="0" y="48" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Sertifika Kimliği (ID):</text>
    <text x="175" y="48" fill="#0b132b" font-family="'Courier New', Courier, monospace" font-size="13" font-weight="bold">${escapeXml(certificate.certificateId)}</text>

    <text x="0" y="70" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Organizatör Cüzdanı:</text>
    <text x="175" y="70" fill="#0f172a" font-family="'Courier New', Courier, monospace" font-size="12.5">${escapeXml(certificate.organizerAddress)}</text>

    <text x="0" y="92" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Blokzincir Ağı &amp; Sözleşme:</text>
    <text x="175" y="92" fill="#0f172a" font-family="'Courier New', Courier, monospace" font-size="12.5">Monad Testnet (Chain ID: ${escapeXml(chainId)}) • ${escapeXml(contractAddress)}</text>

    <text x="0" y="114" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Katılım İşlem Özeti (Tx):</text>
    <text x="175" y="114" fill="#0f172a" font-family="'Courier New', Courier, monospace" font-size="12">${escapeXml(certificate.attendanceTxHash)}</text>

    <text x="0" y="136" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Blok / Log / Veriliş Tarihi:</text>
    <text x="175" y="136" fill="#0f172a" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12.5">Blok #${escapeXml(certificate.attendanceBlockNumber)} (Log #${escapeXml(certificate.attendanceLogIndex)}) • Veriliş: ${escapeXml(issuedFormatted)} (TSİ)</text>

    <text x="0" y="158" fill="#475569" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="12" font-weight="bold">Bütünlük Özeti (SHA-256):</text>
    <text x="175" y="158" fill="#0f172a" font-family="'Courier New', Courier, monospace" font-size="11.5">${escapeXml(certificate.certificateHash || "")}</text>
  </g>

  <!-- Sağ Alt: Taranabilir QR Doğrulama Kutusu -->
  <g transform="translate(866, 488)">
    <rect x="0" y="0" width="174" height="196" rx="8" fill="#ffffff" stroke="#0b132b" stroke-width="2"/>
    <g transform="translate(21, 12)">
      <rect width="${qrBoxSize}" height="${qrBoxSize}" fill="#ffffff"/>
      ${qrRects}
    </g>
    <text x="87" y="160" text-anchor="middle" fill="#0b132b" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="11" font-weight="bold">
      QR İLE CANLI DOĞRULA
    </text>
    <text x="87" y="176" text-anchor="middle" fill="#475569" font-family="'Courier New', Courier, monospace" font-size="9.5">
      /verify/${escapeXml(certificate.certificateId.slice(0, 16))}…
    </text>
  </g>

  <!-- Alt Yasal ve Akademik Uyarı Şeridi -->
  <line x1="64" y1="704" x2="1059" y2="704" stroke="#cbd5e1" stroke-width="1"/>
  <text x="561.5" y="724" text-anchor="middle" fill="#64748b" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="11">
    UYARI: Bu belge resmî bir üniversite diploması veya akademik yeterlilik belgesi değildir; yalnızca belirtilen cüzdan adresinin Monad Testnet üzerindeki
  </text>
  <text x="561.5" y="740" text-anchor="middle" fill="#64748b" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="11">
    CampusPass akıllı sözleşmesinde (${escapeXml(contractAddress)}) doğrulanmış etkinlik katılımını (AttendanceMarked) temsil eder. Doğrulama: ${escapeXml(verificationUrl)}
  </text>
</svg>`;
}

/**
 * Harici bağımlılık gerektirmeden gerçek A4 Yatay (%PDF-1.4, 841.89 x 595.28 pt)
 * vektörel PDF belgesi (QR kod matrisi dahil) üretir.
 */
export function generateCertificatePdfDocument(
  certificate,
  { baseOrigin = null, displayNameOverride = null } = {}
) {
  if (!certificate || !certificate.certificateId) {
    throw new Error("PDF üretimi için geçerli bir sertifika nesnesi gereklidir.");
  }

  const verificationUrl = buildVerificationUrl(
    certificate.certificateId,
    baseOrigin
  );
  const qrMatrix = generateQrMatrix(verificationUrl);
  const svgMarkup = buildCertificateSvgMarkup(certificate, {
    baseOrigin,
    displayNameOverride,
  });

  const titleLines = wrapCertificateTitleLines(certificate.eventTitle, 44, 2);
  const effectiveDisplayName =
    displayNameOverride !== null
      ? String(displayNameOverride || "").trim()
      : String(certificate.displayName || "").trim();

  const issuedFormatted = formatTurkeyDateTime(
    certificate.issuedAt || new Date().toISOString()
  );
  const eventDateFormatted = certificate.eventStartAt
    ? formatTurkeyDateTime(certificate.eventStartAt)
    : issuedFormatted;
  const chainId = Number(certificate.chainId || MONAD_CHAIN_ID);
  const contractAddress = certificate.contractAddress || CONTRACT_ADDRESS;

  const cmds = [];

  // 1. Arka Plan (#fcfbf7 -> 0.988 0.984 0.969)
  cmds.push("0.988 0.984 0.969 rg");
  cmds.push(`0 0 ${A4_LANDSCAPE_WIDTH_PT} ${A4_LANDSCAPE_HEIGHT_PT} re f`);

  // 2. Dış Lacivert Çerçeve (#0b132b -> 0.043 0.075 0.169)
  cmds.push("0.043 0.075 0.169 RG 4 w");
  cmds.push("20 20 801.89 555.28 re S");

  // 3. Altın İç Çerçeve (#c59b27 -> 0.773 0.608 0.153)
  cmds.push("0.773 0.608 0.153 RG 1.5 w");
  cmds.push("28 28 785.89 539.28 re S");

  // 4. Üst Lacivert Başlık Bandı
  cmds.push("0.043 0.075 0.169 rg");
  cmds.push("32 478 777.89 85 re f");
  cmds.push("0.773 0.608 0.153 RG 2.5 w");
  cmds.push("32 478 m 809.89 478 l S");

  const addText = (font, size, x, y, rgb, text) => {
    const [r, g, b] = rgb;
    cmds.push(
      `BT /${font} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${normalizePdfText(text)}) Tj ET`
    );
  };

  // Başlık Metinleri
  addText(
    "F1",
    10,
    215,
    538,
    [0.9, 0.776, 0.396],
    "CAMPUSPASS - BLOKZINCIR DOGRULAMALI ETKINLIK KATILIM BELGESI"
  );
  addText(
    "F1",
    22,
    245,
    502,
    [1, 1, 1],
    "DIJITAL KATILIM SERTIFIKASI"
  );

  // Sunuş
  addText(
    "F2",
    10.5,
    130,
    452,
    [0.2, 0.25, 0.33],
    "Asagida cuzdan kimligi belirtilen katilimcinin, organizator tarafindan blokzincir uzerinde (AttendanceMarked)"
  );
  addText(
    "F2",
    10.5,
    155,
    436,
    [0.2, 0.25, 0.33],
    "dogrulanmis olarak asagidaki kampus etkinligine katildigi kriptografik olarak kayit altina alinmistir:"
  );

  // Etkinlik Başlığı
  if (titleLines.length === 1) {
    addText("F1", 18, 90, 402, [0.043, 0.075, 0.169], titleLines[0]);
  } else {
    addText("F1", 16, 90, 408, [0.043, 0.075, 0.169], titleLines[0]);
    addText("F1", 16, 90, 388, [0.043, 0.075, 0.169], titleLines[1]);
  }

  addText(
    "F1",
    11,
    90,
    366,
    [0.486, 0.345, 0.071],
    `${certificate.community || "Kampus Toplulugu"} | ${certificate.category || "Etkinlik"} | Etkinlik Tarihi: ${eventDateFormatted} (TSI)`
  );

  // Katılımcı Cüzdan Kutusu
  cmds.push("0.945 0.961 0.976 rg 0.796 0.835 0.882 RG 1 w");
  cmds.push("60 282 721.89 68 re B");

  addText(
    "F1",
    9.5,
    80,
    333,
    [0.278, 0.333, 0.412],
    "DOGRULANAN KATILIMCI CUZDAN ADRESI (BIRINCIL BLOKZINCIR KIMLIGI):"
  );
  addText(
    "F3",
    14,
    80,
    312,
    [0.043, 0.075, 0.169],
    certificate.participantAddress
  );

  if (effectiveDisplayName) {
    addText(
      "F2",
      9.5,
      80,
      292,
      [0.2, 0.25, 0.33],
      `Katilimci Beyani Gosterim Adi: ${effectiveDisplayName} (Cuzdan sahibi beyanidir, resmi kimlik dogrulamasi degildir)`
    );
  }

  // Blokzincir Kanıt Alanı
  addText(
    "F1",
    10.5,
    60,
    256,
    [0.043, 0.075, 0.169],
    "BLOKZINCIR VE DOGRULAMA KANIT BILGILERI"
  );
  cmds.push("0.773 0.608 0.153 RG 1 w 60 250 m 610 250 l S");

  addText("F1", 9.5, 60, 232, [0.278, 0.333, 0.412], "Sertifika Kimligi (ID):");
  addText("F3", 10, 195, 232, [0.043, 0.075, 0.169], certificate.certificateId);

  addText("F1", 9.5, 60, 214, [0.278, 0.333, 0.412], "Organizator Cuzdani:");
  addText("F3", 9.5, 195, 214, [0.06, 0.09, 0.16], certificate.organizerAddress);

  addText("F1", 9.5, 60, 196, [0.278, 0.333, 0.412], "Ag ve Akilli Sozlesme:");
  addText(
    "F3",
    9,
    195,
    196,
    [0.06, 0.09, 0.16],
    `Monad Testnet (Chain ID: ${chainId}) - ${contractAddress}`
  );

  addText("F1", 9.5, 60, 178, [0.278, 0.333, 0.412], "Katilim Islem Ozeti (Tx):");
  addText("F3", 8.5, 195, 178, [0.06, 0.09, 0.16], certificate.attendanceTxHash);

  addText("F1", 9.5, 60, 160, [0.278, 0.333, 0.412], "Blok / Log / Verilis:");
  addText(
    "F2",
    9.5,
    195,
    160,
    [0.06, 0.09, 0.16],
    `Blok #${certificate.attendanceBlockNumber} (Log #${certificate.attendanceLogIndex}) | Verilis: ${issuedFormatted} (TSI)`
  );

  addText("F1", 9.5, 60, 142, [0.278, 0.333, 0.412], "Butunluk Ozeti (SHA-256):");
  addText("F3", 8.5, 195, 142, [0.06, 0.09, 0.16], certificate.certificateHash || "");

  addText("F1", 9.5, 60, 124, [0.278, 0.333, 0.412], "Dogrulama Baglantisi:");
  addText("F3", 8.5, 195, 124, [0.06, 0.09, 0.16], verificationUrl);

  // Vektörel QR Kod Çizimi (Sağ Alt Kutu)
  const qrBoxX = 640;
  const qrBoxY = 112;
  const qrBoxW = 140;
  const qrBoxH = 152;
  cmds.push("1 1 1 rg 0.043 0.075 0.169 RG 1.5 w");
  cmds.push(`${qrBoxX} ${qrBoxY} ${qrBoxW} ${qrBoxH} re B`);

  const qrSize = qrMatrix.length;
  const qrDrawSize = 106;
  const cellPt = qrDrawSize / qrSize;
  const qrStartX = qrBoxX + (qrBoxW - qrDrawSize) / 2;
  const qrTopY = qrBoxY + qrBoxH - 12;

  cmds.push("0.043 0.075 0.169 rg");
  for (let r = 0; r < qrSize; r++) {
    for (let c = 0; c < qrSize; c++) {
      if (qrMatrix[r][c] === 1) {
        const rx = qrStartX + c * cellPt;
        const ry = qrTopY - (r + 1) * cellPt;
        cmds.push(
          `${rx.toFixed(2)} ${ry.toFixed(2)} ${(cellPt + 0.08).toFixed(2)} ${(cellPt + 0.08).toFixed(2)} re f`
        );
      }
    }
  }

  addText("F1", 8.5, qrBoxX + 18, qrBoxY + 18, [0.043, 0.075, 0.169], "QR ILE CANLI DOGRULA");

  // Alt Uyarı Metni
  cmds.push("0.796 0.835 0.882 RG 0.8 w 50 78 m 791.89 78 l S");
  addText(
    "F2",
    8,
    60,
    60,
    [0.39, 0.45, 0.55],
    "UYARI: Bu belge resmi bir universite diplomasi veya akademik yeterlilik belgesi degildir; yalnizca belirtilen cuzdan adresinin Monad Testnet"
  );
  addText(
    "F2",
    8,
    60,
    47,
    [0.39, 0.45, 0.55],
    `uzerindeki CampusPass akilli sozlesmesinde (${contractAddress}) dogrulanmis etkinlik katilimini (AttendanceMarked) temsil eder.`
  );

  const streamContent = cmds.join("\n");
  const streamByteLength = new TextEncoder().encode(streamContent).length;

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_LANDSCAPE_WIDTH_PT} ${A4_LANDSCAPE_HEIGHT_PT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    `7 0 obj\n<< /Length ${streamByteLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdfString = "%PDF-1.4\n";
  const offsets = [0];
  for (const objStr of objects) {
    offsets.push(new TextEncoder().encode(pdfString).length);
    pdfString += objStr;
  }

  const xrefOffset = new TextEncoder().encode(pdfString).length;
  pdfString += `xref\n0 ${objects.length + 1}\n`;
  pdfString += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdfString += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdfString += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBytes = new TextEncoder().encode(pdfString);
  const fileName = `CampusPass-Sertifika-${certificate.certificateId}.pdf`;

  return {
    pdfBytes,
    pdfString,
    svgMarkup,
    qrMatrix,
    verificationUrl,
    fileName,
  };
}

/**
 * Tarayıcıda tek tıkla A4 yatay PDF dosyasını indirir.
 */
export function downloadCertificatePdf(certificate, options = {}) {
  const doc = generateCertificatePdfDocument(certificate, options);
  if (
    typeof globalThis !== "undefined" &&
    globalThis.window &&
    globalThis.document &&
    typeof Blob !== "undefined"
  ) {
    const blob = new Blob([doc.pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement("a");
    link.href = url;
    link.download = doc.fileName;
    globalThis.document.body.appendChild(link);
    link.click();
    globalThis.document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return doc;
}

/**
 * Tarayıcıda tam Türkçe tipografili yüksek çözünürlüklü A4 Yatay yazdırma / PDF kaydetme penceresini açar.
 */
export function openCertificatePrintWindow(certificate, options = {}) {
  const svgMarkup = buildCertificateSvgMarkup(certificate, options);
  if (typeof globalThis === "undefined" || !globalThis.window) {
    return svgMarkup;
  }

  const printWin = globalThis.window.open("", "_blank", "width=1160,height=840");
  if (!printWin) {
    return svgMarkup;
  }

  printWin.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>CampusPass Sertifika - ${escapeXml(certificate.certificateId)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 297mm;
      height: 210mm;
      background: #fcfbf7;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cert-sheet {
      width: 297mm;
      height: 210mm;
    }
  </style>
</head>
<body>
  <div class="cert-sheet">${svgMarkup}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`);
  printWin.document.close();
  return svgMarkup;
}
