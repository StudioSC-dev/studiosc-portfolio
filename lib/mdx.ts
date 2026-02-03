import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import type { BlogPost } from "@/types";
import { calculateReadingTime } from "./utils";

const contentDirectory = join(process.cwd(), "content/blog");

export async function getBlogPosts(): Promise<BlogPost[]> {
  try {
    const files = await readdir(contentDirectory);
    const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

    const posts = await Promise.all(
      mdxFiles.map(async (file) => {
        const filePath = join(contentDirectory, file);
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
    const filePath = join(contentDirectory, `${slug}.mdx`);
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
