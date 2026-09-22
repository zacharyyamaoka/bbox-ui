/**
 * Storybook sidebar-organisation PREVIEWS — three proposals, each served as a
 * real Storybook so the sidebar can be judged by clicking it, not from a mock.
 *
 * WHY a title remap in the indexer instead of rewriting 151 `title:` lines:
 * the proposals are not decided yet, and peer lanes are editing these story
 * files right now. Storybook's own `experimental_indexers` hook takes the
 * stock CSF indexer's output and replaces only `title` (and tags); the preview
 * loads the CSF file with the index's title (`StoryStore.loadCSFFileByStoryId`),
 * so what renders is exactly what the chosen proposal would ship. Nothing under
 * `src/` changes, and `.storybook/` (Zach's :5421 config) is untouched.
 *
 * Throwaway by design: once a proposal is picked, the real change is the
 * titles themselves (or, for A, deleting them), and this folder goes.
 */
import type { Indexer, StorybookConfig } from "storybook/internal/types";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("./story-org.json", import.meta.url), "utf8"));

export type Org = "a" | "b" | "c";

type Row = { path: string; today: string; a: string; b: string; c: string; kit: string; object: string };
const BY_PATH = new Map<string, Row>((data.rows as Row[]).map((row) => [row.path, row]));

function relativeToSrc(absolutePath: string): string {
  const at = absolutePath.lastIndexOf("/src/");
  return at < 0 ? absolutePath : absolutePath.slice(at + "/src/".length);
}

/** The tag that carries the axis the tree does NOT use: objects for A/B, kits for C. */
function retag(tags: string[] | undefined, row: Row | undefined, org: Org): string[] {
  // WHY drop `area:*`: measured 2026-09-22, it restates the title's first
  // segment, so under any new tree it would either lie or repeat the root.
  const kept = (tags ?? []).filter((tag) => !tag.startsWith("area:"));
  if (!row) return [...kept, "org:unsorted"];
  return [...kept, org === "c" ? `kit:${row.kit}` : `object:${row.object}`];
}

function remapIndexer(indexer: Indexer, org: Org): Indexer {
  return {
    ...indexer,
    createIndex: async (fileName, options) => {
      const row = BY_PATH.get(relativeToSrc(fileName));
      const inputs = await indexer.createIndex(fileName, options);
      // WHY drop `__id`: the stock CSF indexer pre-computes it from the ORIGINAL
      // title, and the preview recomputes story ids from the index's title — a
      // stale `__id` makes every story "not found". Without it, the generator
      // derives the id from the new title, as it would for a real rename.
      return inputs.map(({ __id: _staleId, ...input }) => ({
        ...input,
        // A file added after the table was cut still shows up, under its old title.
        title: row ? row[org] : `Unsorted/${input.title ?? options.makeTitle()}`,
        tags: retag(input.tags, row, org),
      }));
    },
  };
}

export function withOrg(base: StorybookConfig, org: Org): StorybookConfig {
  return {
    ...base,
    stories: ["../../src/**/*.stories.@(ts|tsx)"],
    experimental_indexers: async (existing) => (existing ?? []).map((indexer) => remapIndexer(indexer, org)),
  };
}
