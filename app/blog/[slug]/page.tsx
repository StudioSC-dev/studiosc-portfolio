import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost, getBlogPosts, getProject } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Calendar, Clock, ExternalLink } from "lucide-react";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";

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

// Helper function to extract YouTube video ID from URL or return ID if already provided
function getYouTubeVideoId(urlOrId: string): string | null {
  // If it's already just an ID (no special characters except alphanumeric, hyphens, underscores)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }

  // Try to extract from various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
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
  YouTube: ({ videoId, url }: { videoId?: string; url?: string }) => {
    const id = videoId || (url ? getYouTubeVideoId(url) : null);

    if (!id) {
      return (
        <div className="my-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
          Invalid YouTube video ID or URL provided
        </div>
      );
    }

    return (
      <div className="my-8">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute top-0 left-0 w-full h-full rounded-lg"
          />
        </div>
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

  // Get project if this blog post is linked to a project
  const project = post.projectSlug ? await getProject(post.projectSlug) : null;

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

        {/* Project Link Section */}
        {project && (
          <div className="mt-12 pt-8 border-t border-gray-800">
            <h2 className="text-2xl font-bold text-white mb-4">
              Related Project
            </h2>
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-2">
                {project.title}
              </h3>
              <p className="text-gray-300 mb-4">{project.description}</p>
              <Link
                href={`/work/${project.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                View Project Details
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
