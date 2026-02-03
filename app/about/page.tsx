import type { Metadata } from "next";
import PersonSection from "@/components/about/PersonSection";
import SharedInterests from "@/components/about/SharedInterests";
import type { Person } from "@/types";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Meet the team behind StudioSC. Learn about Seth's full-stack engineering expertise and Christine's QA automation and testing experience.",
};

const seth: Person = {
  name: "Seth",
  role: "Lead Engineer",
  bio: "Full-stack architect with a passion for building scalable, performant applications. Specialized in React, Node.js, and modern web technologies.",
  techStack: [
    "React",
    "Next.js",
    "Node.js",
    "TypeScript",
    "PostgreSQL",
    "AWS",
    "Docker",
  ],
  experience: [
    "Led development of high-traffic web applications",
    "Architected microservices and API designs",
    "Optimized frontend performance and user experience",
    "Mentored engineering teams and established best practices",
  ],
  linkedIn: "https://www.linkedin.com/in/sethcharlespalileo/",
  resumePath: "/resumes/seth-cv.pdf",
};

const christine: Person = {
  name: "Christine",
  role: "Senior QA Engineer",
  bio: "QA automation expert focused on building robust testing strategies and ensuring software quality at scale. Specialized in test automation, performance testing, and release management.",
  techStack: [
    "Selenium",
    "Cypress",
    "Playwright",
    "Jest",
    "Load Testing",
    "CI/CD",
    "Test Strategy",
  ],
  experience: [
    "Built comprehensive test automation frameworks",
    "Conducted performance and load testing audits",
    "Established QA processes and release strategies",
    "Reduced production bugs through systematic testing",
  ],
  linkedIn:
    "https://www.linkedin.com/in/christine-dianne-nacar-palileo-86249a64/",
  resumePath: "/resumes/christine-cv.pdf",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          About Us
        </h1>
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">
          Two professionals, one mission: delivering exceptional software
        </p>
      </div>

      <PersonSection person={seth} id="seth" delay={0.1} />
      <PersonSection person={christine} id="christine" delay={0.3} />
      <SharedInterests />
    </div>
  );
}
