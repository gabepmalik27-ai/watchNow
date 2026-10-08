import type { ImageLoaderProps } from "next/image";

/** Fixed widths TMDB's image CDN serves (plus "original"). */
const TMDB_WIDTHS = [185, 342, 500, 780] as const;

/**
 * next/image custom loader. next/image asks for a URL per candidate width in
 * its srcset; we answer with the smallest TMDB size at least that wide, or
 * "original" beyond 780px. The browser then picks from the srcset using the
 * `sizes` prop and the screen's pixel density.
 */
export function tmdbImageLoader({ src, width }: ImageLoaderProps): string {
  const size = TMDB_WIDTHS.find((w) => w >= width);
  return `https://image.tmdb.org/t/p/${size ? `w${size}` : "original"}${src}`;
}
