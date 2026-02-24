import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import ProjectCard from "@/components/home/ProjectCard";
import LatestBlogPosts from "@/components/home/LatestBlogPosts";
import { getBlogPosts, getProjects } from "@/lib/mdx";

export const metadata: Metadata = {
  title: "StudioSC",
  description:
    "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
};

export default async function Home() {
  const allPosts = await getBlogPosts();
  const latestPosts = allPosts.slice(0, 3);
  const allProjects = await getProjects();

  // Get featured projects
  const featuredProjects = allProjects.filter(
    (p) =>
      p.slug === "portfolio-site" ||
      p.slug === "tallyandtrace" ||
      p.slug === "fitness-rival"
  );

  // Sort by completion status: QA Verified > QA In Progress > Under Development
  const sortedFeaturedProjects = featuredProjects.sort((a, b) => {
    const getStatusPriority = (project: typeof a) => {
      if (project.qaVerified) return 1;
      if (project.qaInProgress) return 2;
      if (project.underDevelopment) return 3;
      return 4;
    };
    return getStatusPriority(a) - getStatusPriority(b);
  });

  return (
    <>
      <Hero />

      {/* Featured Work Section */}
      <section className="px-6 py-20 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12">Featured Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedFeaturedProjects.map((project) => (
              <ProjectCard
                key={project.slug}
                slug={project.slug}
                title={project.title}
                description={project.description}
                tags={project.tags}
                thumbnail={project.thumbnail}
                qaVerified={project.qaVerified}
                qaInProgress={project.qaInProgress}
                underDevelopment={project.underDevelopment}
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
