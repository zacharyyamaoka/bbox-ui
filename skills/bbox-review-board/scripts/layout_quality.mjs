// skills/bbox-review-board/scripts/layout_quality.mjs — the recipe validator.
//
// Host-neutral on purpose: it reads a recipe's JSON and never touches an
// editor, so the same rules hold whether the board is later built in tldraw or
// (still TBD) React Flow. Everything that needs REAL measured bounds — a card
// overlapping a shape, an arrow that is not perpendicular to its edge — lives in
// the generator, because only a running editor knows how big a Block actually is.
//
// Ported from the archived SystemSketch skill (skills/systemsketch-review-fixture
// in /home/bam/systemsketch, read-only). Two changes: `bindings` is no longer
// mandatory-shaped, and `connections` (a cable between two seeded objects) is
// validated here because the new app builds cables through its own constructor,
// not through raw bindings.

export const EDGE_ANCHORS = new Set(['top', 'right', 'bottom', 'left'])
export const MIN_CALLOUT_GAP = 48
export const MIN_SAME_EDGE_TARGET_GAP = 48

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
}

function localId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    throw new Error(`${label} must use letters, digits, underscores, or hyphens`)
  }
}

export function rectangleGap(first, second) {
  const x = Math.max(first.x - (second.x + second.w), second.x - (first.x + first.w), 0)
  const y = Math.max(first.y - (second.y + second.h), second.y - (first.y + first.h), 0)
  return Math.hypot(x, y)
}

export function estimatedWrappedLines(text, width) {
  const charactersPerLine = Math.max(16, Math.floor((width - 44) / 10))
  let lines = 0
  for (const paragraph of text.split('\n')) {
    let used = 0
    lines += 1
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const length = Math.min(word.length, charactersPerLine)
      if (used === 0) used = length
      else if (used + 1 + length <= charactersPerLine) used += 1 + length
      else {
        lines += 1
        used = length
      }
    }
  }
  return lines
}

function validateConnections(recipe, shapeIds) {
  if (recipe.connections === undefined) return
  if (!Array.isArray(recipe.connections)) throw new Error('recipe.connections must be an array when present')
  for (const [index, connection] of recipe.connections.entries()) {
    if (!isRecord(connection)) throw new Error(`connections[${index}] must be an object`)
    for (const end of ['from', 'to']) {
      const side = connection[end]
      if (!isRecord(side)) throw new Error(`connections[${index}].${end} must be {shape, port}`)
      if (!shapeIds.has(side.shape)) throw new Error(`connections[${index}].${end}.shape names unknown shape: ${side.shape}`)
      if (typeof side.port !== 'string' || !side.port) {
        throw new Error(`connections[${index}].${end}.port is required (a floating port speaks the port id "port")`)
      }
    }
  }
}

export function validateRecipe(recipe) {
  if (!isRecord(recipe)) throw new Error('recipe must be a JSON object')
  if (typeof recipe.feature !== 'string' || !recipe.feature.trim()) throw new Error('recipe.feature is required')
  if (!Array.isArray(recipe.shapes) || recipe.shapes.length === 0) {
    throw new Error('recipe.shapes must contain at least one real interaction target — a review board is never blank')
  }
  if (!Array.isArray(recipe.callouts) || recipe.callouts.length === 0) {
    throw new Error('recipe.callouts must contain at least one numbered instruction')
  }
  if (recipe.bindings !== undefined && !Array.isArray(recipe.bindings)) {
    throw new Error('recipe.bindings must be an array when present')
  }
  const ids = new Set()
  const shapeIds = new Set()
  for (const [index, shape] of recipe.shapes.entries()) {
    if (!isRecord(shape)) throw new Error(`shapes[${index}] must be an object`)
    localId(shape.id, `shapes[${index}].id`)
    if (ids.has(shape.id)) throw new Error(`duplicate local id: ${shape.id}`)
    ids.add(shape.id)
    shapeIds.add(shape.id)
    if (typeof shape.type !== 'string' || !shape.type) throw new Error(`shapes[${index}].type is required`)
    finite(shape.x ?? 0, `shapes[${index}].x`)
    finite(shape.y ?? 0, `shapes[${index}].y`)
  }
  validateConnections(recipe, shapeIds)
  let targetedStep = false
  let passCard = false
  for (const [index, callout] of recipe.callouts.entries()) {
    if (!isRecord(callout)) throw new Error(`callouts[${index}] must be an object`)
    localId(callout.id, `callouts[${index}].id`)
    if (ids.has(`cue-${callout.id}`)) throw new Error(`duplicate callout id: ${callout.id}`)
    ids.add(`cue-${callout.id}`)
    if (!['step', 'note', 'pass'].includes(callout.kind)) {
      throw new Error(`callouts[${index}].kind must be step, note, or pass`)
    }
    if (typeof callout.text !== 'string' || !callout.text.trim()) {
      throw new Error(`callouts[${index}].text is required`)
    }
    for (const key of ['x', 'y', 'w', 'h']) finite(callout[key], `callouts[${index}].${key}`)
    if (callout.w < 340 || callout.h < 100) {
      throw new Error(`callouts[${index}] must be at least 340×100 canvas units for readable review text`)
    }
    const textLines = estimatedWrappedLines(callout.text, callout.w)
    const availableLines = Math.max(1, Math.floor((callout.h - 34) / 24))
    if (textLines > availableLines) {
      throw new Error(`callouts[${index}] needs about ${textLines} text lines but its height fits ${availableLines}; enlarge or shorten the card`)
    }
    if (callout.target !== undefined) {
      if (!isRecord(callout.target)) throw new Error(`callouts[${index}].target must be an object`)
      if (typeof callout.target.shapeId === 'string') {
        if (!shapeIds.has(callout.target.shapeId)) throw new Error(`unknown target shape: ${callout.target.shapeId}`)
        if (!EDGE_ANCHORS.has(callout.target.anchor)) {
          throw new Error(`callouts[${index}].target.anchor must name a target edge: top, right, bottom, or left`)
        }
        if ((callout.target.anchor === 'left' || callout.target.anchor === 'right')
          && (callout.target.dx ?? 0) !== 0) {
          throw new Error(`callouts[${index}].target.dx would pull the endpoint off the ${callout.target.anchor} edge; use dy to choose a point along it`)
        }
        if ((callout.target.anchor === 'top' || callout.target.anchor === 'bottom')
          && (callout.target.dy ?? 0) !== 0) {
          throw new Error(`callouts[${index}].target.dy would pull the endpoint off the ${callout.target.anchor} edge; use dx to choose a point along it`)
        }
      } else {
        finite(callout.target.x, `callouts[${index}].target.x`)
        finite(callout.target.y, `callouts[${index}].target.y`)
      }
      if (callout.kind === 'step') targetedStep = true
    }
    if (callout.kind === 'pass') passCard = true
  }
  for (let firstIndex = 0; firstIndex < recipe.callouts.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < recipe.callouts.length; secondIndex += 1) {
      const gap = rectangleGap(recipe.callouts[firstIndex], recipe.callouts[secondIndex])
      if (gap < MIN_CALLOUT_GAP) {
        throw new Error(`callouts[${firstIndex}] and callouts[${secondIndex}] have only ${Math.round(gap)} canvas units between them; leave at least ${MIN_CALLOUT_GAP}`)
      }
      const firstTarget = recipe.callouts[firstIndex].target
      const secondTarget = recipe.callouts[secondIndex].target
      if (typeof firstTarget?.shapeId === 'string'
        && firstTarget.shapeId === secondTarget?.shapeId
        && firstTarget.anchor === secondTarget.anchor) {
        const firstOffset = firstTarget.anchor === 'left' || firstTarget.anchor === 'right'
          ? firstTarget.dy ?? 0
          : firstTarget.dx ?? 0
        const secondOffset = secondTarget.anchor === 'left' || secondTarget.anchor === 'right'
          ? secondTarget.dy ?? 0
          : secondTarget.dx ?? 0
        const targetGap = Math.abs(firstOffset - secondOffset)
        if (targetGap < MIN_SAME_EDGE_TARGET_GAP) {
          throw new Error(`callouts[${firstIndex}] and callouts[${secondIndex}] target the same ${firstTarget.anchor} edge only ${Math.round(targetGap)} canvas units apart; separate their edge lanes by at least ${MIN_SAME_EDGE_TARGET_GAP}`)
        }
      }
    }
  }
  if (!targetedStep) throw new Error('at least one step callout must point at its interaction target')
  if (!passCard) throw new Error('add a pass callout with the visible success condition')
  if (recipe.viewport !== undefined) {
    if (!isRecord(recipe.viewport)) throw new Error('recipe.viewport must be an object')
    finite(recipe.viewport.width, 'recipe.viewport.width')
    finite(recipe.viewport.height, 'recipe.viewport.height')
  }
}
