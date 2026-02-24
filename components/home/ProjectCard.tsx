"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ExternalLink,
  Github,
  CheckCircle2,
  Clock,
  Wrench,
} from "lucide-react";

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
  // Determine which badge to show (priority: QA Verified > QA In Progress > Under Development)
  const getStatusBadge = () => {
    if (qaVerified) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider font-bold">
          <CheckCircle2 className="w-3 h-3" />
          QA Verified
        </div>
      );
    }
    if (qaInProgress) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] uppercase tracking-wider font-bold">
          <Clock className="w-3 h-3" />
          QA In Progress
        </div>
      );
    }
    if (underDevelopment) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] uppercase tracking-wider font-bold">
          <Wrench className="w-3 h-3" />
          Under Development
        </div>
      );
    }
    return null;
  };

  return (
    <Link
      href={`/work/${slug}`}
      className="group block bg-slate-900/40 border border-slate-800 rounded-xl hover:bg-slate-900/60 hover:border-slate-700 transition-all overflow-hidden"
    >
      {thumbnail ? (
        <div className="relative w-full h-48 overflow-hidden border-b border-slate-800 bg-slate-950">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 to-transparent z-10" />
          <Image
            src={thumbnail}
            alt={`${title} screenshot`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute inset-0 border-2 border-slate-700/50 group-hover:border-slate-600/50 transition-colors z-20 pointer-events-none" />
        </div>
      ) : (
        <div className="relative w-full h-48 bg-slate-950 border-b border-slate-800 flex items-center justify-center">
          <div className="text-center px-4">
            <div className="text-4xl mb-2">🚧</div>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
              Under Construction
            </p>
          </div>
        </div>
      )}
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          {getStatusBadge()}
        </div>

        <p className="text-slate-400 text-sm mb-6 line-clamp-2">
          {description}
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((tag: string) => (
            <span
              key={tag}
              className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        <div
          className="flex items-center gap-3 pt-4 border-t border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Visit
            </a>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ProjectCard;
