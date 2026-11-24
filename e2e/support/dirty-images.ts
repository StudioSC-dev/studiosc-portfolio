/**
 * Builders for the checker's dirty fixtures. They run at test time in a temp
 * dir; no dirty image is ever committed. Every value in them is made up.
 */
import { PNG_SIGNATURE, readIcoDirectory } from "./ico";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG chunk with its length and CRC. */
export function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

/** The PNG with `chunk` inserted just before IEND. */
export function pngWithChunk(png: Buffer, chunk: Buffer): Buffer {
  const iend = png.length - 12;
  if (png.toString("latin1", iend + 4, iend + 8) !== "IEND") {
    throw new Error("PNG does not end with IEND");
  }
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}

/** A JPEG segment: marker, length and payload. */
function jpegSegment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** The JPEG with `segment` inserted after SOI and any APP0. */
export function jpegWithSegment(jpeg: Buffer, segment: Buffer): Buffer {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, at), segment, jpeg.subarray(at)]);
}

/** An APP1 Exif segment holding made-up GPS coordinates. */
export function exifGpsSegment(): Buffer {
  // Little-endian TIFF: IFD0 points at a GPS IFD with latitude and longitude.
  const tiff = Buffer.alloc(8 + 18 + 54 + 48);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  // IFD0: one entry, GPSInfo (0x8825) -> offset 26.
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  // GPS IFD at 26: four entries, then the rationals at 80.
  const entries: [number, number, number, number][] = [
    [0x0001, 2, 2, 0x4e], // GPSLatitudeRef "N"
    [0x0002, 5, 3, 80], // GPSLatitude
    [0x0003, 2, 2, 0x45], // GPSLongitudeRef "E"
    [0x0004, 5, 3, 104], // GPSLongitude
  ];
  tiff.writeUInt16LE(entries.length, 26);
  entries.forEach(([tag, type, count, value], i) => {
    const at = 28 + i * 12;
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    tiff.writeUInt32LE(value, at + 8);
  });
  tiff.writeUInt32LE(0, 76);
  [12, 34, 56, 123, 45, 6].forEach((deg, i) => {
    tiff.writeUInt32LE(deg, 80 + i * 8);
    tiff.writeUInt32LE(1, 84 + i * 8);
  });
  return jpegSegment(
    0xe1,
    Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff])
  );
}

/** A made-up XMP packet. */
export const XMP_PACKET =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ' +
  'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
  'exif:GPSLatitude="12,34.5N" exif:GPSLongitude="123,45.6E"/>' +
  '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

/** An APP1 XMP segment holding the made-up packet. */
export function xmpSegment(): Buffer {
  return jpegSegment(
    0xe1,
    Buffer.from("http://ns.adobe.com/xap/1.0/\0" + XMP_PACKET, "latin1")
  );
}

/** A clean 1x1 lossless WebP. */
export const CLEAN_WEBP = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64"
);

/** The WebP with a chunk appended and its RIFF size updated. */
export function webpWithChunk(
  webp: Buffer,
  fourcc: string,
  data: Buffer
): Buffer {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  const pad = Buffer.alloc(data.length & 1);
  const out = Buffer.concat([webp, head, data, pad]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

export interface IconFrame {
  width: number;
  height: number;
  bitCount: number;
  data: Buffer;
}

/** The frames of an ICO file. */
export function icoFrames(ico: Buffer): IconFrame[] {
  return readIcoDirectory(ico).entries.map((e) => ({
    width: e.width,
    height: e.height,
    bitCount: e.bitCount,
    data: Buffer.from(ico.subarray(e.offset, e.offset + e.size)),
  }));
}

/** An ICO file holding these frames, laid out one after another. */
export function buildIco(frames: IconFrame[]): Buffer {
  const dir = Buffer.alloc(6 + 16 * frames.length);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(frames.length, 4);
  let offset = dir.length;
  frames.forEach((f, i) => {
    const at = 6 + 16 * i;
    dir[at] = f.width === 256 ? 0 : f.width;
    dir[at + 1] = f.height === 256 ? 0 : f.height;
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(f.bitCount, at + 6);
    dir.writeUInt32LE(f.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += f.data.length;
  });
  return Buffer.concat([dir, ...frames.map((f) => f.data)]);
}

/** Overwrites one directory entry's offset in an ICO file. */
export function withFrameOffset(
  ico: Buffer,
  index: number,
  offset: number
): Buffer {
  const out = Buffer.from(ico);
  out.writeUInt32LE(offset, 6 + 16 * index + 12);
  return out;
}

export const isPng = (data: Buffer) =>
  data.subarray(0, 8).equals(PNG_SIGNATURE);
