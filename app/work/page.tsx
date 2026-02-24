import type { Metadata } from "next";
import { getProjects } from "@/lib/mdx";
import ProjectCard from "@/components/home/ProjectCard";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Explore our portfolio of projects, from full-stack applications to quality assurance case studies.",
};

export default async function WorkPage() {
  const allProjects = await getProjects();

  // Group projects by status
  const qaVerified = allProjects.filter((p) => p.qaVerified);
  const qaInProgress = allProjects.filter((p) => p.qaInProgress);
  const underDevelopment = allProjects.filter((p) => p.underDevelopment);

  const renderProjectSection = (
    title: string,
    projects: typeof allProjects,
    emptyMessage: string
  ) => {
    if (projects.length === 0) {
      return null;
    }

    return (
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
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
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Our Work
        </h1>
        <p className="mt-4 text-xl text-slate-400">
          A catalog of our projects, showcasing our approach to building and
          breaking software
        </p>
      </div>

      {allProjects.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <p className="text-lg text-slate-400">
            No projects yet. Check back soon!
          </p>
        </div>
      ) : (
        <>
          {renderProjectSection(
            "QA Verified",
            qaVerified,
            "No QA verified projects yet."
          )}
          {renderProjectSection(
            "QA In Progress",
            qaInProgress,
            "No projects in QA currently."
          )}
          {renderProjectSection(
            "Under Development",
            underDevelopment,
            "No projects in development currently."
          )}
        </>
      )}
    </div>
  );
}
