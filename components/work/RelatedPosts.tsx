import type { BlogPost } from "@/types";
import PostTeaser from "@/components/blog/PostTeaser";

interface RelatedPostsProps {
  posts: BlogPost[];
}

export default function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mt-20 border-t border-line pt-12">
      <h2 className="subhead mb-8 text-3xl">Related Posts</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostTeaser key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
