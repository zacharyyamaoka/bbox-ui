// src/recording/flightRecorder.test.ts — the donor's OWN suite, ported
// verbatim from /home/bam/systemsketch/src/recorder/flightRecorder.test.ts:
// 1-236 (read on disk 2026-09-19). One edit: `./recorderEvents` ->
// `./recordingDiagnostics`.
//
// WHY the donor's suite and not a fresh one: it is an INDEPENDENT oracle,
// written against the archive's recorder before this port existed, so it
// cannot have been shaped to whatever the port happens to do — the same
// reasoning apps/storybook-basics/vitest.config.ts gives for the elbow suite.
// It runs in the `unit` project: node, no DOM, no browser (the recorder's
// `domTarget` defaults to null when `window` is undefined).
import { describe, expect, it } from 'vitest'
import type { Editor, RecordsDiff, TLRecord, TLStoreSnapshot } from 'tldraw'
import {
  DEFAULT_WINDOW_MS,
  FlightRecorder,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  clampWindowMs,
  rewindSnapshot,
  summariseDiff,
  trimBefore,
} from './flightRecorder'
import { emitRecorderDiagnostic } from './recordingDiagnostics'

type Listener = (...args: never[]) => void

/**
 * A stand-in editor exposing exactly the seams the recorder uses, so the
 * window arithmetic and the snapshot rewind can be proved without a canvas.
 * The real seams are exercised by `tests/recorder_smoke.mjs`.
 */
function fakeEditor(store: Record<string, TLRecord>) {
  const handlers = new Map<string, Set<Listener>>()
  let storeListener: ((entry: { changes: RecordsDiff<TLRecord>; source: 'user' }) => void) | null = null
  let path = 'select.idle'
  const editor = {
    on: (name: string, handler: Listener) => {
      if (!handlers.has(name)) handlers.set(name, new Set())
      handlers.get(name)!.add(handler)
    },
    off: (name: string, handler: Listener) => handlers.get(name)?.delete(handler),
    getPath: () => path,
    menus: { getOpenMenus: () => [] as string[] },
    inputs: { currentPagePoint: { x: 1, y: 2 } },
    store: {
      listen: (fn: typeof storeListener) => {
        storeListener = fn
        return () => { storeListener = null }
      },
      getStoreSnapshot: (): TLStoreSnapshot => ({ store: { ...store }, schema: { schemaVersion: 2, sequences: {} } } as TLStoreSnapshot),
    },
    getInstanceState: () => ({ screenBounds: { x: 0, y: 0, w: 100, h: 100 } }),
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    getCurrentPageId: () => 'page:page',
    getCurrentPageShapeIds: () => new Set(Object.keys(store).filter((id) => id.startsWith('shape:'))),
    getSelectedShapeIds: () => [] as string[],
  }
  return {
    editor: editor as unknown as Editor,
    emit: (name: string, payload: unknown) => handlers.get(name)?.forEach((handler) => (handler as (value: unknown) => void)(payload)),
    change: (changes: RecordsDiff<TLRecord>) => {
      // Apply to the fake store the way tldraw would, then notify.
      for (const record of Object.values(changes.added)) store[record.id] = record
      for (const id of Object.keys(changes.removed)) delete store[id]
      for (const [id, [, after]] of Object.entries(changes.updated)) store[id] = after
      storeListener?.({ changes, source: 'user' })
    },
    setPath: (next: string) => { path = next },
  }
}

const asDiff = (diff: object) => diff as unknown as RecordsDiff<TLRecord>
const shape = (id: string, x: number): TLRecord => ({ id, typeName: 'shape', type: 'block', x, y: 0 } as unknown as TLRecord)

describe('window arithmetic', () => {
  it('clamps the window to the allowed range', () => {
    expect(clampWindowMs(Number.NaN)).toBe(DEFAULT_WINDOW_MS)
    expect(clampWindowMs(1)).toBe(MIN_WINDOW_MS)
    expect(clampWindowMs(10 * 60 * 1000)).toBe(MAX_WINDOW_MS)
    expect(clampWindowMs(30_000)).toBe(30_000)
  })

  it('drops rows from the front until the cutoff', () => {
    const rows = [{ t: 1 }, { t: 5 }, { t: 9 }]
    expect(trimBefore(rows, 6)).toBe(2)
    expect(rows).toEqual([{ t: 9 }])
  })
})

describe('store diff summary', () => {
  it('names records and changed keys, and skips the pointer record', () => {
    const before = shape('shape:a', 0)
    const after = shape('shape:a', 40)
    const ops = summariseDiff(asDiff({
      added: { 'shape:b': shape('shape:b', 0) },
      removed: {},
      updated: {
        'shape:a': [before, after],
        'pointer:pointer': [{ id: 'pointer:pointer', typeName: 'pointer', x: 0 } as unknown as TLRecord, { id: 'pointer:pointer', typeName: 'pointer', x: 1 } as unknown as TLRecord],
      },
    }))
    expect(ops).toEqual([
      { op: 'add', id: 'shape:b', type: 'block' },
      { op: 'update', id: 'shape:a', type: 'block', delta: { x: 40 } },
    ])
  })
})

describe('rewinding a snapshot through diffs', () => {
  it('recovers the state at the tail of the window', () => {
    const a0 = shape('shape:a', 0)
    const a1 = shape('shape:a', 10)
    const b = shape('shape:b', 5)
    const end = { store: { 'shape:a': a1 }, schema: {} } as unknown as TLStoreSnapshot
    const diffs: RecordsDiff<TLRecord>[] = [
      asDiff({ added: { 'shape:b': b }, removed: {}, updated: {} }),
      asDiff({ added: {}, removed: {}, updated: { 'shape:a': [a0, a1] } }),
      asDiff({ added: {}, removed: { 'shape:b': b }, updated: {} }),
    ]
    const start = rewindSnapshot(end, diffs)
    expect(start.store).toEqual({ 'shape:a': a0 })
    // The end snapshot is untouched.
    expect(end.store).toEqual({ 'shape:a': a1 })
  })
})

describe('FlightRecorder', () => {
  it('keeps only the window, rebases rows, and rewinds the start snapshot for a retroactive save', () => {
    let clock = 0
    const store: Record<string, TLRecord> = { 'shape:a': shape('shape:a', 0) }
    const fake = fakeEditor(store)
    const recorder = new FlightRecorder(fake.editor, { windowMs: MIN_WINDOW_MS, now: () => clock, wallNow: () => 1_000_000 + clock, domTarget: null })
    recorder.start()

    clock = 100
    fake.change(asDiff({ added: {}, removed: {}, updated: { 'shape:a': [shape('shape:a', 0), shape('shape:a', 20)] } }))
    clock = 200
    fake.setPath('select.pointing_shape')
    fake.emit('event', { name: 'pointer_down', type: 'pointer', point: { x: 3, y: 4 }, target: 'shape', button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })
    clock = 7_000 // beyond the 5 s window: everything above must age out
    fake.change(asDiff({ added: { 'shape:b': shape('shape:b', 1) }, removed: {}, updated: {} }))
    clock = 7_100
    fake.emit('event', { name: 'pointer_up', type: 'pointer', point: { x: 3, y: 4 }, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })

    const payload = recorder.collect('last', 'why did this happen')
    const lanes = payload.rows.map((row) => `${row.lane}:${String(row.name ?? row.ops ? 'x' : '')}`)
    expect(payload.rows.every((row) => row.t >= 0 && row.t <= MIN_WINDOW_MS)).toBe(true)
    expect(payload.rows.some((row) => row.lane === 'store')).toBe(true)
    expect(payload.rows.some((row) => row.lane === 'input' && row.name === 'pointer_up')).toBe(true)
    expect(payload.rows.some((row) => row.lane === 'input' && row.name === 'pointer_down')).toBe(false)
    expect(lanes.length).toBeGreaterThan(0)
    // The tail of the window is after shape:a moved, but before shape:b existed.
    expect(payload.startSnapshot.store).toEqual({ 'shape:a': shape('shape:a', 20) })
    expect(Object.keys(payload.endSnapshot.store)).toEqual(['shape:a', 'shape:b'])
    expect(payload.header.mode).toBe('last')
    expect(payload.header.note).toBe('why did this happen')
    expect(payload.header.durationMs).toBe(MIN_WINDOW_MS)
    expect(payload.header.rowsDropped).toBeGreaterThan(0)
    recorder.stop()
  })

  it('records state-chart transitions and menu changes as their own lanes', () => {
    let clock = 0
    const fake = fakeEditor({})
    const recorder = new FlightRecorder(fake.editor, { now: () => clock, wallNow: () => clock, domTarget: null })
    recorder.start()
    clock = 10
    fake.setPath('block.pointing')
    fake.emit('event', { name: 'pointer_down', type: 'pointer', point: { x: 0, y: 0 }, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false })
    const payload = recorder.collect('last')
    const transition = payload.rows.find((row) => row.lane === 'state')
    expect(transition).toMatchObject({ from: 'select.idle', to: 'block.pointing', trigger: 'pointer_down' })
    expect(payload.header.pathAtStart).toBe('select.idle')
    expect(payload.header.pathAtEnd).toBe('block.pointing')
    recorder.stop()
  })

  it('an explicit take starts at the take, with the snapshot taken then', () => {
    let clock = 0
    const store: Record<string, TLRecord> = {}
    const fake = fakeEditor(store)
    const recorder = new FlightRecorder(fake.editor, { now: () => clock, wallNow: () => 5_000 + clock, domTarget: null })
    recorder.start()
    clock = 500
    fake.change(asDiff({ added: { 'shape:early': shape('shape:early', 0) }, removed: {}, updated: {} }))
    clock = 1_000
    recorder.beginTake()
    expect(recorder.isTaking).toBe(true)
    clock = 1_500
    fake.change(asDiff({ added: { 'shape:late': shape('shape:late', 0) }, removed: {}, updated: {} }))
    const payload = recorder.collect('take')
    expect(recorder.isTaking).toBe(false)
    expect(payload.header.mode).toBe('take')
    expect(payload.header.startedAtWall).toBe(6_000)
    expect(payload.header.durationMs).toBe(500)
    expect(Object.keys(payload.startSnapshot.store)).toEqual(['shape:early'])
    expect(payload.rows.map((row) => row.lane)).toEqual(['mark', 'store'])
    expect(payload.rows[0].t).toBe(0)
    expect(payload.storeDiffs).toHaveLength(1)
    expect(payload.storeDiffs[0]).toMatchObject({
      t: 500,
      source: 'user',
      changes: { added: { 'shape:late': shape('shape:late', 0) } },
    })
    expect(payload.rows[1].detail).toBe(payload.storeDiffs[0].id)
    recorder.stop()
  })

  it('indexes semantic app facts while keeping their full detail out of the compact row', () => {
    let clock = 0
    const fake = fakeEditor({})
    const recorder = new FlightRecorder(fake.editor, { now: () => clock, wallNow: () => clock, domTarget: null })
    recorder.start()
    recorder.beginTake()
    clock = 25
    emitRecorderDiagnostic({
      lane: 'workspace',
      name: 'autosave-error',
      summary: 'autosave conflict',
      level: 'error',
      detail: { path: '/tmp/board.systemsketch', phase: 'conflict', diskDigest: 'abc' },
    })
    const payload = recorder.collect('take')
    const row = payload.rows.find((candidate) => candidate.lane === 'workspace')
    expect(row).toMatchObject({ name: 'autosave-error', summary: 'autosave conflict', level: 'error' })
    expect(row?.path).toBeUndefined()
    expect(payload.details).toEqual([{
      id: row?.detail,
      t: 25,
      lane: 'workspace',
      kind: 'autosave-error',
      data: { path: '/tmp/board.systemsketch', phase: 'conflict', diskDigest: 'abc' },
    }])
    recorder.stop()
  })

  it('restores the console it patched', () => {
    const original = console.warn
    const fake = fakeEditor({})
    const recorder = new FlightRecorder(fake.editor, { domTarget: null })
    recorder.start()
    expect(console.warn).not.toBe(original)
    recorder.stop()
    expect(console.warn).toBe(original)
  })
})
