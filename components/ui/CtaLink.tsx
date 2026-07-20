import Link from "next/link";

interface CtaLinkProps {
  href: string;
  children: React.ReactNode;
  /**
   * `primary` is a filled ink block that inverts to outline on hover;
   * `secondary` is an outline that fills on hover. Both land on the same
   * footprint so a pair sits on one baseline.
   */
  variant?: "primary" | "secondary";
  /**
   * `md` for page-level calls to action; `sm` for tighter contexts such as
   * project cards, where a full-size pair would not fit the column.
   */
  size?: "md" | "sm";
  /** Serve the target as a download rather than navigating to it. */
  download?: boolean;
}

const base =
  "group inline-flex items-center justify-center border transition-colors duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const sizes = {
  md: "gap-2.5 px-6 py-3 text-sm",
  sm: "gap-2 px-4 py-2 text-xs",
} as const;

const variants = {
  // Inverts on hover: the fill drops out and the outline stays put, so the
  // button changes state without changing size or shifting the layout.
  primary: "border-ink bg-ink text-paper hover:bg-transparent hover:text-ink",
  secondary: "border-line-strong text-ink hover:border-ink hover:bg-sunken",
} as const;

export default function CtaLink({
  href,
  children,
  variant = "primary",
  size = "md",
  download = false,
}: CtaLinkProps) {
  const className = `${base} ${sizes[size]} ${variants[variant]}`;
  const glyph = download ? "↓" : "→";
  const arrow = (
    <span
      aria-hidden
      className={
        download
          ? "transition-transform duration-200 group-hover:translate-y-0.5"
          : "transition-transform duration-200 group-hover:translate-x-1"
      }
    >
      {glyph}
    </span>
  );

  // next/link is for internal navigation only; external URLs and downloads use
  // a plain anchor so Next does not try to prefetch or client-route them.
  const isExternal = /^https?:\/\//.test(href);

  if (isExternal || download) {
    return (
      <a
        href={href}
        className={className}
        {...(download
          ? { download: true }
          : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {children}
        {arrow}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      {arrow}
    </Link>
  );
}
