/**
 * src/editor/breadcrumbCompact.test.ts — ported from
 * /home/bam/systemsketch/src/depth/depthBreadcrumbs.test.ts:1-51 verbatim for
 * `compactDepthBreadcrumbs`, plus coverage for `segmentBreadcrumbs` (the
 * generalized `TitleBar.tsx:147-160` helper) that donor file never isolated
 * in a unit test of its own.
 */
import { describe, expect, it } from "vitest"

import { compactDepthBreadcrumbs, segmentBreadcrumbs, type DepthBreadcrumbItem } from "./breadcrumbCompact"

function entry(depth: number, name = `Level ${depth}`): DepthBreadcrumbItem {
  return { id: `shape:${depth}`, name, isCurrent: false }
}

describe("compactDepthBreadcrumbs", () => {
  it("shows every structural level when the path fits the inline budget", () => {
    const entries = [entry(1, "System"), entry(2, "Scheduler"), { ...entry(3, "Dispatch"), isCurrent: true }]

    expect(compactDepthBreadcrumbs("Board", entries)).toEqual(entries)
  })

  it("keeps root context, immediate parent, and current scope while eliding level 1 onward first", () => {
    const entries = [
      entry(1, "System"),
      entry(2, "A".repeat(75)),
      entry(3, "B".repeat(75)),
      entry(4, "C".repeat(75)),
      { ...entry(5, "Current dispatch"), isCurrent: true },
    ]

    expect(compactDepthBreadcrumbs("Board", entries)).toEqual([
      { kind: "elision", hiddenCount: 3 },
      entries[3],
      entries[4],
    ])
  })

  it("removes the earliest descendant before a nearer parent", () => {
    const entries = [
      entry(1, "System"),
      entry(2, "Execution workspace"),
      { ...entry(3, "Dispatch"), isCurrent: true },
    ]

    expect(compactDepthBreadcrumbs("Board", entries, 35)).toEqual([
      { kind: "elision", hiddenCount: 1 },
      entries[1],
      entries[2],
    ])
  })

  it("does not compact a short path just because it has multiple depths", () => {
    const entries = [entry(1, "A"), entry(2, "B"), { ...entry(3, "C"), isCurrent: true }]

    expect(compactDepthBreadcrumbs("Board", entries, 150)).toEqual(entries)
  })
})

describe("segmentBreadcrumbs", () => {
  it("recovers the exact hidden run behind each elision, in source order", () => {
    const entries = [
      entry(1, "System"),
      entry(2, "A".repeat(75)),
      entry(3, "B".repeat(75)),
      entry(4, "C".repeat(75)),
      { ...entry(5, "Current dispatch"), isCurrent: true },
    ]

    const segments = segmentBreadcrumbs("Board", entries)

    expect(segments.map((segment) => segment.kind)).toEqual(["elision", "entry", "entry"])
    expect(segments[0]).toEqual({ kind: "elision", hidden: [entries[0], entries[1], entries[2]] })
    expect(segments[1]).toEqual({ kind: "entry", entry: entries[3] })
    expect(segments[2]).toEqual({ kind: "entry", entry: entries[4] })
  })

  it("emits one entry segment per level when nothing needed eliding", () => {
    const entries = [entry(1, "A"), entry(2, "B"), { ...entry(3, "C"), isCurrent: true }]

    expect(segmentBreadcrumbs("Board", entries)).toEqual(
      entries.map((item) => ({ kind: "entry", entry: item })),
    )
  })
})
