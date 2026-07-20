import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import type { BlogPost, Project } from "@/types";
import { calculateReadingTime } from "./utils";

const blogDirectory = join(process.cwd(), "content/blog");
const projectsDirectory = join(process.cwd(), "content/projects");

/**
 * Drop a leading `# Heading` from an MDX body.
 *
 * Every content file opens with an H1 that repeats its frontmatter `title`,
 * which the page already renders as the real `<h1>`. Left in, each page ships
 * two H1s — a duplicated title on screen and an accessibility problem. Stripping
 * it here keeps the MDX files readable on their own (e.g. on GitHub).
 */
function stripLeadingH1(content: string): string {
  return content.replace(/^\s*#\s+.*(\r?\n)+/, "");
}

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
          projectSlug: data.projectSlug,
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

export async function getBlogPostsByProject(
  projectSlug: string
): Promise<BlogPost[]> {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.projectSlug === projectSlug);
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
      projectSlug: data.projectSlug,
      content: stripLeadingH1(content),
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
          qaInProgress: data.qaInProgress || false,
          underDevelopment: data.underDevelopment || false,
          githubUrl: data.githubUrl,
          liveUrl: data.liveUrl,
          date: data.date || new Date().toISOString(),
          thumbnail: data.thumbnail,
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
      qaInProgress: data.qaInProgress || false,
      underDevelopment: data.underDevelopment || false,
      githubUrl: data.githubUrl,
      liveUrl: data.liveUrl,
      date: data.date || new Date().toISOString(),
      thumbnail: data.thumbnail,
      content: stripLeadingH1(content),
    };
  } catch (error) {
    console.error(`Error reading project ${slug}:`, error);
    return null;
  }
}
