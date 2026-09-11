// WHY: the site must serve bbox-ui's OWN registry at /r/*.json — the URL the
// catalog pages advertise. The forked template shipped its own registry routes
// generating its demo `button`; those are gone. The real payloads are built at
// the repo root by `shadcn build` (root `registry.json` -> root `public/r/`),
// so the site just copies them in as static files at build time. One registry,
// one source of truth, no second copy to drift.
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const from = path.join(root, "public", "r");
const to = path.join(import.meta.dirname, "public", "r");

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`registry -> public/r (${(await readdir(to)).join(", ")})`);
