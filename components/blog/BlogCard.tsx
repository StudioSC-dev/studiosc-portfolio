"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Calendar, Clock } from "lucide-react";
import type { BlogPost } from "@/types";

interface BlogCardProps {
  post: BlogPost;
  index: number;
}

export default function BlogCard({ post, index }: BlogCardProps) {
  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
    >
      <Link href={`/blog/${post.slug}`}>
        <div className="p-6">
          <div className="mb-3 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center">
              <Calendar className="mr-1 h-4 w-4" />
              {formattedDate}
            </span>
            {post.readingTime && (
              <span className="flex items-center">
                <Clock className="mr-1 h-4 w-4" />
                {post.readingTime} min read
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {post.category === "technical" ? "Technical" : "Non-Technical"}
            </span>
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900 transition-colors group-hover:text-gray-700 dark:text-white dark:group-hover:text-gray-300">
            {post.title}
          </h2>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {post.description}
          </p>
          <div className="flex items-center text-sm font-medium text-gray-900 dark:text-white">
            Read more →
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
