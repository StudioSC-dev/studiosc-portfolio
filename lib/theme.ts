export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "studiosc-theme";

/** Fired on <html> when the theme changes, so subscribers re-render. */
const THEME_EVENT = "studiosc:themechange";

/**
 * Blocking script injected into <head>. Runs before first paint so the page
 * never flashes the wrong theme, and always leaves `data-theme` set — which is
 * why globals.css only needs a `prefers-color-scheme` rule for the no-JS case.
 *
 * Kept as a string because it has to execute before React hydrates.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this page.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);

  // Follow the OS only while the visitor has not made an explicit choice.
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY)) {
        return;
      }
    } catch {
      // Unreadable storage means no explicit choice was recorded.
    }
    document.documentElement.setAttribute(
      "data-theme",
      query.matches ? "dark" : "light"
    );
    onChange();
  };
  query.addEventListener("change", onSystemChange);

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
