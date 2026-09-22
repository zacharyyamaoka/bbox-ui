// src/editor/cameraGestures.ts — the persisted wheel preferences, read as
// the numbers a viewport actually needs. Pure: no React, no DOM, no engine,
// not even its types.
//
// Zach, ruling 2: "Please add the option within settings to do the remapping.
// its about giving the user flexibility to do what they want."
//
// The OPTION already existed and persisted before this file — `directWheelZoom`
// in `./appearancePreferences.ts` (key `systemsketch.appearance.v1`), the four
// rebindable wheel gestures and the two speed sliders in `./gestureSettings.ts`
// (key `systemsketch.gestures.v1`), and every one of them rendered by
// `./settingsCategories.tsx`'s "Mouse and scrolling" category. What did not
// exist is any READER: measured 2026-09-21, `apps/systemsketch/src` mentioned
// `readGestureSettings` exactly once (chrome/ShareMenu/appSettings.tsx:37 —
// the dialog reading its own control back) and `setCameraOptions` zero times.
// So the preference was a control that lied: it saved, and nothing moved.
//
// This file is the missing half, and it is deliberately the SMALLER half — a
// translation, not a gesture engine. The host applies the result; see
// `apps/systemsketch/src/chrome/ShareMenu/cameraGestureHost.tsx`.
//
// WHY the two conventions are the unit, rather than nine independent dials:
// Zach named them as the pair to offer — "wheel = zoom (Figma-ish) vs wheel =
// pan, ctrl+wheel = zoom (Excalidraw/tldraw)". They are not two points on one
// axis; they are two different input contracts, each with its own sensitivity
// (which is why `./settingsCategories.tsx` already shows one set of sliders or
// the other, never both). `WheelConvention` is that fact, given a name.

import { type AppearancePreferences } from "./appearancePreferences";
import { type GestureSettings } from "./gestureSettings";

/**
 * The two conventions, by what the UNMODIFIED wheel does.
 *
 * - `"pan"` — wheel pans, Ctrl/Cmd + wheel zooms. Excalidraw, tldraw, Miro.
 * - `"zoom"` — wheel zooms directly. Figma-ish, and every CAD tool.
 *
 * WHY the vocabulary is "what the plain wheel does" rather than a boolean
 * named after one of them: `directWheelZoom: true/false` reads as "the normal
 * one and the weird one", and neither is weird — a host that picked either as
 * its hardcode would be taking a side in a preference war. Naming both makes
 * the setting a choice instead of an override.
 */
export type WheelConvention = "pan" | "zoom";

/** Menu order — the loose/stock convention first, matching the order
 *  `./settingsCategories.tsx` prints its two radio rows in. */
export const WHEEL_CONVENTIONS_IN_ORDER: readonly WheelConvention[] = ["pan", "zoom"];

/** The row labels. Zach's own reference apps, because he specifies by
 *  pointing at one: "wheel = zoom (Figma-ish) vs wheel = pan, ctrl+wheel =
 *  zoom (Excalidraw/tldraw)". */
export const WHEEL_CONVENTION_LABELS: Record<WheelConvention, string> = {
  pan: "Scroll pans, Ctrl/Cmd + scroll zooms",
  zoom: "Scroll zooms directly",
};

/** One line under each label — what the OTHER modifier then does, which is
 *  the part a one-word label hides. */
export const WHEEL_CONVENTION_DESCRIPTIONS: Record<WheelConvention, string> = {
  pan: "The stock whiteboard contract — Excalidraw, tldraw, Miro.",
  zoom: "Figma-ish, and every CAD tool. Ctrl/Cmd + scroll then pans.",
};

/**
 * Which convention a stored `AppearancePreferences` means.
 *
 * WHY this reads the existing `directWheelZoom` boolean instead of minting a
 * `wheelConvention` field: `systemsketch.appearance.v1` is a key real browsers
 * already hold (see `./appearancePreferences.ts`'s header — the key travels
 * "character for character" so a choice already made survives the move). A new
 * field would silently reset everyone who had already chosen. The convention
 * is a READING of the stored record, never a second copy of it.
 */
export function wheelConventionOf(appearance: Pick<AppearancePreferences, "directWheelZoom">): WheelConvention {
  return appearance.directWheelZoom ? "zoom" : "pan";
}

/** The patch that selects `convention` — the inverse of `wheelConventionOf`,
 *  so a settings row can be written in convention vocabulary end to end. */
export function appearanceForWheelConvention(convention: WheelConvention): Pick<AppearancePreferences, "directWheelZoom"> {
  return { directWheelZoom: convention === "zoom" };
}

/**
 * What a viewport needs in order to obey the preferences — engine-neutral on
 * purpose.
 *
 * Speeds are MULTIPLIERS of the host's stock speed (1 = stock), not
 * percentages: percent is the product's language (it makes 100 the obvious
 * reset point, `./gestureSettings.ts`) and a multiplier is the viewport's.
 * Converting here is what keeps the division out of the host.
 */
export interface CameraGesturePlan {
  /** What the unmodified wheel does. The host is expected to make this
   *  AUTHORITATIVE — see the host file for why that takes two calls, not one. */
  wheelBehavior: WheelConvention;
  /** Only meaningful under `"zoom"`: flip which wheel direction moves closer. */
  invertZoomDirection: boolean;
  /** Stock pan speed × this. */
  panSpeed: number;
  /** Stock zoom speed × this. */
  zoomSpeed: number;
}

/**
 * The two persisted records → one plan. Total: every input is already clamped
 * by its own parser, so there is no failure mode here and no clamping repeated.
 *
 * WHY `zoomSpeed` comes from a DIFFERENT slider per convention: the settings
 * page shows `Sensitivity → Zoom speed` (gestures) under the pan convention and
 * `Direct wheel zoom → Wheel zoom sensitivity` (appearance) under the zoom
 * convention — it has done that since the port, and the gate is load-bearing
 * rather than tidy (`./settingsCategories.tsx`, "direct wheel zoom is a
 * DIFFERENT input contract with its own sensitivity"). Reading the same field
 * in both modes would make whichever slider is on screen the one that does
 * nothing, which is the exact bug this whole file exists to end.
 *
 * WHY `invertZoomDirection` is `!scrollDownZoomsIn`: the preference is written
 * in the affirmative ("Scroll down to zoom in", default on) and the host's is
 * written as an inversion. Stating the flip once, here, is what stops two
 * readers disagreeing about which way round it goes.
 */
export function cameraGesturePlan(appearance: AppearancePreferences, gestures: GestureSettings): CameraGesturePlan {
  const wheelBehavior = wheelConventionOf(appearance);
  return {
    wheelBehavior,
    invertZoomDirection: wheelBehavior === "zoom" ? !appearance.scrollDownZoomsIn : false,
    panSpeed: gestures.panSpeedPercent / 100,
    zoomSpeed:
      wheelBehavior === "zoom" ? appearance.wheelZoomSensitivityPercent / 100 : gestures.zoomSpeedPercent / 100,
  };
}
