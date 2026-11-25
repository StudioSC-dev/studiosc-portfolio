/**
 * One-change drifts of the fidelity fixture site. Each changes exactly one
 * thing the check reads (or, for `picture-only`, only what a frame holds).
 * The harness injects them into the unchanged fixture site.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** The pinned fixture font, and another font's bytes inline. */
const PINNED_FONT = "/fonts/RrQXbohi_ic6B3yVSzGBrMxQaKct.woff2";
const INLINE_FONT = `data:font/woff2;base64,${readFileSync(
  path.join(__dirname, "site", "alt-font.woff2")
).toString("base64")}`;
const face = (src: string) =>
  `@font-face { font-family: 'Red Hat Text'; font-style: normal; font-weight: 400 700; src: ${src}; }`;
const swapFonts = (to: string) =>
  `document.querySelector('link[href="/fonts.css"]').href = ${JSON.stringify(to)};`;

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
  // Spacing inside a section, ±2: the heading up and its text down.
  "inner-gap-at-limit": {
    css: "#opener h1 { position: relative; top: -1px; } #opener p { position: relative; top: 1px; }",
  },
  "inner-gap-beyond": {
    css: "#opener h1 { position: relative; top: -1.5px; } #opener p { position: relative; top: 1.5px; }",
  },
  // Section order: in the DOM, and only as rendered (across the unbuilt notes).
  "order-swap": {
    js: 'document.querySelector("main").insertBefore(document.getElementById("gallery"), document.getElementById("range"));',
  },
  "css-order-swap": {
    css: "main { display: flex; flex-direction: column; } #opener, #range { order: -2; } #list { order: -1; }",
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
  "cv-absent": { css: 'a[href^="/cv/"] { display: none; }' },
  // Image frames: box, ratio, radius, border; never the picture.
  "frame-narrower": {
    css: "#gallery figure { width: calc(min(480px, 100%) - 10px); }",
  },
  "frame-ratio": { css: ".frame { aspect-ratio: 16 / 9; }" },
  // 2px wider and 2px shorter: each side within ±2, the shape not.
  "ratio-skew": {
    css: "#gallery .frame img { inset: auto; left: 0; top: 0; width: calc(100% + 2px); height: calc(100% - 2px); }",
  },
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
  "plate-reversed": {
    css: ".plate.from-right { animation-direction: reverse !important; }",
  },
  "reveal-shrinks": {
    css: "::view-transition-new(root) { animation-direction: reverse !important; }",
  },
  "opener-moves-on-tab": {
    js: 'document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => { const p = document.querySelector("#opener p"); p.style.animation = "none"; void p.offsetWidth; p.style.animation = "fade-in 300ms ease-out"; }));',
  },
  "rm-waapi": {
    js: 'if (matchMedia("(prefers-reduced-motion: reduce)").matches) document.querySelector("#opener h1").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });',
  },
  // A short effect started with play(): done before any sweep could see it.
  "rm-play": {
    js: 'if (matchMedia("(prefers-reduced-motion: reduce)").matches) new Animation(new KeyframeEffect(document.querySelector("#opener h1"), [{ opacity: 0 }, { opacity: 1 }], { duration: 1 }), document.timeline).play();',
  },
  "rm-toggle-motion": {
    css: '@media (prefers-reduced-motion: reduce) { :root[data-theme="dark"] header { animation: fade-in 300ms ease-out !important; } }',
  },
  "rm-animation": {
    css: "@media (prefers-reduced-motion: reduce) { #opener h1 { animation: rise 560ms ease-out both !important; } }",
  },
  // Controls.
  "tab-dead": dead("[data-tab]"),
  "gallery-dead": dead("[data-next-photo]"),
  "filter-dead": dead("[data-filter]"),
  "toggle-dead": dead("[data-toggle]"),
  "thumb-dead": dead("[data-thumb]"),
  "chips-back-dead": dead("[data-chips-back]"),
  "holly-dead": dead("[data-holly-next]"),
  "plate-next-dead": dead("[data-next-plate]"),
  "plate-prev-dead": dead("[data-prev-plate]"),
  "treat-dead": dead("[data-treat]"),
  // Next updates the counter and the pressed thumbnail, not the picture.
  "gallery-counter-only": {
    js: `document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-next-photo]")) return;
  e.stopImmediatePropagation();
  const shown = document.querySelector("[data-shown]");
  const n = (Number(shown.textContent.split(" ")[0]) % 3) + 1;
  shown.textContent = n + " of 3";
  document.querySelectorAll("[data-thumb]").forEach((t, j) => t.setAttribute("aria-pressed", String(j === n - 1)));
}, true);`,
  },
  // A failed send says nothing; a sent one still thanks.
  "contact-error-dead": {
    js: `document.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  const r = await fetch("/api/contact", { method: "POST", body: new FormData(e.target) });
  if (r.ok) document.querySelector("[data-status]").textContent = "Thanks, it is sent.";
}, true);`,
  },
  "contact-dead": {
    js: 'document.addEventListener("submit", (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);',
  },
  "writing-dead": {
    js: 'document.addEventListener("click", (e) => { if (e.target.closest(\'a[href="/blog/work"]\')) e.preventDefault(); }, true);',
  },
  // Fonts: the family's name kept, another file behind it, or none.
  "fonts-wrong": {
    replace: [['href="/fonts.css"', 'href="/fonts-wrong.css"']],
  },
  "fonts-missing": {
    replace: [['href="/fonts.css"', 'href="/fonts-missing.css"']],
  },
  // The pinned file, behind a local() source tried first.
  "fonts-local": { css: face(`local('Red Hat Text'), url(${PINNED_FONT})`) },
  // Another font's bytes inline: loaded, from no file the site served.
  "fonts-inline": { css: face(`url(${INLINE_FONT})`) },
  // The wrong file only with reduced motion, or only once a tab is picked.
  "fonts-wrong-rm": {
    js: `if (matchMedia("(prefers-reduced-motion: reduce)").matches) ${swapFonts("/fonts-wrong.css")}`,
  },
  "fonts-wrong-on-tab": {
    js: `document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => { ${swapFonts("/fonts-wrong.css")} }));`,
  },
};
