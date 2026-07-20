import React from "react";
import Link from "next/link";
import type { BlogPost } from "@/types";
import PostTeaser from "@/components/blog/PostTeaser";

interface LatestBlogPostsProps {
  posts: BlogPost[];
}

export default function LatestBlogPosts({ posts }: LatestBlogPostsProps) {
  return (
    <section className="border-t border-line px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 flex items-baseline justify-between gap-6">
          <h2 className="subhead text-3xl">Latest from the Blog</h2>
          <Link
            href="/blog"
            className="shrink-0 text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-line-strong"
          >
            View all posts
          </Link>
        </div>

        {posts.length === 0 ? (
          <p className="text-body">No blog posts yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostTeaser key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
