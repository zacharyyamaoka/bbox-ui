// src/channelBadge.test.ts — the Storybook manager's channel badge
// (`.storybook/manager-head.html`), driven through fabricated health
// documents.
//
// WHY this test exists (judge finding, 2026-09-22 — HIGH): that badge is the
// answer to "am I looking at the latest code?", and it was wrong in three
// configurations that no story and no browser test can reach, because each
// one needs a health document that is not the one this machine would serve:
//
//   1. STATIC   — a `storybook build` served by anything that is not
//                 bboxui_server.py. There is no /api/health, and the badge
//                 used to declare it "Preview · live, following disk"
//                 because its port was not 5430.
//   2. PORT     — a Stable server on a configured BBOXUI_SB_STABLE_PORT. The
//                 hardcoded 5430 comparison made the real Stable read as
//                 Preview, so setting the documented env var broke the badge
//                 rather than moving it.
//   3. WORKTREES— Stable from checkout A, Preview from checkout B. Preview
//                 never queried its OWN health; it rendered A's `live` block
//                 and printed "Stable matches Preview" — two worktrees
//                 agreeing with each other about neither.
//
// WHY it evaluates the shipped file rather than a copy of its logic: the file
// IS the artifact. A test against a re-typed copy would keep passing while
// the injected script drifted, which is the same class of false green as the
// `storyRenders.reportedException` probe CLAUDE.md warns about.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const BADGE_HTML = fileURLToPath(new URL("../.storybook/manager-head.html", import.meta.url));

// --- the smallest DOM the badge actually touches -------------------------

interface FakeNode {
  tagName: string;
  children: FakeNode[];
  textContent: string;
  title: string;
  type: string;
  disabled: boolean;
  id: string;
  style: Record<string, string>;
  innerHTML: string;
  appendChild(child: FakeNode): FakeNode;
  addEventListener(name: string, handler: () => void): void;
  listeners: Record<string, (() => void)[]>;
}

function createNode(tagName: string): FakeNode {
  const node: FakeNode = {
    tagName,
    children: [],
    textContent: "",
    title: "",
    type: "",
    disabled: false,
    id: "",
    style: {},
    listeners: {},
    get innerHTML() {
      return "";
    },
    set innerHTML(value: string) {
      if (value === "") node.children.length = 0;
    },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    addEventListener(name, handler) {
      (node.listeners[name] ??= []).push(handler);
    },
  };
  return node;
}

/** Everything a viewer would read out of the badge, in order. */
function textOf(node: FakeNode): string {
  return (node.textContent + node.children.map(textOf).join("")).trim();
}

function buttonLabels(node: FakeNode): string[] {
  const here = node.tagName === "button" ? [node.textContent] : [];
  return here.concat(...node.children.map(buttonLabels));
}

// --- the badge, loaded from the shipped HTML -----------------------------

type Badge = {
  identityOf(payload: unknown): { kind: string; reason?: string; payload?: Record<string, unknown> };
  freshnessText(freshness: unknown): { text: string; warn: boolean };
  compareCheckouts(own: string | null, stable: unknown): { kind: string; stableCheckoutId?: string };
  previewLine(payload: Record<string, unknown>): string;
  unsupportedLine(reason: string): string;
  stableOriginOf(payload: unknown): string;
  refresh(badge: FakeNode): Promise<void>;
};

function loadBadge(routes: Record<string, unknown | "refuse">): { badge: Badge; requested: string[] } {
  const source = readFileSync(BADGE_HTML, "utf8");
  const script = /<script>([\s\S]*)<\/script>/.exec(source);
  if (!script) throw new Error("manager-head.html no longer contains a <script> block");

  const requested: string[] = [];
  const fetchStub = async (url: string) => {
    requested.push(url);
    const answer = routes[url];
    if (answer === undefined) throw new TypeError(`connection refused: ${url}`);
    if (answer === "refuse") return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer };
  };

  const sandbox: Record<string, unknown> = {
    fetch: fetchStub,
    setInterval: () => 0,
    // A `document` that can CREATE elements but has no `body`. The script's
    // own bottom branch then registers a DOMContentLoaded listener that never
    // fires, so nothing auto-mounts and no fetch happens until this test
    // calls `refresh` with a node it owns — while every render function still
    // gets the `createElement` it needs. Thirty lines of fake node instead of
    // jsdom, because the node `unit` project has no DOM and this is all of it
    // the badge touches.
    document: {
      createElement: (tagName: string) => createNode(tagName),
      addEventListener: () => {},
    },
  };
  const context = createContext(sandbox);
  runInContext(script[1], context);
  const badge = (context as Record<string, unknown>).__BBOXUI_STORYBOOK_BADGE__ as Badge | undefined;
  if (!badge) throw new Error("the badge no longer exposes its testing seam");
  return { badge, requested };
}

const STABLE_5430 = "http://127.0.0.1:5430";
const STABLE_6500 = "http://127.0.0.1:6500";

function previewHealth(over: Record<string, unknown> = {}) {
  return {
    product: "bbox-ui-storybook",
    displayName: "bbox-ui Storybook",
    channel: "preview",
    commit: "aaaaaaaaaaaabbbb",
    branch: "lane-x",
    dirty: false,
    checkoutId: "111111111111",
    stableOrigin: STABLE_5430,
    ...over,
  };
}

function stableHealth(over: Record<string, unknown> = {}) {
  return {
    product: "bbox-ui-storybook",
    displayName: "bbox-ui Storybook",
    channel: "stable",
    build: "0bc4dbea4ddc9a11",
    commit: "aaaaaaaaaaaabbbb",
    branch: "lane-x",
    dirty: false,
    checkoutId: "111111111111",
    builtAt: "2026-09-22T12:00:00Z",
    freshness: { state: "match", behind: null, stableAhead: null, detail: "identical" },
    ...over,
  };
}

describe("the badge's channel identity comes from its own /api/health", () => {
  it("case 1 — a STATIC build with no health route claims nothing", async () => {
    // MUTATION: restore `var isStable = location.port === "5430"` identity and
    // this reads "Preview · live, following disk" — the badge asserting a
    // live dev server for a frozen static export.
    const { badge, requested } = loadBadge({});
    const node = createNode("div");
    await badge.refresh(node);
    expect(textOf(node)).toBe("bbox-ui Storybook · static build · unknown checkout (no /api/health on this origin)");
    expect(textOf(node)).not.toContain("Preview");
    expect(textOf(node)).not.toContain("Stable ·");
    // And it offers no button, because there is no Stable API to talk to.
    expect(buttonLabels(node)).toEqual([]);
    expect(requested).toEqual(["/api/health"]);
  });

  it("case 1b — a server that answers a DIFFERENT product claims nothing", async () => {
    const { badge } = loadBadge({ "/api/health": { product: "some-other-app", channel: "preview" } });
    const node = createNode("div");
    await badge.refresh(node);
    expect(textOf(node)).toContain("static build · unknown checkout (another product (some-other-app))");
  });

  it("case 2 — Stable on a CUSTOM port is Stable, and Preview follows its published origin", async () => {
    // MUTATION: reinstate the hardcoded 5430 and the first half reads
    // "Preview" (port 6500 !== 5430) while the second half polls a port
    // nothing is listening on.
    const onCustomStable = loadBadge({ "/api/health": stableHealth() });
    const stableNode = createNode("div");
    await onCustomStable.badge.refresh(stableNode);
    expect(textOf(stableNode)).toContain("bbox-ui Storybook · Stable · aaaaaaa");
    expect(textOf(stableNode)).toContain("up to date");
    // Its own origin, never a hardcoded one.
    expect(onCustomStable.requested).toEqual(["/api/health"]);

    const onPreview = loadBadge({
      "/api/health": previewHealth({ stableOrigin: STABLE_6500 }),
      [`${STABLE_6500}/api/health`]: stableHealth(),
    });
    const previewNode = createNode("div");
    await onPreview.badge.refresh(previewNode);
    expect(onPreview.requested).toEqual(["/api/health", `${STABLE_6500}/api/health`]);
    expect(textOf(previewNode)).toContain("Stable matches Preview");
  });

  it("case 3 — TWO WORKTREES are never reported as matching", async () => {
    // MUTATION: drop `compareCheckouts` from `renderPreview` (the pre-fix
    // code had no such comparison) and this prints "Stable matches Preview"
    // for two entirely different trees, on the strength of Stable's own
    // `liveMatchesStable` — which describes Stable's checkout, not this page.
    const { badge } = loadBadge({
      "/api/health": previewHealth({ checkoutId: "111111111111", branch: "lane-b" }),
      [`${STABLE_5430}/api/health`]: stableHealth({
        checkoutId: "222222222222",
        branch: "lane-a",
        freshness: { state: "match", behind: null, stableAhead: null, detail: "identical" },
      }),
    });
    const node = createNode("div");
    await badge.refresh(node);
    expect(textOf(node)).toContain("Stable is a DIFFERENT checkout (222222222222) — not comparable");
    expect(textOf(node)).not.toContain("Stable matches Preview");
    // The Preview half describes THIS page's checkout, not Stable's.
    expect(textOf(node)).toContain("lane-b");
    expect(textOf(node)).not.toContain("lane-a");
  });

  it("Preview describes its own commit even while Stable is unreachable", async () => {
    const { badge } = loadBadge({ "/api/health": previewHealth({ dirty: true }) });
    const node = createNode("div");
    await badge.refresh(node);
    expect(textOf(node)).toContain("Preview · lane-x · aaaaaaa +uncommitted · live, following disk");
    expect(textOf(node)).toContain("Stable not running");
  });
});

describe("freshnessText", () => {
  let badge: Badge;
  beforeEach(() => {
    badge = loadBadge({}).badge;
  });

  it("only says up to date for a proven match", () => {
    expect(badge.freshnessText({ state: "match" })).toEqual({ text: "up to date", warn: false });
  });

  it("phrases a countdown ONLY for a true ancestor relationship", () => {
    expect(badge.freshnessText({ state: "behind", behind: 3 }).text).toBe("3 commits behind your checkout");
    expect(badge.freshnessText({ state: "behind", behind: 1 }).text).toBe("1 commit behind your checkout");
  });

  it("never phrases DIVERGENCE as a countdown", () => {
    // The judge's HIGH finding, at the display layer: this input used to
    // arrive as `commitsAheadOfStable: 5` and render "5 commits behind your
    // checkout" for a Stable holding commits this checkout has never seen.
    const text = badge.freshnessText({ state: "diverged", behind: 5, stableAhead: 2 }).text;
    expect(text).toBe("diverged from your checkout — not behind, different");
    expect(text).not.toMatch(/behind your checkout/);
  });

  it("says so when Stable is NEWER than the checkout", () => {
    expect(badge.freshnessText({ state: "stable-ahead", stableAhead: 4 }).text).toBe(
      "Stable is NEWER than your checkout by 4",
    );
  });

  it("warns on every state that is not a proven match", () => {
    for (const state of ["behind", "stable-ahead", "diverged", "different", "unknown", undefined]) {
      expect(badge.freshnessText({ state })).toMatchObject({ warn: true });
    }
    expect(badge.freshnessText(null).warn).toBe(true);
    expect(badge.freshnessText(undefined).warn).toBe(true);
  });
});

describe("compareCheckouts", () => {
  let badge: Badge;
  beforeEach(() => {
    badge = loadBadge({}).badge;
  });

  it("is 'same' only when both ids are present and equal", () => {
    const stable = { kind: "stable", payload: { checkoutId: "abc123abc123" } };
    expect(badge.compareCheckouts("abc123abc123", stable).kind).toBe("same");
    expect(badge.compareCheckouts("different000", stable).kind).toBe("different");
    expect(badge.compareCheckouts(null, stable).kind).toBe("unknown");
    expect(badge.compareCheckouts("abc123abc123", { kind: "stable", payload: {} }).kind).toBe("unknown");
    expect(badge.compareCheckouts("abc123abc123", { kind: "unsupported" }).kind).toBe("unreachable");
  });
});

describe("identityOf", () => {
  let badge: Badge;
  beforeEach(() => {
    badge = loadBadge({}).badge;
  });

  it("accepts only this product and only a channel it understands", () => {
    expect(badge.identityOf({ product: "bbox-ui-storybook", channel: "stable" }).kind).toBe("stable");
    expect(badge.identityOf({ product: "bbox-ui-storybook", channel: "preview" }).kind).toBe("preview");
    expect(badge.identityOf({ product: "bbox-ui-storybook", channel: "canary" }).kind).toBe("unsupported");
    expect(badge.identityOf({ product: "bbox-ui", channel: "stable" }).kind).toBe("unsupported");
    expect(badge.identityOf(null).kind).toBe("unsupported");
    expect(badge.identityOf("a string").kind).toBe("unsupported");
  });
});

describe("stableOriginOf", () => {
  it("prefers the origin the dev server published, and falls back to the documented default", () => {
    const { badge } = loadBadge({});
    expect(badge.stableOriginOf({ stableOrigin: STABLE_6500 })).toBe(STABLE_6500);
    // A `storybook dev` older than this change publishes nothing; 5430 is
    // bbox_release.py's STORYBOOK default and only ever a fallback.
    expect(badge.stableOriginOf({})).toBe(STABLE_5430);
  });
});
