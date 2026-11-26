"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeToTheme,
  switchTheme,
} from "@/lib/theme";

/**
 * The round theme toggle, as the boards draw it: a 2.75rem circle with a 1px
 * rule border. The boards' button keeps the browser's own font, so this one
 * reverts to it too (it holds only an icon).
 */
export default function ThemeToggle() {
  // useSyncExternalStore rather than an effect: the theme lives on <html>, set
  // by a blocking script before hydration, so it is genuinely external state.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot
  );

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={(event) => switchTheme(next, event.currentTarget)}
      className="inline-flex size-11 cursor-pointer appearance-none items-center justify-center rounded-pill border border-rule bg-transparent p-0 text-ink [font:revert]"
      aria-label={`Switch to the ${next} theme`}
    >
      {theme === "dark" ? (
        <Sun aria-hidden className="size-5" strokeWidth={1.5} />
      ) : (
        <Moon aria-hidden className="size-5" strokeWidth={1.5} />
      )}
    </button>
  );
}
