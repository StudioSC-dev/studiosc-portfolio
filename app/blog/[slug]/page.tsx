import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost, getBlogPosts, getProject } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { SocialPost, Mermaid } from "@/components/blog/ClientComponents";
import { Children, isValidElement } from "react";

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
          className="h-auto w-full rounded-sm"
          loading="lazy"
        />
        {alt && <p className="label mt-3 text-center">{alt}</p>}
      </div>
    );
  },
  SocialPost,
  Mermaid,
  // Render ```mermaid fenced code blocks as diagrams. The code string survives
  // next-mdx-remote/rsc (MDX expressions {...} do not), so this is how diagrams
  // are passed — see Mermaid.tsx.
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => {
    const child = Children.toArray(props.children)[0];
    if (isValidElement(child)) {
      const { className, children } = child.props as {
        className?: string;
        children?: React.ReactNode;
      };
      if (
        typeof children === "string" &&
        className?.includes("language-mermaid")
      ) {
        return <Mermaid chart={children} />;
      }
    }
    return <pre {...props} />;
  },
  YouTube: ({ videoId, url }: { videoId?: string; url?: string }) => {
    const id = videoId || (url ? getYouTubeVideoId(url) : null);

    if (!id) {
      return (
        <div className="my-8 border-l-2 border-danger py-2 pl-4 text-sm text-danger">
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
    <div className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <header className="mb-12 border-b border-line pb-12">
          <Link
            href="/blog"
            className="label mb-8 inline-block transition-colors hover:text-ink"
          >
            ← Back to Blog
          </Link>
          <h1 className="font-serif text-4xl leading-[1.1] text-ink sm:text-5xl">
            {post.title}
          </h1>
          {post.description && (
            <p className="mt-6 text-lg leading-relaxed text-body">
              {post.description}
            </p>
          )}
          <p className="label mt-8">
            {formattedDate}
            {post.readingTime ? ` · ${post.readingTime} min read` : ""}
            {` · ${post.category === "technical" ? "Technical" : "Non-Technical"} · By ${post.author}`}
          </p>
        </header>

        <div className="prose prose-lg max-w-none">
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
          <div className="mt-16 border-t border-line pt-12">
            <p className="label mb-4">Related Project</p>
            <h2 className="mb-3 font-serif text-2xl text-ink">
              {project.title}
            </h2>
            <p className="mb-6 max-w-xl leading-relaxed text-body">
              {project.description}
            </p>
            <Link
              href={`/work/${project.slug}`}
              className="text-sm text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
            >
              View project details →
            </Link>
          </div>
        )}
      </article>
    </div>
  );
}
