"use client";

import { useEffect, useRef } from "react";

/**
 * A journal of selections for the mouse's back and forward buttons.
 *
 * Zach, 2026-09-11: "bind the forward and back buttons on my mouse to be
 * able to undo the tree navigation on the breadcrumb — if I click in,
 * pressing back should take me to the previous layer." Every selection the
 * page lands on (a member row, a crumb, a navigator row, a canvas click)
 * becomes an entry; back and forward replay them without minting new ones.
 *
 * WHY `mouseup` in the capture phase is the event that is swallowed:
 * measured in real Chrome (SystemSketch, 2026-09-06), only mouseup cancels
 * the browser's own side-button navigation — pointerdown, mousedown and
 * auxclick fire with the default already committed. The gesture is ours in
 * every state, even at the ends of the journal, or Chrome leaves the page.
 */
export function useSelectionHistory(selectedIds: string[], setSelection: (ids: string[]) => void) {
  const entries = useRef<string[][]>([]);
  const index = useRef(-1);
  const replaying = useRef(false);

  useEffect(() => {
    const key = [...selectedIds].sort().join("|");
    const current = entries.current[index.current];
    if (current && [...current].sort().join("|") === key) return;
    if (replaying.current) {
      replaying.current = false;
      return;
    }
    // A new landing truncates any forward entries, like a browser.
    entries.current = entries.current.slice(0, index.current + 1);
    entries.current.push(selectedIds);
    index.current = entries.current.length - 1;
  }, [selectedIds]);

  useEffect(() => {
    const go = (delta: -1 | 1) => {
      const next = index.current + delta;
      if (next < 0 || next >= entries.current.length) return;
      index.current = next;
      replaying.current = true;
      setSelection(entries.current[next]!);
    };
    const swallow = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.button === 3) go(-1);
      else if (e.button === 4) go(1);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "BrowserBack" || e.key === "GoBack") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "BrowserForward" || e.key === "GoForward") {
        e.preventDefault();
        go(1);
      }
    };
    document.addEventListener("mouseup", swallow, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mouseup", swallow, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [setSelection]);

  return { back: () => undefined };
}
