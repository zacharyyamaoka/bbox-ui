import { useState, type MouseEvent as ReactMouseEvent } from "react";

import { caretOffsetFromPoint } from "./caretGeometry";
import type { CodeFieldLine, CodeFieldReference } from "./codeGrammar";

/** Sum of a row's own segment text — its rendered line, stitched back together. */
function rowText(line: CodeFieldLine): string {
  return line.segments.map((segment) => segment.text).join("");
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
          key={line.line}
          line={line}
          path={String(line.line)}
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
              key={child.line}
              line={child}
              path={`${path}/${child.line}`}
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
