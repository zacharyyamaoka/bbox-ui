import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { caretOffsetFromPoint } from "./caretGeometry";
import type { CodeFieldLine, CodeFieldReference } from "./codeGrammar";

/** Sum of a row's own segment text — its rendered line, stitched back together. */
function rowText(line: CodeFieldLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

/**
 * A row's identity for expansion/React-key purposes: its line index PLUS
 * its own name segment, `${line}:${name}` — the donor's own scheme
 * (`typeAttributes.ts`'s `id: \`${line}:${match[1]}\``). WHY not the line
 * index alone (round 2's finding): inserting a line above shifts every
 * later index down by one, so a path keyed on the index alone silently
 * reassigns "expanded" to whatever row now happens to sit at that number
 * — expand only `target`, insert a line above it, and `origin` (now at
 * `target`'s old index) opens while `target` (now one index further down)
 * closes. Keying on the pair means an index shift changes the key, so the
 * row that moved simply drops out of `expandedPaths` (closes) instead of
 * a DIFFERENT row silently inheriting its open state — closing on an
 * unrelated edit is an acceptable rough edge; reassigning to the wrong
 * row is not. Falls back to the row's full text when no segment is
 * marked `role: "name"` (a grammar with no name concept at all).
 */
export function rowIdentity(line: CodeFieldLine): string {
  const name = line.segments.find((segment) => segment.role === "name")?.text ?? rowText(line);
  return `${line.line}:${name}`;
}

/**
 * Drops any `expandedPaths` entry whose TOP-LEVEL `line:name` no longer
 * appears among the current top-level `lines` — an edit that deletes an
 * expanded row (not just shifts it, `rowIdentity`'s own job) would
 * otherwise leave that key sitting there forever. `CodeField` calls this
 * on every `lines()` recompute.
 *
 * WHY this is a narrowing, not a full fix: a stale key can still
 * coincidentally match a DIFFERENT row that lands on the exact same line
 * index under the exact same name (insert `origin: int` above an expanded
 * `origin: Pose` — the new row at line 0 is ALSO named "origin", so the
 * stale `"0:origin"` key remains "valid" for it even though it belongs to
 * a row nobody ever expanded). Resolving that needs a stable identity per
 * row that survives edits, which this line-oriented, reparsed-on-every-
 * keystroke design does not carry — the donor's own `${line}:${name}`
 * scheme has the identical limitation.
 */
export function pruneExpandedPaths(
  expandedPaths: ReadonlySet<string>,
  lines: readonly CodeFieldLine[],
): ReadonlySet<string> {
  const currentTopLevel = new Set(lines.map(rowIdentity));
  let changed = false;
  const next = new Set<string>();
  for (const path of expandedPaths) {
    if (currentTopLevel.has(path.split("/")[0]!)) next.add(path);
    else changed = true;
  }
  return changed ? next : expandedPaths;
}

export interface CodeFieldRowsProps {
  /** `grammar.lines(value)` — the top-level rows. */
  lines: CodeFieldLine[];
  resolveReference?(name: string): CodeFieldReference | null;
  /**
   * A row (or the blank space below the last one) was clicked. `line` is
   * the row's own line INDEX and `column` an approximate offset within it
   * (`caretOffsetFromPoint` against the row's rendered spans — exact when
   * a row's segments concatenate back to its raw source spacing,
   * approximate otherwise). `owner` is `undefined` for a top-level row —
   * `line`/`column` are then straight into this field's own `value`,
   * compose with `lineStartOffset` for a flat offset. For a row that came
   * from a reference's `expandLines()`, `owner` carries THAT reference's
   * own owner token (`CodeFieldReference.owner`, defaulting to the
   * resolved segment's text) — `line`/`column` are into THAT source, not
   * this field's, and the host must resolve `owner` to open its source
   * (the donor's rule: a foreign row jumps to its real owner, never opens
   * this field's own document at an unrelated line).
   */
  onOpenSource?(line: number, column: number, owner?: unknown): void;
  /**
   * Which rows are expanded, keyed by path (`"3"`, `"3/1"`, …). Controlled
   * — pass this alongside `onToggleExpanded` to keep expansion state alive
   * across whatever remounts `CodeFieldRows` (`CodeField` does this across
   * its own `mode` toggle: `CodeFieldRows` itself unmounts every trip
   * through Source, so state living only here reset on every round trip —
   * the donor's `TypeBabbleV1` lifts this same state for the same reason).
   * Omit both to manage it internally instead (an uncontrolled default,
   * fine for a caller that never round-trips through another mode).
   */
  expandedPaths?: ReadonlySet<string>;
  onToggleExpanded?(path: string): void;
  className?: string;
  testId?: string;
}

/**
 * The RENDERED half of `CodeField`'s `mode` toggle: `grammar.lines()` painted
 * as bold-name / accent-type / muted-value rows, a reference segment as an
 * underlined link, and a chevron for a reference that can expand in place —
 * the "code block overlay" idea: rendered by default, source only under the
 * caret. `CodeField` mounts this in place of CodeMirror while `mode ===
 * "rendered"`; it never runs alongside the live document.
 */
export function CodeFieldRows({
  lines,
  resolveReference,
  onOpenSource,
  expandedPaths,
  onToggleExpanded,
  className,
  testId,
}: CodeFieldRowsProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const expanded = expandedPaths ?? uncontrolledExpanded;
  const toggle =
    onToggleExpanded ??
    ((path: string) =>
      setUncontrolledExpanded((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      }));

  const last = lines[lines.length - 1];
  return (
    <div
      data-slot="code-field-rows"
      className={`bbox-code-field-rows${className ? ` ${className}` : ""}`}
      data-testid={testId}
      // A click that reaches this container (not caught by a row, a
      // chevron, or a reference link on the way) landed on genuinely empty
      // space below the last row. There is no more specific position than
      // "the end of the last line."
      onClick={(event) => {
        if (event.target !== event.currentTarget || !onOpenSource || !last) return;
        onOpenSource(last.line, rowText(last).length);
      }}
    >
      {lines.map((line) => (
        <CodeFieldRow
          key={rowIdentity(line)}
          line={line}
          path={rowIdentity(line)}
          owner={undefined}
          resolveReference={resolveReference}
          onOpenSource={onOpenSource}
          expandedPaths={expanded}
          togglePath={toggle}
        />
      ))}
    </div>
  );
}

function CodeFieldRow({
  line,
  path,
  owner,
  resolveReference,
  onOpenSource,
  expandedPaths,
  togglePath,
}: {
  line: CodeFieldLine;
  path: string;
  /** The owner of THIS row's own source — `undefined` at the top level, the enclosing reference's owner once nested inside its `expandLines()`. */
  owner: unknown;
  resolveReference?(name: string): CodeFieldReference | null;
  onOpenSource?(line: number, column: number, owner?: unknown): void;
  expandedPaths: ReadonlySet<string>;
  togglePath(path: string): void;
}) {
  const referenceIndex = line.segments.findIndex((segment) => segment.isReference);
  const resolved = referenceIndex >= 0 && resolveReference
    ? resolveReference(line.segments[referenceIndex]!.text)
    : null;
  const expandable = Boolean(resolved?.expandLines);
  const isOpen = expandable && expandedPaths.has(path);

  const activateRow = (event: ReactMouseEvent<HTMLElement>) => {
    if (!onOpenSource) return;
    const column = caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY);
    onOpenSource(line.line, Math.min(column, rowText(line).length), owner);
  };

  const children = isOpen && resolved?.expandLines ? resolved.expandLines() : null;
  // The owner every row inside THIS reference's expansion carries: the
  // reference's own declared token, or (the common case — `expandLines`
  // alone is enough to mark rows as foreign) the resolved segment's text.
  const childOwner = resolved ? resolved.owner ?? line.segments[referenceIndex]!.text : owner;

  return (
    <div className="bbox-code-field-row" data-slot="code-field-row" data-depth={path.split("/").length - 1}>
      <span className="bbox-code-field-row-content" onClick={activateRow}>
        <span
          aria-hidden={expandable ? undefined : true}
          className="bbox-code-field-chevron"
          data-caret-ignore=""
          data-open={isOpen || undefined}
          role={expandable ? "button" : undefined}
          tabIndex={expandable ? 0 : undefined}
          onPointerDown={expandable ? (event) => event.stopPropagation() : undefined}
          onClick={expandable ? (event) => { event.stopPropagation(); togglePath(path); } : undefined}
        >
          {expandable ? (isOpen ? "▾" : "▸") : null}
        </span>
        {line.segments.map((segment, index) => {
          const isResolvedReference = index === referenceIndex && resolved;
          const className = `bbox-code-seg${segment.role ? ` bbox-code-seg--${segment.role}` : ""}${
            isResolvedReference ? ` bbox-code-ref bbox-code-ref--${resolved.kind}` : ""
          }`;
          if (isResolvedReference && resolved.onJump) {
            return (
              <span
                key={index}
                className={className}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); resolved.onJump!(); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  resolved.onJump!();
                }}
              >
                {segment.text}
              </span>
            );
          }
          return (
            <span key={index} className={className}>
              {segment.text}
            </span>
          );
        })}
      </span>
      {isOpen && children ? (
        <div className="bbox-code-field-preview">
          {children.map((child) => (
            <CodeFieldRow
              key={rowIdentity(child)}
              line={child}
              path={`${path}/${rowIdentity(child)}`}
              owner={childOwner}
              resolveReference={resolveReference}
              onOpenSource={onOpenSource}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
