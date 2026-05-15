"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

const ICONS = {
  instagram: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-current"
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  facebook: (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-current"
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
};

const LABELS = {
  instagram: "View on Instagram",
  facebook: "View on Facebook",
};

function LinkCard({
  platform,
  url,
}: {
  platform: "instagram" | "facebook";
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/60 px-5 py-4 text-gray-200 no-underline transition-colors hover:border-gray-500 hover:bg-gray-800"
    >
      <span className="text-gray-400">{ICONS[platform]}</span>
      <span className="text-sm font-medium">{LABELS[platform]}</span>
      <span className="ml-auto text-xs text-gray-500">↗</span>
    </a>
  );
}

interface SocialPostProps {
  /** Try Instagram first; fall back to Facebook if the post is private or unavailable. */
  instagramUrl?: string;
  facebookUrl?: string;
  /** Simple single-platform usage (no fallback logic). */
  platform?: "instagram" | "facebook";
  url?: string;
  fallbackUrl?: string;
}

// --- Smart fallback component (instagramUrl + optional facebookUrl) ---

type IgStatus = "pending" | "success" | "failed";

function SmartSocialPost({
  instagramUrl,
  facebookUrl,
}: {
  instagramUrl: string;
  facebookUrl?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [igStatus, setIgStatus] = useState<IgStatus>("pending");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const TIMEOUT_MS = 3000;

    // Detect a successful embed by watching for the iframe Instagram inserts
    const observer = new MutationObserver(() => {
      if (el.querySelector("iframe")) {
        clearTimeout(timeoutId);
        observer.disconnect();
        setIgStatus("success");
      }
    });

    observer.observe(el, { childList: true, subtree: true });

    // If no iframe appears within the timeout, the post is private or unavailable
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      setIgStatus("failed");
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [instagramUrl]);

  return (
    <div ref={containerRef} className="my-8">
      {/* Always mount the Instagram blockquote while pending so embed.js can find it */}
      {igStatus !== "failed" && (
        <>
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={instagramUrl}
            data-instgrm-version="14"
            style={{
              maxWidth: "540px",
              minWidth: "326px",
              width: "100%",
              margin: "0 auto",
            }}
          >
            {/* Visible until embed.js replaces it, or until we fall back */}
            <LinkCard platform="instagram" url={instagramUrl} />
          </blockquote>
          <Script
            src="https://www.instagram.com/embed.js"
            strategy="lazyOnload"
          />
        </>
      )}

      {igStatus === "failed" && facebookUrl && (
        <>
          <div id="fb-root" />
          <div
            className="fb-post"
            data-href={facebookUrl}
            data-width="500"
            data-show-text="true"
          />
          <Script
            src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v18.0"
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
        </>
      )}

      {igStatus === "failed" && !facebookUrl && (
        <LinkCard platform="instagram" url={instagramUrl} />
      )}
    </div>
  );
}

// --- Main component ---

export default function SocialPost({
  instagramUrl,
  facebookUrl,
  platform,
  url,
  fallbackUrl,
}: SocialPostProps) {
  // Smart fallback mode
  if (instagramUrl) {
    return (
      <SmartSocialPost instagramUrl={instagramUrl} facebookUrl={facebookUrl} />
    );
  }

  // Simple single-platform mode
  const href = fallbackUrl || url || "";

  if (platform === "instagram") {
    return (
      <div className="my-8 flex justify-center">
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ maxWidth: "540px", minWidth: "326px", width: "100%" }}
        >
          <LinkCard platform="instagram" url={href} />
        </blockquote>
        <Script
          src="https://www.instagram.com/embed.js"
          strategy="lazyOnload"
        />
      </div>
    );
  }

  if (platform === "facebook") {
    return (
      <div className="my-8 flex justify-center">
        <div id="fb-root" />
        <div
          className="fb-post"
          data-href={url}
          data-width="500"
          data-show-text="true"
        />
        <Script
          src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v18.0"
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  return platform ? <LinkCard platform={platform} url={href} /> : null;
}
