import Link from "next/link";

interface CtaLinkProps {
  href: string;
  children: React.ReactNode;
  /**
   * `primary` is filled ink with gallery text; `secondary` is outlined in ink.
   * Both are 6px controls at least 3rem tall, as the boards draw "Start a
   * project" and "Every project".
   */
  variant?: "primary" | "secondary";
  /** Serve the target as a download rather than navigating to it. */
  download?: boolean;
}

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-[1.375rem] text-small font-semibold no-underline";

const variants = {
  primary: "bg-ink text-gallery",
  secondary: "border border-ink bg-transparent text-ink",
} as const;

export default function CtaLink({
  href,
  children,
  variant = "primary",
  download = false,
}: CtaLinkProps) {
  const className = `${base} ${variants[variant]}`;

  // next/link is for internal navigation only; external URLs and downloads use
  // a plain anchor so Next does not try to prefetch or client-route them.
  const isExternal = /^https?:\/\//.test(href);

  if (isExternal || download) {
    return (
      <a
        href={href}
        className={className}
        data-cta={variant}
        {...(download
          ? { download: true }
          : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} data-cta={variant}>
      {children}
    </Link>
  );
}
