"use client";

import { motion } from "framer-motion";

const interests = [
  "Cafe hopping and discovering new coffee spots",
  "Fitness and maintaining an active lifestyle",
  "Continuous learning and staying current with tech trends",
  "Building side projects and experimenting with new tools",
];

export default function SharedInterests() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="border-t border-line py-16"
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[14rem_1fr] md:gap-16">
        <h2 className="subhead text-3xl md:sticky md:top-28 md:self-start">
          Shared Interests
        </h2>

        <div>
          <p className="max-w-2xl text-lg leading-relaxed text-body">
            Beyond code and quality assurance, we share a passion for life
            outside the screen. Here&apos;s what keeps us balanced and inspired.
          </p>
          <ul className="mt-8 space-y-3">
            {interests.map((interest) => (
              <li
                key={interest}
                className="border-l border-line pl-4 leading-relaxed text-body"
              >
                {interest}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.section>
  );
}
