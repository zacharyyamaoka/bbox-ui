// Build the proposal's evidence: a fixture scene through the REAL SystemSketch editor,
// then 21 crops of it, driven headlessly.  Every capture in the report comes from here.
//
//   node docs/capture_proposal_shots.mjs
//
// WHY a fixture rather than Zach's board: the app autosaves into whatever board it opens.
// WHY a zoom clamp: zoomToBounds on a 320px block in a 1600px viewport lands at 400%+, which
// ellipsizes every header and makes the capture a picture of truncation rather than of layout.
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startApp, openApp, waitFor, evaluate, delay } from '/home/bam/systemsketch/tests/browser_harness.mjs'

const OUT = '/home/bam/bbox-ui/reports/media/component-proposal'

const BUILD = `(() => {
  const e = window.__systemsketch.editor
  const failed = []
  const mk = (id, type, x, y, props) => {
    try {
      e.createShape({ id: 'shape:' + id, type, x, y })
      if (props) e.updateShape({ id: 'shape:' + id, type, props })
    } catch (err) { failed.push(id + ':' + type + ' — ' + String(err && err.message).slice(0, 90)) }
    return 'shape:' + id
  }
  const P = (id, name, type, extra) => Object.assign({ id, name, type, visible: true }, extra || {})
  const SZ = (w, h) => ({ simple: { w, h }, port: { w, h }, expanded: { w, h }, value: { w, h } })

  // --- A: simple-view ladder -------------------------------------------
  mk('a1','block',0,0,{ view:'simple', w:380, h:190, title:'Detect', description:'', blockType:'', showDescription:false, views:SZ(380,190) })
  mk('a2','block',430,0,{ view:'simple', w:380, h:190, title:'Detect', description:'', blockType:'component', showDescription:false, views:SZ(380,190) })
  mk('a3','block',860,0,{ view:'simple', w:380, h:190, title:'Detect', description:'blackbox modelling', blockType:'component', showDescription:true, views:SZ(380,190) })
  mk('a4','block',1290,0,{ view:'simple', w:380, h:190, title:'Detect', description:'blackbox modelling', blockType:'component', icon:'Search', showDescription:true, views:SZ(380,190) })

  // --- B: port view ----------------------------------------------------
  const ins = [P('i1','image','Image'), P('i2','threshold','float'), P('i3','model','Model')]
  const outs = [P('o1','boxes','list[Box]'), P('o2','scores','list[float]')]
  mk('b1','block',0,300,{ view:'port', w:440, h:240, title:'Detect', blockType:'component', portLayout:'inline', inputs:ins, outputs:outs, views:SZ(440,240) })
  mk('b2','block',500,300,{ view:'port', w:440, h:240, title:'Detect', blockType:'component', portLayout:'offset', inputs:ins, outputs:outs, views:SZ(440,240) })
  mk('b3','block',1000,300,{ view:'port', w:440, h:240, title:'Detect', blockType:'component', portLayout:'inline',
      inputs:[P('i1','image','Image'), P('i2','threshold','float',{visible:false}), P('i3','model','Model',{visible:false}), P('i4','seed','int',{visible:false})],
      outputs:outs, views:SZ(440,240) })
  mk('b4','block',1500,300,{ view:'port', w:440, h:240, title:'Detect', blockType:'component', foldable:true, folded:true, inputs:ins, outputs:outs, views:SZ(440,240) })

  // --- C: header size rungs -------------------------------------------
  const sizes = ['s','m','l','xl']
  sizes.forEach((s, i) => mk('c'+i,'block', i*470, 620, { view:'port', w:420, h:150, title:'Title', blockType:'Type', titleSize:s, inputs:[P('i1','x','int')], outputs:[], views:SZ(420,150) }))

  // --- D: visibility ---------------------------------------------------
  mk('d1','block',0,820,{ view:'port', w:380, h:200, title:'No header line', blockType:'component', showHeaderDivider:false, inputs:ins, outputs:[], views:SZ(380,200) })
  mk('d2','block',430,820,{ view:'port', w:380, h:200, title:'No footer', blockType:'component', showFooter:false, inputs:ins, outputs:[], views:SZ(380,200) })
  mk('d3','block',860,820,{ view:'port', w:380, h:200, title:'Centered', blockType:'component', headerAlign:'center', inputs:ins, outputs:[], views:SZ(380,200) })

  // --- E: members (stack vs free) --------------------------------------
  const eStack = mk('e1','block',0,1100,{ view:'expanded', w:420, h:420, title:'Pipeline', blockType:'system', bodyLayout:'stack', memberGap:10, memberGutter:14, memberWidth:'fill', views:SZ(420,420) })
  const eFree  = mk('e2','block',520,1100,{ view:'expanded', w:420, h:420, title:'Pipeline', blockType:'system', bodyLayout:'free', views:SZ(420,420) })
  ;[['m1','Grab',0],['m2','Detect',1],['m3','Track',2]].forEach(([id,t,i]) => {
    mk(id,'block',30,1180+i*100,{ view:'simple', w:200, h:80, title:t, blockType:'component', showDescription:false, views:SZ(200,80) })
    e.reparentShapes(['shape:'+id], eStack)
  })
  ;[['n1','Grab',20,30],['n2','Detect',180,140],['n3','Track',40,250]].forEach(([id,t,dx,dy]) => {
    mk(id,'block',520+dx,1100+dy,{ view:'simple', w:180, h:70, title:t, blockType:'component', showDescription:false, views:SZ(180,70) })
    e.reparentShapes(['shape:'+id], eFree)
  })

  // --- F: primitives ---------------------------------------------------
  mk('f1','block',0,1620,{ view:'value', w:180, h:60, title:'0.85', blockType:'float', views:SZ(180,60) })
  mk('f2','block',240,1620,{ view:'value', w:220, h:60, title:'"frames/*.png"', blockType:'str', views:SZ(220,60) })
  ;[0,1,2,3].forEach(i => mk('fp'+i,'floating-port', 540 + i*90, 1630))
  mk('ic','systemsketch-icon', 940, 1620)
  mk('cd','code', 1060, 1600)

  // --- G: regions ------------------------------------------------------
  mk('g1','branch', 0, 1820)
  mk('g2','loop', 640, 1820)
  mk('g3','behaviorTree', 1280, 1820)

  // --- H: edge ---------------------------------------------------------
  const h1 = mk('h1','block',0,2400,{ view:'port', w:280, h:160, title:'Source', blockType:'component', inputs:[], outputs:[P('o1','events','Event')], views:SZ(280,160) })
  const h2 = mk('h2','block',480,2400,{ view:'port', w:280, h:160, title:'Sink', blockType:'component', inputs:[P('i1','events','Event')], outputs:[], views:SZ(280,160) })

  // a stock geo + a real cable with its two bindings
  mk('rect','geo', 900, 2400, { w: 240, h: 140 })
  try {
    e.createShape({ id: 'shape:cable', type: 'connection', x: 0, y: 0, props: { temporal: 'data', routing: 'elbow' } })
    e.createBindings([
      { type: 'connection', fromId: 'shape:cable', toId: h1, props: { portId: 'o1', terminal: 'start' } },
      { type: 'connection', fromId: 'shape:cable', toId: h2, props: { portId: 'i1', terminal: 'end' } },
    ])
  } catch (err) { failed.push('cable — ' + String(err && err.message).slice(0, 120)) }

  return JSON.stringify({ shapes: e.getCurrentPageShapes().length, utils: Object.keys(e.shapeUtils).sort(), failed })
})()`

const CROPS = [
  ['01-simple-ladder', ['a1','a2','a3','a4']],
  ['02-simple-icon', ['a4']],
  ['03-port-inline', ['b1']],
  ['04-port-offset', ['b2']],
  ['05-hidden-ports', ['b3']],
  ['06-folded', ['b4']],
  ['07-header-sizes', ['c0','c1','c2','c3']],
  ['08-visibility', ['d1','d2','d3']],
  ['09-members-stack', ['e1']],
  ['10-members-free', ['e2']],
  ['11-value-pill', ['f1','f2']],
  ['12-floating-ports', ['fp0','fp1','fp2','fp3']],
  ['13-icon-primitive', ['ic']],
  ['14-code-block', ['cd']],
  ['15-branch-region', ['g1']],
  ['16-loop-region', ['g2']],
  ['17-behaviour-tree', ['g3']],
  ['18-edge', ['h1','h2']],
]

const app = await startApp({ label: 'bbox-proposal', width: 1600, height: 1000 })
try {
  const { page, port, filesRoot } = app
  const board = join(filesRoot, 'SystemSketch', 'bbox-proposal.systemsketch')
  await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
  await copyFile('/home/bam/bbox-ui/.claude/worktrees/component-proposal/docs/empty.systemsketch', board)
  await openApp(page, port, `?board=${encodeURIComponent(board)}`)
  await waitFor(page, `window.__systemsketch?.editor`, 'editor', 30000)
  await delay(600)
  const n = await evaluate(page, BUILD)
  console.log('built shapes:', JSON.stringify(n))
  await delay(1200)
  await mkdir(OUT, { recursive: true })
  for (const [name, ids] of CROPS) {
    const ok = await evaluate(page, `(() => {
      const e = window.__systemsketch.editor
      const ids = ${JSON.stringify(ids.map(i => 'shape:' + i))}
      const bs = ids.map(id => e.getShapePageBounds(id)).filter(Boolean)
      if (!bs.length) return 'missing'
      const minX = Math.min(...bs.map(b => b.minX)), minY = Math.min(...bs.map(b => b.minY))
      const maxX = Math.max(...bs.map(b => b.maxX)), maxY = Math.max(...bs.map(b => b.maxY))
      e.selectNone()
      e.zoomToBounds({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, { inset: 40, animation: { duration: 0 } })
      const cam = e.getCamera()
      if (cam.z > 1.7) {
        const vb = e.getViewportScreenBounds(), z = 1.7
        e.setCamera({ z, x: -(minX + (maxX - minX) / 2) + vb.w / (2 * z), y: -(minY + (maxY - minY) / 2) + vb.h / (2 * z) })
      }
      return 'ok'
    })()`)
    await delay(700)
    if (String(ok).includes('missing')) { console.log('MISSING', name, ids.join(',')); continue }
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))
    console.log('shot', name)
  }
  // UI captures: style menu + inspector on a selected block
  await evaluate(page, `(() => { const e = window.__systemsketch.editor; e.select('shape:b1'); e.zoomToBounds(e.getShapePageBounds('shape:b1'), { inset: 220, animation: { duration: 0 } }); return 1 })()`)
  await delay(1000)
  let shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(OUT, '19-selected-chrome.png'), Buffer.from(shot.data, 'base64'))
  console.log('shot 19-selected-chrome')
  // 20: appearance / line-fill controls on a connection
  await evaluate(page, `(() => { const e = window.__systemsketch.editor; e.setCurrentTool('select'); const c = e.getCurrentPageShapes().find(s => s.type === 'connection'); if (!c) return 'none'; e.select(c.id); const b = e.getShapePageBounds(c.id); if (b) e.zoomToBounds(b, { inset: 300, animation: { duration: 0 } }); return 'connection' })()`)
  await delay(900)
  shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(OUT, '20-appearance-menu.png'), Buffer.from(shot.data, 'base64'))
  console.log('shot 20-appearance-menu')
  // 21: stock geo selected -> primitive style controls
  await evaluate(page, `(() => { const e = window.__systemsketch.editor; e.setCurrentTool('select'); const g = e.getCurrentPageShapes().find(s => s.type === 'geo'); if (!g) return 'none'; e.select(g.id); e.zoomToBounds(e.getShapePageBounds(g.id), { inset: 300, animation: { duration: 0 } }); return 'geo' })()`)
  await delay(900)
  shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(OUT, '21-stock-style.png'), Buffer.from(shot.data, 'base64'))
  console.log('shot 21-stock-style')
  await writeFile(join(OUT, '_meta.json'), JSON.stringify({ shapes: n }, null, 2))
} finally { app.close() }
