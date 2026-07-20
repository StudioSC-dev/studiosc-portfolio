import React from "react";
import CtaLink from "@/components/ui/CtaLink";

const disciplines = [
  {
    index: "01",
    heading: "The Build",
    name: "Seth",
    role: "Lead Engineer",
    blurb:
      "Leads system design end to end — architecture, APIs, data, and delivery. Picks the stack to fit the problem rather than the fashion, and builds it to hold up once real traffic arrives.",
    skills: ["Architecture", "Full-Stack", "Cloud"],
  },
  {
    index: "02",
    heading: "The Break",
    name: "Christine",
    role: "Senior QA Engineer",
    blurb:
      "Hardening applications through automated testing and performance auditing, before users find the edges.",
    skills: ["Playwright", "Cypress", "Load Testing"],
  },
];

const Hero = () => {
  return (
    <section className="border-b border-line px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <p className="label mb-8">StudioSC — Engineering &amp; Quality</p>

        <h1 className="font-serif text-5xl leading-[1.05] text-ink sm:text-6xl md:text-7xl">
          We build <em>resilient</em> software.
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-body">
          A specialized engineering duo bridging the gap between high-velocity
          development and enterprise-grade quality assurance.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <CtaLink href="/work">View the Studio Showcase</CtaLink>
          <CtaLink href="/contact" variant="secondary">
            Start a conversation
          </CtaLink>
        </div>
      </div>

      {/* The two disciplines, set as a typographic spread rather than icon cards.
          The divider is a real border rather than a gap-px/background trick, so
          these columns stay transparent and the paper texture shows through. */}
      <div className="mx-auto mt-20 grid max-w-5xl grid-cols-1 border-t border-line md:grid-cols-2">
        {disciplines.map((d, i) => (
          <div
            key={d.heading}
            className={
              i === 0
                ? "pt-8 md:pr-8"
                : "mt-10 border-t border-line pt-8 md:mt-0 md:border-l md:border-t-0 md:pl-8"
            }
          >
            <p className="label mb-6">
              {d.index} / {d.heading}
            </p>
            <h3 className="subhead text-2xl">{d.heading}</h3>
            <p className="mt-1 text-sm text-muted">
              {d.name} — {d.role}
            </p>
            <p className="mt-4 max-w-sm leading-relaxed text-body">{d.blurb}</p>
            <p className="mt-6 font-mono text-xs text-muted">
              {d.skills.join("  ·  ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Hero;
