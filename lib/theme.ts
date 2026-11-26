export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "studiosc-theme";

/** Fired on <html> when the theme changes, so subscribers re-render. */
const THEME_EVENT = "studiosc:themechange";

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/**
 * Blocking script injected into <head>. Runs before first paint so the page
 * never flashes the wrong theme, and always leaves `data-theme` set — which is
 * why globals.css only needs a `prefers-color-scheme` rule for the no-JS case.
 *
 * The stored choice wins; without one, or when storage cannot be read, the
 * system setting decides. The two reads are guarded separately, so blocked
 * storage still lets the system setting through.
 *
 * Kept as a string because it has to execute before React hydrates.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  var theme = null;
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === "light" || stored === "dark") theme = stored;
  } catch (e) {}
  if (!theme) {
    try {
      theme = window.matchMedia(${JSON.stringify(SYSTEM_DARK)}).matches
        ? "dark"
        : "light";
    } catch (e) {
      theme = "light";
    }
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
`;

/** A choice made on this page, kept for when storage cannot hold it. */
let pageChoice: Theme | null = null;

/** The stored choice, or null when there is none or storage is unreadable. */
function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Puts the theme on <html> with every CSS transition held for that one style
 * change, so colours swap at once instead of each element fading on its own
 * (which would also be motion under reduced motion).
 */
function applyTheme(theme: Theme) {
  const hold = document.createElement("style");
  hold.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(hold);
  document.documentElement.setAttribute("data-theme", theme);
  // Force the style change through while transitions are held.
  void getComputedStyle(document.documentElement).color;
  window.setTimeout(() => hold.remove(), 1);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Applies the visitor's choice and stores it where storage allows. */
export function setTheme(theme: Theme) {
  pageChoice = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this page.
  }
}

/**
 * The toggle's switch. Where View Transitions exist and motion is allowed, the
 * new theme is revealed as a circle growing from `origin` (the `theme-reveal`
 * animation in globals.css reads --rx and --ry). Under reduced motion, or
 * without `startViewTransition`, the change is instant.
 */
export function switchTheme(theme: Theme, origin?: Element | null) {
  const root = document.documentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || typeof document.startViewTransition !== "function") {
    setTheme(theme);
    return;
  }
  if (origin) {
    const r = origin.getBoundingClientRect();
    root.style.setProperty("--rx", `${r.left + r.width / 2}px`);
    root.style.setProperty("--ry", `${r.top + r.height / 2}px`);
  }
  document.startViewTransition(
    () =>
      new Promise<void>((done) => {
        setTheme(theme);
        // One task later, so React has re-rendered the toggle's label and
        // icon into the new view. Not a frame: rendering is held while this
        // update runs, so a frame callback may not come before the timeout.
        window.setTimeout(done, 0);
      })
  );
}

export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);

  // Follow the system setting only while the visitor has made no choice.
  const query = window.matchMedia(SYSTEM_DARK);
  const onSystemChange = () => {
    if (pageChoice || storedTheme()) return;
    const theme: Theme = query.matches ? "dark" : "light";
    if (getThemeSnapshot() !== theme) applyTheme(theme);
  };
  query.addEventListener("change", onSystemChange);
  // The setting may have changed between the head script and this
  // subscription (while the page hydrated); catch up with it now.
  onSystemChange();

  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    query.removeEventListener("change", onSystemChange);
  };
}

export function getThemeSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** The server cannot know the visitor's theme; light matches the CSS default. */
export function getThemeServerSnapshot(): Theme {
  return "light";
}
