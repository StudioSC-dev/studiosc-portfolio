"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { BlogPost } from "@/types";
import { formatDate } from "@/lib/utils";

interface BlogCardProps {
  post: BlogPost;
  index: number;
}

/**
 * Index-page row. Set as a hairline-separated list rather than a stack of
 * shadowed cards — at this width, rules read as an editorial contents page.
 */
export default function BlogCard({ post, index }: BlogCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.04 }}
      className="group border-b border-line"
    >
      <Link href={`/blog/${post.slug}`} className="block py-8">
        <p className="label mb-3">
          {formatDate(post.date)}
          {post.readingTime ? ` · ${post.readingTime} min read` : ""}
          {` · ${post.category === "technical" ? "Technical" : "Non-Technical"}`}
        </p>
        <h2 className="mb-3 font-serif text-3xl leading-tight text-ink">
          {post.title}
        </h2>
        <p className="max-w-2xl leading-relaxed text-body">
          {post.description}
        </p>
        <span className="mt-4 inline-block text-sm text-muted transition-colors group-hover:text-ink">
          Read more →
        </span>
      </Link>
    </motion.article>
  );
}
