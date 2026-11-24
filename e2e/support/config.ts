import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, cleanEnv } from "./git";

/** The tsx binary the repo installs. */
export const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

/**
 * Loads a TypeScript config file in a fresh process and returns its default
 * export as JSON. `env` replaces the named variables; `undefined` unsets one.
 */
export function loadConfig(
  file: string,
  env: Record<string, string | undefined> = {}
): Record<string, unknown> {
  const childEnv = cleanEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const code = `import(${JSON.stringify("./" + file)}).then((m) => {
    const c = m.default.default ?? m.default;
    process.stdout.write(JSON.stringify(c));
  });`;
  const out = execFileSync(TSX, ["-e", code], {
    cwd: ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return JSON.parse(out) as Record<string, unknown>;
}
