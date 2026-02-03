"use client";

import { motion } from "framer-motion";

export default function SharedInterests() {
  const interests = [
    "Cafe hopping and discovering new coffee spots",
    "Fitness and maintaining an active lifestyle",
    "Continuous learning and staying current with tech trends",
    "Building side projects and experimenting with new tools",
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
      className="mb-16"
    >
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-12">
        <h2 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
          Shared Interests
        </h2>
        <p className="mb-6 text-lg leading-8 text-gray-700 dark:text-gray-300">
          Beyond code and quality assurance, we share a passion for life outside
          the screen. Here&apos;s what keeps us balanced and inspired:
        </p>
        <ul className="space-y-4">
          {interests.map((interest, index) => (
            <li
              key={index}
              className="flex items-start text-gray-700 dark:text-gray-300"
            >
              <span className="mr-3 mt-1 text-gray-500 dark:text-gray-400">
                •
              </span>
              <span className="text-lg">{interest}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
