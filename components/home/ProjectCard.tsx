import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Github } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import CtaLink from "@/components/ui/CtaLink";

interface ProjectProps {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  githubUrl?: string;
  liveUrl?: string;
  qaVerified?: boolean;
  qaInProgress?: boolean;
  underDevelopment?: boolean;
}

const ProjectCard = ({
  slug,
  title,
  description,
  tags,
  thumbnail,
  githubUrl,
  liveUrl,
  qaVerified,
  qaInProgress,
  underDevelopment,
}: ProjectProps) => {
  return (
    <div className="group relative flex h-full flex-col border border-line bg-surface transition-colors hover:border-line-strong">
      {/* Stretched link makes the whole card navigate to the project page.
          Action links below sit above it via z-index, avoiding nested <a>. */}
      <Link
        href={`/work/${slug}`}
        className="absolute inset-0 z-10"
        aria-label={`View ${title}`}
      >
        <span className="sr-only">View {title}</span>
      </Link>

      {thumbnail ? (
        <div className="relative h-44 w-full overflow-hidden border-b border-line bg-sunken">
          <Image
            src={thumbnail}
            alt={`${title} screenshot`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="flex h-44 w-full items-center justify-center border-b border-line bg-sunken">
          <p className="label">In Progress</p>
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-serif text-xl leading-snug text-ink">{title}</h3>
          <span className="mt-1">
            <StatusBadge
              qaVerified={qaVerified}
              qaInProgress={qaInProgress}
              underDevelopment={underDevelopment}
            />
          </span>
        </div>

        <p className="mb-6 line-clamp-2 text-sm leading-relaxed text-body">
          {description}
        </p>

        <p className="mb-6 font-mono text-xs leading-relaxed text-muted">
          {tags.join("  ·  ")}
        </p>

        {/* z-20 lifts these above the stretched card link so they stay
            independently clickable. Sized `sm` to fit a three-column card. */}
        {(liveUrl || githubUrl) && (
          <div className="relative z-20 mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {liveUrl && (
              <CtaLink href={liveUrl} size="sm">
                Visit
              </CtaLink>
            )}
            {githubUrl && (
              <CtaLink href={githubUrl} variant="secondary" size="sm">
                <Github className="h-3.5 w-3.5" />
                GitHub
              </CtaLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
