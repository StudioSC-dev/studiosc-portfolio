import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost, getBlogPosts } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Calendar, Clock } from "lucide-react";
import remarkGfm from "remark-gfm";
import Image from "next/image";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  return {
    title: post.title,
    description: post.description,
  };
}

const components = {
  img: ({
    src,
    alt,
    width,
    height,
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    width?: number;
    height?: number;
  }) => {
    // Only handle external images (strings starting with http:// or https://)
    if (!src || typeof src !== "string") {
      return null;
    }

    return (
      <div className="my-8">
        <Image
          src={src}
          alt={alt || ""}
          width={width || 800}
          height={height || 600}
          className="rounded-lg w-full h-auto"
          loading="lazy"
        />
        {alt && (
          <p className="mt-2 text-sm text-center text-gray-300 italic">{alt}</p>
        )}
      </div>
    );
  },
};

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <article className="rounded-lg bg-gray-900 p-8 shadow-2xl md:p-16 lg:p-20">
        <header className="mb-8">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
            <span className="flex items-center">
              <Calendar className="mr-1 h-4 w-4" />
              {formattedDate}
            </span>
            {post.readingTime && (
              <span className="flex items-center">
                <Clock className="mr-1 h-4 w-4" />
                {post.readingTime} min read
              </span>
            )}
            <span className="rounded-full bg-gray-700 px-3 py-1 text-xs font-medium text-gray-200">
              {post.category === "technical" ? "Technical" : "Non-Technical"}
            </span>
            <span className="text-gray-300">By {post.author}</span>
          </div>
          {post.description && (
            <p className="mt-4 text-xl text-gray-200">{post.description}</p>
          )}
        </header>

        <div className="prose prose-lg max-w-none prose-invert blog-content text-gray-400">
          <MDXRemote
            source={post.content}
            components={components}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
              },
            }}
          />
        </div>
      </article>
    </div>
  );
}
