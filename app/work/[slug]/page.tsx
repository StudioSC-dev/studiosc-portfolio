import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, getProjects, getBlogPostsByProject } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";
import { Mermaid } from "@/components/blog/ClientComponents";
import RelatedPosts from "@/components/work/RelatedPosts";
import StatusBadge from "@/components/ui/StatusBadge";
import CtaLink from "@/components/ui/CtaLink";
import { Github } from "lucide-react";
import { Children, isValidElement } from "react";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({
    slug: project.slug,
  }));
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    return {
      title: "Project Not Found",
    };
  }

  return {
    title: project.title,
    description: project.description,
  };
}

const components = {
  Mermaid,
  // Render ```mermaid fenced code blocks as diagrams (MDX expressions {...} are
  // stripped by next-mdx-remote/rsc, so diagrams are passed as code blocks).
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
  img: ({
    src,
    alt,
    width,
    height,
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    width?: number;
    height?: number;
  }) => {
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
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  const relatedPosts = await getBlogPostsByProject(slug);

  const formattedDate = new Date(project.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <header className="mb-12 border-b border-line pb-12">
          <Link
            href="/work"
            className="label mb-8 inline-block transition-colors hover:text-ink"
          >
            ← Back to Work
          </Link>
          <h1 className="font-serif text-4xl leading-[1.1] text-ink sm:text-5xl">
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-6 text-lg leading-relaxed text-body">
              {project.description}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="label">{formattedDate}</span>
            <StatusBadge
              qaVerified={project.qaVerified}
              qaInProgress={project.qaInProgress}
              underDevelopment={project.underDevelopment}
            />
          </div>

          {project.tags && project.tags.length > 0 && (
            <p className="mt-6 font-mono text-xs leading-relaxed text-muted">
              {project.tags.join("  ·  ")}
            </p>
          )}

          {(project.githubUrl || project.liveUrl) && (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {project.liveUrl && (
                <CtaLink href={project.liveUrl}>Visit the live site</CtaLink>
              )}
              {project.githubUrl && (
                <CtaLink href={project.githubUrl} variant="secondary">
                  <Github className="h-4 w-4" />
                  View on GitHub
                </CtaLink>
              )}
            </div>
          )}
        </header>

        {project.content && (
          <div className="prose prose-lg max-w-none">
            <MDXRemote
              source={project.content}
              components={components}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                },
              }}
            />
          </div>
        )}
      </article>

      <RelatedPosts posts={relatedPosts} />
    </div>
  );
}
