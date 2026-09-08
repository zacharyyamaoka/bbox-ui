/**
 * Inline tool glyphs. tldraw accepts a React element in a tool's icon slot;
 * keeping the SVGs inline avoids extending the host's icon asset map solely
 * for two semantic tools.
 */

/** A Block: the Simple View container with its glyph + title header. */
export function BlockToolIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="2.5"
        y="3.75"
        width="15"
        height="12.5"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="6.25" cy="7.5" r="1.1" fill="currentColor" />
      <path
        d="M9 7.5h5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

/** A Port terminal and its short leader — intentionally not a second node glyph. */
export function PortToolIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle
        cx="6"
        cy="10"
        r="3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M10.5 10h6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <path
        d="M14 7.5 16.5 10 14 12.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
