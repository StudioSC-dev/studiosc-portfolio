"use client";

import dynamic from "next/dynamic";

export const SocialPost = dynamic(() => import("./SocialPost"), { ssr: false });

// Mermaid is a plain client component that lazy-loads the mermaid library inside
// an effect, so it needs no ssr:false dynamic wrapper. Wrapping it in next/dynamic
// dropped its `chart` prop when rendered through the RSC MDXRemote pipeline.
export { default as Mermaid } from "./Mermaid";
