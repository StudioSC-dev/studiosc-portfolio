import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/** One entry of an ICO directory. A width or height of 0 means 256. */
export interface IcoEntry {
  index: number;
  width: number;
  height: number;
  bitCount: number;
  size: number;
  offset: number;
}

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Reads the header and directory of an ICO file. Throws if they are cut short. */
export function readIcoDirectory(buf: Buffer): {
  type: number;
  entries: IcoEntry[];
  directoryEnd: number;
} {
  if (buf.length < 6) throw new Error("ICO header is cut short");
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  const directoryEnd = 6 + 16 * count;
  if (buf.length < directoryEnd) throw new Error("ICO directory is cut short");
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    entries.push({
      index: i,
      width: buf[at] || 256,
      height: buf[at + 1] || 256,
      bitCount: buf.readUInt16LE(at + 6),
      size: buf.readUInt32LE(at + 8),
      offset: buf.readUInt32LE(at + 12),
    });
  }
  return { type, entries, directoryEnd };
}

export interface DecodedFrame {
  kind: "png" | "bmp";
  width: number;
  height: number;
  /** Top-down RGBA, 8 bits per channel. */
  rgba: Buffer;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG to RGBA. */
export function decodePng(png: Buffer): DecodedFrame {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (pos + 8 <= png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("latin1", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      colorType = data[9];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || data[12]) {
        throw new Error("only 8-bit, non-interlaced RGB or RGBA PNGs decode");
      }
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c =
        x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      if (predictor === undefined) throw new Error(`bad PNG filter ${filter}`);
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  if (channels === 4) return { kind: "png", width, height, rgba: pixels };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels.copy(rgba, i * 4, i * 3, i * 3 + 3);
    rgba[i * 4 + 3] = 255;
  }
  return { kind: "png", width, height, rgba };
}

/** Decodes a 32-bit BI_RGB icon bitmap (BGRA, bottom-up) to RGBA. */
export function decodeBmp(dib: Buffer): DecodedFrame {
  const width = dib.readInt32LE(4);
  const height = dib.readInt32LE(8) / 2; // the height counts the AND mask too
  if (dib.readUInt16LE(14) !== 32 || dib.readUInt32LE(16) !== 0) {
    throw new Error("only 32-bit BI_RGB icon bitmaps decode");
  }
  const header = dib.readUInt32LE(0);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = header + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const from = row + x * 4;
      const to = (y * width + x) * 4;
      rgba[to] = dib[from + 2];
      rgba[to + 1] = dib[from + 1];
      rgba[to + 2] = dib[from];
      rgba[to + 3] = dib[from + 3];
    }
  }
  return { kind: "bmp", width, height, rgba };
}

export interface FrameHash {
  index: number;
  kind: "png" | "bmp";
  width: number;
  height: number;
  /** sha256 of the decoded top-down RGBA pixels. */
  rgbaSha256: string;
}

/** The decoded-pixel hash of every frame of an ICO file. */
export function icoFrameHashes(buf: Buffer): FrameHash[] {
  return readIcoDirectory(buf).entries.map((entry) => {
    const data = buf.subarray(entry.offset, entry.offset + entry.size);
    const frame = data.subarray(0, 8).equals(PNG_SIGNATURE)
      ? decodePng(data)
      : decodeBmp(data);
    return {
      index: entry.index,
      kind: frame.kind,
      width: frame.width,
      height: frame.height,
      rgbaSha256: createHash("sha256").update(frame.rgba).digest("hex"),
    };
  });
}
