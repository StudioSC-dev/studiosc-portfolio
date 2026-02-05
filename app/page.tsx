import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import ProjectCard from "@/components/home/ProjectCard";

export const metadata: Metadata = {
  title: "Home",
  description:
    "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
};

export default function Home() {
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
              qaVerified={true}
              githubUrl="https://github.com/studiosc"
            />
            <ProjectCard
              title="E-Commerce Platform Rebuild"
              description="Full-stack TypeScript rebuild with 99.9% uptime. Complete modernization of legacy e-commerce system with comprehensive test coverage."
              tags={["Next.js", "PostgreSQL", "Playwright"]}
              qaVerified={true}
              githubUrl="https://github.com/studiosc"
              liveUrl="https://demo.studiosc.dev"
            />
            <ProjectCard
              title="API Gateway Service"
              description="High-performance API gateway handling 10k+ req/s. Built with Node.js and hardened through load testing and security audits."
              tags={["Node.js", "Redis", "Docker", "k6"]}
              qaVerified={true}
              githubUrl="https://github.com/studiosc"
            />
          </div>
        </div>
      </section>
    </>
  );
}
