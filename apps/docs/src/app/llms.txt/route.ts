import { readFileSync } from "node:fs";
import path from "node:path";
import { llms } from "fumadocs-core/source";

import { source } from "@/lib/source";

export const revalidate = false;

// WHY the preamble is a separate markdown file: llms.txt is read by models that
// will otherwise guess at installation, and the guess is always `npm install`.
// The generated page-tree index alone cannot say "there is no npm package" — so
// the authored half carries the usage contract and lives in content/llms-intro.md
// where it can be edited without touching this route.
export function GET() {
  const intro = readFileSync(
    path.join(process.cwd(), "content", "llms-intro.md"),
    "utf8",
  );
  return new Response(`${intro}${llms(source).index()}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
