import Link from "next/link";
import ThemeToggle from "@/components/ui/ThemeToggle";
import MenuRouteHandler from "@/components/layout/MenuRouteHandler";
import { PHONE_MENU_ID, PRIMARY_NAV } from "@/components/layout/nav";

/**
 * The shared header, as the Range boards draw it (`range-light-desktop`,
 * `range-phone`). Desktop: the wordmark, then the nav and the round theme
 * toggle. Phone: the toggle, the centred wordmark and Menu, which opens the
 * nav in a native popover (Escape and a click outside close it).
 *
 * A server component: only the toggle and the route handler run on the client.
 */
export default function Header() {
  return (
    <header data-board-section="chrome/header" className="relative z-20">
      <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-gutter-phone md:mx-auto md:box-content md:flex md:h-22 md:max-w-page md:justify-between md:gap-8 md:px-gutter">
        <div className="justify-self-start md:hidden">
          <ThemeToggle />
        </div>
        <Link
          href="/"
          aria-label="StudioSC, home"
          className="font-display text-xl leading-7 font-bold no-underline hover:text-muted md:text-[1.375rem] md:tracking-[-0.01em]"
        >
          StudioSC
        </Link>
        <div className="hidden md:flex md:items-center md:gap-6">
          <nav aria-label="Main">
            <ul className="m-0 flex list-none items-center gap-8 p-0 text-small font-medium">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-nav-link
                    className={
                      item.cta
                        ? "inline-flex min-h-11 items-center rounded-control bg-ink px-[1.125rem] font-semibold text-gallery no-underline"
                        : "no-underline hover:text-muted"
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>
        <div className="justify-self-end md:hidden">
          <button
            type="button"
            popoverTarget={PHONE_MENU_ID}
            aria-controls={PHONE_MENU_ID}
            aria-expanded="false"
            className="min-h-11 cursor-pointer rounded-control border border-ink bg-transparent px-3.5 text-small font-semibold text-ink"
          >
            Menu
          </button>
        </div>
      </div>
      <div
        id={PHONE_MENU_ID}
        popover="auto"
        className="absolute inset-x-0 top-16 bottom-auto m-0 h-auto w-full max-w-none border-0 border-y border-rule bg-plate p-0 text-ink md:hidden"
      >
        <nav aria-label="Main" className="px-gutter-phone py-2">
          <ul className="m-0 list-none p-0 text-small">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-nav-link
                  className={
                    item.cta
                      ? "my-2 flex min-h-11 items-center justify-center rounded-control bg-ink px-[1.125rem] font-semibold text-gallery no-underline"
                      : "flex min-h-11 items-center font-semibold no-underline hover:text-muted"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <MenuRouteHandler menuId={PHONE_MENU_ID} />
    </header>
  );
}
