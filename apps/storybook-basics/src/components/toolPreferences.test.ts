/**
 * src/components/toolPreferences.test.ts — the generic registry algebra is
 * new surface area created by generalizing
 * /home/bam/systemsketch/src/toolbar/toolbarModel.ts, so it gets its own
 * fixture (a two-field "fruit/size" registry) proving field-independent
 * fallback and identity-preserving merge on a shape the donor never had. The
 * arrow-preset cases below are ported from
 * /home/bam/systemsketch/src/toolbar/toolbarModel.test.ts:17-56 verbatim
 * (the "elbow is the datum" describe block and the cycle/press-order tests) —
 * those assertions ARE the acceptance criteria for the worked example.
 */
import { describe, expect, it } from "vitest"

import {
  DEFAULT_TOOLBAR_PREFERENCES,
  arrowPresetForActivation,
  arrowPresetPressCount,
  arrowPresetsInPressOrder,
  mergePreferences,
  nextArrowPreset,
  parsePreferences,
  parseToolbarPreferences,
  type ArrowPreset,
  type PreferenceRegistry,
} from "./toolPreferences"

interface FixturePreferences {
  fruit: "apple" | "banana"
  size: "sm" | "md" | "lg"
}

const FIXTURE_REGISTRY: PreferenceRegistry<FixturePreferences> = {
  fruit: { values: ["apple", "banana"], default: "apple" },
  size: { values: ["sm", "md", "lg"], default: "md" },
}

describe("parsePreferences", () => {
  it("keeps every valid field and resets invalid fields independently", () => {
    expect(parsePreferences(FIXTURE_REGISTRY, { fruit: "banana", size: "xl" })).toEqual({
      fruit: "banana",
      size: "md",
    })
    expect(parsePreferences(FIXTURE_REGISTRY, { fruit: "not-a-fruit", size: "lg" })).toEqual({
      fruit: "apple",
      size: "lg",
    })
  })

  it("falls back to every field's default for corrupt or missing storage", () => {
    expect(parsePreferences(FIXTURE_REGISTRY, null)).toEqual({ fruit: "apple", size: "md" })
    expect(parsePreferences(FIXTURE_REGISTRY, "not an object")).toEqual({ fruit: "apple", size: "md" })
    expect(parsePreferences(FIXTURE_REGISTRY, {})).toEqual({ fruit: "apple", size: "md" })
  })
})

describe("mergePreferences", () => {
  it("returns the SAME reference when the update changes nothing", () => {
    const current = { fruit: "banana", size: "lg" } as FixturePreferences
    expect(mergePreferences(current, { fruit: "banana" })).toBe(current)
    expect(mergePreferences(current, {})).toBe(current)
  })

  it("returns a new object only when a field actually changes", () => {
    const current = { fruit: "banana", size: "lg" } as FixturePreferences
    const next = mergePreferences(current, { size: "sm" })
    expect(next).not.toBe(current)
    expect(next).toEqual({ fruit: "banana", size: "sm" })
  })
})

describe("toolbar arrow recall", () => {
  it("cycles straight, curve, elbow, then back to straight", () => {
    expect(nextArrowPreset("straight")).toBe("curve")
    expect(nextArrowPreset("curve")).toBe("elbow")
    expect(nextArrowPreset("elbow")).toBe("straight")
  })

  it("recalls the last preset when entering Arrow and cycles only while Arrow is active", () => {
    expect(arrowPresetForActivation("select", "curve")).toBe("curve")
    expect(arrowPresetForActivation("geo", "elbow")).toBe("elbow")
    expect(arrowPresetForActivation("arrow", "curve")).toBe("elbow")
  })
})

describe("elbow is the datum", () => {
  it("starts a fresh app on the elbow arrow", () => {
    expect(DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset).toBe("elbow")
  })

  it("lands the first press of A on elbow, then walks straight and curve", () => {
    let preset = arrowPresetForActivation("select", DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset)
    const walked: ArrowPreset[] = [preset]
    for (let press = 2; press <= 4; press += 1) {
      preset = arrowPresetForActivation("arrow", preset)
      walked.push(preset)
    }
    expect(walked).toEqual(["elbow", "straight", "curve", "elbow"])
  })

  it("numbers each preset by the press that reaches it, in that order", () => {
    expect(arrowPresetsInPressOrder()).toEqual(["elbow", "straight", "curve"])
    expect(arrowPresetsInPressOrder().map(arrowPresetPressCount)).toEqual([1, 2, 3])
  })
})

describe("parseToolbarPreferences", () => {
  it("is parsePreferences applied to the toolbar's own registry", () => {
    expect(parseToolbarPreferences({ lastArrowPreset: "curve" })).toEqual({ lastArrowPreset: "curve" })
    expect(parseToolbarPreferences({ lastArrowPreset: "sideways" })).toEqual(DEFAULT_TOOLBAR_PREFERENCES)
    expect(parseToolbarPreferences(null)).toEqual(DEFAULT_TOOLBAR_PREFERENCES)
  })
})
