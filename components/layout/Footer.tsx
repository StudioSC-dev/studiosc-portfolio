import Link from "next/link";
import { FOOTER_NAV } from "@/components/layout/nav";

/**
 * The shared footer, as the boards draw it: `range-light-desktop` and the
 * Work boards on desktop, the page boards (`pages-about-phone`,
 * `pages-work-phone`) on a phone.
 */
export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      data-board-section="chrome/footer"
      className="mt-14 mb-12 border-t border-rule md:my-0"
    >
      <div className="px-gutter-phone pt-8 md:mx-auto md:box-content md:grid md:max-w-page md:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] md:gap-x-8 md:gap-y-6 md:px-gutter md:py-10">
        <div>
          <p className="m-0 font-display text-xl leading-7 font-bold md:text-[1.375rem]">
            StudioSC
          </p>
          <p className="mt-1 mb-0 text-small text-muted">
            Seth builds. Christine tests.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="mt-4 grid grid-cols-2 gap-x-4 text-small md:mt-0 md:flex md:flex-wrap md:content-start md:gap-x-8 md:gap-y-2"
        >
          {FOOTER_NAV.map((item) =>
            /^https?:\/\//.test(item.href) ? (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center no-underline hover:text-muted md:block md:min-h-0"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center no-underline hover:text-muted md:block md:min-h-0"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <p className="mt-4 mb-0 text-meta text-muted md:mt-0">
          © {currentYear} StudioSC
        </p>
        <p className="mt-1 mb-0 text-meta md:mt-0">
          <Link
            href="/privacy/hermes-personal-assistant"
            className="text-muted underline decoration-1 underline-offset-[0.2em] hover:text-ink"
          >
            Hermes Personal Assistant privacy policy
          </Link>
        </p>
      </div>
    </footer>
  );
}
