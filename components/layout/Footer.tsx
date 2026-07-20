import Link from "next/link";
import { Instagram } from "lucide-react";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { INSTAGRAM, LINKEDIN } from "@/lib/links";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          <div className="md:col-span-1">
            <p className="font-serif text-xl text-ink">StudioSC</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              High-integrity engineering and quality assurance.
            </p>
          </div>

          <div>
            <p className="label mb-4">Navigation</p>
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label mb-4">Connect</p>
            <ul className="space-y-2">
              <li>
                <a
                  href={LINKEDIN.seth}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  <LinkedInIcon className="h-4 w-4" />
                  Seth
                </a>
              </li>
              <li>
                <a
                  href={LINKEDIN.christine}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  <LinkedInIcon className="h-4 w-4" />
                  Christine
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-16 border-t border-line pt-8 text-xs text-muted">
          © {currentYear} StudioSC. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
