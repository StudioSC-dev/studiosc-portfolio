import Link from "next/link";
import type { BlogPost } from "@/types";
import { formatDate } from "@/lib/utils";

interface PostTeaserProps {
  post: BlogPost;
  /** Show the reading time alongside the date. */
  showReadingTime?: boolean;
}

/**
 * Compact post teaser shared by the homepage "Latest" grid and a project page's
 * Related Posts. Both rendered near-identical markup before.
 */
export default function PostTeaser({
  post,
  showReadingTime = false,
}: PostTeaserProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col border border-line bg-surface p-6 transition-colors hover:border-line-strong"
    >
      <p className="label mb-4">
        {formatDate(post.date)}
        {showReadingTime && post.readingTime
          ? ` · ${post.readingTime} min`
          : ""}
        {` · ${post.category === "technical" ? "Technical" : "Non-Technical"}`}
      </p>
      <h3 className="mb-3 font-serif text-2xl leading-snug text-ink">
        {post.title}
      </h3>
      <p className="line-clamp-2 text-sm leading-relaxed text-body">
        {post.description}
      </p>
      <span className="mt-auto pt-6 text-sm text-muted transition-colors group-hover:text-ink">
        Read more →
      </span>
    </Link>
  );
}
