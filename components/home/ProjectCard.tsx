import React from "react";
import { ExternalLink, Github, CheckCircle2 } from "lucide-react";

interface ProjectProps {
  title: string;
  description: string;
  tags: string[];
  githubUrl?: string;
  liveUrl?: string;
  qaVerified: boolean;
}

const ProjectCard = ({
  title,
  description,
  tags,
  githubUrl,
  liveUrl,
  qaVerified,
}: ProjectProps) => {
  return (
    <div className="group bg-slate-900/40 border border-slate-800 p-6 rounded-xl hover:bg-slate-900/60 transition-all">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {qaVerified && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-wider font-bold">
            <CheckCircle2 className="w-3 h-3" />
            QA Verified
          </div>
        )}
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

      <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
        {githubUrl && (
          <a
            href={githubUrl}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        )}
        {liveUrl && (
          <a
            href={liveUrl}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-medium"
          >
            Live Demo <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
