import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import CtaLink from "@/components/ui/CtaLink";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The generic 404, inside the shared header and footer and in the visitor's
 * theme. PRV-9 replaces it with the boards' illustrated 404.
 */
export default function NotFound() {
  return (
    <div className="mx-auto box-content max-w-page px-gutter-phone pt-20 pb-32 md:px-gutter">
      <PageHeader
        title="Page not found"
        lead="The link may be old, or mistyped."
        divider={false}
      />
      <div className="mt-8">
        <CtaLink href="/">Back to the home page</CtaLink>
      </div>
    </div>
  );
}
