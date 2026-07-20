"use client";

import { motion } from "framer-motion";
import type { Person } from "@/types";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import CtaLink from "@/components/ui/CtaLink";

interface PersonSectionProps {
  person: Person;
  id: string;
  delay?: number;
}

/**
 * A person, set as a two-column editorial spread: the name and role hold the
 * left rail while the detail runs in the measure on the right. Replaces the
 * previous single shadowed card.
 */
export default function PersonSection({
  person,
  id,
  delay = 0,
}: PersonSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="scroll-mt-24 border-t border-line py-16"
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[14rem_1fr] md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <h2 className="subhead text-3xl">{person.name}</h2>
          <p className="label mt-3">{person.role}</p>
        </div>

        <div>
          <p className="max-w-2xl text-lg leading-relaxed text-body">
            {person.bio}
          </p>

          {/* Grouped by category, mirroring the CV's layout: a label rail on
              the left, the mono list of tools on the right. */}
          <div className="mt-10">
            <p className="label mb-5">Tech Stack &amp; Expertise</p>
            <dl className="divide-y divide-line border-t border-line">
              {person.techStack.map((group) => (
                <div
                  key={group.label}
                  className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
                >
                  <dt className="label pt-0.5">{group.label}</dt>
                  <dd className="font-mono text-sm leading-relaxed text-body">
                    {group.items.join("  ·  ")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-10">
            <p className="label mb-4">Experience Highlights</p>
            <ul className="space-y-3">
              {person.experience.map((exp) => (
                <li
                  key={exp}
                  className="border-l border-line pl-4 leading-relaxed text-body"
                >
                  {exp}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <CtaLink href={person.linkedIn}>
              <LinkedInIcon className="h-4 w-4" />
              LinkedIn
            </CtaLink>
            <CtaLink href={person.resumePath} variant="secondary" download>
              Download CV
            </CtaLink>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
