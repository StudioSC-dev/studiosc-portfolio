"use client";

import { motion } from "framer-motion";
import { Download } from "lucide-react";
import type { Person } from "@/types";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

interface PersonSectionProps {
  person: Person;
  id: string;
  delay?: number;
}

export default function PersonSection({
  person,
  id,
  delay = 0,
}: PersonSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="mb-16 scroll-mt-20"
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-12">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {person.name}
          </h2>
          <p className="mt-2 text-xl font-semibold text-gray-600 dark:text-gray-400">
            {person.role}
          </p>
        </div>

        <div className="mb-6">
          <p className="text-lg leading-8 text-gray-700 dark:text-gray-300">
            {person.bio}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Tech Stack & Expertise
          </h3>
          <div className="flex flex-wrap gap-2">
            {person.techStack.map((tech, index) => (
              <span
                key={index}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Experience Highlights
          </h3>
          <ul className="space-y-2">
            {person.experience.map((exp, index) => (
              <li
                key={index}
                className="flex items-start text-gray-700 dark:text-gray-300"
              >
                <span className="mr-2 text-gray-500 dark:text-gray-400">•</span>
                <span>{exp}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-4">
          <a
            href={person.linkedIn}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <LinkedInIcon className="mr-2 h-4 w-4" />
            LinkedIn
          </a>
          <a
            href={person.resumePath}
            download
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CV
          </a>
        </div>
      </div>
    </motion.section>
  );
}
