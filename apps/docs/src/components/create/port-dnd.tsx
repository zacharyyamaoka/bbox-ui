"use client";

/**
 * dnd-kit owns every Port drag (Zach, 2026-09-12). The actual `DndContext` /
 * `PointerSensor` / `useDroppable` / `useDraggable` / `DragOverlay` wiring
 * lives in `@bbox-ui/panel`'s `portDnd.tsx`, not here — `@dnd-kit/core` is
 * already a real dependency of that package (`members/List.tsx`'s own
 * drag-to-reorder), while `apps/docs/package.json` does not declare it, and
 * adding it would need a lockfile change and an install this work is not
 * allowed to run. `@bbox-ui/panel` is also where `bench.tsx` draws a
 * Block's four `PortEdge` lanes and its Port members in the first place
 * (`renderLane`'s `data-slot="port-lane"`, `data-port-id`), so the code that
 * makes those SAME elements draggable/droppable belongs beside the code
 * that renders them — this file just re-exports the app-facing surface, the
 * same "host-neutral engine, thin app shell" split `bench.tsx`'s own header
 * describes for the rest of the panel.
 *
 * `render-instance.tsx` mounts `PortDndProvider` around a Block's render;
 * `viewport/dom-preview.tsx` provides `HostZoomContext` (1, since the DOM
 * render is never scaled).
 */
export { PortDndProvider, HostZoomContext, type PortDndProviderProps } from "@bbox-ui/panel";
