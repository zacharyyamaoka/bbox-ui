// src/shell/BboxShell.tsx — the shell: every window around a canvas, with the
// canvas as a swappable background.
//
// P0 built the container, the port plumbing and the capability-resolved
// affordance set (interpretation I3 of docs/WORK-ORDER-HOST-LESS-SHELL.md: no
// windows yet). P1 (B-SHELL-P1, docs/lanes/finish-B-SHELL-P1.md) lifted the
// windows in behind the hooks below: `shellChromeBar.tsx`, `shellToolDock.tsx`,
// `shellStatusStrip.tsx`, `shellPanelRail.tsx`, `shellSelectionPill.tsx` —
// each a window a host mounts as a child of `BboxShell` (or, for a window a
// host must seat in its own engine slot, inside a `HostPortScope`).
//
// WHY the shell owns its own container (constraint 6): the tldraw chrome
// reaches `editor.getContainer()` at `apps/systemsketch/src/chrome/overlay.tsx:158`
// to position itself. A shell that asked a host for a DOM node would make the
// host responsible for the shell's own layout, and there is no answer a fake
// host could give. So the shell renders the container and every screen
// coordinate in `HostPort` is relative to it.

import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import {
  affordancesForMaybe,
  type AlwaysOnAffordance,
  type HostPort,
  type ShellAffordance,
} from "./hostPort";

export interface BboxShellProps {
  /** `null` means "no canvas yet" — a real state the no-host runner starts
   *  in, not an error. Every window hides rather than throwing. */
  port: HostPort | null;
  /** The whiteboard, painted behind every window. `undefined` paints the
   *  honest empty state. `null` paints NOTHING: the host's engine already
   *  draws its own canvas behind the shell — tldraw mounts the shell in its
   *  `InFrontOfTheCanvas` slot, over a canvas it owns — and the empty-state
   *  text would sit over the board (B-SHELL-P1 brief, "Traps"). */
  background?: ReactNode | null;
  /** P1 mounts the windows here. Kept as a slot so the shell's container and
   *  its contents can land in separate commits behind separate gates. */
  children?: ReactNode;
  className?: string;
}

interface ShellContextValue {
  port: HostPort | null;
  affordances: ReadonlySet<ShellAffordance | AlwaysOnAffordance>;
}

const ShellContext = createContext<ShellContextValue>({ port: null, affordances: new Set() });

/**
 * The port's context WITHOUT the shell's container — for a window a host must
 * seat inside one of its engine's own slots rather than in the shell's
 * windows layer.
 *
 * WHY it exists: tldraw lays its toolbar out in `components.Toolbar`, inside
 * its own `.tlui-layout`, and the studio's dock keeps that box (the corner
 * placement and the interface-scale zoom both measure it there —
 * `corner.smoke`, `chromeSize.smoke`). The dock is still the SHELL's window
 * (`shellToolDock.tsx`); only its seat is the host's. One provider, the same
 * affordance set `BboxShell` computes, so a window cannot tell which it is in.
 */
export function HostPortScope({ port, children }: { port: HostPort | null; children?: ReactNode }) {
  const affordances = useMemo(() => affordancesForMaybe(port), [port]);
  const value = useMemo<ShellContextValue>(() => ({ port, affordances }), [port, affordances]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** The port, or `null`. Windows that need one return `null` themselves. */
export function useHostPort(): HostPort | null {
  return useContext(ShellContext).port;
}

/** True when this host earns the affordance. A window calls this and renders
 *  nothing when it is false — the shell HIDES what a host lacks, it never
 *  shows a disabled control and it never throws (constraint 4). */
export function useAffordance(id: ShellAffordance | AlwaysOnAffordance): boolean {
  return useContext(ShellContext).affordances.has(id);
}

/**
 * Reads one value out of the host, re-rendering when the host notifies.
 *
 * WHY `useSyncExternalStore` and not a `useState` + effect: an effect runs
 * after paint, so a window would render one frame behind the canvas — visible
 * as a selection pill lagging a drag. The store hook is also what forces the
 * port's stability rule (HOST-PORT.md constraint 7): React compares the
 * snapshot by reference and throws "The result of getSnapshot should be cached
 * to avoid an infinite loop" if `select` allocates. That is why the contract
 * checks referential stability rather than trusting it.
 */
export function useHostValue<T>(select: (port: HostPort) => T, fallback: T): T {
  const port = useHostPort();

  // `select` and `fallback` are almost always written inline at the call site
  // — `useHostValue(p => p.tools().active, "")` — so their identity changes
  // every render. Refs decouple the snapshot from that: the latest ones are
  // always used, but a new arrow does not invalidate the cache.
  const latest = useRef({ select, fallback });
  latest.current = { select, fallback };

  // The cache is what makes `getSnapshot` referentially stable across renders.
  // The host's own stability rule (HOST-PORT.md constraint 7) only binds the
  // host's getters — it says nothing about a SELECTOR that derives a new
  // object from two of them, and `p => ({ tool: p.tools().active, canUndo:
  // p.history().canUndo })` is the obvious thing a window will want. Without
  // this, that selector allocates on every call and React throws the very
  // "getSnapshot should be cached" error the constraint exists to prevent —
  // just raised on the shell side instead of the host side. Same hazard for
  // an inline object `fallback` while no host is connected, which is the
  // COMMON state in the no-host app. Found by an independent audit before
  // either had a call site; fixed here rather than left for P1 to hit.
  const cache = useRef<{ version: number; value: T } | null>(null);
  const version = useRef(0);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!port) return () => {};
      return port.subscribe(() => {
        version.current += 1;
        onChange();
      });
    },
    [port],
  );

  // Changing host is itself a change: drop the cache so the next read is fresh.
  const portRef = useRef(port);
  if (portRef.current !== port) {
    portRef.current = port;
    version.current += 1;
    cache.current = null;
  }

  const snapshot = useCallback(() => {
    if (cache.current && cache.current.version === version.current) return cache.current.value;
    const { select: read, fallback: empty } = latest.current;
    const value = portRef.current ? read(portRef.current) : empty;
    cache.current = { version: version.current, value };
    return value;
  }, []);

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function BboxShell({ port, background, children, className }: BboxShellProps) {
  const affordances = useMemo(() => affordancesForMaybe(port), [port]);
  const value = useMemo<ShellContextValue>(() => ({ port, affordances }), [port, affordances]);

  return (
    <ShellContext.Provider value={value}>
      <div
        data-slot="bbox-shell"
        data-has-canvas={port ? "true" : "false"}
        className={className}
        // WHY `pointer-events: none` on the ROOT too, not only on the windows
        // layer: on a host whose canvas is painted BEHIND the shell (tldraw's
        // `InFrontOfTheCanvas`), this box covers the whole board, and a root
        // that hit-tests swallows every press on it. A1.4's pass-through is
        // measured in `apps/systemsketch/src/shellLift.smoke.test.tsx`. A
        // `background` the shell paints itself opts back in below.
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}
      >
        {/* The canvas, painted behind everything. `inset: 0` rather than a
            flex child so a window can sit over any part of it, which is what
            "the whiteboard is the background" means. */}
        <div
          data-slot="bbox-shell-canvas"
          style={{ position: "absolute", inset: 0, pointerEvents: background ? "auto" : "none" }}
        >
          {background === undefined ? <EmptyCanvas hasPort={port !== null} /> : background}
        </div>
        {/* Windows. `pointer-events: none` on the layer and `auto` on each
            window is what lets a press fall THROUGH to the canvas anywhere a
            window is not — the pointer pass-through A1.4 measures. */}
        <div data-slot="bbox-shell-windows" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

/** The honest empty state. A host with no canvas is not an error. */
function EmptyCanvas({ hasPort }: { hasPort: boolean }) {
  return (
    <div
      data-slot="bbox-shell-empty"
      style={{ display: "grid", placeItems: "center", height: "100%", opacity: 0.45, fontSize: 13 }}
    >
      {hasPort ? "No canvas behind this shell" : "No host connected"}
    </div>
  );
}
