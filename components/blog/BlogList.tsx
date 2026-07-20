"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import BlogCard from "./BlogCard";
import type { BlogPost } from "@/types";

interface BlogListProps {
  posts: BlogPost[];
}

export default function BlogList({ posts }: BlogListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "technical" | "non-technical"
  >("all");

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Category filter
      if (selectedCategory !== "all" && post.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim() === "") {
        return true;
      }

      const query = searchQuery.toLowerCase();
      return (
        post.title.toLowerCase().includes(query) ||
        post.description.toLowerCase().includes(query) ||
        post.author.toLowerCase().includes(query)
      );
    });
  }, [posts, searchQuery, selectedCategory]);

  return (
    <div>
      {/* Search and Filter Section */}
      <div className="mb-4 border-b border-line pb-6">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search posts"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-b border-line bg-transparent py-3 pl-7 pr-8 text-ink placeholder-muted transition-colors focus:border-ink focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category Filter — underline marks the active filter instead of a filled pill */}
        <div className="mt-6 flex flex-wrap items-center gap-6">
          {(
            [
              ["all", "All Posts"],
              ["technical", "Technical"],
              ["non-technical", "Non-Technical"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSelectedCategory(value)}
              aria-pressed={selectedCategory === value}
              className={`pb-1 text-sm transition-colors ${
                selectedCategory === value
                  ? "border-b border-ink text-ink"
                  : "border-b border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}

          {filteredPosts.length !== posts.length && (
            <span className="label ml-auto">
              {filteredPosts.length} of {posts.length}
            </span>
          )}
        </div>
      </div>

      {/* Blog Posts List */}
      {filteredPosts.length === 0 ? (
        <p className="py-16 text-center text-body">
          No posts found matching your search criteria.
        </p>
      ) : (
        <div>
          {filteredPosts.map((post, index) => (
            <BlogCard key={post.slug} post={post} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
