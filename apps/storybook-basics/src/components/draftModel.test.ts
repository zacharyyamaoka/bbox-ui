// src/components/draftModel.test.ts — acceptance for the draft bookkeeping.
//
// PORTED from /home/bam/systemsketch/src/drafts/draftModel.test.ts:1-308,
// case for case. That suite is an INDEPENDENT ORACLE in the sense
// `vitest.config.ts` means it: it was written against the donor, by the
// donor, before this repo existed, so it cannot have been shaped to whatever
// this port happens to do. The only edits are the import path, the
// house formatting of this directory, and `memoryStorage()` being passed
// explicitly everywhere the donor could fall back to `window.localStorage`.
//
// The two `describe` blocks at the bottom (`activeDraftOf`, `draftSummaries`)
// are NEW — those two functions are this port's own addition (the projection
// into `branchChip.tsx`'s `DraftSummary`), so nothing upstream covers them.
import { describe, expect, it } from "vitest";

import {
  MAIN_SNAPSHOT_SLOT,
  activateDraft,
  activeDraftOf,
  createDraft,
  currentVersionLabel,
  deleteDraftSnapshot,
  discardDraft,
  draftBaseSlot,
  draftSnapshotKey,
  draftStateKey,
  draftSummaries,
  mergeDraft,
  nextDraftName,
  parseDraftState,
  pinVersion,
  readDraftSnapshot,
  rebaseDraft,
  renameDraft,
  saveDraftState,
  snapshotDigest,
  writeDraftSnapshot,
  type DocumentDraftState,
  type DraftStorage,
} from "./draftModel";

const DOC = "/boards/plan.systemsketch";

/** The `Map`-backed stub `DraftStorage` exists for. */
function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const EMPTY: DocumentDraftState = {
  version: 1,
  activeDraftId: null,
  drafts: [],
  versions: [],
};

describe("key builders", () => {
  it("scopes state and snapshot keys by document path", () => {
    expect(draftStateKey(DOC)).toBe(`systemsketch.drafts.v1:${DOC}`);
    expect(draftSnapshotKey(DOC, MAIN_SNAPSHOT_SLOT)).toBe(
      `systemsketch.draftSnapshot.v1:${DOC}:current`,
    );
    expect(draftSnapshotKey(DOC, "abc")).toBe(`systemsketch.draftSnapshot.v1:${DOC}:abc`);
  });

  it("names a draft base slot from its draft id", () => {
    expect(draftBaseSlot("abc")).toBe("abc:base");
  });

  it("keeps two documents' state apart", () => {
    expect(draftStateKey("/a.systemsketch")).not.toBe(draftStateKey("/b.systemsketch"));
  });
});

describe("parseDraftState", () => {
  it("returns empty state when nothing is stored", () => {
    expect(parseDraftState(DOC, memoryStorage())).toEqual(EMPTY);
  });

  it("round-trips through saveDraftState", () => {
    const storage = memoryStorage();
    const { state } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    saveDraftState(DOC, state, storage);
    const loaded = parseDraftState(DOC, storage);
    expect(loaded.drafts).toHaveLength(1);
    expect(loaded.drafts[0].name).toBe("Draft 1");
    expect(loaded.activeDraftId).toBe(state.activeDraftId);
  });

  it("resets to empty on corrupt JSON rather than throwing", () => {
    const storage = memoryStorage();
    storage.setItem(draftStateKey(DOC), "{not json");
    expect(parseDraftState(DOC, storage)).toEqual(EMPTY);
  });

  it("resets to empty on an unrecognised version", () => {
    const storage = memoryStorage();
    storage.setItem(
      draftStateKey(DOC),
      JSON.stringify({ version: 2, drafts: [], versions: [] }),
    );
    expect(parseDraftState(DOC, storage)).toEqual(EMPTY);
  });

  it("resets to empty when storage throws", () => {
    const throwing: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(parseDraftState(DOC, throwing)).toEqual(EMPTY);
  });

  it("drops a malformed draft record but keeps its well-formed siblings", () => {
    const storage = memoryStorage();
    storage.setItem(
      draftStateKey(DOC),
      JSON.stringify({
        version: 1,
        activeDraftId: null,
        drafts: [
          { id: "missing-fields" },
          { id: "ok", name: "Draft 1", baseLabel: "v0.1", baseDigest: null, createdAt: 1, updatedAt: 1 },
        ],
        versions: [],
      }),
    );
    const state = parseDraftState(DOC, storage);
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0].id).toBe("ok");
  });

  it("drops a malformed version record but keeps its well-formed siblings", () => {
    const storage = memoryStorage();
    storage.setItem(
      draftStateKey(DOC),
      JSON.stringify({
        version: 1,
        activeDraftId: null,
        drafts: [],
        versions: [{ id: "missing-fields" }, { id: "v1", label: "v0.1", name: "First cut", createdAt: 1 }],
      }),
    );
    const state = parseDraftState(DOC, storage);
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0].id).toBe("v1");
  });
});

describe("saveDraftState", () => {
  it("swallows a storage that refuses to write, rather than throwing at the canvas", () => {
    const throwing: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(() => saveDraftState(DOC, EMPTY, throwing)).not.toThrow();
  });
});

describe("nextDraftName", () => {
  it("starts at Draft 1", () => {
    expect(nextDraftName(EMPTY)).toBe("Draft 1");
  });

  it("skips names already in use", () => {
    const { state } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(nextDraftName(state)).toBe("Draft 2");
  });

  it("reuses a gap left by a discarded draft", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    const afterDiscard = discardDraft(r2.state, r1.draft.id);
    expect(nextDraftName(afterDiscard)).toBe("Draft 1");
  });
});

describe("currentVersionLabel", () => {
  it("starts at v0.1", () => {
    expect(currentVersionLabel(EMPTY)).toBe("v0.1");
  });

  it("increments within the 0.x row", () => {
    const { state } = pinVersion(EMPTY, "First");
    expect(currentVersionLabel(state)).toBe("v0.2");
  });

  it("rolls v0.9 over to v1.0, not v0.10", () => {
    let state: DocumentDraftState = EMPTY;
    for (let i = 0; i < 8; i++) {
      state = pinVersion(state, `Pin ${i}`).state;
    }
    expect(currentVersionLabel(state)).toBe("v0.9");
    state = pinVersion(state, "Pin 8").state;
    expect(currentVersionLabel(state)).toBe("v1.0");
  });
});

describe("createDraft", () => {
  it("adds the draft and makes it active", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", "digest-1");
    expect(state.drafts).toEqual([draft]);
    expect(state.activeDraftId).toBe(draft.id);
    expect(draft.baseLabel).toBe("v0.1");
    expect(draft.baseDigest).toBe("digest-1");
    expect(draft.createdAt).toBe(draft.updatedAt);
  });

  it("gives two drafts distinct ids", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    expect(r2.draft.id).not.toBe(r1.draft.id);
  });
});

describe("activateDraft", () => {
  it("switches the active draft id, including back to null", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const exited = activateDraft(state, null);
    expect(exited.activeDraftId).toBeNull();
    const resumed = activateDraft(exited, draft.id);
    expect(resumed.activeDraftId).toBe(draft.id);
  });
});

describe("renameDraft", () => {
  it("renames only the targeted draft", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    const renamed = renameDraft(r2.state, r1.draft.id, "Feature X");
    expect(renamed.drafts.find((d) => d.id === r1.draft.id)?.name).toBe("Feature X");
    expect(renamed.drafts.find((d) => d.id === r2.draft.id)?.name).toBe("Draft 2");
  });

  it("bumps updatedAt without touching createdAt", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const renamed = renameDraft(state, draft.id, "Renamed");
    const stored = renamed.drafts[0];
    expect(stored.createdAt).toBe(draft.createdAt);
    expect(stored.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
  });

  it("renders a name with punctuation and spacing exactly as authored", () => {
    // Truthful property rendering: the model never normalises, trims or
    // substitutes an authored name.
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const odd = "  pose → grasp (v2)  ";
    expect(renameDraft(state, draft.id, odd).drafts[0].name).toBe(odd);
  });
});

describe("rebaseDraft", () => {
  it("moves the targeted draft's base label and digest, bumping updatedAt", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", "digest-base");
    const rebased = rebaseDraft(state, draft.id, "v0.3", "digest-fresh-main");
    const stored = rebased.drafts.find((d) => d.id === draft.id);
    expect(stored?.baseLabel).toBe("v0.3");
    expect(stored?.baseDigest).toBe("digest-fresh-main");
    expect(stored?.createdAt).toBe(draft.createdAt);
    expect(stored?.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
  });

  it("leaves a different draft untouched", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    const rebased = rebaseDraft(r2.state, r1.draft.id, "v0.3", "digest");
    expect(rebased.drafts.find((d) => d.id === r2.draft.id)).toEqual(r2.draft);
  });

  it("accepts a null digest, same as a fresh Main with no file yet", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", "digest-base");
    const rebased = rebaseDraft(state, draft.id, "v0.2", null);
    expect(rebased.drafts.find((d) => d.id === draft.id)?.baseDigest).toBeNull();
  });

  it("is a no-op for an id that is not an existing draft", () => {
    expect(rebaseDraft(EMPTY, "nonexistent", "v0.2", "digest")).toEqual(EMPTY);
  });
});

describe("discardDraft", () => {
  it("removes the draft", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(discardDraft(state, draft.id).drafts).toHaveLength(0);
  });

  it("clears activeDraftId when the active draft is discarded", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(discardDraft(state, draft.id).activeDraftId).toBeNull();
  });

  it("leaves a different active draft untouched", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    const switched = activateDraft(r2.state, r1.draft.id);
    const afterDiscard = discardDraft(switched, r2.draft.id);
    expect(afterDiscard.activeDraftId).toBe(r1.draft.id);
  });
});

describe("pinVersion", () => {
  it("appends a version at the current label", () => {
    const { state, version } = pinVersion(EMPTY, "Milestone");
    expect(state.versions).toEqual([version]);
    expect(version.label).toBe("v0.1");
    expect(version.name).toBe("Milestone");
  });
});

describe("mergeDraft", () => {
  it("removes the draft, clears activeDraftId, and pins a Merged version", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const merged = mergeDraft(state, draft.id);
    expect(merged.drafts).toHaveLength(0);
    expect(merged.activeDraftId).toBeNull();
    expect(merged.versions).toHaveLength(1);
    expect(merged.versions[0].name).toBe("Merged Draft 1");
    expect(merged.versions[0].label).toBe("v0.1");
  });

  it("is a no-op for an id that is not an existing draft", () => {
    expect(mergeDraft(EMPTY, "nonexistent")).toBe(EMPTY);
  });
});

describe("snapshotDigest", () => {
  it("is null for null input", () => {
    expect(snapshotDigest(null)).toBeNull();
  });

  it("is stable for the same payload", () => {
    expect(snapshotDigest('{"a":1}')).toBe(snapshotDigest('{"a":1}'));
  });

  it("differs once two snapshots diverge past a shared prefix", () => {
    expect(snapshotDigest("hello world")).not.toBe(snapshotDigest("hello there"));
  });

  it("differs for two same-length payloads (length alone is not the digest)", () => {
    expect(snapshotDigest("abcd")).not.toBe(snapshotDigest("abce"));
  });
});

describe("snapshot slot storage", () => {
  it("writes, reads, and deletes a slot", () => {
    const storage = memoryStorage();
    writeDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, '{"test":1}', storage);
    expect(readDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, storage)).toBe('{"test":1}');
    deleteDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, storage);
    expect(readDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, storage)).toBeNull();
  });

  it("returns null for a slot that was never written", () => {
    expect(readDraftSnapshot(DOC, "never-written", memoryStorage())).toBeNull();
  });

  it("keeps a draft head separate from its base slot", () => {
    const storage = memoryStorage();
    writeDraftSnapshot(DOC, "draft-1", '{"head":true}', storage);
    writeDraftSnapshot(DOC, draftBaseSlot("draft-1"), '{"base":true}', storage);
    expect(readDraftSnapshot(DOC, "draft-1", storage)).toBe('{"head":true}');
    expect(readDraftSnapshot(DOC, draftBaseSlot("draft-1"), storage)).toBe('{"base":true}');
  });

  it("returns null rather than throwing when storage is blocked", () => {
    const throwing: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeDraftSnapshot(DOC, "s", "x", throwing)).not.toThrow();
    expect(readDraftSnapshot(DOC, "s", throwing)).toBeNull();
    expect(() => deleteDraftSnapshot(DOC, "s", throwing)).not.toThrow();
  });
});

describe("activeDraftOf", () => {
  it("is null on Main", () => {
    expect(activeDraftOf(EMPTY)).toBeNull();
  });

  it("is the record activeDraftId points at", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(activeDraftOf(state)?.id).toBe(draft.id);
  });

  it("is null when activeDraftId points at a draft that no longer exists", () => {
    const { state, draft } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const orphaned: DocumentDraftState = { ...state, drafts: [] };
    expect(activeDraftOf(orphaned)).toBeNull();
    expect(orphaned.activeDraftId).toBe(draft.id);
  });
});

describe("draftSummaries", () => {
  it("is empty on a document with no drafts", () => {
    expect(draftSummaries(EMPTY)).toEqual([]);
  });

  it("says 'based on <label>' only when that version is genuinely on record", () => {
    const pinned = pinVersion(EMPTY, "First cut");
    expect(pinned.version.label).toBe("v0.1");
    const { state } = createDraft(pinned.state, "Draft 1", "v0.1", null);
    expect(draftSummaries(state)[0].secondaryLabel).toBe("based on v0.1");
  });

  it("refuses to fabricate a version nobody ever pinned", () => {
    // The donor's own bug, named in branchChip.tsx's DraftSummary comment:
    // every draft read "based on v0.1" whether or not that meant anything.
    const { state } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(state.versions).toHaveLength(0);
    expect(draftSummaries(state)[0].secondaryLabel).toBe("Forked from Main");
  });

  it("takes a host-supplied wording for the unpinned case", () => {
    const { state } = createDraft(EMPTY, "Draft 1", "v0.1", null);
    expect(draftSummaries(state, { forkedLabel: "off Main" })[0].secondaryLabel).toBe("off Main");
  });

  it("carries each draft's id and name through unaltered", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "pose → grasp", "v0.1", null);
    expect(draftSummaries(r2.state).map((s) => s.name)).toEqual(["Draft 1", "pose → grasp"]);
    expect(draftSummaries(r2.state).map((s) => s.id)).toEqual([r1.draft.id, r2.draft.id]);
  });

  it("keeps the drafts in creation order, the order the popover lists them", () => {
    const r1 = createDraft(EMPTY, "Draft 1", "v0.1", null);
    const r2 = createDraft(r1.state, "Draft 2", "v0.1", null);
    const r3 = createDraft(r2.state, "Draft 3", "v0.1", null);
    expect(draftSummaries(r3.state).map((s) => s.name)).toEqual(["Draft 1", "Draft 2", "Draft 3"]);
  });
});
