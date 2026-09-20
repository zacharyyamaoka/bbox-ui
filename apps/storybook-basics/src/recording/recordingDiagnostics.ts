// src/recording/recordingDiagnostics.ts — PORTED VERBATIM from the archive:
// /home/bam/systemsketch/src/recorder/recorderEvents.ts:1-67 (read on disk
// 2026-09-19). Renamed only because `recorderEvents` reads like DOM events
// here; the module body below is character-for-character the donor's.
/**
 * Small, dependency-free seam for semantic facts that happen outside tldraw.
 *
 * The canvas recorder already sees pointer input and store changes. Workspace
 * persistence, app commands, and chrome surface changes happen above that
 * boundary, so those modules publish a compact fact here. Nothing is buffered
 * in this module: when no explicit take is running, publishing is a no-op.
 */

export type RecorderDiagnosticLane = 'action' | 'workspace'

export interface RecorderDiagnosticEvent {
  lane: RecorderDiagnosticLane
  name: string
  summary: string
  level?: 'info' | 'warn' | 'error'
  detail?: Record<string, unknown>
}

type Listener = (event: RecorderDiagnosticEvent) => void

const listeners = new Set<Listener>()

export function emitRecorderDiagnostic(event: RecorderDiagnosticEvent): void {
  for (const listener of listeners) listener(event)
}

export function subscribeRecorderDiagnostics(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function recordSemanticAction<T>(
  name: string,
  summary: string,
  run: () => T | Promise<T>,
  detail: Record<string, unknown> = {},
): Promise<T> {
  const started = performance.now()
  emitRecorderDiagnostic({ lane: 'action', name, summary: `${summary} started`, detail: { ...detail, phase: 'start' } })
  try {
    const result = await run()
    emitRecorderDiagnostic({
      lane: 'action',
      name,
      summary: `${summary} completed`,
      detail: { ...detail, phase: 'complete', durationMs: +(performance.now() - started).toFixed(1) },
    })
    return result
  } catch (cause) {
    emitRecorderDiagnostic({
      lane: 'action',
      name,
      summary: `${summary} failed`,
      level: 'error',
      detail: {
        ...detail,
        phase: 'error',
        durationMs: +(performance.now() - started).toFixed(1),
        error: cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : String(cause),
      },
    })
    throw cause
  }
}
