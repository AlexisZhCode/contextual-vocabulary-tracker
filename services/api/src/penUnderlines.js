import jpeg from 'jpeg-js';

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'as',
  'by',
  'at',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'he',
  'she',
  'they',
  'we',
  'you',
  'i',
  'my',
  'your',
  'our',
  'their',
  'not',
  'no',
  'but',
  'if',
  'so',
  'than',
  'then',
  'also',
  'into',
  'over',
  'such',
  'can',
  'may',
  'will',
  'just',
  'about',
  'which',
  'who',
  'what',
  'when',
  'where',
  'how',
  'why',
]);

function isBluePenPixel(r, g, b) {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const blueBias = b - (r + g) / 2;
  return chroma > 12 && blueBias > 8 && b > 30 && b < 220 && r < 200 && g < 200;
}

function cleanToken(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .replace(/'+/g, "'");
}

function isPlausibleWord(word) {
  if (word.length < 5) return false;
  if (STOP.has(word)) return false;
  if (!/[aeiouy]/.test(word)) return false;
  const vowels = (word.match(/[aeiouy]/g) || []).length;
  if (vowels / word.length < 0.18) return false;
  return true;
}

function extractEnglishWords(text) {
  const matches = String(text || '').match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
  const out = [];
  const seen = new Set();
  for (const match of matches) {
    const word = cleanToken(match);
    if (!isPlausibleWord(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

function decodeJpeg(imageBuffer) {
  try {
    return jpeg.decode(imageBuffer, { useTArray: true, formatAsRGBA: true });
  } catch (error) {
    throw new Error(
      `Could not decode JPEG for pen detection. Convert HEIC/PNG to JPEG first. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function buildInkMask(data, width, height) {
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    if (isBluePenPixel(data[o], data[o + 1], data[o + 2])) {
      ink[i] = 1;
    }
  }
  return ink;
}

function dilateHorizontal(ink, width, height, radius = 3) {
  const out = new Uint8Array(ink.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        if (ink[row + xx]) {
          on = 1;
          break;
        }
      }
      out[row + x] = on;
    }
  }
  return out;
}

function findUnderlineSegments(ink, width, height) {
  const rowInk = new Int32Array(height);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (ink[row + x]) count += 1;
    }
    rowInk[y] = count;
  }

  const minRowInk = Math.max(12, Math.floor(width * 0.015));
  const candidateRows = [];
  for (let y = 0; y < height; y += 1) {
    if (rowInk[y] >= minRowInk) candidateRows.push(y);
  }

  const bands = [];
  let bandStart = null;
  let prev = null;
  for (const y of candidateRows) {
    if (bandStart == null) {
      bandStart = y;
      prev = y;
      continue;
    }
    if (y - prev <= 4) {
      prev = y;
      continue;
    }
    bands.push([bandStart, prev]);
    bandStart = y;
    prev = y;
  }
  if (bandStart != null) bands.push([bandStart, prev]);

  const segments = [];
  const maxStrokeW = Math.floor(width * 0.52); // ignore full-width page tint
  const minStrokeW = Math.max(22, Math.floor(width * 0.035));

  for (const [y0, y1] of bands) {
    const bandH = y1 - y0 + 1;
    if (bandH > Math.max(14, Math.floor(height * 0.02))) continue;

    const colHits = new Uint8Array(width);
    for (let y = y0; y <= y1; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        if (ink[row + x]) colHits[x] = 1;
      }
    }

    let runStart = null;
    const flush = (runEnd) => {
      if (runStart == null) return;
      const runW = runEnd - runStart + 1;
      if (runW < minStrokeW || runW > maxStrokeW) {
        runStart = null;
        return;
      }
      // Require enough ink density in the run (avoid faint tint streaks).
      let inkPixels = 0;
      for (let y = y0; y <= y1; y += 1) {
        const row = y * width;
        for (let x = runStart; x <= runEnd; x += 1) {
          if (ink[row + x]) inkPixels += 1;
        }
      }
      const area = runW * bandH;
      if (inkPixels / area < 0.08) {
        runStart = null;
        return;
      }

      segments.push({
        x0: Math.max(0, runStart - 6),
        x1: Math.min(width - 1, runEnd + 6),
        y0,
        y1,
      });
      runStart = null;
    };

    for (let x = 0; x < width; x += 1) {
      if (colHits[x]) {
        if (runStart == null) runStart = x;
      } else if (runStart != null) {
        let gapOk = false;
        for (let look = 1; look <= 8; look += 1) {
          if (x + look < width && colHits[x + look]) {
            gapOk = true;
            break;
          }
        }
        if (!gapOk) flush(x - 1);
      }
    }
    flush(width - 1);
  }

  segments.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(seg.y0 - last.y0) <= 12 && seg.x0 <= last.x1 + 40) {
      last.x1 = Math.max(last.x1, seg.x1);
      last.y0 = Math.min(last.y0, seg.y0);
      last.y1 = Math.max(last.y1, seg.y1);
      if (last.x1 - last.x0 > maxStrokeW) merged.pop();
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function cropRgba(data, width, height, box, scale = 2) {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(width - 1, Math.ceil(box.x1));
  const y1 = Math.min(height - 1, Math.ceil(box.y1));
  const cw = Math.max(1, x1 - x0 + 1);
  const ch = Math.max(1, y1 - y0 + 1);
  const srcCrop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    const src = ((y0 + y) * width + x0) * 4;
    data.copy(srcCrop, y * cw * 4, src, src + cw * 4);
  }

  const sw = cw * scale;
  const sh = ch * scale;
  const out = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const o = (sy * cw + sx) * 4;
      let gray = 0.3 * srcCrop[o] + 0.59 * srcCrop[o + 1] + 0.11 * srcCrop[o + 2];
      gray = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      const d = (y * sw + x) * 4;
      out[d] = gray;
      out[d + 1] = gray;
      out[d + 2] = gray;
      out[d + 3] = 255;
    }
  }

  const encoded = jpeg.encode({ data: out, width: sw, height: sh }, 92);
  return Buffer.from(encoded.data);
}

/**
 * Detect blue/purple pen underlines, OCR the text band above each stroke.
 */
export async function findPenUnderlinedWords(imageBuffer, worker) {
  const decoded = decodeJpeg(imageBuffer);
  const width = decoded.width;
  const height = decoded.height;
  const data = Buffer.from(decoded.data);

  const ink = dilateHorizontal(buildInkMask(data, width, height), width, height, 3);
  const segments = findUnderlineSegments(ink, width, height);

  const allWords = [];
  const seen = new Set();
  const rawParts = [];

  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  for (const seg of segments) {
    const strokeH = Math.max(2, seg.y1 - seg.y0 + 1);
    const bandH = Math.max(48, Math.min(96, Math.floor(width * 0.065) + strokeH * 4));
    const cropBox = {
      x0: Math.max(0, seg.x0 - 12),
      x1: Math.min(width - 1, seg.x1 + 12),
      y0: Math.max(0, seg.y0 - bandH),
      y1: Math.min(height - 1, seg.y1 + 3),
    };
    if (cropBox.x1 - cropBox.x0 < 24 || cropBox.y1 - cropBox.y0 < 20) continue;

    const cropJpeg = cropRgba(data, width, height, cropBox, 2);
    const result = await worker.recognize(cropJpeg);
    const text = (result?.data?.text || '').trim();
    if (text) rawParts.push(text);

    // Prefer the last non-empty OCR line (closest to the pen stroke).
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const focusLine = lines.length > 0 ? lines[lines.length - 1] : text;
    const finalTokens = extractEnglishWords(focusLine);

    for (const word of finalTokens) {
      if (seen.has(word)) continue;
      seen.add(word);
      allWords.push(word);
    }
  }

  await worker.setParameters({
    tessedit_pageseg_mode: '3',
  });

  return {
    words: allWords,
    rawText: rawParts.join(' | ').trim(),
    marks: segments.length,
    ocrPreview: rawParts.join(' | ').slice(0, 240),
  };
}
