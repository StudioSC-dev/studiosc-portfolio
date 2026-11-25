/**
 * One-change drifts of the fidelity fixture site. Each changes exactly one
 * thing the check reads (or, for `picture-only`, only what a frame holds).
 * The harness injects them into the unchanged fixture site.
 */
export interface Drift {
  css?: string;
  js?: string;
  replace?: [string, string][];
  /** Photo requests answered with another file from site/. */
  images?: Record<string, string>;
}

const dead = (selector: string): Drift => ({
  js: `document.addEventListener("click", (e) => { if (e.target.closest(${JSON.stringify(
    selector
  )})) e.stopImmediatePropagation(); }, true);`,
});

export const DRIFTS: Record<string, Drift> = {
  // Geometry: the section box, x ±2 and width ±2, height ±4.
  "moved-10": { css: "#opener { position: relative; left: 10px; }" },
  "x-at-limit": { css: "#opener { position: relative; left: 2px; }" },
  "x-beyond": { css: "#opener { position: relative; left: 3px; }" },
  "width-at-limit": { css: "#opener { margin-right: 2px; }" },
  "width-beyond": { css: "#opener { margin-right: 3px; }" },
  "height-at-limit": { css: "#opener { padding-bottom: 36px; }" },
  "height-beyond": { css: "#opener { padding-bottom: 37px; }" },
  "taller-3": { css: "#opener { padding-bottom: 35px; }" },
  "taller-10": { css: "#opener { padding-bottom: 42px; }" },
  // Key elements within their section, ±2.
  "key-at-limit": { css: "#opener p { position: relative; top: 2px; }" },
  "key-beyond": { css: "#opener p { position: relative; top: 3px; }" },
  // Spacing between sections, ±2.
  "gap-6": { css: "#gallery { margin-top: 6px; }" },
  "gap-at-limit": { css: "#gallery { margin-top: 2px; }" },
  "gap-beyond": { css: "#gallery { margin-top: 3px; }" },
  // Section order.
  "order-swap": {
    js: 'document.querySelector("main").insertBefore(document.getElementById("gallery"), document.getElementById("range"));',
  },
  // Type.
  "font-size": { css: "#opener h1 { font-size: 57px; }" },
  "font-family": { css: "#opener p { font-family: serif; }" },
  "font-weight": { css: "#opener h1 { font-weight: 700; }" },
  "line-height-at-limit": { css: "#opener p { line-height: 24.5px; }" },
  "line-height-beyond": { css: "#opener p { line-height: 24.6px; }" },
  "tracking-at-limit": {
    css: ".pager [data-count] { letter-spacing: 0.025em; }",
  },
  "tracking-beyond": {
    css: ".pager [data-count] { letter-spacing: 0.026em; }",
  },
  // Colour.
  token: { css: ":root, :root[data-theme] { --accent: #ff0000 !important; }" },
  "text-colour": { css: "#opener p { color: #123456; }" },
  background: {
    css: '.tabs button[aria-pressed="true"] { background: #123456; }',
  },
  border: { css: "[data-toggle] { border-color: #123456; }" },
  // Copy.
  word: { replace: [["made to be measured", "made to be checked"]] },
  "cv-absent": { css: 'header a[href^="/cv/"] { display: none; }' },
  // Image frames: box, ratio, radius, border; never the picture.
  "frame-narrower": {
    css: "#gallery figure { width: calc(min(480px, 100%) - 10px); }",
  },
  "frame-ratio": { css: ".frame { aspect-ratio: 16 / 9; }" },
  "frame-radius": { css: ".frame img { border-radius: 4px; }" },
  "frame-border": { css: ".frame img { border: 2px solid #000000; }" },
  "picture-only": { images: { "one.webp": "alt.webp" } },
  // Motion, as the visible result.
  "no-animation": { css: "#opener h1 { animation: none !important; }" },
  "duration-at-limit": {
    css: "#opener h1 { animation-duration: 700ms !important; }",
  },
  "duration-beyond": {
    css: "#opener h1 { animation-duration: 701ms !important; }",
  },
  "duration-doubled": {
    css: ".plate.from-right { animation-duration: 480ms !important; }",
  },
  "wrong-side": {
    css: ".plate.from-right { animation-name: plate-from-left !important; }",
  },
  "rm-animation": {
    css: "@media (prefers-reduced-motion: reduce) { #opener h1 { animation: rise 560ms ease-out both !important; } }",
  },
  // Controls.
  "tab-dead": dead("[data-tab]"),
  "gallery-dead": dead("[data-next-photo]"),
  "filter-dead": dead("[data-filter]"),
  "toggle-dead": dead("[data-toggle]"),
};
