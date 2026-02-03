"use client";

import { motion } from "framer-motion";

export default function ContactHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-12 text-center"
    >
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
        Contact Us
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-400">
        Let&apos;s build (and break) something great. We are currently accepting
        select inquiries for custom software development, QA auditing, and
        technical consulting. Tell us a bit about your project, and we&apos;ll
        get back to you within 2 business days.
      </p>
    </motion.div>
  );
}
