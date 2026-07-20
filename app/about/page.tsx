import type { Metadata } from "next";
import PersonSection from "@/components/about/PersonSection";
import SharedInterests from "@/components/about/SharedInterests";
import PageHeader from "@/components/layout/PageHeader";
import type { Person } from "@/types";
import { LINKEDIN } from "@/lib/links";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Meet the team behind StudioSC. Learn about Seth's full-stack engineering expertise and Christine's QA automation and testing experience.",
};

// Employers and their end clients are deliberately anonymised — the scale is
// real, the names are not ours to publish.
const seth: Person = {
  name: "Seth",
  role: "Lead Engineer",
  bio: "Lead software engineer with 10+ years across full-stack web and mobile. Works as a software architect on AWS, GCP, and Vercel, and leads teams through delivery — picking the stack to fit the problem rather than the fashion.",
  techStack: [
    {
      label: "Languages",
      items: ["TypeScript", "JavaScript", "Python", "HTML/CSS"],
    },
    {
      label: "Frameworks",
      items: ["React", "Next.js", "Node.js", "NestJS", "Express", "FastAPI"],
    },
    {
      label: "Cloud & Infra",
      items: ["AWS", "GCP", "Vercel", "Docker", "IaC", "CI/CD"],
    },
    {
      label: "Data & Storage",
      items: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase"],
    },
    {
      label: "Messaging",
      items: ["Amazon SQS", "Amazon SNS"],
    },
    {
      label: "AI & Integrations",
      items: ["Generative AI (LLM)", "Twilio", "Stripe", "Mailgun", "SendGrid"],
    },
    {
      label: "Practices",
      items: ["System Design", "Code Review", "Agile Scrum", "Lean Kanban"],
    },
  ],
  experience: [
    "Leads end-to-end delivery of AI customer-service tooling — roadmap, architecture, and engineering standards — now serving ~1K daily users.",
    "Designed and led generative-AI features spanning ~10M+ customer accounts at a 99.9% SLA.",
    "Lead solutions architect for a 6-person JS/TS team shipping four products averaging ~200K monthly users each.",
    "Migrated a legacy on-prem Java service estate to infrastructure-as-code on AWS, cutting operational overhead.",
    "Re-platformed a retail commerce front end to micro-frontends on a serverless backend.",
    "10+ years across web and mobile; APMG Lean IT Foundation certified.",
  ],
  linkedIn: LINKEDIN.seth,
  resumePath: "/resumes/seth-cv.pdf",
};

const christine: Person = {
  name: "Christine",
  role: "Senior QA Engineer",
  bio: "Senior QA engineer with 11+ years designing, scaling, and maintaining test automation frameworks. Specializes in Cypress and Playwright with TypeScript, API testing, and CI/CD quality gates — increasingly with AI-assisted tooling to speed up test generation, debugging, and framework migration.",
  techStack: [
    {
      label: "Automation",
      items: [
        "Cypress (E2E & Component)",
        "Playwright",
        "Selenium WebDriver",
        "Katalon Studio",
      ],
    },
    {
      label: "Languages",
      items: ["TypeScript", "JavaScript", "SQL", "REST API"],
    },
    {
      label: "AI & Productivity",
      items: ["Claude", "GitHub Copilot", "Gemini", "Glean"],
    },
    {
      label: "CI/CD & DevOps",
      items: ["Buildkite", "Git", "SourceTree", "VirtualBox"],
    },
    {
      label: "Testing Utilities",
      items: [
        "Postman",
        "Lighthouse",
        "Puppeteer",
        "Percy",
        "TestRail",
        "XRAY",
        "JIRA",
      ],
    },
    {
      label: "Data & Storage",
      items: ["SQL Server", "MongoDB"],
    },
  ],
  experience: [
    "Architected and scaled Cypress end-to-end and component testing frameworks in TypeScript, significantly reducing regression cycles.",
    "Led migration of an established Cypress suite to Playwright, using AI-assisted translation to accelerate the refactor.",
    "Owns CI/CD quality gates in Buildkite — failing checks block production deploys.",
    "Established performance baselines with Lighthouse and Puppeteer, and visual-regression coverage with Percy to catch UI drift pre-release.",
    "Monitors product health and drives root-cause follow-through, lowering post-release P0/P1 defects.",
    "11+ years across hospitality, martech, and banking platforms; mentors QA engineers.",
  ],
  linkedIn: LINKEDIN.christine,
  resumePath: "/resumes/christine-cv.pdf",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <PageHeader
        label="About"
        title="About Us"
        lead="Two professionals, one mission: delivering exceptional software."
        divider={false}
      />

      <PersonSection person={seth} id="seth" delay={0.05} />
      <PersonSection person={christine} id="christine" delay={0.15} />
      <SharedInterests />
    </div>
  );
}
