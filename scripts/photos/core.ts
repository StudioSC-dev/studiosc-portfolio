/**
 * The photo pipeline's core: one source image in, sized WebP variants out.
 *
 * Every variant is turned upright from the source's orientation tag first,
 * then resized and encoded with no metadata at all: sharp writes none unless
 * asked, and nothing here asks. PRV-1's image guard (scripts/image-metadata.ts)
 * and its pre-commit hook check the result again before anything is
 * committed. PRV-16 reuses this module for post photos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** The widths every photo is published at (`<name>-<width>.webp`). */
export const VARIANT_WIDTHS = [400, 800, 1200] as const;

/** WebP quality: small files that still read as photographs. */
const WEBP_QUALITY = 80;

export interface Variant {
  /** The public URL path, e.g. `/img/seth-400.webp`. */
  src: string;
  width: number;
  height: number;
}

/**
 * The source's pixels, upright: the orientation tag applied and then
 * dropped, so no consumer can rotate them a second time.
 */
export async function upright(input: Buffer | string): Promise<Buffer> {
  return sharp(input).rotate().toBuffer();
}

/**
 * Writes `<name>-<width>.webp` into `outDir` for each width and returns the
 * variants, narrowest first. `urlBase` is the public path of `outDir`.
 * A source narrower than a width is enlarged to it, so every variant has the
 * width its name declares.
 */
export async function writeVariants(
  input: Buffer | string,
  name: string,
  outDir: string,
  urlBase: string,
  widths: readonly number[] = VARIANT_WIDTHS
): Promise<Variant[]> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    throw new Error(`photo name "${name}" must be lowercase words and dashes`);
  const source = await upright(input);
  mkdirSync(outDir, { recursive: true });
  const variants: Variant[] = [];
  for (const width of [...widths].sort((a, b) => a - b)) {
    const { data, info } = await sharp(source)
      .resize({ width })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const file = `${name}-${width}.webp`;
    writeFileSync(path.join(outDir, file), data);
    variants.push({
      src: `${urlBase.replace(/\/$/, "")}/${file}`,
      width: info.width,
      height: info.height,
    });
  }
  return variants;
}
