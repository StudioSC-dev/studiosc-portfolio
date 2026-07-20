"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { INSTAGRAM, LINKEDIN } from "@/lib/links";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email({ message: "Please enter a valid email address" }),
  company: z.string().min(2, "Company name must be at least 2 characters"),
  service: z.enum(["full-stack", "qa", "full-cycle", "employment"]),
  projectGoals: z
    .string()
    .min(10, "Please provide at least 10 characters about your project"),
  estimatedBudget: z.string().optional(),
  referralSource: z.string().optional(),
  website: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

// Hoisted so the six inputs cannot drift apart. Underline-only fields: boxed
// inputs with shadows were a large part of the site's generic-template look.
const fieldClass =
  "mt-2 block w-full border-b border-line bg-transparent py-2 text-ink placeholder-muted transition-colors focus:border-ink focus:outline-none";
const labelClass = "label block";
const errorClass = "mt-2 text-sm text-danger";

export default function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setIsSuccess(true);
      reset();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="border-l-2 border-ok py-2 pl-6"
      >
        <h3 className="subhead mb-4 text-2xl">
          Got it! Thanks for reaching out to StudioSC.
        </h3>
        <p className="mb-4 leading-relaxed text-body">
          We&apos;re likely either at the gym or deep in a code review, but
          we&apos;ve received your message. We&apos;ll review your project
          details and follow up shortly.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          In the meantime, feel free to check out our{" "}
          <Link
            href="/blog"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            latest project
          </Link>{" "}
          or{" "}
          <a
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            follow our cafe-hopping journey on Instagram
          </a>
          .
        </p>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8"
    >
      {/* Honeypot field — hidden from real users, bots tend to fill every field */}
      <div className="absolute -left-2499.75" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          type="text"
          id="website"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            id="name"
            {...register("name")}
            className={fieldClass}
            placeholder="Your name"
          />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email <span className="text-danger">*</span>
          </label>
          <input
            type="email"
            id="email"
            {...register("email")}
            className={fieldClass}
            placeholder="your.email@example.com"
          />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="company" className={labelClass}>
          Company <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          id="company"
          {...register("company")}
          className={fieldClass}
          placeholder="Your company"
        />
        {errors.company && (
          <p className={errorClass}>{errors.company.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="service" className={labelClass}>
          What can we help with? <span className="text-danger">*</span>
        </label>
        <select
          id="service"
          {...register("service")}
          className={`${fieldClass} bg-paper`}
        >
          <option value="">Select a service</option>
          <option value="full-stack">Full-Stack Development (The Build)</option>
          <option value="qa">QA Strategy & Automation (The Quality)</option>
          <option value="full-cycle">
            The &quot;Full Cycle&quot; (Dev + QA)
          </option>
          <option value="employment">Full-time / Employment Inquiry</option>
        </select>
        {errors.service && (
          <p className={errorClass}>{errors.service.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="projectGoals" className={labelClass}>
          Project Goals <span className="text-danger">*</span>
        </label>
        <textarea
          id="projectGoals"
          {...register("projectGoals")}
          rows={6}
          className={fieldClass}
          placeholder="What problem are we solving? What is your desired timeline?"
        />
        {errors.projectGoals && (
          <p className={errorClass}>{errors.projectGoals.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="estimatedBudget" className={labelClass}>
          Estimated Budget
        </label>
        <input
          type="text"
          id="estimatedBudget"
          {...register("estimatedBudget")}
          className={fieldClass}
          placeholder="e.g., $10k - $50k"
        />
      </div>

      <div>
        <label htmlFor="referralSource" className={labelClass}>
          How did you hear about us? (Optional)
        </label>
        <input
          type="text"
          id="referralSource"
          {...register("referralSource")}
          className={fieldClass}
          placeholder="e.g., LinkedIn, Google, Referral"
        />
      </div>

      {error && (
        <p className="border-l-2 border-danger py-2 pl-4 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        // Same invert-on-hover treatment as CtaLink, so buttons and CTAs read as
        // one control family.
        className="border border-ink bg-ink px-8 py-3 text-sm text-paper transition-colors duration-200 hover:bg-transparent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-line-strong disabled:text-paper disabled:hover:bg-line-strong disabled:hover:text-paper"
      >
        {isSubmitting ? "Sending..." : "Send Message"}
      </button>

      <div className="border-t border-line pt-8">
        <p className="text-sm leading-relaxed text-muted">
          <strong className="font-normal text-ink">
            Looking for a full-time hire?
          </strong>{" "}
          If you&apos;re a recruiter or hiring manager, feel free to skip the
          form and email us directly at{" "}
          <a
            href="mailto:hello@studiosc.dev"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            hello@studiosc.dev
          </a>{" "}
          or connect with either of us on LinkedIn.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <a
            href={LINKEDIN.seth}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            <LinkedInIcon className="h-4 w-4" />
            Seth — Lead Engineer
          </a>
          <a
            href={LINKEDIN.christine}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            <LinkedInIcon className="h-4 w-4" />
            Christine — Senior QA Engineer
          </a>
        </div>
      </div>
    </motion.form>
  );
}
