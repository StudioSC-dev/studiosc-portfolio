import React from "react";
import {
  ExternalLink,
  Github,
  CheckCircle2,
  Clock,
  Wrench,
} from "lucide-react";

interface ProjectProps {
  title: string;
  description: string;
  tags: string[];
  githubUrl?: string;
  liveUrl?: string;
  qaVerified?: boolean;
  qaInProgress?: boolean;
  underDevelopment?: boolean;
}

const ProjectCard = ({
  title,
  description,
  tags,
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
    <div className="group bg-slate-900/40 border border-slate-800 p-6 rounded-xl hover:bg-slate-900/60 transition-all">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {getStatusBadge()}
      </div>

      <p className="text-slate-400 text-sm mb-6 line-clamp-2">{description}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Live Demo
          </a>
        )}
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
