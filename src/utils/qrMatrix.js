/**
 * ISO/IEC 18004 Standart QR Kod Matris Üreticisi (Byte Mode, ECC Level L)
 * Harici kütüphane veya CDN gerektirmeden taranabilir SVG QR kod matrisi üretir.
 */

// Version 1..15 için ECC Level L parametreleri:
// [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
const VERSION_TABLE_L = [
  null,
  [26, 7, 1, 19, 0, 0],
  [44, 10, 1, 34, 0, 0],
  [70, 15, 1, 55, 0, 0],
  [100, 20, 1, 80, 0, 0],
  [134, 26, 1, 108, 0, 0],
  [172, 18, 2, 68, 0, 0],
  [196, 20, 2, 78, 0, 0],
  [242, 24, 2, 97, 0, 0],
  [292, 30, 2, 116, 0, 0],
  [346, 18, 2, 68, 2, 69],
  [404, 20, 4, 81, 0, 0],
  [466, 24, 2, 92, 2, 93],
  [532, 26, 4, 107, 0, 0],
  [581, 30, 3, 115, 1, 116],
  [655, 22, 5, 87, 1, 88],
];

const ALIGNMENT_POSITIONS = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
];

// GF(256) log/exp tabloları (polinom 0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function getGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(dataBytes, ecLen) {
  const gen = getGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < dataBytes.length; i++) {
    const factor = dataBytes[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function chooseVersion(byteLength) {
  for (let v = 1; v <= 15; v++) {
    const [, , g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_TABLE_L[v];
    const totalDataCap = g1Blocks * g1Data + g2Blocks * g2Data;
    const headerBits = v <= 9 ? 4 + 8 : 4 + 16;
    const maxPayload = Math.floor((totalDataCap * 8 - headerBits) / 8);
    if (byteLength <= maxPayload) return v;
  }
  throw new Error("QR verisi çok uzun (Maksimum kapasite aşıldı).");
}

function encodeDataCodewords(utf8Bytes, version) {
  const [, , g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_TABLE_L[version];
  const totalDataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator (0100)
  pushBits(0b0100, 4);
  pushBits(utf8Bytes.length, version <= 9 ? 8 : 16);

  for (let i = 0; i < utf8Bytes.length; i++) {
    pushBits(utf8Bytes[i], 8);
  }

  // Terminator (en fazla 4 sıfır biti)
  const maxBits = totalDataCodewords * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(totalDataCodewords);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    codewords[byteIdx++] = b;
  }

  let padToggle = true;
  while (byteIdx < totalDataCodewords) {
    codewords[byteIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  return codewords;
}

function interleaveCodewords(dataCodewords, version) {
  const [totalCodewords, ecLen, g1Blocks, g1Data, g2Blocks, g2Data] =
    VERSION_TABLE_L[version];

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let i = 0; i < g1Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + g1Data);
    offset += g1Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecLen));
  }

  for (let i = 0; i < g2Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + g2Data);
    offset += g2Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecLen));
  }

  const result = new Uint8Array(totalCodewords);
  let ptr = 0;
  const maxDataLen = Math.max(g1Data, g2Data);

  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (col < dataBlocks[b].length) {
        result[ptr++] = dataBlocks[b][col];
      }
    }
  }

  for (let col = 0; col < ecLen; col++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      result[ptr++] = ecBlocks[b][col];
    }
  }

  return result;
}

export function generateQrMatrix(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("QR verisi boş olamaz.");
  }
  const utf8Bytes = new TextEncoder().encode(text);
  const version = chooseVersion(utf8Bytes.length);
  const size = version * 4 + 17;

  const matrix = Array.from({ length: size }, () => new Uint8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const setModule = (r, c, dark) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = dark ? 1 : 0;
      reserved[r][c] = 1;
    }
  };

  // Finder patterns + separators
  const placeFinder = (row, col) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const isBorder =
          (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
        const isCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(r, c, isBorder || isCenter);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns (sadece 3 Finder köşesiyle çakışanlar atlanır)
  const alignCoords = ALIGNMENT_POSITIONS[version];
  const lastIdx = alignCoords.length - 1;
  for (let i = 0; i < alignCoords.length; i++) {
    for (let j = 0; j < alignCoords.length; j++) {
      const overlapsFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === lastIdx) ||
        (i === lastIdx && j === 0);
      if (overlapsFinder) continue;

      const r = alignCoords[i];
      const c = alignCoords[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  // Timing patterns (Alignment pattern olmayan hücrelere yerleştirilir)
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Reserve format info areas & dark module
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) reserved[8][size - 1 - i] = 1;
    if (!reserved[size - 1 - i][8]) reserved[size - 1 - i][8] = 1;
  }
  setModule(size - 8, 8, true);

  // Reserve version info area (for version >= 7)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const vInfo = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vInfo >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(b, a, bit);
      setModule(a, b, bit);
    }
  }

  // Encode & place data bits
  const dataCodewords = encodeDataCodewords(utf8Bytes, version);
  const allCodewords = interleaveCodewords(dataCodewords, version);

  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((size - 1 - right) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!reserved[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = allCodewords[bitIdx >>> 3];
            dark = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Mask pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          matrix[r][c] = dark ? 1 : 0;
        }
      }
    }
  }

  // Format information bits for ECC Level L (01) and Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >>> i) & 1) === 1 ? 1 : 0;
    // Sol-üst
    if (i < 6) matrix[i][8] = bit;
    else if (i < 8) matrix[i + 1][8] = bit;
    else matrix[8][14 - i] = bit;

    // Sağ-üst ve sol-alt
    if (i < 8) matrix[8][size - 1 - i] = bit;
    else matrix[size - 15 + i][8] = bit;
  }

  return matrix;
}
