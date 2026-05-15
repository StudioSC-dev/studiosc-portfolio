"use client";

import Script from "next/script";

interface SocialPostProps {
  platform: "instagram" | "facebook";
  url: string;
  fallbackUrl?: string;
}

export default function SocialPost({
  platform,
  url,
  fallbackUrl,
}: SocialPostProps) {
  const fallback = fallbackUrl || url;

  if (platform === "instagram") {
    return (
      <div className="my-8 flex justify-center">
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ maxWidth: "540px", minWidth: "326px", width: "100%" }}
        >
          <a
            href={fallback}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline"
          >
            View post on Instagram
          </a>
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

  return (
    <div className="my-8">
      <a
        href={fallback}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 underline"
      >
        View original post
      </a>
    </div>
  );
}
