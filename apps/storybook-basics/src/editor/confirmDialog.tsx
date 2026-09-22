// src/editor/confirmDialog.tsx — the trunk's confirmation surface: the
// "are you sure?" a host raises before a destructive command (Move to Trash,
// Replace, discard), built entirely out of the stock shadcn `base-nova`
// Dialog and Button this repo already carries.
//
// WHY it is here and not in the app: Zach, 2026-09-19 — "all of the feedback
// regarding the chrome should be made in bbox-ui editor-components, not in
// system sketch, system sketch should just be kinda like importing these stock
// menus and doing a light bit of configuration". `apps/systemsketch` used to
// author this dialog's header, body, footer, BOTH buttons and its dismissal
// inline (chromeBar.tsx, before this file existed), which is precisely the
// divergence the rule exists to stop: the next host — the VS Code extension,
// the Obsidian plugin — inherits nothing from a modal that lives inside one
// app. Now the app passes a message and two callbacks and gets a boolean.
//
// WHY the hook (`useConfirm`) ships beside the component rather than leaving
// every host to wire its own promise: the ONE thing a confirm surface can get
// dangerously wrong is settling twice. Its caller is a file command — "Move to
// Trash" on Zach's real board — and a promise that resolves a second time runs
// that command a second time. The latch that prevents it is three lines, and
// it belongs in the one place every host shares, not copied into each of them.
// `stories/ConfirmDialog.stories.tsx` drives all three dismissal doors
// (Cancel, Escape, the ×) and asserts exactly one answer per prompt.
"use client";

import { useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "../components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";

/** What a host says. Everything else about the surface is this file's. */
export interface ConfirmPrompt {
  title: string;
  /** Inline text — it renders inside the stock `DialogDescription`'s `<p>`. */
  body: ReactNode;
  confirmLabel: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /**
   * Paint the confirming button as the stock `destructive` Button variant.
   * WHY opt-in rather than inferred from the label: "Replace" and "Move to
   * Trash" are both destructive and share no word, and a surface that guessed
   * would eventually paint a harmless confirmation red.
   */
  destructive?: boolean;
}

export interface ConfirmDialogProps extends ConfirmPrompt {
  open: boolean;
  /** Called with `false` for EVERY dismissal door: Cancel, Escape, the ×, the
   *  backdrop. A host that treats this as "answered no" is correct. */
  onOpenChange(open: boolean): void;
  /** The confirming button. The host closes; this surface never assumes. */
  onConfirm(): void;
  popupClassName?: string;
  /** `data-testid` on the popup; its buttons get `<prefix>-cancel` /
   *  `<prefix>-confirm`. Default `"confirm-dialog"`. */
  testIdPrefix?: string;
}

/**
 * DOM contract (what the story measures):
 *   - the popup is the stock `[data-slot="dialog-content"]`, `role="dialog"`,
 *     carrying `data-testid=<prefix>`;
 *   - title in `[data-slot="dialog-title"]`, message in
 *     `[data-slot="dialog-description"]`;
 *   - `[data-testid="<prefix>-cancel"]` and `[data-testid="<prefix>-confirm"]`
 *     are both stock `[data-slot="button"]`s, the confirming one carrying the
 *     stock `destructive` variant when asked.
 */
export function ConfirmDialog(props: ConfirmDialogProps): ReactElement {
  const {
    open,
    onOpenChange,
    onConfirm,
    title,
    body,
    confirmLabel,
    cancelLabel = "Cancel",
    destructive = false,
    popupClassName,
    testIdPrefix = "confirm-dialog",
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testIdPrefix} className={cn("gap-3", popupClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* WHY Cancel is a `DialogClose` rather than a button that calls
              `onOpenChange(false)` itself: it makes Cancel, Escape, the × and
              the backdrop ONE code path through the stock primitive, so the
              latch below can never see a door it did not cover. */}
          <DialogClose data-testid={`${testIdPrefix}-cancel`} render={<Button variant="outline" />}>
            {cancelLabel}
          </DialogClose>
          <Button
            data-testid={`${testIdPrefix}-confirm`}
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface UseConfirmOptions {
  popupClassName?: string;
  testIdPrefix?: string;
}

export interface ConfirmSurface {
  /** Ask; resolves `true` once on confirm, `false` once on any dismissal. */
  confirm(prompt: ConfirmPrompt): Promise<boolean>;
  /** Render this wherever the host wants the surface to live. */
  dialog: ReactElement | null;
}

/**
 * The confirm surface as a host uses it: `confirm(prompt)` in, one boolean
 * out, `dialog` rendered somewhere in the tree.
 */
export function useConfirm(options: UseConfirmOptions = {}): ConfirmSurface {
  const { popupClassName, testIdPrefix } = options;
  const [prompt, setPrompt] = useState<ConfirmPrompt | null>(null);
  const pending = useRef<((answer: boolean) => void) | null>(null);

  // WHY the ref is cleared BEFORE resolving: this is the latch. Without it a
  // confirming click that also closes the dialog settles once for the click
  // and once for the close, and the caller — a file command — runs twice.
  // Clearing first makes the second call a no-op whatever order the events
  // arrive in.
  const settle = useCallback((answer: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setPrompt(null);
    resolve?.(answer);
  }, []);

  const confirm = useCallback(
    (next: ConfirmPrompt) =>
      new Promise<boolean>((resolve) => {
        // A second prompt while one is open answers the first "no" rather
        // than leaving its promise hanging forever — an abandoned `await`
        // inside a file command is a command that silently never finishes.
        pending.current?.(false);
        pending.current = resolve;
        setPrompt(next);
      }),
    [],
  );

  const dialog = prompt ? (
    <ConfirmDialog
      {...prompt}
      open
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      onConfirm={() => settle(true)}
      popupClassName={popupClassName}
      testIdPrefix={testIdPrefix}
    />
  ) : null;

  return useMemo(() => ({ confirm, dialog }), [confirm, dialog]);
}
