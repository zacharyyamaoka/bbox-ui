#!/usr/bin/env node
/**
 * Validate every published payload against shadcn's OWN registryItemSchema.
 *
 * WHY this exists beside the Python checker rather than inside it: that
 * checker re-derives what a valid payload looks like, and a re-derivation is
 * only ever as good as its author's memory of the format. It approved
 * payloads with `name` removed and with a corrupted item `type` — both of
 * which shadcn itself rejects — because it was comparing the fields it
 * thought to compare (judge fault injection, 2026-09-18). shadcn ships the
 * schema it actually installs by, so that schema is the independent oracle
 * and this is the check that consults it.
 *
 *   node docs/validate_registry_payloads.mjs [public/r]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "public/r");
const { registryItemSchema } = await import("shadcn/schema");

const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "registry.json");
let bad = 0;
for (const file of files.sort()) {
  const payload = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  const result = registryItemSchema.safeParse(payload);
  if (!result.success) {
    bad += 1;
    const issues = result.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    console.error(`  ${file}: ${issues.join("; ")}`);
  }
}
if (bad) {
  console.error(`\nSCHEMA-INVALID: ${bad}/${files.length} published payloads would be rejected by shadcn itself.`);
  process.exit(1);
}
console.log(`shadcn registryItemSchema: ${files.length} published payloads valid`);
