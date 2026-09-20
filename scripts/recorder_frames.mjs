#!/usr/bin/env node
/*
 * PORTED VERBATIM from the archive, read on disk 2026-09-19:
 * /home/bam/systemsketch/scripts/recorder_frames.mjs:1-274. Not one line of
 * the protocol or the ring buffer is changed; only this note is added.
 *
 * WHY it is copied at all when nothing in this repo starts it yet:
 * `FrameSidecar.availability()` (systemsketch_recordings.py) answers "<name>
 * is missing beside the host" when this file is absent, and that answer is
 * what the recorder's own UI renders as the reason it fell back to canvas
 * frames. Shipping the Python half without its Node half would have made the
 * screencast path permanently, and silently, unavailable — a weaker feature
 * wearing the donor's error message.
 */
/**
 * The slow channel of the flight recorder: Chrome's own screencast, kept in a
 * ring buffer outside the page.
 *
 * The Python host spawns one of these per channel and talks to it over stdin /
 * stdout, one JSON object per line. It finds every page of the channel's
 * Chrome through the debugging port the launcher opened, and while armed asks
 * each one for `Page.startScreencast`. Chrome sends a JPEG only when the page
 * repaints, stamped with its swap time on the wall clock — the same clock the
 * in-page recorder uses — so a save just asks for "everything between these
 * two wall times", thinned to one frame per `keepGapMs`.
 *
 *   {"id":1,"op":"arm","enabled":true}
 *   {"id":2,"op":"status"}
 *   {"id":3,"op":"dump","dir":"/abs/frames","fromWall":…,"toWall":…,"keepGapMs":300,"url":"http://…"}
 *   {"id":4,"op":"quit"}
 *
 * Node 22's built-in WebSocket is enough; there are no dependencies.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const args = parseArgs(process.argv.slice(2))
const CDP_PORT = Number(args['cdp-port'])
const URL_PREFIX = String(args['url-prefix'] ?? '')
const WINDOW_MS = Number(args['window-ms'] ?? 60_000)
const MAX_BYTES = Number(args['max-bytes'] ?? 160 * 1024 * 1024)
const QUALITY = Number(args.quality ?? 70)
// Measured (docs/assets/recorder-spike/screencast-cost.json): the cost is ~17 ms
// of Chrome CPU per delivered frame whatever the size or quality, so the
// frame count is the lever. Every second repaint halves it and still gives
// more frames than a save keeps.
const EVERY_NTH = Number(args['every-nth'] ?? 2)
// These are physical-pixel limits for Chrome's compositor capture, not CSS
// layout dimensions. A tall desktop Preview can otherwise read back a 4M+
// pixel surface for every frame even when the saved diagnostic needs far less.
const MAX_WIDTH = Number(args['max-width'] ?? 1440)
const MAX_HEIGHT = Number(args['max-height'] ?? 1440)
const DISCOVER_MS = 1500

if (!Number.isFinite(CDP_PORT) || !URL_PREFIX) {
  process.stderr.write('usage: recorder_frames.mjs --cdp-port N --url-prefix http://127.0.0.1:4322/ [--window-ms 60000]\n')
  process.exit(2)
}

/** @type {Map<string, {id: string, url: string, ws: WebSocket, ring: {wall: number, buf: Buffer}[], bytes: number, seq: number, pending: Map<number, (v: any) => void>, casting: boolean}>} */
const targets = new Map()
let armed = false
const log = (...parts) => process.stderr.write(`[recorder_frames] ${parts.join(' ')}\n`)

function parseArgs(list) {
  const out = {}
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (!item.startsWith('--')) continue
    const key = item.slice(2)
    const next = list[index + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; index += 1 }
  }
  return out
}

async function listPages() {
  try {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, { signal: AbortSignal.timeout(2000) })
    const pages = await response.json()
    return pages.filter((page) => page.type === 'page' && typeof page.url === 'string' && page.url.startsWith(URL_PREFIX))
  } catch {
    return null // Chrome is not up (yet); keep polling
  }
}

function send(target, method, params = {}) {
  const id = ++target.seq
  return new Promise((resolve, reject) => {
    target.pending.set(id, { resolve, reject })
    try { target.ws.send(JSON.stringify({ id, method, params })) } catch (error) { target.pending.delete(id); reject(error) }
  })
}

async function startCast(target) {
  if (target.casting) return
  target.casting = true
  const params = { format: 'jpeg', quality: QUALITY, everyNthFrame: EVERY_NTH }
  if (MAX_WIDTH > 0) params.maxWidth = MAX_WIDTH
  if (MAX_HEIGHT > 0) params.maxHeight = MAX_HEIGHT
  try { await send(target, 'Page.startScreencast', params) } catch (error) { target.casting = false; log('startScreencast failed', error.message) }
}

async function stopCast(target) {
  if (!target.casting) return
  target.casting = false
  try { await send(target, 'Page.stopScreencast') } catch { /* the page may be gone */ }
}

function trim(target, now) {
  const cutoff = now - WINDOW_MS - 1000
  while (target.ring.length && target.ring[0].wall < cutoff) target.bytes -= target.ring.shift().buf.length
  while (target.ring.length > 1 && target.bytes > MAX_BYTES) target.bytes -= target.ring.shift().buf.length
}

async function attach(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const target = { id: page.id, url: page.url, ws, ring: [], bytes: 0, seq: 0, pending: new Map(), casting: false }
  targets.set(page.id, target)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('websocket error')), { once: true })
  }).catch((error) => { targets.delete(page.id); throw error })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id !== undefined) {
      const request = target.pending.get(message.id)
      if (!request) return
      target.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result ?? {})
      return
    }
    if (message.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = message.params
      const wall = metadata?.timestamp ? metadata.timestamp * 1000 : Date.now()
      const buf = Buffer.from(data, 'base64')
      target.ring.push({ wall, buf })
      target.bytes += buf.length
      trim(target, Date.now())
      send(target, 'Page.screencastFrameAck', { sessionId }).catch(() => undefined)
      return
    }
    if (message.method === 'Page.frameNavigated' && message.params.frame?.parentId === undefined) {
      target.url = message.params.frame.url
      // A navigation ends the screencast session; start it again if we are armed.
      target.casting = false
      if (armed) void startCast(target)
    }
  })
  ws.addEventListener('close', () => { targets.delete(page.id) })
  await send(target, 'Page.enable').catch(() => undefined)
  if (armed) await startCast(target)
  log('attached', page.url)
}

async function discover() {
  const pages = await listPages()
  if (pages === null) return
  for (const page of pages) {
    if (targets.has(page.id)) { targets.get(page.id).url = page.url; continue }
    try { await attach(page) } catch (error) { log('attach failed', page.url, error.message) }
  }
  const alive = new Set(pages.map((page) => page.id))
  for (const [id, target] of targets) {
    if (!alive.has(id)) { try { target.ws.close() } catch { /* ignore */ } targets.delete(id) }
  }
}

function pickTarget(url) {
  const list = [...targets.values()]
  if (list.length === 0) return null
  const exact = list.find((target) => target.url === url)
  if (exact) return exact
  const base = String(url).split('?')[0]
  const sameBase = list.find((target) => target.url.split('?')[0] === base)
  if (sameBase) return sameBase
  return list.reduce((best, target) => (target.ring.length > (best?.ring.length ?? -1) ? target : best), null)
}

async function dump({ dir, fromWall, toWall, keepGapMs = 300, url, keyWalls = [] }) {
  const target = pickTarget(url)
  if (!target) return { ok: true, frames: [], captured: 0, targets: targets.size, reason: 'no page attached' }
  const from = Number(fromWall), to = Number(toWall)
  const slack = 60
  const inRange = target.ring.filter((frame) => frame.wall >= from - slack && frame.wall <= to + slack)
  await mkdir(dir, { recursive: true })
  const selected = new Map()
  const keep = (index, reason) => {
    if (index < 0 || index >= inRange.length) return false
    if (!selected.has(index)) selected.set(index, new Set())
    selected.get(index).add(reason)
    return true
  }
  if (inRange.length) {
    keep(0, 'start')
    keep(inRange.length - 1, 'end')
  }
  let lastPeriodic = -Infinity
  for (let index = 0; index < inRange.length; index += 1) {
    if (inRange[index].wall - lastPeriodic >= keepGapMs) {
      keep(index, 'cadence')
      lastPeriodic = inRange[index].wall
    }
  }
  let keyframesMatched = 0
  for (const rawWall of keyWalls) {
    const wall = Number(rawWall)
    if (!Number.isFinite(wall)) continue
    let index = inRange.findIndex((frame) => frame.wall >= wall)
    if (index < 0) index = inRange.length - 1
    if (index >= 0 && Math.abs(inRange[index].wall - wall) <= Math.max(500, keepGapMs * 2)) {
      if (keep(index, 'event')) keyframesMatched += 1
    }
  }
  const kept = []
  const usedTimes = new Set()
  for (const index of [...selected.keys()].sort((a, b) => a - b)) {
    const frame = inRange[index]
    let t = Math.max(0, Math.round(frame.wall - from))
    while (usedTimes.has(t)) t += 1
    usedTimes.add(t)
    const file = `f-${String(t).padStart(6, '0')}.jpg`
    await writeFile(join(dir, file), frame.buf)
    kept.push({
      t,
      bytes: frame.buf.length,
      file: `frames/${file}`,
      wall: frame.wall,
      reasons: [...selected.get(index)],
    })
  }
  const rawGaps = inRange.slice(1).map((frame, index) => frame.wall - inRange[index].wall)
  return {
    ok: true,
    frames: kept,
    captured: inRange.length,
    droppedForDensity: Math.max(0, inRange.length - kept.length),
    requestedKeyframes: keyWalls.length,
    keyframesMatched,
    largestRawGapMs: rawGaps.length ? Math.round(Math.max(...rawGaps)) : null,
    target: target.url,
    targetId: target.id,
    targets: targets.size,
    cdpPort: CDP_PORT,
  }
}

async function handle(message) {
  switch (message.op) {
    case 'arm': {
      armed = Boolean(message.enabled)
      await discover()
      for (const target of targets.values()) { if (armed) await startCast(target); else await stopCast(target) }
      if (!armed) for (const target of targets.values()) { target.ring = []; target.bytes = 0 }
      return { ok: true, armed, targets: targets.size }
    }
    case 'status':
      return {
        ok: true, armed, cdpPort: CDP_PORT, urlPrefix: URL_PREFIX, windowMs: WINDOW_MS,
        targets: [...targets.values()].map((target) => ({ id: target.id, url: target.url, frames: target.ring.length, bytes: target.bytes, casting: target.casting })),
      }
    case 'dump':
      return dump(message)
    case 'quit':
      setTimeout(() => process.exit(0), 10)
      return { ok: true }
    default:
      return { ok: false, error: `unknown op ${message.op}` }
  }
}

const stdin = createInterface({ input: process.stdin })
stdin.on('line', (line) => {
  let message
  try { message = JSON.parse(line) } catch { return }
  Promise.resolve()
    .then(() => handle(message))
    .then((reply) => process.stdout.write(JSON.stringify({ id: message.id, ...reply }) + '\n'))
    .catch((error) => process.stdout.write(JSON.stringify({ id: message.id, ok: false, error: error.message }) + '\n'))
})
stdin.on('close', () => process.exit(0))

setInterval(() => { void discover() }, DISCOVER_MS).unref()
void discover()
