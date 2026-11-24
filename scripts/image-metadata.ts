/**
 * Image metadata checker. An allowlist: every marker, chunk or structure not
 * listed below fails, naming the file and what was found. Used by the
 * pre-commit hook (lint-staged) and by e2e/guards.spec.ts.
 *
 *   npx tsx scripts/image-metadata.ts [--hook] <file>...
 *
 * Exits 1 when any file fails. With --hook it also names the fix.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG_SIGNATURE, readIcoDirectory } from "../e2e/support/ico";

const PNG_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "pHYs",
  "bKGD",
  "sBIT",
]);

/** Chunks whose size the PNG spec fixes; any other size hides bytes. */
const PNG_FIXED_SIZES: Record<string, number> = {
  IHDR: 13,
  IEND: 0,
  gAMA: 4,
  cHRM: 32,
  sRGB: 1,
  pHYs: 9,
};

const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF"]);
/** The only chunks an ANMF frame may hold, after its 16-byte header. */
const WEBP_FRAME_CHUNKS = new Set(["VP8 ", "VP8L", "ALPH"]);
const WEBP_FIXED_SIZES: Record<string, number> = { VP8X: 10, ANIM: 6 };

/** A chunk or marker name, printable even when the bytes are not. */
const printable = (s: string) => JSON.stringify(s.trim()).slice(1, -1);

function jpegMarkerName(marker: number): string {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker >= 0xd0 && marker <= 0xd7) return `RST${marker - 0xd0}`;
  const names: Record<number, string> = {
    0x01: "TEM",
    0xc4: "DHT",
    0xc8: "JPG",
    0xcc: "DAC",
    0xd8: "SOI",
    0xd9: "EOI",
    0xda: "SOS",
    0xdb: "DQT",
    0xdc: "DNL",
    0xdd: "DRI",
    0xde: "DHP",
    0xdf: "EXP",
    0xfe: "COM",
  };
  if (names[marker]) return names[marker];
  if (marker >= 0xc0 && marker <= 0xcf) return `SOF${marker - 0xc0}`;
  return `marker 0x${marker.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** What an application segment carries, from its known identifiers only. */
function appKind(segment: Buffer): string {
  const head = segment.toString("latin1", 0, 40);
  if (head.startsWith("Exif\0")) return "Exif";
  if (head.startsWith("http://ns.adobe.com/xap/1.0/")) return "XMP";
  if (head.startsWith("http://ns.adobe.com/xmp/extension/")) return "XMP";
  if (head.startsWith("Photoshop 3.0")) return "Photoshop IRB";
  if (head.startsWith("JFIF\0")) return "JFIF";
  if (head.startsWith("ICC_PROFILE\0")) return "ICC_PROFILE";
  if (head.startsWith("Adobe")) return "Adobe";
  // Never echo the bytes: an unknown segment's payload may be the metadata.
  return "unidentified payload";
}

const isSof = (m: number) =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

export function checkJpeg(buf: Buffer): string[] {
  const problems: string[] = [];
  let pos = 2; // after SOI
  for (;;) {
    if (pos >= buf.length) {
      problems.push("no EOI marker (the file is cut short)");
      return problems;
    }
    if (buf[pos] !== 0xff) {
      problems.push(
        `unexpected byte 0x${buf[pos].toString(16)} at offset ${pos}`
      );
      return problems;
    }
    while (buf[pos] === 0xff) pos++;
    const marker = buf[pos];
    pos++;
    const name = jpegMarkerName(marker);
    if (marker === 0xd9) {
      if (pos < buf.length) {
        problems.push(`${buf.length - pos} bytes after EOI`);
      }
      return problems;
    }
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0xd8 || marker === 0x01 || marker === undefined) {
      problems.push(`${name} marker at offset ${pos - 2}`);
      return problems;
    }
    if (pos + 2 > buf.length) {
      problems.push(`${name} segment is cut short`);
      return problems;
    }
    const length = buf.readUInt16BE(pos);
    if (length < 2 || pos + length > buf.length) {
      problems.push(`${name} segment runs past the end of the file`);
      return problems;
    }
    const segment = buf.subarray(pos + 2, pos + length);
    if (marker === 0xe0) {
      if (!segment.toString("latin1", 0, 5).startsWith("JFIF\0")) {
        problems.push(`APP0 segment (${appKind(segment)}), not JFIF`);
      } else if (segment.length !== 14) {
        // JFIF is 14 bytes; anything more is a thumbnail or hidden bytes.
        problems.push(
          `APP0 JFIF segment is ${segment.length} bytes, not 14 (a thumbnail or extra bytes)`
        );
      }
    } else if (marker === 0xe2) {
      if (!segment.toString("latin1", 0, 12).startsWith("ICC_PROFILE\0")) {
        problems.push(`APP2 segment (${appKind(segment)}), not ICC_PROFILE`);
      }
    } else if (marker === 0xee) {
      if (!segment.toString("latin1", 0, 5).startsWith("Adobe")) {
        problems.push(`APP14 segment (${appKind(segment)}), not Adobe`);
      } else if (segment.length !== 12) {
        problems.push(
          `APP14 Adobe segment is ${segment.length} bytes, not 12 (extra bytes)`
        );
      }
    } else if (marker >= 0xe1 && marker <= 0xef) {
      problems.push(`${name} segment (${appKind(segment)})`);
    } else if (marker === 0xfe) {
      problems.push("COM segment (a comment)");
    } else if (
      marker !== 0xdb &&
      marker !== 0xc4 &&
      marker !== 0xdd &&
      marker !== 0xda &&
      !isSof(marker)
    ) {
      problems.push(`${name} segment`);
    }
    pos += length;
    if (marker === 0xda) {
      // Entropy-coded data runs to the next marker that is not a stuffed
      // 0xFF00 or a restart marker.
      while (pos < buf.length) {
        if (buf[pos] === 0xff) {
          const next = buf[pos + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            pos += 2;
            continue;
          }
          break;
        }
        pos++;
      }
    }
  }
}

export function checkPng(buf: Buffer): string[] {
  const problems: string[] = [];
  let pos = 8;
  let first = true;
  while (pos < buf.length) {
    if (pos + 8 > buf.length) {
      problems.push(`chunk header cut short at offset ${pos}`);
      return problems;
    }
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    if (pos + 12 + length > buf.length) {
      problems.push(`chunk ${printable(type)} runs past the end of the file`);
      return problems;
    }
    if (first && type !== "IHDR") problems.push("first chunk is not IHDR");
    first = false;
    if (!PNG_CHUNKS.has(type)) problems.push(`chunk ${printable(type)}`);
    const fixed = PNG_FIXED_SIZES[type];
    if (fixed !== undefined && length !== fixed) {
      problems.push(`chunk ${type} is ${length} bytes, not ${fixed}`);
    }
    pos += 12 + length;
    if (type === "IEND") {
      if (pos < buf.length)
        problems.push(`${buf.length - pos} bytes after IEND`);
      return problems;
    }
  }
  problems.push("no IEND chunk (the file is cut short)");
  return problems;
}

export function checkWebp(buf: Buffer): string[] {
  const problems: string[] = [];
  const end = 8 + buf.readUInt32LE(4);
  if (end > buf.length) {
    problems.push("RIFF size runs past the end of the file");
  } else if (end < buf.length) {
    problems.push(`${buf.length - end} bytes beyond the RIFF size`);
  }
  problems.push(
    ...walkWebpChunks(buf, 12, Math.min(end, buf.length), WEBP_CHUNKS, "")
  );
  return problems;
}

/** Checks RIFF chunks in buf[start, limit) against an allowlist. */
function walkWebpChunks(
  buf: Buffer,
  start: number,
  limit: number,
  allowed: Set<string>,
  where: string
): string[] {
  const problems: string[] = [];
  let pos = start;
  while (pos < limit) {
    if (pos + 8 > limit) {
      problems.push(`${where}chunk header cut short at offset ${pos}`);
      break;
    }
    const fourcc = buf.toString("latin1", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const name = printable(fourcc);
    if (!allowed.has(fourcc)) problems.push(`${where}chunk ${name}`);
    if (pos + 8 + size > limit) {
      problems.push(`${where}chunk ${name} runs past its container`);
      break;
    }
    const fixed = WEBP_FIXED_SIZES[fourcc];
    if (fixed !== undefined && size !== fixed) {
      problems.push(`${where}chunk ${name} is ${size} bytes, not ${fixed}`);
    }
    if (fourcc === "ANMF") {
      if (size < 16) {
        problems.push(`${where}chunk ANMF is cut short`);
      } else {
        problems.push(
          ...walkWebpChunks(
            buf,
            pos + 8 + 16,
            pos + 8 + size,
            WEBP_FRAME_CHUNKS,
            "ANMF frame "
          )
        );
      }
    }
    if (size & 1) {
      if (pos + 8 + size >= limit) {
        problems.push(`${where}chunk ${name} is missing its padding byte`);
        break;
      }
      if (buf[pos + 8 + size] !== 0) {
        problems.push(`${where}chunk ${name} has a nonzero padding byte`);
      }
    }
    pos += 8 + size + (size & 1);
  }
  return problems;
}

const rowBytes = (width: number, bits: number) =>
  Math.floor((width * bits + 31) / 32) * 4;

/** A non-PNG icon frame: a plain BITMAPINFOHEADER DIB and nothing else. */
function checkIconBitmap(dib: Buffer, width: number, height: number): string[] {
  if (dib.length < 40) return ["bitmap header is cut short"];
  const headerSize = dib.readUInt32LE(0);
  if (headerSize !== 40) {
    return [
      `bitmap header is ${headerSize} bytes, not a 40-byte BITMAPINFOHEADER`,
    ];
  }
  const problems: string[] = [];
  const w = dib.readInt32LE(4);
  const h2 = dib.readInt32LE(8);
  const planes = dib.readUInt16LE(12);
  const bits = dib.readUInt16LE(14);
  const compression = dib.readUInt32LE(16);
  const colorsUsed = dib.readUInt32LE(32);
  if (w !== width || h2 !== height * 2) {
    problems.push(
      `bitmap header says ${w}x${h2 / 2}, the directory says ${width}x${height}`
    );
  }
  if (planes !== 1) problems.push(`bitmap header has ${planes} planes`);
  if (![1, 4, 8, 24, 32].includes(bits)) {
    problems.push(`bitmap header has ${bits} bits per pixel`);
  }
  if (compression !== 0) {
    problems.push(`bitmap compression ${compression}, not BI_RGB`);
  }
  if (problems.length) return problems;
  const palette = colorsUsed || (bits <= 8 ? 2 ** bits : 0);
  const expected =
    40 + palette * 4 + rowBytes(w, bits) * height + rowBytes(w, 1) * height;
  if (dib.length !== expected) {
    problems.push(
      `bitmap payload is ${dib.length} bytes, its header implies ${expected}`
    );
  }
  return problems;
}

export function checkIco(buf: Buffer): string[] {
  let directory: ReturnType<typeof readIcoDirectory>;
  try {
    directory = readIcoDirectory(buf);
  } catch (error) {
    return [(error as Error).message];
  }
  const { type, entries, directoryEnd } = directory;
  if (type !== 1) return [`ICO type ${type}, not an icon`];
  if (!entries.length) return ["no frames"];
  const problems: string[] = [];
  const spans: { index: number; start: number; end: number }[] = [];
  for (const entry of entries) {
    const { index, offset, size } = entry;
    const end = offset + size;
    if (size === 0 || offset < directoryEnd || end > buf.length) {
      problems.push(
        `frame ${index}: invalid bounds (offset ${offset}, size ${size}; ` +
          `the directory ends at ${directoryEnd}, the file at ${buf.length})`
      );
      continue;
    }
    const overlap = spans.find((s) => offset < s.end && s.start < end);
    if (overlap) {
      problems.push(
        `frame ${index}: invalid bounds (overlaps frame ${overlap.index})`
      );
      continue;
    }
    spans.push({ index, start: offset, end });
    const data = buf.subarray(offset, end);
    const frameProblems = data.subarray(0, 8).equals(PNG_SIGNATURE)
      ? checkPng(data).map((p) => `PNG ${p}`)
      : checkIconBitmap(data, entry.width, entry.height);
    problems.push(...frameProblems.map((p) => `frame ${index}: ${p}`));
  }
  if (spans.length === entries.length) {
    const covered = spans.reduce((n, s) => n + (s.end - s.start), 0);
    const loose = buf.length - directoryEnd - covered;
    if (loose > 0) problems.push(`${loose} bytes outside any frame`);
  }
  return problems;
}

/**
 * An SVG must be a UTF-8 document whose root element is <svg>, with no
 * <metadata> element. Other encodings fail rather than being decoded, so no
 * element can hide in them.
 */
export function checkSvg(buf: Buffer): string[] {
  if (buf.includes(0)) {
    return ["SVG is not UTF-8 (it holds NUL bytes, as UTF-16 does)"];
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return ["SVG is not UTF-8 (invalid byte sequence)"];
  }
  text = text.replace(/^\uFEFF/, "");
  const declaration = /^<\?xml\b[^>]*\?>/.exec(text);
  const encoding = declaration
    ? /\bencoding\s*=\s*["']([^"']*)["']/i.exec(declaration[0])
    : null;
  if (encoding && !/^utf-?8$/i.test(encoding[1])) {
    return ["SVG declares an encoding other than UTF-8"];
  }
  const prolog =
    /^(?:\s|<\?[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*>)*<(?:[\w.-]+:)?svg[\s>/]/i;
  if (!prolog.test(text)) {
    return ["not an SVG document (its root element is not <svg>)"];
  }
  return /<(?:[\w.-]+:)?metadata[\s>/]/i.test(text)
    ? ["<metadata> element"]
    : [];
}

/** Why an image fails the allowlist. Empty when it passes. */
export function checkImage(file: string, buf: Buffer): string[] {
  const ascii = buf.toString("latin1", 0, 16);
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return checkJpeg(buf);
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return checkPng(buf);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return checkWebp(buf);
  }
  const magic = buf.length >= 4 ? buf.readUInt32BE(0) : -1;
  if (magic === 0x00000100) return checkIco(buf);
  if (magic === 0x00000200) return ["CUR format (a cursor)"];
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
    return ["GIF format is not allowed"];
  }
  if (ascii.startsWith("II*\0") || ascii.startsWith("MM\0*")) {
    return ["TIFF format is not allowed"];
  }
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12);
    if (/^avi[fs]$/.test(brand)) return ["AVIF format is not allowed"];
    if (/^(hei[cmsx]|hev[cmsx]|mif1|msf1)$/.test(brand)) {
      return ["HEIC format is not allowed"];
    }
    return [`ISO media format (${printable(brand)}) is not allowed`];
  }
  const text = buf.toString("utf8", 0, 1024).replace(/^﻿/, "").trimStart();
  if (file.toLowerCase().endsWith(".svg") || /^<(\?xml|svg|!--)/.test(text)) {
    return checkSvg(buf);
  }
  return ["unrecognised image format"];
}

function main(args: string[]): number {
  const hook = args.includes("--hook");
  const files = args.filter((a) => a !== "--hook");
  let failed = 0;
  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const shown = relative.startsWith("..") ? file : relative;
    let problems: string[];
    try {
      problems = checkImage(file, readFileSync(file));
    } catch (error) {
      problems = [`cannot be read (${(error as Error).message})`];
    }
    for (const problem of problems) console.error(`${shown}: ${problem}`);
    if (problems.length) failed++;
  }
  if (failed && hook) {
    console.error(
      `\n${failed} image(s) carry metadata or are not an allowed format. ` +
        "Strip them with `npm run photos`, then stage them again."
    );
  }
  return failed ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
