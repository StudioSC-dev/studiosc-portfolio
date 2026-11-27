import type { ImageLoaderProps } from "next/image";
import manifestJson from "../scripts/photos/manifest.json";

/**
 * The site's `next/image` loader (next.config.ts `images.loaderFile`), so
 * Vercel's metered image optimisation is never used (§6 Q7). It branches by
 * source:
 *
 * - a local photo (`/img/<name>`) gets the narrowest committed variant at
 *   least as wide as asked, or the widest there is, from the manifest
 *   scripts/image-variants.ts writes;
 * - a Cloudinary image on the studio's account gets `f_auto,q_auto,w_<width>`
 *   right after `/upload/`, so Cloudinary sizes it and keeps the asset;
 * - anything else throws, which fails the build on the page that uses it.
 */

interface Variant {
  src: string;
  width: number;
  height: number;
}

interface Manifest {
  images: Record<string, { source: string; variants: Variant[] }>;
}

const manifest: Manifest = manifestJson;

/** The only remote origin and account images may come from. */
export const CLOUDINARY_HOST = "res.cloudinary.com";
export const CLOUDINARY_ACCOUNT = "dg0t8ipwi";

const UPLOAD = "/upload/";

/**
 * Fails the render, and so the build, on a source the site does not serve:
 * a local path with no committed variants (run scripts/image-variants.ts), or
 * a remote image off the studio's Cloudinary uploads. Kept short, since it
 * ships in the client bundle.
 */
function unsupported(src: string): never {
  throw new Error(`Unsupported image source ${src}`);
}

/** The committed variants of a local photo, narrowest first. */
export function variantsOf(src: string): Variant[] {
  const entry = manifest.images[src];
  if (!entry) unsupported(src);
  return [...entry.variants].sort((a, b) => a.width - b.width);
}

/** The narrowest variant at least `width` wide, or the widest there is. */
export function nearestVariant(src: string, width: number): Variant {
  const variants = variantsOf(src);
  return variants.find((v) => v.width >= width) ?? variants.at(-1)!;
}

const CLOUDINARY_ORIGIN = `https://${CLOUDINARY_HOST}/${CLOUDINARY_ACCOUNT}/`;

function cloudinary(src: string, width: number): string {
  const at = src.indexOf(UPLOAD);
  // The prefix pins the scheme, host and account; the rest is kept byte for
  // byte, so the asset stays the same one.
  if (
    !src.startsWith(CLOUDINARY_ORIGIN) ||
    at < 0 ||
    /[?#]/.test(src.slice(0, at))
  )
    unsupported(src);
  const cut = at + UPLOAD.length;
  return `${src.slice(0, cut)}f_auto,q_auto,w_${width}/${src.slice(cut)}`;
}

export default function imageLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith("/") && !src.startsWith("//"))
    return nearestVariant(src, width).src;
  if (/^https?:\/\//i.test(src)) return cloudinary(src, width);
  return unsupported(src);
}
