// Run: node --test skills/bbox-review-board/scripts/*.test.mjs
//
// node:test, not vitest, because a skill's scripts must run with no framework:
// neither bbox-ui's root nor an agent's fresh worktree is guaranteed to have
// one installed, and the generator itself only needs Node + the app's own deps.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MIN_CALLOUT_GAP,
  MIN_SAME_EDGE_TARGET_GAP,
  estimatedWrappedLines,
  rectangleGap,
  validateRecipe,
} from './layout_quality.mjs'

function recipe() {
  return {
    feature: 'Layout validation',
    viewport: { width: 1280, height: 720 },
    shapes: [
      { id: 'subject', type: 'ss-block', x: 600, y: 260 },
      { id: 'other', type: 'ss-block', x: 900, y: 260 },
    ],
    connections: [{ from: { shape: 'subject', port: 'out' }, to: { shape: 'other', port: 'in' } }],
    callouts: [
      {
        id: 'step-1', kind: 'step', text: '1 · Drag the Block right',
        x: 40, y: 120, w: 360, h: 110,
        target: { shapeId: 'subject', anchor: 'left' },
      },
      {
        id: 'pass', kind: 'pass', text: 'PASS WHEN · The Block moves',
        x: 40, y: 310, w: 440, h: 110,
      },
    ],
  }
}

describe('review board recipe validation', () => {
  it('accepts a spaced recipe with an explicit target edge and a cable', () => {
    assert.doesNotThrow(() => validateRecipe(recipe()))
  })

  it('refuses a blank board — the whole point of the skill', () => {
    const candidate = recipe()
    candidate.shapes = []
    assert.throws(() => validateRecipe(candidate), /never blank/)
  })

  it('rejects a cable that names a shape the recipe does not seed', () => {
    const candidate = recipe()
    candidate.connections[0].to.shape = 'ghost'
    assert.throws(() => validateRecipe(candidate), /unknown shape: ghost/)
  })

  it('rejects a cable end with no port', () => {
    const candidate = recipe()
    delete candidate.connections[0].from.port
    assert.throws(() => validateRecipe(candidate), /port is required/)
  })

  it('rejects ambiguous center targets', () => {
    const candidate = recipe()
    candidate.callouts[0].target.anchor = 'center'
    assert.throws(() => validateRecipe(candidate), /must name a target edge/)
  })

  it('rejects offsets that pull an endpoint away from its edge', () => {
    const candidate = recipe()
    candidate.callouts[0].target.dx = 12
    assert.throws(() => validateRecipe(candidate), /pull the endpoint off the left edge/)
  })

  it('rejects flush or overlapping cards', () => {
    const candidate = recipe()
    candidate.callouts[1].y = candidate.callouts[0].y + candidate.callouts[0].h + MIN_CALLOUT_GAP - 1
    assert.throws(() => validateRecipe(candidate), /leave at least 48/)
  })

  it('rejects converging arrow lanes on the same target edge', () => {
    const candidate = recipe()
    candidate.callouts.splice(1, 0, {
      id: 'step-2', kind: 'step', text: '2 · Use the second edge control',
      x: 40, y: 310, w: 360, h: 110,
      target: { shapeId: 'subject', anchor: 'left', dy: MIN_SAME_EDGE_TARGET_GAP - 1 },
    })
    candidate.callouts[2].y = 500
    assert.throws(() => validateRecipe(candidate), /separate their edge lanes by at least 48/)
  })

  it('rejects text that is likely to clip', () => {
    const candidate = recipe()
    candidate.callouts[0].text = Array(45).fill('unnecessarily-dense').join(' ')
    assert.throws(() => validateRecipe(candidate), /enlarge or shorten/)
  })

  it('requires a pass card and at least one targeted step', () => {
    const noPass = recipe()
    noPass.callouts.pop()
    assert.throws(() => validateRecipe(noPass), /pass callout/)
    const noTarget = recipe()
    delete noTarget.callouts[0].target
    assert.throws(() => validateRecipe(noTarget), /point at its interaction target/)
  })

  it('measures whitespace and estimated wrapping independently', () => {
    assert.equal(rectangleGap({ x: 0, y: 0, w: 100, h: 100 }, { x: 160, y: 0, w: 100, h: 100 }), 60)
    assert.ok(estimatedWrappedLines('one two three four five six', 340) >= 1)
  })
})
