import Link from "next/link";
import { Calendar } from "lucide-react";
import type { BlogPost } from "@/types";

interface RelatedPostsProps {
  posts: BlogPost[];
}

export default function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  const formattedDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <section className="mt-12">
      <h2 className="mb-8 text-3xl font-bold text-white">Related Posts</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-xl border border-gray-800 bg-gray-900 p-6 transition-all hover:border-gray-700 hover:bg-gray-800/60"
          >
            <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="h-3 w-3" />
              <span>{formattedDate(post.date)}</span>
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-300">
                {post.category === "technical" ? "Technical" : "Non-Technical"}
              </span>
            </div>
            <h3 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-blue-400">
              {post.title}
            </h3>
            <p className="mb-4 line-clamp-2 text-sm text-gray-400">
              {post.description}
            </p>
            <span className="text-sm font-medium text-blue-400 transition-colors group-hover:text-blue-300">
              Read more →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
