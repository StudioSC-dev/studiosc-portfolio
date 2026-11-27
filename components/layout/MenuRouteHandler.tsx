"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

interface MenuRouteHandlerProps {
  /** The phone menu's popover panel. */
  menuId: string;
}

/**
 * The header's one route-aware piece. The header itself is server-rendered
 * and does not re-render on client navigation, so this marks the current
 * section's nav links with `aria-current="page"` (Work on /work and every
 * /work/<slug>, as the case and post boards draw it) and closes the phone
 * menu whenever the route changes. It renders nothing.
 */
export default function MenuRouteHandler({ menuId }: MenuRouteHandlerProps) {
  const pathname = usePathname();

  useEffect(() => {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "a[data-nav-link]"
    )) {
      const href = link.getAttribute("href") ?? "";
      // Matched at a path boundary: /work/x is in /work, /workshop is not.
      if (pathname === href || pathname.startsWith(`${href}/`)) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
    const panel = document.getElementById(menuId);
    if (panel?.matches(":popover-open")) panel.hidePopover();
  }, [pathname, menuId]);

  useEffect(() => {
    const panel = document.getElementById(menuId);
    const invoker = document.querySelector<HTMLButtonElement>(
      `[popovertarget="${menuId}"]`
    );
    if (!panel || !invoker) return;
    // A link in the panel closes it, even when it leads to this same page.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) panel.hidePopover();
    };
    // Keep Menu's expanded state in step, and give it focus back when the
    // panel closes with nothing else focused (Escape, or a click outside).
    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      invoker.setAttribute("aria-expanded", String(open));
      const active = document.activeElement;
      if (!open && (!active || active === document.body))
        invoker.focus({ preventScroll: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      if (active && panel.contains(active))
        invoker.focus({ preventScroll: true });
    };
    panel.addEventListener("click", onClick);
    panel.addEventListener("toggle", onToggle);
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("click", onClick);
      panel.removeEventListener("toggle", onToggle);
      panel.removeEventListener("keydown", onKeyDown);
    };
  }, [menuId]);

  return null;
}
