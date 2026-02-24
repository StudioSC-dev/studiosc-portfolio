import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, getProjects } from "@/lib/mdx";
import { MDXRemote } from "next-mdx-remote/rsc";
import {
  Calendar,
  ExternalLink,
  Github,
  CheckCircle2,
  Clock,
  Wrench,
} from "lucide-react";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import Link from "next/link";

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

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  const formattedDate = new Date(project.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const getStatusBadge = () => {
    if (project.qaVerified) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs uppercase tracking-wider font-bold">
          <CheckCircle2 className="w-4 h-4" />
          QA Verified
        </div>
      );
    }
    if (project.qaInProgress) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs uppercase tracking-wider font-bold">
          <Clock className="w-4 h-4" />
          QA In Progress
        </div>
      );
    }
    if (project.underDevelopment) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs uppercase tracking-wider font-bold">
          <Wrench className="w-4 h-4" />
          Under Development
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <article className="rounded-lg bg-gray-900 p-8 shadow-2xl md:p-16 lg:p-20">
        <header className="mb-8">
          <div className="mb-4">
            <Link
              href="/work"
              className="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block"
            >
              ← Back to Work
            </Link>
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300 mb-4">
            <span className="flex items-center">
              <Calendar className="mr-1 h-4 w-4" />
              {formattedDate}
            </span>
            {getStatusBadge()}
          </div>
          {project.description && (
            <p className="mt-4 text-xl text-gray-200">{project.description}</p>
          )}

          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-1 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {(project.githubUrl || project.liveUrl) && (
            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-gray-800">
              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Github className="w-5 h-5" />
                  <span className="text-sm font-medium">View on GitHub</span>
                </a>
              )}
              {project.liveUrl && (
                <a
                  href={project.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="text-sm font-medium">Live Demo</span>
                </a>
              )}
            </div>
          )}
        </header>

        {project.content && (
          <div className="prose prose-lg max-w-none prose-invert blog-content text-gray-400">
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
    </div>
  );
}
