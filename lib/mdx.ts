import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import type { BlogPost, Project } from "@/types";
import { calculateReadingTime } from "./utils";
import { projectFrontmatterSchema } from "./projects-schema";
import { RANGE_CATEGORIES, validateRange } from "../content/range";

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

function parseProject(file: string, fileContents: string) {
  const { data, content } = matter(fileContents);
  const parsed = projectFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid project frontmatter in ${file}: ${issues}`);
  }
  return {
    project: {
      slug: file.replace(/\.mdx$/, ""),
      ...parsed.data,
    } satisfies Project,
    content,
  };
}

/**
 * Read every project. Malformed frontmatter throws, naming the file, so a bad
 * file fails the build instead of quietly disappearing from the site.
 */
export async function getProjects(
  directory: string = projectsDirectory
): Promise<Project[]> {
  const files = await readdir(directory);
  const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

  const projects = await Promise.all(
    mdxFiles.map(async (file) => {
      const fileContents = await readFile(join(directory, file), "utf8");
      return parseProject(file, fileContents).project;
    })
  );

  return projects.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/** One project by slug: `null` when there is no such file, a throw when it is malformed. */
export async function getProject(
  slug: string,
  directory: string = projectsDirectory
) {
  const file = `${slug}.mdx`;
  let fileContents: string;
  try {
    fileContents = await readFile(join(directory, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const { project, content } = parseProject(file, fileContents);
  return { ...project, content: stripLeadingH1(content) };
}

/** Build-time check of the shipped Range against the project files. */
export async function validateShippedRange(): Promise<void> {
  const projects = await getProjects();
  validateRange(
    RANGE_CATEGORIES,
    projects.map((project) => project.slug)
  );
}
