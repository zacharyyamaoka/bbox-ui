#!/usr/bin/env python3
"""
Anchor-space port layout — Zach's idea, worked out.

Zach, 2026-09-18: "I do wonder if there's a way to make our port layout a bit
more general and robust where you can kind of set any anchor points for the
cards you want and then you kind of reorganize them… we have kind of the port
layout things which support arbitrary layouts and then DND kit basically just
allows us to kind of like modify the data structure."

That last clause is the whole design. This page works it out, and the demo is
the argument: one drag implementation, four completely different layouts, and
the only thing the drag writes is the order array.

    python3 docs/build_anchor_layout_report.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import idea_diagrams as D          # noqa: E402
import report_feedback as FB       # noqa: E402

OUT = pathlib.Path("/home/bam/bbox-ui/reports/anchor-layout-2026-09-18.html")


def v_layers(w=980, h=250) -> str:
    """Three layers, and the one arrow that is dnd-kit's entire job."""
    s = D.txt(0, 12, "WHERE EACH THING IS ALLOWED TO DECIDE SOMETHING", D.ORANGE, 10, weight="700")

    s += D.box(14, 30, 300, 74, D.PANEL, D.PURPLE, rx=9)
    s += D.txt(30, 52, "1 · the data", D.PURPLE, 10.5, weight="700")
    s += D.txt(30, 72, "items: PortEdgeItem[]", D.FG, 10, mono=True)
    s += D.txt(30, 90, "an ORDER. no pixels anywhere.", D.DIM2, 9, mono=True)

    s += (f'<path d="M164,104 V128" stroke="{D.DIM}" stroke-width="1.4" marker-end="url(#a-{w}{h})"/>')
    s += D.box(14, 136, 300, 86, D.PANEL, D.ORANGE, rx=9)
    s += D.txt(30, 158, "2 · the layout function", D.ORANGE, 10.5, weight="700")
    s += D.txt(30, 178, "layout(items, box, args)", D.FG, 10, mono=True)
    s += D.txt(30, 196, "  → PortAnchor[] {x, y, side?}", D.GREEN, 10, mono=True)
    s += D.txt(30, 213, "the ONLY source of geometry. pure.", D.DIM2, 9, mono=True)

    s += (f'<path d="M322,178 H376" stroke="{D.GREEN}" stroke-width="1.5" marker-end="url(#ab-{w}{h})"/>')
    s += D.box(388, 136, 250, 86, D.PANEL, D.LINE2, rx=9)
    s += D.txt(404, 158, "3 · render", D.FG, 10.5, weight="700")
    s += D.txt(404, 178, "draw each card at its anchor", D.DIM2, 9.5)
    s += D.txt(404, 198, "no measuring, no negotiation", D.DIM2, 9.5)

    s += D.box(672, 30, 294, 192, D.PANEL2, D.BLUE, rx=9)
    s += D.txt(688, 52, "dnd-kit", D.BLUE, 11, weight="700")
    s += D.txt(688, 74, "what it keeps doing:", D.DIM2, 9.5, mono=True)
    for i, l in enumerate(["pointer + keyboard sensors", "drag lifecycle & cancellation",
                           "accessibility, announcements", "the DragOverlay portal"]):
        s += D.txt(688, 94 + i * 16, "· " + l, D.DIM2, 9)
    s += D.txt(688, 170, "what it stops doing:", D.RED, 9.5, mono=True)
    s += D.txt(688, 188, "· deciding where anything sits", D.RED, 9)
    s += D.txt(688, 204, "· animating a fake preview", D.RED, 9)
    s += (f'<path d="M672,130 C600,130 420,110 316,80" fill="none" stroke="{D.BLUE}" '
          f'stroke-width="1.6" marker-end="url(#ab-{w}{h})"/>')
    s += D.txt(396, 118, "its one write: arrayMove(items, from, to)", D.BLUE, 9.5, mono=True, weight="700")
    return D.svg(w, h, s, "Three layers and dnd-kit's single write")


def v_evidence(w=980, h=180) -> str:
    """The bug already in the file that proves the current seam is wrong."""
    s = D.txt(0, 12, "THIS IS NOT SPECULATIVE — THE WORKAROUND IS ALREADY IN THE FILE", D.RED, 10, weight="700")
    s += D.box(14, 28, 560, 122, "#1a1113", D.RED, rx=9)
    s += D.txt(30, 50, "portEdge.tsx — comment B1, and the function under it", D.RED, 10, weight="700")
    for i, l in enumerate([
        "@dnd-kit/sortable's useDerivedTransform computes geometry",
        "from measured rects. Our cards are NOT uniform width —",
        "so it visibly stretched a card for one frame every time",
        "the drag passed it.",
    ]):
        s += D.txt(30, 72 + i * 16, l, D.DIM2, 9.5)
    s += D.txt(30, 140, "function neutralizeScale(transform) { …scaleX: 1, scaleY: 1 }", D.RED, 9.5, mono=True)

    s += D.box(596, 28, 370, 122, D.PANEL, D.GREEN, rx=9)
    s += D.txt(612, 50, "what the B1 bug actually was", D.GREEN, 10, weight="700")
    s += D.txt(612, 74, "two things both computing geometry", D.FG, 9.5)
    s += D.txt(612, 92, "and disagreeing: the sortable strategy,", D.DIM2, 9.5)
    s += D.txt(612, 110, "and the real layout.", D.DIM2, 9.5)
    s += D.txt(612, 136, "one owner ⇒ the bug cannot exist", D.GREEN, 9.5, mono=True, weight="700")
    s += D.txt(0, 174, "Zach's instinct arrived at the architecture the workaround was already pointing at.", D.FG, 10)
    return D.svg(w, h, s, "The neutralizeScale workaround as evidence")


def v_precedent(w=980, h=150) -> str:
    """The repo already shipped an anchor space — for traces."""
    s = D.txt(0, 12, "YOU ALREADY BUILT THIS ONCE, FOR TRACES", D.ORANGE, 10, weight="700")
    s += D.box(14, 28, 440, 104, D.PANEL, D.LINE2, rx=9)
    s += D.txt(30, 50, "trace.bends.ts", D.FG, 10.5, mono=True, weight="600")
    s += D.txt(30, 72, "interface TraceBend { t: number; o: number }", D.ORANGE, 10, mono=True)
    s += D.txt(30, 94, "t — fraction along the chord", D.DIM2, 9.5, mono=True)
    s += D.txt(30, 110, "o — perpendicular offset, px", D.DIM2, 9.5, mono=True)
    s += D.txt(30, 126, "“so a bend survives its endpoints moving”", D.DIM, 9)

    s += (f'<path d="M462,80 H512" stroke="{D.ORANGE}" stroke-width="1.5" marker-end="url(#ao-{w}{h})"/>')
    s += D.box(524, 28, 442, 104, D.PANEL, D.ORANGE, rx=9)
    s += D.txt(540, 50, "the same move, for ports", D.ORANGE, 10.5, weight="600")
    s += D.txt(540, 72, "a port's position is a parameter in the", D.FG, 9.5)
    s += D.txt(540, 90, "layout's own space, not a pixel — so it", D.FG, 9.5)
    s += D.txt(540, 108, "survives the block resizing, the wall", D.FG, 9.5)
    s += D.txt(540, 126, "changing, or the layout being swapped.", D.FG, 9.5)
    return D.svg(w, h, s, "TraceBend as the existing anchor-space precedent")


# ---------------------------------------------------------------------------
# The demo. Four layouts, ONE drag implementation. Drag a card: the nearest
# anchor wins, the order array is rewritten, and the preview you see is the
# real layout of the hypothetical order — not an animation approximating it.
# ---------------------------------------------------------------------------
DEMO = r"""
<div class="demo">
  <div class="dhd"><h4>One drag implementation, four layouts &mdash; drag a card</h4>
    <p>Nothing below knows which layout is active. It asks <code>layout()</code> where the anchors are,
    picks the nearest to the pointer, and rewrites the order array. Switch the layout mid-drag if you like.</p></div>
  <div class="dbody">
    <svg id="al-svg" viewBox="0 0 980 340" aria-label="Dragging a port card under four different layout functions">
      <rect x="0" y="0" width="980" height="340" rx="10" fill="#0b0d10"/>
      <g id="al-block"></g>
      <g id="al-ghosts"></g>
      <g id="al-cards"></g>
    </svg>
  </div>
  <div class="ctrls">
    <span class="seg" role="group" aria-label="layout">
      <button class="b" data-lay="line" aria-pressed="true">line</button>
      <button class="b" data-lay="arc" aria-pressed="false">arc</button>
      <button class="b" data-lay="grid" aria-pressed="false">grid</button>
      <button class="b" data-lay="ring" aria-pressed="false">ring</button>
    </span>
    <button class="b" id="al-reset">Reset order</button>
    <span class="readout" id="al-read"></span>
  </div>
</div>
<script>
(function(){
  var NAMES = ['pose','gain','reset','cmd','status','tick'];
  var COLOURS = ['#f0883e','#8b94a4','#e8eaf0','#f0883e','#3fb950','#bc8cff'];
  var order = [0,1,2,3,4,5];
  var mode = 'line';
  var drag = null;               // {slot, pointer:{x,y}, target}
  var svg = document.getElementById('al-svg');
  var gBlock = document.getElementById('al-block');
  var gGhost = document.getElementById('al-ghosts');
  var gCards = document.getElementById('al-cards');
  var BOX = {x: 330, y: 70, w: 320, h: 200};
  var CARD = {w: 104, h: 30};

  function el(n, a){ var e = document.createElementNS('http://www.w3.org/2000/svg', n);
    for (var k in a) e.setAttribute(k, a[k]); return e; }

  /* ---- the four layout functions. Each is (count, box) -> [{x,y}] ------- */
  var LAYOUTS = {
    line: function(n, b){
      var out = [];
      for (var i = 0; i < n; i++) out.push({x: b.x, y: b.y + (b.h * (i + 1)) / (n + 1)});
      return out;
    },
    arc: function(n, b){
      var out = [], cx = b.x + 30, cy = b.y + b.h / 2, r = b.h * 0.62;
      for (var i = 0; i < n; i++){
        var a = -Math.PI / 2.6 + (i / (n - 1)) * (Math.PI / 1.3);
        out.push({x: cx - Math.cos(a) * r * 0.55, y: cy + Math.sin(a) * r});
      }
      return out;
    },
    grid: function(n, b){
      var out = [], cols = 2, rows = Math.ceil(n / cols);
      for (var i = 0; i < n; i++){
        var c = i % cols, r = Math.floor(i / cols);
        out.push({x: b.x - 30 + c * 128, y: b.y + 26 + (r * (b.h - 44)) / Math.max(1, rows - 1)});
      }
      return out;
    },
    ring: function(n, b){
      var out = [], cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = 112;
      for (var i = 0; i < n; i++){
        var a = (i / n) * Math.PI * 2 - Math.PI / 2;
        out.push({x: cx + Math.cos(a) * r * 1.35, y: cy + Math.sin(a) * r * 0.82});
      }
      return out;
    }
  };

  /* ---- the ONE piece of drag geometry: which anchor is nearest ---------- */
  function nearestAnchor(anchors, p){
    var best = 0, bd = Infinity;
    for (var i = 0; i < anchors.length; i++){
      var dx = anchors[i].x - p.x, dy = anchors[i].y - p.y, d = dx * dx + dy * dy;
      if (d < bd){ bd = d; best = i; }
    }
    return best;
  }
  function arrayMove(a, from, to){
    var c = a.slice(), it = c.splice(from, 1)[0]; c.splice(to, 0, it); return c;
  }

  function pointerIn(evt){
    var r = svg.getBoundingClientRect();
    return {x: (evt.clientX - r.left) * (980 / r.width), y: (evt.clientY - r.top) * (340 / r.height)};
  }

  function draw(){
    gBlock.textContent = ''; gGhost.textContent = ''; gCards.textContent = '';
    gBlock.appendChild(el('rect', {x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h, rx: 10,
      fill: '#15181e', stroke: '#4a5364'}));
    gBlock.appendChild(el('rect', {x: BOX.x, y: BOX.y, width: BOX.w, height: 24, rx: 10, fill: '#1e232c'}));
    var t = el('text', {x: BOX.x + 14, y: BOX.y + 17, fill: '#d7dbe3', 'font-size': 11, 'font-weight': 600});
    t.textContent = 'Planner'; gBlock.appendChild(t);

    // the order we are PREVIEWING: if dragging, the hypothetical one
    var shown = order;
    if (drag && drag.target !== null && drag.target !== drag.index){
      shown = arrayMove(order, drag.index, drag.target);
    }
    var anchors = LAYOUTS[mode](order.length, BOX);

    // ghost anchors, always visible during a drag — this is the whole contract
    if (drag){
      anchors.forEach(function(a, i){
        var on = i === drag.target;
        gGhost.appendChild(el('circle', {cx: a.x, cy: a.y, r: on ? 9 : 4.5,
          fill: 'none', stroke: on ? '#f0883e' : '#39404e', 'stroke-width': on ? 2 : 1.4,
          'stroke-dasharray': on ? '' : '3 2'}));
      });
    }

    shown.forEach(function(itemIdx, slot){
      var a = anchors[slot];
      var dragging = drag && itemIdx === order[drag.index];
      var x = a.x - CARD.w / 2, y = a.y - CARD.h / 2;
      if (dragging){ x = drag.pointer.x - CARD.w / 2; y = drag.pointer.y - CARD.h / 2; }
      var g = el('g', {style: 'cursor:grab'});
      g.appendChild(el('rect', {x: x, y: y, width: CARD.w, height: CARD.h, rx: 7,
        fill: dragging ? '#2a1d10' : '#1b1f27', stroke: dragging ? '#f0883e' : '#39404e',
        'stroke-width': dragging ? 1.8 : 1, opacity: dragging ? 0.96 : 1}));
      g.appendChild(el('circle', {cx: x + 13, cy: y + CARD.h / 2, r: 4.6, fill: 'none',
        stroke: COLOURS[itemIdx], 'stroke-width': 2}));
      var lab = el('text', {x: x + 26, y: y + CARD.h / 2 + 4, fill: dragging ? '#ffc794' : '#aab2c0',
        'font-size': 10.5, 'pointer-events': 'none'});
      lab.textContent = NAMES[itemIdx];
      g.appendChild(lab);
      g.addEventListener('pointerdown', function(evt){
        evt.preventDefault();
        drag = {index: slot, pointer: pointerIn(evt), target: slot};
        svg.setPointerCapture(evt.pointerId);
        draw();
      });
      gCards.appendChild(g);
    });

    var read = document.getElementById('al-read');
    read.innerHTML = drag
      ? 'nearest anchor <b>#' + (drag.target + 1) + '</b> &nbsp;&middot;&nbsp; preview = layout(arrayMove(order, '
        + drag.index + ', ' + drag.target + '))'
      : 'order <b>[' + order.map(function(i){ return NAMES[i]; }).join(', ') + ']</b>';
  }

  svg.addEventListener('pointermove', function(evt){
    if (!drag) return;
    drag.pointer = pointerIn(evt);
    drag.target = nearestAnchor(LAYOUTS[mode](order.length, BOX), drag.pointer);
    draw();
  });
  function end(){
    if (!drag) return;
    if (drag.target !== null && drag.target !== drag.index) order = arrayMove(order, drag.index, drag.target);
    drag = null; draw();
  }
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', end);

  Array.prototype.forEach.call(document.querySelectorAll('.demo [data-lay]'), function(b){
    b.addEventListener('click', function(){
      mode = b.dataset.lay;
      Array.prototype.forEach.call(document.querySelectorAll('.demo [data-lay]'), function(o){
        o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
  });
  document.getElementById('al-reset').addEventListener('click', function(){
    order = [0,1,2,3,4,5]; drag = null; draw(); });

  draw();
})();
</script>"""


SECTIONS = [
    dict(t="Your sentence, as an architecture",
         svg=v_layers(),
         body="""<i>&ldquo;the port layout things which support arbitrary layouts, and then dnd-kit basically
         just allows us to kind of like modify the data structure&rdquo;</i> &mdash; that is the whole design, and
         it is a stronger claim than it sounds. It says <b>exactly one thing is allowed to know where a card
         sits</b>, and it is the layout function. Everything else either produces the order or consumes the
         anchors.
         <br><br>What makes it robust rather than merely tidy: the drag stops being a special case. Today a
         drag is a second geometry system that has to <i>agree</i> with the layout. In this shape a drag is a
         question &mdash; <i>which anchor is the pointer nearest?</i> &mdash; and an answer that is just an array
         index. The preview is not an animation approximating the result; it <b>is</b>
         <code>layout(arrayMove(order, from, to))</code>, so what you see during the drag is the layout you get."""),

    dict(t="It is not speculative — the workaround is already in the file",
         svg=v_evidence(),
         body="""<code>portEdge.tsx</code> carries a comment marked <b>B1</b> and a function called
         <code>neutralizeScale</code>. The bug it fixes: <code>@dnd-kit/sortable</code>'s
         <code>useDerivedTransform</code> computes geometry from measured rects, our port cards are not uniform
         width, and so it <i>visibly stretched a card for one frame every time the drag passed it</i>. The fix was
         to pin its scale to 1 &mdash; that is, to partially disable dnd-kit's geometry.
         <br><br>That is this exact problem, found from the other end. Two systems computing geometry and
         disagreeing. Give the layout function sole ownership and the bug class disappears rather than being
         neutralised."""),

    dict(t="You already shipped an anchor space — for traces",
         svg=v_precedent(),
         body="""<code>trace.bends.ts</code> stores a bend as <code>{ t, o }</code> &mdash; a fraction along the
         chord and a perpendicular offset &mdash; explicitly <i>so a bend survives its endpoints moving</i>. That
         is an anchor space: a position expressed in the layout's own parameters rather than in pixels.
         <br><br>Ports are the same problem and currently get the pixel answer: <code>freeOffsets</code> is a
         <code>Record&lt;string, number&gt;</code> of px along one rail, which stops meaning anything the moment
         the rail is not a line. Under this design <code>freeOffsets</code> is not a special mode at all &mdash;
         it is simply the layout function that reads per-item parameters, sitting beside the ones that compute
         them. <code>mode: "auto" | "custom"</code> collapses into <i>which function</i>."""),

    dict(t="What this does to W1 in the work order",
         svg=D.svg(980, 132, D.t_before_after(980, 132,
             D.txt(14, 26, "registerPortLayout(name, {", D.DIM2, 9.5, mono=True)
             + D.txt(22, 44, "position, sortingStrategy?", D.DIM2, 9.5, mono=True)
             + D.txt(14, 62, "})", D.DIM2, 9.5, mono=True)
             + D.txt(14, 88, "a strategy per layout, because", D.RED, 9, mono=True)
             + D.txt(14, 102, "dnd-kit still owns drag geometry", D.RED, 9, mono=True),
             D.txt(14, 26, "registerPortLayout(name, fn)", D.GREEN, 9.5, mono=True)
             + D.txt(14, 50, "fn: (items, box, args) => Anchor[]", D.GREEN, 9.5, mono=True)
             + D.txt(14, 78, "no strategy. one collision fn for", D.GREEN, 9, mono=True)
             + D.txt(14, 92, "every layout: nearestAnchor()", D.GREEN, 9, mono=True)
             + D.txt(14, 112, "dnd-kit writes the array. that is all.", D.DIM2, 9, mono=True),
             "W1 as written", "W1 under this design", split=0.46),
             "How the work order's W1 changes"),
         body="""W1 currently says &ldquo;turn the closed union into a registry&rdquo;, and &mdash; because
         dnd-kit would still own drag geometry &mdash; each entry had to carry its own
         <code>sortingStrategy</code>, with non-linear layouts opting out of reordering entirely. That was me
         designing <i>around</i> the coupling.
         <br><br>Under your version the entry is just the function, there is one collision routine for every
         layout, and a ring layout reorders as naturally as a line. <b>I would rather build W1 this way than ship
         the smaller one and redo it</b> &mdash; it is not much more work (the demo above is the whole geometry
         contract) and it is the version that does not need revisiting.
         <br><br>The cost, stated honestly: we stop using <code>@dnd-kit/sortable</code>'s
         <code>useSortable</code>/<code>SortableContext</code> and drop to <code>@dnd-kit/core</code>'s
         <code>useDraggable</code> plus a custom <code>collisionDetection</code> &mdash; which is a documented,
         first-class prop that <code>portEdge.tsx</code> already passes (<code>closestCenter</code> today). We
         also give up sortable's free keyboard reordering and its animation, and have to supply both. That is the
         real bill."""),

    dict(t="Where else this lands, once anchors exist",
         svg=D.svg(980, 156, D.t_chain(980, 156,
             [{"t": "port cards", "sub": "the case at hand"},
              {"t": "Anchor[]", "sub": "one vocabulary", "accent": D.ORANGE, "fill": "#2a1d10"},
              {"t": "trace badges", "sub": "already {t, o}"},
              {"t": "block members", "sub": "free vs stack"}],
             "the same nearest-anchor drag serves all three — and #11 in the 100 wanted this shape anyway"),
             "Anchors as a shared vocabulary"),
         body="""<code>blockMembers</code> already has a <code>free</code> and a <code>stack</code> mode &mdash;
         which is <i>exactly</i> the same distinction as ports' <code>custom</code> and <code>auto</code>, written
         a second time. <code>traceBadge</code> already drags along a chord in <code>{t, o}</code> space. Three
         separate implementations of &ldquo;a thing sits at a parameterised position and can be dragged to a
         different one.&rdquo;
         <br><br>This also subsumes rank 11 of the 100 ideas (&ldquo;split the trace terminal into port / anchor /
         connectionPoint&rdquo;) &mdash; an anchor is precisely a point on a box that a port may or may not
         declare. If anchors become the shared vocabulary, that idea stops being a separate feature and becomes
         the same type.
         <br><br>I would still scope W1 to ports only. But the type should be named for the general case from day
         one, because renaming it later across three call sites is the expensive version."""),
]

CSS = """
  :root { --bg:#0c0d10; --panel:#15171c; --panel2:#1b1e25; --sunk:#0b0d10;
    --line:#282d38; --line2:#343b48; --fg:#e8eaf0; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --purple:#bc8cff;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif }
  .wrap { max-width:1120px; margin:0 auto; padding:0 24px 130px }
  a { color:var(--accent2); text-decoration:none }
  code { font-family:var(--mono); font-size:.86em; background:#0009; padding:1px 5px; border-radius:4px }
  .hero { padding:56px 0 6px }
  .kicker { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent);
    font-weight:700; margin:0 0 15px }
  h1 { font-size:42px; line-height:1.08; margin:0 0 14px; letter-spacing:-.03em; max-width:920px }
  .sub { color:var(--dim); font-size:16.5px; margin:0 0 8px; max-width:860px } .sub b { color:var(--fg) }
  .quote { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:12px; padding:18px 22px; margin:24px 0 8px; color:var(--dim); font-size:15px }
  .quote b { color:var(--fg) }
  .sec { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line2);
    border-radius:13px; padding:18px 22px 16px; margin:0 0 18px }
  .sec h3 { margin:0 0 12px; font-size:19px; letter-spacing:-.015em }
  .sec .dia { background:var(--sunk); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; margin:0 0 14px } .sec .dia svg { display:block; width:100%; height:auto }
  .sec p.body { color:var(--dim); font-size:14.5px; margin:0 } .sec p.body b { color:var(--fg) }
  .demo { background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:0; margin:26px 0; overflow:hidden }
  .demo .dhd { padding:16px 20px 12px; border-bottom:1px solid var(--line); background:var(--panel2) }
  .demo .dhd h4 { margin:0 0 3px; font-size:15.5px } .demo .dhd p { margin:0; color:var(--dim2); font-size:12.5px }
  .demo .dbody { padding:18px 20px 8px } .demo svg { display:block; width:100%; height:auto; touch-action:none }
  .ctrls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 20px 16px;
    border-top:1px solid var(--line) }
  button.b { font:600 12.5px/1 inherit; font-family:inherit; color:var(--fg); background:#242932;
    border:1px solid var(--line2); border-radius:8px; padding:9px 14px; cursor:pointer }
  button.b:hover { background:#2d333e } button.b[aria-pressed="true"] { background:#3a2a17;
    border-color:#7a4d1f; color:#ffc794 }
  .seg { display:inline-flex; border:1px solid var(--line2); border-radius:8px; overflow:hidden }
  .seg button.b { border:0; border-radius:0; border-right:1px solid var(--line2) }
  .seg button.b:last-child { border-right:0 }
  .readout { margin-left:auto; font-family:var(--mono); font-size:11.5px; color:var(--dim2); text-align:right }
  .readout b { color:var(--accent); font-weight:700 }
  footer { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.85 } footer b { color:var(--dim) }
  .hidden { display:none !important }
"""
CSS += FB.CSS

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anchor-space port layout — 2026-09-18</title>
<style>{CSS}</style></head>
<body><div class="wrap">

<div class="hero">
  <p class="kicker">bbox-ui &middot; design &middot; 2026-09-18</p>
  <h1>Yes &mdash; and the last clause of your sentence is the whole design.</h1>
  <p class="sub">A layout function owns every pixel. dnd-kit owns one array write. Drag the cards below and
  switch the layout while you do &mdash; it is the same drag code every time.</p>
</div>

<div class="quote">
<i>&ldquo;a way to make our port layout a bit more general and robust where you can kind of set any anchor
points for the cards you want and then you kind of reorganize them &hellip; we have kind of the port layout
things which support arbitrary layouts and then <b>DND kit basically just allows us to kind of like modify the
data structure</b>.&rdquo;</i>
</div>

{DEMO}

{''.join(f'<div class="sec"><h3>{s["t"]}</h3><div class="dia">{s["svg"]}</div><p class="body">{s["body"]}</p>' + FB.strip(n, s["t"], noun="section") + "</div>" for n, s in enumerate(SECTIONS, 1))}

{FB.ui("anchor-space port layout (2026-09-18)", "section", len(SECTIONS))}

<footer>
<p><b>Checked, not recalled.</b> <code>portEdge.tsx</code> for the dnd-kit surface actually in use
(<code>useSortable</code>, <code>SortableContext</code>, <code>arrayMove</code>,
<code>horizontal/verticalListSortingStrategy</code>, and <code>collisionDetection={{closestCenter}}</code> on
the <code>DndContext</code>), for comment <b>B1</b> and <code>neutralizeScale</code>; <code>trace.bends.ts</code>
for <code>TraceBend {{ t, o }}</code>; <code>portEdge.layout.ts</code> for the closed unions and
<code>freeOffsets</code>.</p>
<p><b>The demo is a drawing, not the component.</b> It implements the geometry contract in ~90 lines of plain
SVG to show the contract is small; it is not bbox-ui code and does not use dnd-kit. What it proves is that one
nearest-anchor drag serves four unrelated layouts &mdash; which is the claim.</p>
<p><b>What I would do next, if you agree:</b> rewrite W1 in the work order to this shape before dispatching
it, rather than shipping the smaller registry and redoing it. W2 and W4 are unaffected.</p>
</footer>

</div>{FB.JS}</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")
