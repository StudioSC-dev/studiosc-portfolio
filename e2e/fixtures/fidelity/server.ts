/**
 * The fidelity fixture's site: a static server for site/, sharing the fixture
 * canvas's photos and font, with an optional drift injected into every page.
 * The harness starts it in-process; the nested Playwright run starts it as
 * its web server (`tsx server.ts --port <n>`, drift from FIXTURE_DRIFT).
 *
 * It also stands in for the published canvas: `/published/support.js`
 * answers with the stand-in runtime, or with any bytes the harness sets.
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DRIFTS, type Drift } from "./drifts";

export const FIXTURE = __dirname;
export const CANVAS = path.join(FIXTURE, "canvas");
export const RUNTIME = path.join(FIXTURE, "runtime", "support.js");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export interface FixtureServer {
  url: string;
  setDrift(drift: Drift | null): void;
  /** The bytes `/published/support.js` answers with. */
  setRuntime(bytes: Buffer): void;
  close(): Promise<void>;
}

function apply(html: string, drift: Drift | null): string {
  if (!drift) return html;
  let out = html;
  for (const [from, to] of drift.replace ?? []) {
    if (!out.includes(from))
      throw new Error(`drift: "${from}" is not in the page`);
    out = out.split(from).join(to);
  }
  if (drift.css)
    out = out.replace("</head>", `<style>${drift.css}</style>\n</head>`);
  if (drift.js)
    out = out.replace("</body>", `<script>${drift.js}</script>\n</body>`);
  return out;
}

export function startFixtureServer(
  port = 0,
  initial: Drift | null = null
): Promise<FixtureServer> {
  let drift = initial;
  let runtime: Buffer = readFileSync(RUNTIME);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture.local");
    const send = (
      status: number,
      body: Buffer | string,
      type = "text/plain"
    ) => {
      res.writeHead(status, {
        "content-type": type,
        "cache-control": "no-store",
      });
      res.end(body);
    };
    if (url.pathname === "/published/support.js")
      return send(200, runtime, TYPES[".js"]);
    let file: string | null = null;
    if (url.pathname === "/") file = path.join(FIXTURE, "site", "index.html");
    else if (url.pathname === "/blog/work")
      file = path.join(FIXTURE, "site", "blog-work.html");
    else if (
      url.pathname.startsWith("/img/") ||
      url.pathname === "/_next/image"
    ) {
      // The gallery's photos come through an image optimiser, as Next.js
      // serves them: the original path is in the `url` parameter.
      const name = path.basename(
        url.pathname === "/_next/image"
          ? (url.searchParams.get("url") ?? "")
          : url.pathname
      );
      const swap = drift?.images?.[name];
      file = swap
        ? path.join(FIXTURE, "site", swap)
        : path.join(CANVAS, "img", name);
    } else if (url.pathname.startsWith("/fonts/"))
      file = path.join(CANVAS, "fonts", path.basename(url.pathname));
    else if (/^\/[\w.-]+$/.test(url.pathname))
      file = path.join(FIXTURE, "site", url.pathname.slice(1));
    if (!file || !existsSync(file)) return send(404, "not found");
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    if (type.startsWith("text/html"))
      return send(200, apply(readFileSync(file, "utf8"), drift), type);
    return send(200, readFileSync(file), type);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${p}`,
        setDrift: (d) => {
          drift = d;
        },
        setRuntime: (b) => {
          runtime = b;
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

if (require.main === module) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 0;
  const name = process.env.FIXTURE_DRIFT;
  if (name && !DRIFTS[name]) throw new Error(`unknown drift ${name}`);
  void startFixtureServer(port, name ? DRIFTS[name] : null).then((s) =>
    console.log(`fixture site on ${s.url}`)
  );
}
