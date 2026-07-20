"use client";

import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeToTheme,
} from "@/lib/theme";

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

/** Read a design token off :root so diagrams match the rest of the page. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function DiagramError({ message }: { message: string }) {
  return (
    <div className="my-8 border-l-2 border-danger py-2 pl-4 font-mono text-sm text-danger">
      <p className="mb-2">Mermaid render error</p>
      <pre className="whitespace-pre-wrap">{message}</pre>
    </div>
  );
}

export default function Mermaid({ children, chart }: MermaidProps) {
  const id = useId().replace(/:/g, "");
  const [state, setState] = useState<State>({ status: "loading" });

  // Diagram colours are baked into the rendered SVG, so a theme change has to
  // re-render rather than just restyle. Tracks the site theme (not the OS), so
  // diagrams follow the header toggle too.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot
  );

  // next-mdx-remote/rsc strips MDX expressions ({...}), so the diagram is passed
  // as a fenced ```mermaid code block whose string content arrives via `chart`
  // (see the `pre` component mapping in the blog/work page). `children` is kept
  // as a fallback for direct React usage.
  const raw =
    typeof chart === "string"
      ? chart
      : typeof children === "string"
        ? children
        : "";
  const source = raw.trim();

  useEffect(() => {
    if (!source) {
      return;
    }

    let cancelled = false;

    (async () => {
      // mermaid touches the DOM on import, so load it only on the client.
      const mermaid = (await import("mermaid")).default;

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        darkMode: theme === "dark",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        themeVariables: {
          background: token("--paper", "#fafaf9"),
          primaryColor: token("--sunken", "#f5f5f4"),
          primaryTextColor: token("--ink", "#1c1917"),
          primaryBorderColor: token("--line-strong", "#d6d3d1"),
          secondaryColor: token("--surface", "#ffffff"),
          tertiaryColor: token("--sunken", "#f5f5f4"),
          lineColor: token("--muted", "#78716c"),
          textColor: token("--body", "#44403c"),
        },
      });

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
  }, [source, id, theme]);

  // Derived during render rather than pushed into state from an effect.
  if (!source) {
    return <DiagramError message="No diagram source provided." />;
  }

  if (state.status === "error") {
    return <DiagramError message={state.message} />;
  }

  if (state.status === "loading") {
    return <div className="my-8 h-32 animate-pulse rounded-sm bg-sunken" />;
  }

  return (
    <div
      className="my-8 flex justify-center overflow-auto border border-line bg-surface p-6"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
