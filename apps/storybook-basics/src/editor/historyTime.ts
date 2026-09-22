/**
 * src/components/historyTime.ts — the relative/absolute time pair behind the
 * "just now" / "7 minutes ago" stamps in the Compare dialog's HISTORY rail
 * (docs/menus/screenshots/08).
 *
 * Ported verbatim from
 * /home/bam/systemsketch/src/history/historyModel.ts:75-103
 * (`relativeTime`, `absoluteTime`) — the injectable `now` clock and the
 * deliberate no-`Intl.RelativeTimeFormat` WHY travel unchanged.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Figma's own relative phrasing — "7 minutes ago" — and its rounding.
 *
 * Deliberately NOT `Intl.RelativeTimeFormat`. That formatter is excellent and it
 * is the wrong tool here: it renders "7 minutes ago" and "last week" from the
 * same call, and the second one is a phrase Figma's list never shows. Matching
 * the reference means choosing the unit the reference chooses, so this walks the
 * thresholds explicitly. Anything past a week reads as a date, because "37 days
 * ago" is a number nobody converts.
 */
export function relativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return "time not recorded"
  const elapsed = now - timestamp
  // A clock skew or a file written a moment ago must not read "in 3 seconds".
  if (elapsed < 45_000) return "just now"
  if (elapsed < HOUR) {
    const minutes = Math.round(elapsed / MINUTE)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  }
  if (elapsed < DAY) {
    const hours = Math.round(elapsed / HOUR)
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }
  if (elapsed < 7 * DAY) {
    const days = Math.round(elapsed / DAY)
    return `${days} day${days === 1 ? "" : "s"} ago`
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Absolute stamp for the tooltip, so the relative one is never the only record. */
export function absoluteTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return "No timestamp recorded"
  return new Date(timestamp).toLocaleString()
}
