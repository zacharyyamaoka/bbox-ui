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
   * A row (or the blank space below the last one) was clicked. Reports the
   * source line and an approximate column within it — `caretOffsetFromPoint`
   * against the row's own rendered spans, same caveat as that function's:
   * exact when a row's segments concatenate back to its raw source
   * spacing, approximate otherwise. Compose with `lineStartOffset` (in
   * `caretGeometry.ts`) against the field's `value` for a flat offset to
   * hand `CodeField`'s `cursorAt`.
   */
  onOpenSource?(line: number, column: number): void;
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
export function CodeFieldRows({ lines, resolveReference, onOpenSource, className, testId }: CodeFieldRowsProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

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
  resolveReference,
  onOpenSource,
  expandedPaths,
  togglePath,
}: {
  line: CodeFieldLine;
  path: string;
  resolveReference?(name: string): CodeFieldReference | null;
  onOpenSource?(line: number, column: number): void;
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
    onOpenSource(line.line, Math.min(column, rowText(line).length));
  };

  const children = isOpen && resolved?.expandLines ? resolved.expandLines() : null;

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
