import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import ProjectCard from "@/components/home/ProjectCard";
import LatestBlogPosts from "@/components/home/LatestBlogPosts";
import { getBlogPosts } from "@/lib/mdx";

export const metadata: Metadata = {
  title: "StudioSC",
  description:
    "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
};

export default async function Home() {
  const allPosts = await getBlogPosts();
  const latestPosts = allPosts.slice(0, 3);

  return (
    <>
      <Hero />

      {/* Featured Work Section */}
      <section className="px-6 py-20 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12">Featured Work</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ProjectCard
              title="StudioSC Portfolio"
              description="The very site you're on. A modern Next.js portfolio showcasing our duo approach to software development and quality assurance."
              tags={["Next.js", "TypeScript", "Playwright", "Tailwind"]}
              qaInProgress={true}
              githubUrl="https://github.com/studiosc"
            />
            <ProjectCard
              title="Tally And Trace"
              description="A full-stack, type-safe financial management tool for personal and business finances. Features React web frontend, FastAPI backend, and React Native mobile app (coming soon)."
              tags={[
                "React",
                "FastAPI",
                "TypeScript",
                "PostgreSQL",
                "React Native",
                "Redux Toolkit",
                "TanStack Router",
                "Supabase",
                "Render",
              ]}
              qaInProgress={true}
              liveUrl="https://tallyandtrace.studiosc.dev"
              githubUrl="https://github.com/StudioSC-dev/tally-and-trace"
            />
            <ProjectCard
              title="Fitness Rival"
              description="A gamified fitness application designed to make working out more engaging and social. Currently in active development."
              tags={["React", "TypeScript", "Node.js"]}
              underDevelopment={true}
            />
          </div>
        </div>
      </section>

      {/* Latest Blog Posts Section */}
      <LatestBlogPosts posts={latestPosts} />
    </>
  );
}
