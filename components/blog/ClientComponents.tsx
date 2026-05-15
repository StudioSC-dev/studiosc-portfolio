"use client";

import dynamic from "next/dynamic";

export const SocialPost = dynamic(() => import("./SocialPost"), { ssr: false });
export const Mermaid = dynamic(() => import("./Mermaid"), { ssr: false });
