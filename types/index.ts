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
  qaVerified: boolean;
  qaInProgress?: boolean;
  underDevelopment?: boolean;
  githubUrl?: string;
  liveUrl?: string;
  date: string;
  content?: string;
  thumbnail?: string;
}
