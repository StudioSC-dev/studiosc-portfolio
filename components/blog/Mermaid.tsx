"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  darkMode: true,
  themeVariables: {
    background: "#111827",
    primaryColor: "#1d4ed8",
    primaryTextColor: "#f9fafb",
    primaryBorderColor: "#374151",
    lineColor: "#6b7280",
    secondaryColor: "#1f2937",
    tertiaryColor: "#1f2937",
  },
});

interface MermaidProps {
  chart: string;
}

type State =
  | { status: "loading" }
  | { status: "done"; svg: string }
  | { status: "error"; message: string };

export default function Mermaid({ chart }: MermaidProps) {
  const id = useId().replace(/:/g, "");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    mermaid
      .render(`mermaid-${id}`, chart.trim())
      .then(({ svg }) => setState({ status: "done", svg }))
      .catch((e: unknown) =>
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Failed to render diagram",
        })
      );
  }, [chart, id]);

  if (state.status === "error") {
    return (
      <div className="my-8 rounded-lg border border-red-500/50 bg-red-900/20 p-4 font-mono text-sm text-red-400">
        <p className="mb-2 font-bold">Mermaid render error</p>
        <pre className="whitespace-pre-wrap">{state.message}</pre>
      </div>
    );
  }

  if (state.status === "loading") {
    return <div className="my-8 h-32 animate-pulse rounded-lg bg-gray-800" />;
  }

  return (
    <div
      className="my-8 flex justify-center overflow-auto rounded-lg bg-gray-900 p-6"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
