import type { ProjectStatus } from "@/lib/statuses";

export interface ContactFormData {
  name: string;
  company: string;
  service: "full-stack" | "qa" | "full-cycle" | "employment";
  projectGoals: string;
  estimatedBudget?: string;
  referralSource?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: "technical" | "non-technical";
  readingTime?: number;
  projectSlug?: string;
}

/** One labelled row of the tech stack, mirroring the CV's grouped layout. */
export interface SkillGroup {
  label: string;
  items: string[];
}

export interface Person {
  name: string;
  role: string;
  bio: string;
  /** Grouped by category rather than a flat tag cloud — see SkillGroup. */
  techStack: SkillGroup[];
  experience: string[];
  linkedIn: string;
  resumePath: string;
}

export interface Project {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  status: ProjectStatus;
  /** The one-line list summary, at most 80 characters. */
  summary: string;
  /** One to three stack names. */
  builtWith: string[];
  githubUrl?: string;
  liveUrl?: string;
  date: string;
  content?: string;
  thumbnail?: string;
}
