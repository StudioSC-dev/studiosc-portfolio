"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type State =
  | { status: "loading" }
  | { status: "done"; svg: string }
  | { status: "error"; message: string };

interface MermaidProps {
  /** Diagram source. Prefer passing as children: <Mermaid>{`flowchart...`}</Mermaid> */
  children?: ReactNode;
  /** Legacy/alternate way to pass the diagram source. */
  chart?: string;
}

export default function Mermaid({ children, chart }: MermaidProps) {
  const id = useId().replace(/:/g, "");
  const initialized = useRef(false);
  const [state, setState] = useState<State>({ status: "loading" });

  // next-mdx-remote/rsc strips MDX expressions ({...}), so the diagram is passed
  // as a fenced ```mermaid code block whose string content arrives via `chart`
  // (see the `code` component mapping in the blog/work page). `children` is kept
  // as a fallback for direct React usage.
  const raw =
    typeof chart === "string"
      ? chart
      : typeof children === "string"
        ? children
        : "";

  useEffect(() => {
    const source = raw.trim();
    if (!source) {
      setState({ status: "error", message: "No diagram source provided." });
      return;
    }

    let cancelled = false;

    (async () => {
      // mermaid touches the DOM on import, so load it only on the client.
      const mermaid = (await import("mermaid")).default;

      if (!initialized.current) {
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
        initialized.current = true;
      }

      const { svg } = await mermaid.render(`mermaid-${id}`, source);
      if (!cancelled) {
        setState({ status: "done", svg });
      }
    })().catch((e: unknown) => {
      if (!cancelled) {
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Failed to render diagram",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [raw, id]);

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
