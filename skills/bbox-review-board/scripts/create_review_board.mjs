#!/usr/bin/env node
// skills/bbox-review-board/scripts/create_review_board.mjs
//
// Recipe -> a seeded, non-blank review board (.tldr) + a PNG, built by driving
// the REAL tldraw app in a headless browser, then cold-reopening the saved
// file through the app's own Open path and re-checking it.
//
//   node skills/bbox-review-board/scripts/create_review_board.mjs \
//     --recipe skills/bbox-review-board/assets/example-review-recipe.json \
//     --output apps/systemsketch/review/<feature-slug>.tldr
//
// Options: --screenshot PNG  --app apps/systemsketch  --url http://127.0.0.1:<port>/  --force
//
// WHY it exists (Zach, 2026-09-19): "please don't create a board that is blank,
// because then I have to myself build the changes to see them." A handoff that
// says "open the app" lands on an empty canvas. This puts the interaction on
// the canvas — real objects, numbered cue cards, orange arrows, a PASS WHEN
// card — before the handoff.
//
// WHY it drives the app instead of writing .tldr JSON by hand: the app
// registers custom shapes/bindings whose props are validated by tldraw's schema
// (`T.*`), and a hand-written record that drifts from it either fails to load
// or loads wrong. Authoring through `editor.createShapes` + the app's own cable
// constructor, then serializing with the app's own serializer, is the same
// stance the archived SystemSketch helper took (tldraw's serializer docs, and
// the r0b0tlab tldraw skill, say the same thing).
//
// The app is reached through FOUR seams (plus one soft one) and nothing else. If a lane moves one,
// this script fails naming it — update the seam here, do not work around it:
const SEAMS = {
  editorHandle: 'window.editor — <app>/src/main.tsx, set only under import.meta.env.DEV',
  serializeBoard: '/src/chrome/fileActions.ts  serializeBoard(editor) -> .tldr text',
  // Whichever of these the app has — the first is what the unmerged files lane
  // (claude/chrome-files-settings-2026-09-19) replaced the second with.
  loadBoard: '/src/chrome/fileActions.ts  loadBoardText(editor, text) -> {ok} (preferred)  |  openBoard(editor, helpers) -> file chooser (main, until that lane merges)',
  createWire: '/src/shapes/wire/createWire.ts  createWire(editor, {from,to,routing?,color?}) -> id | null',
  // SOFT — informational only, never fails a build if it moves:
  problems: '/src/document/sceneFromStore.ts sceneFromRecords + /src/chrome/problems.ts boardLintFindings -> what the Problems badge will show',
}
// These are imported through the dev server, so they are the SAME module
// instances the running app uses — not copies.
//
// Naming: the tldraw app is `apps/systemsketch` today and is being renamed
// `apps/bbox-tldraw`. Only `--app` (default below) names it; nothing else here
// does. React Flow: NOT IMPLEMENTED (see SKILL.md) — do not point this at it.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateRecipe } from './layout_quality.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')
const DEFAULT_APP = 'apps/systemsketch'
const MIN_CARD_TO_SUBJECT_GAP = 80

function usage() {
  return 'Usage: node create_review_board.mjs --recipe RECIPE.json --output BOARD.tldr [--screenshot BOARD.png] [--app apps/systemsketch] [--url http://127.0.0.1:PORT/] [--force]'
}

function parseArguments(argv) {
  const result = { force: false, app: DEFAULT_APP }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--force') result.force = true
    else if (['--recipe', '--output', '--screenshot', '--app', '--url'].includes(value)) {
      const next = argv[index + 1]
      if (!next) throw new Error(`${value} requires a value\n${usage()}`)
      result[value.slice(2)] = next
      index += 1
    } else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else throw new Error(`unknown argument: ${value}\n${usage()}`)
  }
  if (!result.recipe || !result.output) throw new Error(usage())
  return result
}

const log = (message) => process.stdout.write(`review board · ${message}\n`)

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function inside(path, parent) {
  const offset = relative(resolve(parent), resolve(path))
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset))
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  await writeFile(temporary, bytes)
  await rename(temporary, path)
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    // Port 0: the OS picks. This script never binds a fixed port, so it can
    // never collide with Zach's dev server (:4340) or his stable build (:4341).
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

async function startVite(appDir) {
  const candidates = [join(appDir, 'node_modules/.bin/vite'), join(REPO_ROOT, 'node_modules/.bin/vite')]
  let viteBin = null
  for (const candidate of candidates) if (await exists(candidate)) { viteBin = candidate; break }
  if (!viteBin) {
    throw new Error(`no vite binary under ${appDir}/node_modules — run: pnpm install --filter ${basename(appDir)}...`)
  }
  const port = await freePort()
  const child = spawn(viteBin, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: appDir,
    // WHY DISPLAY is blanked: a dev server's child processes must never be able
    // to open a real window on Zach's screen from an unattended run.
    env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '', BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group, so the whole vite tree (esbuild children included) can
    // be stopped by pid — never by a `pkill -f` pattern that could match us.
    detached: true,
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const url = `http://127.0.0.1:${port}/`
  const deadline = Date.now() + 90_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite exited early (${child.exitCode}):\n${output}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (response.ok) break
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`vite never came up on ${url}:\n${output}`)
    await new Promise((done) => setTimeout(done, 250))
  }
  const stop = () => {
    if (child.exitCode !== null || child.pid === undefined) return
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  }
  return { url, stop }
}

/** Pure: the ids the recipe promises will exist on the board. */
function expectedIds(recipe) {
  const shapeId = (id) => `shape:${id}`
  const ids = recipe.shapes.map((shape) => shapeId(shape.id))
  for (const callout of recipe.callouts) {
    ids.push(shapeId(`cue-${callout.id}`))
    if (callout.target) ids.push(shapeId(`cue-${callout.id}-arrow`))
  }
  return ids
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const recipePath = resolve(args.recipe)
  const outputPath = resolve(args.output)
  const appDir = resolve(REPO_ROOT, args.app)
  const screenshotPath = resolve(
    args.screenshot ?? join(REPO_ROOT, 'reports/media/review-boards', `${basename(outputPath, extname(outputPath))}.png`),
  )
  const personalBoards = join(homedir(), 'SystemSketch')

  if (extname(outputPath).toLowerCase() !== '.tldr') throw new Error('output must end in .tldr (the stock tldraw file format)')
  // WHY: the app autosaves into whatever board it has open, and ~/SystemSketch
  // is where Zach's real boards live. A generated fixture never goes there.
  if (inside(outputPath, personalBoards)) {
    throw new Error(`refusing to write a generated review board inside the personal board directory: ${personalBoards}`)
  }
  for (const path of [outputPath, screenshotPath]) {
    if (!args.force && await exists(path)) throw new Error(`${path} already exists; pass --force only to replace this review board intentionally`)
  }
  if (!(await exists(join(appDir, 'package.json')))) throw new Error(`--app ${args.app}: no package.json at ${appDir}`)

  const recipe = JSON.parse(await readFile(recipePath, 'utf8'))
  validateRecipe(recipe)
  const width = Math.max(900, Math.round(recipe.viewport?.width ?? 1280))
  const height = Math.max(700, Math.round(recipe.viewport?.height ?? 720))

  // playwright is the app's own devDependency (it drives the app's smoke tests),
  // so resolve it from the app, not from wherever this script happens to sit.
  const { chromium } = createRequire(join(appDir, 'package.json'))('playwright')

  let server = null
  let browser = null
  const scratch = await mkdtemp(join(tmpdir(), 'bbox-review-board-'))
  const consoleErrors = []
  const watch = (page, label) => {
    page.on('pageerror', (error) => consoleErrors.push(`${label} pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      // A missing favicon is the dev server's, not the board's.
      if (/favicon/i.test(text)) return
      consoleErrors.push(`${label} console: ${text}`)
    })
  }
  const cleanup = async () => {
    await browser?.close().catch(() => {})
    server?.stop()
    await rm(scratch, { recursive: true, force: true }).catch(() => {})
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)) })

  try {
    if (args.url) {
      server = { url: args.url.endsWith('/') ? args.url : `${args.url}/`, stop() {} }
      log(`attached to ${server.url} (not started by this script — left running)`)
    } else {
      server = await startVite(appDir)
      log(`app served on ${server.url}`)
    }
    browser = await chromium.launch({ headless: true })

    // ---------------------------------------------------------------- author
    const authoring = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const page = await authoring.newPage()
    watch(page, 'authoring')
    await page.goto(server.url)
    await page.waitForFunction(() => Boolean(window.editor), null, { timeout: 60_000 })
      .catch(() => { throw new Error(`seam missing — ${SEAMS.editorHandle}`) })
    await probeSeams(page)
    log('editor ready, seams present')

    const built = await page.evaluate(buildBoardInPage, { recipe })
    log(`${built.shapeCount} shapes on the board (${built.derived.length} derived by the app)`)

    // Every declared port has to be MEASURED before a cable can paint: the app
    // sights each dot once per layout and stores the reading on the shape.
    await page.waitForFunction((needs) => {
      const editor = window.editor
      return needs.every(({ id, ports }) => (editor.getShape(id)?.props?.anchors?.length ?? 0) >= ports)
    }, built.anchorNeeds, { timeout: 20_000 }).catch(() => {
      throw new Error('ports were never measured — is a seeded Block outside the viewport (tldraw culls what it cannot see)?')
    })

    const missing = expectedIds(recipe).filter((id) => !built.ids.includes(id))
    if (missing.length) throw new Error(`the editor did not create: ${missing.join(', ')}`)
    const boardText = await page.evaluate(async () => {
      const { serializeBoard } = await import('/src/chrome/fileActions.ts')
      return serializeBoard(window.editor)
    })
    const parsed = JSON.parse(boardText)
    if (typeof parsed.tldrawFileFormatVersion !== 'number' || !Array.isArray(parsed.records)) {
      throw new Error('serializeBoard did not return a stock .tldr document')
    }
    const candidatePath = join(scratch, basename(outputPath))
    await writeFile(candidatePath, boardText)
    log(`serialized ${parsed.records.length} records`)
    await authoring.close()

    // ------------------------------------------------------- cold reopen
    // A fresh context has an empty IndexedDB, so nothing carries over: what we
    // see is what the file alone reconstructs, through the product's real Open.
    const reopen = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const reopened = await reopen.newPage()
    watch(reopened, 'reopen')
    await reopened.goto(server.url)
    await reopened.waitForFunction(() => Boolean(window.editor), null, { timeout: 60_000 })
    const loader = await reopened.evaluate(async () => {
      const module = await import('/src/chrome/fileActions.ts')
      return typeof module.loadBoardText === 'function' ? 'loadBoardText' : 'openBoard'
    })
    if (loader === 'loadBoardText') {
      const result = await reopened.evaluate(async (text) => {
        const { loadBoardText } = await import('/src/chrome/fileActions.ts')
        return loadBoardText(window.editor, text)
      }, boardText)
      if (!result?.ok) throw new Error(`the saved board did not load through the app's loadBoardText: ${JSON.stringify(result)}`)
    } else {
      // The picker path: what a person does. Answer the file chooser with the
      // saved file. Deliberately not awaited in the page — openBoard resolves
      // only after the chooser is answered.
      const chooser = reopened.waitForEvent('filechooser', { timeout: 15_000 })
        .catch(() => { throw new Error(`the file chooser never opened — seam changed? ${SEAMS.loadBoard}`) })
      await reopened.evaluate(() => {
        window.__toasts = []
        void import('/src/chrome/fileActions.ts').then(({ openBoard }) => openBoard(window.editor, {
          addToast: (toast) => window.__toasts.push(toast),
          confirm: async () => true,
        }))
      })
      await (await chooser).setFiles(candidatePath)
    }
    await reopened.waitForFunction(
      (ids) => ids.every((id) => window.editor.getShape(id)),
      built.ids,
      { timeout: 20_000 },
    ).catch(async () => {
      const toasts = await reopened.evaluate(() => window.__toasts ?? [])
      throw new Error(`the saved board did not reopen through the app's ${loader}. toasts: ${JSON.stringify(toasts)}`)
    })
    const toasts = await reopened.evaluate(() => window.__toasts ?? [])
    if (toasts.some((toast) => toast.severity === 'error')) throw new Error(`Open reported an error: ${JSON.stringify(toasts)}`)
    log(`cold reopen through the app’s own ${loader}: ok`)

    const reopenedIds = await reopened.evaluate(() => window.editor.getCurrentPageShapes().map((shape) => shape.id).sort())
    const authoredIds = [...built.ids].sort()
    if (JSON.stringify(reopenedIds) !== JSON.stringify(authoredIds)) {
      throw new Error(`reopened board differs from the authored one:\n  authored ${authoredIds.length}, reopened ${reopenedIds.length}`)
    }

    const checks = await reopened.evaluate(verifyBoardInPage, { recipe, minGap: MIN_CARD_TO_SUBJECT_GAP })
    for (const failure of checks.failures) throw new Error(failure)
    log(`containment real · ${checks.wires} cable(s) painted · cue arrows on their edge, square · cards clear of the subject`)
    if (checks.problems?.length) log(`the Problems badge will read ${checks.problems.length}: ${checks.problems.map((problem) => problem.rule).join(', ')} — intended for this review?`)
    if (checks.freeTips) log(`${checks.freeTips} cue tip(s) are fixed points (the target refuses arrow bindings) — they will not follow a moved target`)

    await reopened.evaluate(() => {
      window.editor.selectNone()
      window.editor.zoomToFit({ animation: { duration: 0 } })
    })
    const framed = await reopened.evaluate(() => {
      const editor = window.editor
      const content = editor.getCurrentPageBounds()
      return { zoom: editor.getZoomLevel(), covered: Boolean(content && editor.getViewportPageBounds().contains(content)) }
    })
    if (!framed.covered) throw new Error(`the capture camera does not cover the whole board (zoom ${framed.zoom.toFixed(3)})`)
    await reopened.waitForTimeout(400)
    if (consoleErrors.length) throw new Error(`browser console errors:\n  ${consoleErrors.join('\n  ')}`)

    const capture = await reopened.screenshot({ type: 'png' })
    await atomicWrite(outputPath, boardText)
    await atomicWrite(screenshotPath, capture)
    process.stdout.write(`${JSON.stringify({
      feature: recipe.feature,
      board: outputPath,
      screenshot: screenshotPath,
      shapes: built.shapeCount,
      records: parsed.records.length,
      cables: checks.wires,
      derivedByApp: built.derived.length,
      boardBytes: (await stat(outputPath)).size,
      camera: `${Math.round(framed.zoom * 100)}%`,
      cueTips: { bound: checks.boundTips, fixed: checks.freeTips },
      problems: checks.problems,
      verified: 'cold-reopen · containment · painted cables · cue arrows attached + square · card clearance',
    }, null, 2)}\n`)
  } finally {
    await cleanup()
  }
}

/** Fail with the seam's name, not a stack trace from inside the page. */
async function probeSeams(page) {
  const problems = await page.evaluate(async () => {
    const found = []
    const need = async (path, names) => {
      try {
        const module = await import(/* @vite-ignore */ path)
        for (const name of names) if (typeof module[name] !== 'function') found.push(`${path} no longer exports ${name}()`)
      } catch (error) {
        found.push(`${path} could not be imported: ${error}`)
      }
    }
    await need('/src/chrome/fileActions.ts', ['serializeBoard'])
    try {
      const module = await import(/* @vite-ignore */ '/src/chrome/fileActions.ts')
      if (typeof module.loadBoardText !== 'function' && typeof module.openBoard !== 'function') {
        found.push('/src/chrome/fileActions.ts exports neither loadBoardText() nor openBoard()')
      }
    } catch { /* already reported by need() above */ }
    await need('/src/shapes/wire/createWire.ts', ['createWire'])
    return found
  })
  if (problems.length) {
    throw new Error(`a seam this script depends on moved:\n  ${problems.join('\n  ')}\nSeams:\n${Object.entries(SEAMS).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`)
  }
}

// ---------------------------------------------------------------------------
// Runs INSIDE the page. Self-contained: Playwright serializes it, so it may
// close over nothing from this module.
// ---------------------------------------------------------------------------
async function buildBoardInPage({ recipe }) {
  const editor = window.editor
  const { createWire } = await import('/src/shapes/wire/createWire.ts')
  const shapeId = (id) => (id.startsWith('shape:') ? id : `shape:${id}`)
  const bindingId = (id) => (id.startsWith('binding:') ? id : `binding:${id}`)
  const toRichText = (text) => ({
    type: 'doc',
    content: String(text).split('\n').map((line) => (line
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' })),
  })
  // `text` is shorthand for tldraw's rich text on the STOCK text-bearing shapes
  // only. The app's own shapes carry their names in their own props, and must
  // not have a stray `richText` injected into them.
  const RICH_TEXT_TYPES = new Set(['geo', 'text', 'note'])
  const normalizeShape = (shape) => {
    const { id, parentId, text, props = {}, ...rest } = shape
    const normalizedProps = { ...props }
    if (typeof text === 'string' && RICH_TEXT_TYPES.has(shape.type)) normalizedProps.richText = toRichText(text)
    return { ...rest, id: shapeId(id), ...(parentId ? { parentId: shapeId(parentId) } : {}), props: normalizedProps }
  }
  const depthOf = (shape, byId, seen = 0) => (shape.parentId && byId.has(shape.parentId) && seen < 32
    ? 1 + depthOf(byId.get(shape.parentId), byId, seen + 1)
    : 0)

  // WHY: the board must be exactly the recipe's evidence, not the recipe plus
  // whatever the app materialised on first load.
  const existing = editor.getCurrentPageShapes().map((shape) => shape.id)
  if (existing.length) editor.deleteShapes(existing)

  // Parents before children: createShapes needs a parent to exist already.
  const byId = new Map(recipe.shapes.map((shape) => [shape.id, shape]))
  const ordered = [...recipe.shapes].sort((a, b) => depthOf(a, byId) - depthOf(b, byId))
  editor.createShapes(ordered.map(normalizeShape))
  // tldraw culls what it cannot see, and a Block only measures its ports once it
  // has rendered — so fit the camera BEFORE waiting on anchors.
  editor.zoomToFit({ animation: { duration: 0 } })

  recipe.connections?.forEach((connection, index) => {
    const id = createWire(editor, {
      from: { nodeId: shapeId(connection.from.shape), portId: connection.from.port },
      to: { nodeId: shapeId(connection.to.shape), portId: connection.to.port },
      ...(connection.routing ? { routing: connection.routing } : {}),
      ...(connection.color ? { color: connection.color } : {}),
    })
    // createWire returns null when either end's ShapeUtil.canBind refuses. A
    // review board must show a REAL cable, so a refusal is a failed build.
    if (!id) throw new Error(`connections[${index}] (${connection.from.shape} -> ${connection.to.shape}) was refused: an end is not bindable`)
  })
  if (recipe.bindings?.length) {
    editor.createBindings(recipe.bindings.map((binding, index) => ({
      ...binding,
      id: bindingId(binding.id ?? `${binding.type}-${index + 1}`),
      fromId: shapeId(binding.fromId),
      toId: shapeId(binding.toId),
    })))
  }

  const colors = { step: 'orange', note: 'blue', pass: 'green' }
  editor.createShapes(recipe.callouts.map((callout) => ({
    id: shapeId(`cue-${callout.id}`),
    type: 'geo',
    x: callout.x,
    y: callout.y,
    props: {
      geo: 'rectangle', w: callout.w, h: callout.h,
      color: colors[callout.kind], labelColor: 'black', fill: 'semi', dash: 'draw',
      size: 'm', font: 'sans', align: 'start', verticalAlign: 'middle',
      richText: toRichText(callout.text),
    },
  })))

  const cueAnchorForTarget = (anchor) => (anchor === 'left' ? { x: 1, y: 0.5 }
    : anchor === 'right' ? { x: 0, y: 0.5 }
    : anchor === 'top' ? { x: 0.5, y: 1 }
    : { x: 0.5, y: 0 })
  const cuePointForTarget = (callout, anchor) => (anchor === 'left' ? { x: callout.x + callout.w, y: callout.y + callout.h / 2 }
    : anchor === 'right' ? { x: callout.x, y: callout.y + callout.h / 2 }
    : anchor === 'top' ? { x: callout.x + callout.w / 2, y: callout.y + callout.h }
    : { x: callout.x + callout.w / 2, y: callout.y })
  const arrowIds = []
  for (const callout of recipe.callouts.filter((item) => item.target)) {
    const target = callout.target
    const byShape = typeof target.shapeId === 'string'
    let point = { x: target.x, y: target.y }
    let bounds = null
    let normalizedAnchor = null
    if (byShape) {
      bounds = editor.getShapePageBounds(shapeId(target.shapeId))
      if (!bounds) throw new Error(`missing target bounds for ${target.shapeId}`)
      const edge = target.anchor === 'top' ? { x: bounds.midX, y: bounds.minY }
        : target.anchor === 'right' ? { x: bounds.maxX, y: bounds.midY }
        : target.anchor === 'bottom' ? { x: bounds.midX, y: bounds.maxY }
        : { x: bounds.minX, y: bounds.midY }
      point = { x: edge.x + (target.dx ?? 0), y: edge.y + (target.dy ?? 0) }
      normalizedAnchor = {
        x: Math.max(0, Math.min(1, (point.x - bounds.minX) / bounds.w)),
        y: Math.max(0, Math.min(1, (point.y - bounds.minY) / bounds.h)),
      }
      // The card must sit OUTSIDE the edge it names, or the arrow would have to
      // cross its own target to reach it.
      const center = { x: callout.x + callout.w / 2, y: callout.y + callout.h / 2 }
      const outside = target.anchor === 'left' ? center.x < bounds.minX
        : target.anchor === 'right' ? center.x > bounds.maxX
        : target.anchor === 'top' ? center.y < bounds.minY
        : center.y > bounds.maxY
      if (!outside) throw new Error(`cue ${callout.id} is not outside its target's ${target.anchor} edge`)
    }
    const cueAnchor = byShape ? cueAnchorForTarget(target.anchor) : (() => {
      const center = { x: callout.x + callout.w / 2, y: callout.y + callout.h / 2 }
      const dx = point.x - center.x
      const dy = point.y - center.y
      return Math.abs(dx) >= Math.abs(dy) ? { x: dx >= 0 ? 1 : 0, y: 0.5 } : { x: 0.5, y: dy >= 0 ? 1 : 0 }
    })()
    const start = byShape ? cuePointForTarget(callout, target.anchor)
      : { x: callout.x + callout.w * cueAnchor.x, y: callout.y + callout.h * cueAnchor.y }
    const id = shapeId(`cue-${callout.id}-arrow`)
    arrowIds.push(id)
    editor.createShape({
      id, type: 'arrow', x: start.x, y: start.y,
      props: {
        kind: 'elbow', start: { x: 0, y: 0 }, end: { x: point.x - start.x, y: point.y - start.y },
        color: 'orange', dash: 'draw', size: 'm', fill: 'none',
        arrowheadStart: 'none', arrowheadEnd: 'arrow', richText: toRichText(''),
      },
    })
    // Stock arrow bindings. The START always binds to the card. The END binds to
    // the target ONLY IF the target's ShapeUtil accepts an arrow binding.
    //
    // WHY that condition (measured 2026-09-19): the app's own shapes refuse it —
    // `BlockShapeUtil.canBind` answers true only for `ss-wire-binding` from an
    // `ss-wire` ("a block is a data endpoint... Nothing else binds") — and
    // `editor.createBindings` does NOT throw on a refused binding, it drops it
    // silently. The first version of this script bound the end anyway and got an
    // arrow that looked attached and did not follow (0 px when the Block moved
    // 64; a stock rectangle control followed 64). Do not "fix" that by making
    // blocks arrow-bindable: it is a deliberate product rule, and a decorative
    // cue must never be able to pass for a cable.
    // So a cue's tip is normally a FIXED page point on the target's named edge;
    // the verification below measures that it lands there and approaches square.
    const endBinds = byShape && editor.canBindShapes({
      fromShape: { type: 'arrow' }, toShape: editor.getShape(shapeId(target.shapeId)), binding: 'arrow',
    })
    const arrowBindings = [{
      id: bindingId(`cue-${callout.id}-arrow-start`), type: 'arrow', fromId: id,
      toId: shapeId(`cue-${callout.id}`),
      props: { terminal: 'start', normalizedAnchor: cueAnchor, isExact: false, isPrecise: true, snap: 'edge-point' },
    }]
    if (endBinds) {
      arrowBindings.push({
        id: bindingId(`cue-${callout.id}-arrow-end`), type: 'arrow', fromId: id,
        toId: shapeId(target.shapeId),
        props: { terminal: 'end', normalizedAnchor, isExact: false, isPrecise: true, snap: 'edge-point' },
      })
    }
    editor.createBindings(arrowBindings)
    // The guard the silent drop needs: what we asked for is what exists.
    const made = editor.getBindingsFromShape(id, 'arrow').length
    if (made !== arrowBindings.length) {
      throw new Error(`cue ${callout.id}: asked for ${arrowBindings.length} arrow binding(s), the editor kept ${made}`)
    }
  }
  if (arrowIds.length) editor.sendToBack(arrowIds)
  editor.selectNone()
  editor.zoomToFit({ animation: { duration: 0 } })

  const all = editor.getCurrentPageShapes()
  const promised = new Set([
    ...recipe.shapes.map((shape) => shapeId(shape.id)),
    ...recipe.callouts.flatMap((callout) => [shapeId(`cue-${callout.id}`), ...(callout.target ? [shapeId(`cue-${callout.id}-arrow`)] : [])]),
  ])
  const anchorNeeds = recipe.shapes.flatMap((shape) => {
    const ports = shape.props?.ports
    if (shape.type === 'ss-block' && ports) {
      const count = ['left', 'right', 'top', 'bottom'].reduce((sum, side) => sum + (ports[side]?.length ?? 0), 0)
      return count ? [{ id: shapeId(shape.id), ports: count }] : []
    }
    return []
  })
  return {
    shapeCount: all.length,
    ids: all.map((shape) => shape.id),
    // Shapes the recipe did not ask for: cables (by design) and anything the
    // app derives itself, such as a region's corner block.
    derived: all.filter((shape) => !promised.has(shape.id) && shape.type !== 'ss-wire').map((shape) => shape.id),
    anchorNeeds,
  }
}

async function verifyBoardInPage({ recipe, minGap }) {
  const editor = window.editor
  const failures = []
  const shapeId = (id) => (id.startsWith('shape:') ? id : `shape:${id}`)
  const shapes = editor.getCurrentPageShapes()

  // Containment is a TREE fact, not a geometric one. createShapes performs no
  // frame adoption, so a shape merely PLACED inside a frame/region/expanded
  // block is a sibling that overlaps: drag the container and it is left behind.
  // Every count and reopen check passes on such a board — this is the one that
  // catches it (the archived skill shipped exactly this bug on 2026-09-03).
  const containers = shapes.filter((shape) => shape.type === 'frame' || editor.getShapeUtil(shape).isFrameLike?.(shape))
  for (const shape of shapes) {
    if (shape.type === 'ss-wire' || shape.type === 'arrow') continue
    const box = editor.getShapePageBounds(shape)
    if (!box) continue
    for (const container of containers) {
      if (container.id === shape.id) continue
      const containerBox = editor.getShapePageBounds(container)
      if (!containerBox || !containerBox.contains(box)) continue
      if (!editor.getShapeAncestors(shape).some((ancestor) => ancestor.id === container.id)) {
        failures.push(`${shape.type} ${shape.id} sits inside ${container.id} but is not its child — give it parentId in the recipe (its x/y then become parent-local), or move it clear`)
      }
    }
  }

  // Cables: one shape + two bindings each, and actually painted.
  const wires = shapes.filter((shape) => shape.type === 'ss-wire')
  if (wires.length !== (recipe.connections?.length ?? 0)) {
    failures.push(`expected ${recipe.connections?.length ?? 0} cable(s), the board has ${wires.length}`)
  }
  for (const wire of wires) {
    const bindings = editor.getBindingsFromShape(wire.id, 'ss-wire-binding')
    if (bindings.length !== 2) failures.push(`cable ${wire.id} has ${bindings.length} bindings, expected 2`)
    const line = document.querySelector(`[data-shape-id="${wire.id}"] [data-slot="trace-line"]`)
    if (!line || line.getTotalLength() < 20) failures.push(`cable ${wire.id} is on the board but was never painted`)
  }

  // Cue cards must not sit on the thing being reviewed, and must leave room to
  // reach it. Measured from the REAL bounds — only a running editor knows them.
  const cueIds = new Set(recipe.callouts.flatMap((callout) => [shapeId(`cue-${callout.id}`), shapeId(`cue-${callout.id}-arrow`)]))
  const gap = (a, b) => Math.hypot(
    Math.max(a.minX - b.maxX, b.minX - a.maxX, 0),
    Math.max(a.minY - b.maxY, b.minY - a.maxY, 0),
  )
  for (const callout of recipe.callouts) {
    const card = editor.getShapePageBounds(shapeId(`cue-${callout.id}`))
    for (const subject of shapes) {
      if (cueIds.has(subject.id) || subject.type === 'ss-wire') continue
      const box = editor.getShapePageBounds(subject)
      if (!box) continue
      const distance = gap(card, box)
      if (distance < minGap) {
        failures.push(`cue ${callout.id} is only ${Math.round(distance)} canvas units from ${subject.type} ${subject.id}; keep at least ${minGap}`)
      }
    }
  }

  // Every cue arrow: attached to its card, tip on the named edge point of its
  // target, and its LAST segment square to that edge. Read from the arrow's own
  // painted geometry (page space), never from x/y props — an arrow whose props
  // say one thing and whose path says another is exactly how a cue that looks
  // attached and is not gets through.
  let freeTips = 0
  let boundTips = 0
  for (const callout of recipe.callouts.filter((item) => item.target)) {
    const arrowId = shapeId(`cue-${callout.id}-arrow`)
    const arrowBindings = editor.getBindingsFromShape(arrowId, 'arrow')
    const start = arrowBindings.find((binding) => binding.props.terminal === 'start')
    if (start?.toId !== shapeId(`cue-${callout.id}`)) {
      failures.push(`cue ${callout.id}: the arrow is not bound to its card`)
      continue
    }
    if (typeof callout.target.shapeId !== 'string') continue
    const targetId = shapeId(callout.target.shapeId)
    const box = editor.getShapePageBounds(targetId)
    const arrow = editor.getShape(arrowId)
    const body = editor.getShapeGeometry(arrow).children?.[0]
    const transform = editor.getShapePageTransform(arrowId)
    const path = (body?.vertices ?? []).map((vertex) => transform.applyToPoint(vertex))
    if (path.length < 2) {
      failures.push(`cue ${callout.id}: could not read the arrow's painted path`)
      continue
    }
    const edge = callout.target.anchor
    const want = edge === 'top' ? { x: box.midX, y: box.minY }
      : edge === 'right' ? { x: box.maxX, y: box.midY }
      : edge === 'bottom' ? { x: box.midX, y: box.maxY }
      : { x: box.minX, y: box.midY }
    want.x += callout.target.dx ?? 0
    want.y += callout.target.dy ?? 0
    const tip = path[path.length - 1]
    const before = path[path.length - 2]
    if (Math.hypot(tip.x - want.x, tip.y - want.y) > 1.5) {
      failures.push(`cue ${callout.id}: the arrow tip is at (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}), not on the ${edge} edge point (${want.x.toFixed(1)}, ${want.y.toFixed(1)})`)
    }
    const horizontal = Math.abs(tip.y - before.y) < 0.5
    const vertical = Math.abs(tip.x - before.x) < 0.5
    const square = edge === 'left' || edge === 'right' ? horizontal : vertical
    if (!square) failures.push(`cue ${callout.id}: the arrow's last segment is not perpendicular to the ${edge} edge it names`)

    if (arrowBindings.some((binding) => binding.props.terminal === 'end')) {
      // Bound tip: prove it follows. Move the target, read the tip, put it back.
      boundTips += 1
      const target = editor.getShape(targetId)
      const tipNow = () => {
        const shape = editor.getShape(arrowId)
        const handle = editor.getShapeHandles(shape)?.find((item) => item.id === 'end')
        return editor.getShapePageTransform(arrowId).applyToPoint(handle)
      }
      const first = tipNow()
      try {
        editor.updateShape({ id: target.id, type: target.type, x: target.x + 64 })
        const moved = tipNow()
        if (Math.abs(moved.x - first.x - 64) > 1 || Math.abs(moved.y - first.y) > 1) {
          failures.push(`cue ${callout.id} is bound to its target but did not follow it`)
        }
      } finally {
        editor.updateShape({ id: target.id, type: target.type, x: target.x })
      }
    } else {
      freeTips += 1
    }
  }
  // What the Problems badge (bottom-right) will show on this board. Soft: a
  // fixture about duplicate or fan-in cables SHOULD show one, and one about
  // anything else should not — so the author gets told, and decides.
  let problems = null
  try {
    const { sceneFromRecords } = await import('/src/document/sceneFromStore.ts')
    const { boardLintFindings } = await import('/src/chrome/problems.ts')
    problems = boardLintFindings(sceneFromRecords(editor.store.allRecords()))
      .map((finding) => ({ rule: finding.ruleId, severity: finding.severity, message: finding.message }))
  } catch { /* soft seam moved; not a reason to fail a board */ }
  return { failures, wires: wires.length, freeTips, boundTips, problems }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
