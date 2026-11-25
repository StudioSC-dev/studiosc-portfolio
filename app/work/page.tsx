import type { Metadata } from "next";
import { Fragment } from "react";
import { getProjects } from "@/lib/mdx";
import { STATUSES, STATUS_ORDER } from "@/lib/statuses";
import ProjectCard from "@/components/home/ProjectCard";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Explore our portfolio of projects, from full-stack applications to quality assurance case studies.",
};

export default async function WorkPage() {
  const allProjects = await getProjects();

  const renderProjectSection = (
    title: string,
    projects: typeof allProjects
  ) => {
    if (projects.length === 0) {
      return null;
    }

    return (
      <section className="mb-16">
        <h2 className="label mb-6 border-b border-line pb-3">{title}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
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
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <PageHeader
        label="Work"
        title="Our Work"
        lead="A catalog of our projects, showcasing our approach to building and breaking software."
      />

      {allProjects.length === 0 ? (
        <p className="py-16 text-body">No projects yet. Check back soon.</p>
      ) : (
        <>
          {STATUS_ORDER.map((status) => (
            <Fragment key={status}>
              {renderProjectSection(
                STATUSES[status].label,
                allProjects.filter((p) => p.status === status)
              )}
            </Fragment>
          ))}
        </>
      )}
    </div>
  );
}
