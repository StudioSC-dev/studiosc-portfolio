import type { Metadata } from "next";
import { getBlogPosts } from "@/lib/mdx";
import BlogList from "@/components/blog/BlogList";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Read our latest thoughts on software development, QA best practices, and life at StudioSC.",
};

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader
        label="Writing"
        title="Blog"
        lead="Technical insights, QA strategies, and stories from the field."
      />

      {posts.length === 0 ? (
        <p className="py-16 text-body">No blog posts yet. Check back soon.</p>
      ) : (
        <BlogList posts={posts} />
      )}
    </div>
  );
}
