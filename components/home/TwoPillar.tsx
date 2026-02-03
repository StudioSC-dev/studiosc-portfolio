"use client";

import { motion } from "framer-motion";
import { Code, TestTube } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PillarCardProps {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  buttonText: string;
  buttonHref: string;
  delay: number;
}

function PillarCard({
  title,
  subtitle,
  description,
  icon,
  buttonText,
  buttonHref,
  delay,
}: PillarCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-4 flex items-center space-x-3">
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              {icon}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {subtitle}
              </p>
            </div>
          </div>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{description}</p>
          <Link
            href={buttonHref}
            className="inline-flex items-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {buttonText}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function TwoPillar() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Two Pillars, One Mission
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Choose your path or combine both for the full cycle
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2">
          <PillarCard
            title="The Build"
            subtitle="Seth"
            description="Full-stack architecture, API design, and performant frontends."
            icon={<Code className="h-6 w-6 text-gray-900 dark:text-white" />}
            buttonText="View Engineering Portfolio"
            buttonHref="/about#seth"
            delay={0.2}
          />
          <PillarCard
            title="The Quality"
            subtitle="Christine"
            description="Automated testing, performance auditing, and release strategy."
            icon={
              <TestTube className="h-6 w-6 text-gray-900 dark:text-white" />
            }
            buttonText="View QA Case Studies"
            buttonHref="/about#christine"
            delay={0.4}
          />
        </div>
      </div>
    </section>
  );
}
