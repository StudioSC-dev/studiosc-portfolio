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
}

export interface Person {
  name: string;
  role: string;
  bio: string;
  techStack: string[];
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
  githubUrl?: string;
  liveUrl?: string;
  date: string;
  content?: string;
}
