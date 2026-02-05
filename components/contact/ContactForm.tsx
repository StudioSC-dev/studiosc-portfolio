"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import Link from "next/link";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

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
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-900/20"
      >
        <h3 className="mb-4 text-2xl font-bold text-green-900 dark:text-green-100">
          Got it! Thanks for reaching out to StudioSC.
        </h3>
        <p className="mb-4 text-lg text-green-800 dark:text-green-200">
          We&apos;re likely either at the gym or deep in a code review, but
          we&apos;ve received your message. We&apos;ll review your project
          details and follow up shortly.
        </p>
        <p className="text-sm text-green-700 dark:text-green-300">
          In the meantime, feel free to check out our{" "}
          <Link
            href="/blog"
            className="font-semibold underline hover:no-underline"
          >
            latest project
          </Link>{" "}
          or{" "}
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:no-underline"
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
      className="space-y-6"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            {...register("name")}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
            placeholder="Your name"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            {...register("email")}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
            placeholder="your.email@example.com"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.email.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="company"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Company <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="company"
          {...register("company")}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
          placeholder="Your company"
        />
        {errors.company && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.company.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="service"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          What can we help with? <span className="text-red-500">*</span>
        </label>
        <select
          id="service"
          {...register("service")}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
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
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.service.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="projectGoals"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Project Goals <span className="text-red-500">*</span>
        </label>
        <textarea
          id="projectGoals"
          {...register("projectGoals")}
          rows={6}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
          placeholder="What problem are we solving? What is your desired timeline?"
        />
        {errors.projectGoals && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.projectGoals.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="estimatedBudget"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Estimated Budget
        </label>
        <input
          type="text"
          id="estimatedBudget"
          {...register("estimatedBudget")}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
          placeholder="e.g., $10k - $50k"
        />
      </div>

      <div>
        <label
          htmlFor="referralSource"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          How did you hear about us? (Optional)
        </label>
        <input
          type="text"
          id="referralSource"
          {...register("referralSource")}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-gray-900 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-500"
          placeholder="e.g., LinkedIn, Google, Referral"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        {isSubmitting ? "Sending..." : "Send Message"}
      </button>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Looking for a full-time hire?</strong> If you&apos;re a
          recruiter or hiring manager, feel free to skip the form and email us
          directly at{" "}
          <a
            href="mailto:hello@studiosc.dev"
            className="font-semibold text-gray-900 underline hover:no-underline dark:text-white"
          >
            hello@studiosc.dev
          </a>{" "}
          or connect with us on{" "}
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center font-semibold text-gray-900 underline hover:no-underline dark:text-white"
          >
            <LinkedInIcon className="mr-1 h-4 w-4" />
            LinkedIn
          </a>
          .
        </p>
      </div>
    </motion.form>
  );
}
