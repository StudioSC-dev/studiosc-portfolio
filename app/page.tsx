import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import ProjectCard from "@/components/home/ProjectCard";
import LatestBlogPosts from "@/components/home/LatestBlogPosts";
import { getBlogPosts, getProjects, validateShippedRange } from "@/lib/mdx";
import { STATUS_ORDER } from "@/lib/statuses";

export const metadata: Metadata = {
  title: "StudioSC",
  description:
    "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
};

export default async function Home() {
  const allPosts = await getBlogPosts();
  const latestPosts = allPosts.slice(0, 3);
  const allProjects = await getProjects();
  // Fails the build if the project files or the Range are invalid
  await validateShippedRange();

  // Get featured projects
  const featuredProjects = allProjects.filter(
    (p) =>
      p.slug === "portfolio-site" ||
      p.slug === "central-command" ||
      p.slug === "tallyandtrace"
  );

  // Sort by completion status, in the order of the fixed status set
  const sortedFeaturedProjects = featuredProjects.sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );

  return (
    <>
      <Hero />

      {/* Featured Work Section */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="subhead mb-12 text-3xl">Featured Work</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedFeaturedProjects.map((project) => (
              <ProjectCard
                key={project.slug}
                slug={project.slug}
                title={project.title}
                description={project.description}
                tags={project.tags}
                thumbnail={project.thumbnail}
                status={project.status}
                githubUrl={project.githubUrl}
                liveUrl={project.liveUrl}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Latest Blog Posts Section */}
      <LatestBlogPosts posts={latestPosts} />
    </>
  );
}
