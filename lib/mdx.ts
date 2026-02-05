import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import type { BlogPost, Project } from "@/types";
import { calculateReadingTime } from "./utils";

const blogDirectory = join(process.cwd(), "content/blog");
const projectsDirectory = join(process.cwd(), "content/projects");

export async function getBlogPosts(): Promise<BlogPost[]> {
  try {
    const files = await readdir(blogDirectory);
    const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

    const posts = await Promise.all(
      mdxFiles.map(async (file) => {
        const filePath = join(blogDirectory, file);
        const fileContents = await readFile(filePath, "utf8");
        const { data, content } = matter(fileContents);

        return {
          slug: file.replace(/\.mdx$/, ""),
          title: data.title || "Untitled",
          description: data.description || "",
          date: data.date || new Date().toISOString(),
          author: data.author || "StudioSC",
          category: data.category || "technical",
          readingTime: calculateReadingTime(content),
        } as BlogPost;
      })
    );

    return posts.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    console.error("Error reading blog posts:", error);
    return [];
  }
}

export async function getBlogPost(slug: string) {
  try {
    const filePath = join(blogDirectory, `${slug}.mdx`);
    const fileContents = await readFile(filePath, "utf8");
    const { data, content } = matter(fileContents);

    return {
      slug,
      title: data.title || "Untitled",
      description: data.description || "",
      date: data.date || new Date().toISOString(),
      author: data.author || "StudioSC",
      category: data.category || "technical",
      readingTime: calculateReadingTime(content),
      content,
    };
  } catch (error) {
    console.error(`Error reading blog post ${slug}:`, error);
    return null;
  }
}

export async function getProjects(): Promise<Project[]> {
  try {
    const files = await readdir(projectsDirectory);
    const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

    const projects = await Promise.all(
      mdxFiles.map(async (file) => {
        const filePath = join(projectsDirectory, file);
        const fileContents = await readFile(filePath, "utf8");
        const { data } = matter(fileContents);

        return {
          slug: file.replace(/\.mdx$/, ""),
          title: data.title || "Untitled",
          description: data.description || "",
          tags: data.tags || [],
          qaVerified: data.qaVerified || false,
          githubUrl: data.githubUrl,
          liveUrl: data.liveUrl,
          date: data.date || new Date().toISOString(),
        } as Project;
      })
    );

    return projects.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    console.error("Error reading projects:", error);
    return [];
  }
}

export async function getProject(slug: string) {
  try {
    const filePath = join(projectsDirectory, `${slug}.mdx`);
    const fileContents = await readFile(filePath, "utf8");
    const { data, content } = matter(fileContents);

    return {
      slug,
      title: data.title || "Untitled",
      description: data.description || "",
      tags: data.tags || [],
      qaVerified: data.qaVerified || false,
      githubUrl: data.githubUrl,
      liveUrl: data.liveUrl,
      date: data.date || new Date().toISOString(),
      content,
    };
  } catch (error) {
    console.error(`Error reading project ${slug}:`, error);
    return null;
  }
}
