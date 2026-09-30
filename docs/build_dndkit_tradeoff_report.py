#!/usr/bin/env python3
"""
What we give up by leaving @dnd-kit/sortable — with both approaches side by side.

Zach, 2026-09-18: "can you please further explain like what we kind of have to
give up here? From D&D kit. Specifically. Can you perhaps create some examples
showing me like the D&D kit one versus ours?" — and: "I think it could
particularly be helpful with the behavior tree layout as well."

Every row of the give-up table is read from the installed package
(@dnd-kit/sortable@10.0.0), not recalled. The surprise is in the keyboard row.

    python3 docs/build_dndkit_tradeoff_report.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import idea_diagrams as D          # noqa: E402
import report_feedback as FB       # noqa: E402

OUT = pathlib.Path("/home/bam/bbox-ui/reports/dndkit-tradeoff-2026-09-18.html")

# ---------------------------------------------------------------------------
# The ledger. Every export of @dnd-kit/sortable@10.0.0's index.d.ts, in order.
# verdict: loss | work | free | gain
# ---------------------------------------------------------------------------
GIVE_UP = [
    dict(ex="sortableKeyboardCoordinates", verdict="work",
         does="Arrow-key reordering. Filters droppable rects by <i>direction</i> from the dragged "
              "item's rect, then picks the nearest one and returns its coordinate for the "
              "<code>KeyboardSensor</code>.",
         ours="We write the same function over anchors: filter anchors by direction from the current "
              "one, pick nearest, return its centre.",
         note="<b>The one real obligation — and smaller than it looks.</b> Read the source: it is already "
              "<i>geometric</i>, working off <code>droppableRects</code>, not list indices. Our version is "
              "the same algorithm on a set we already compute, in roughly 15 lines — and it works in a "
              "ring, where a list strategy has no answer for &ldquo;Down&rdquo; at all."),
    dict(ex="useSortable — transition + derived transform", verdict="work",
         does="The shuffle animation: when a reorder changes an item's index, it measures the old and "
              "new rects and animates between them (<code>defaultAnimateLayoutChanges</code>, "
              "<code>useDerivedTransform</code>).",
         ours="A FLIP between the old anchor set and the new one.",
         note="<b>Real work, and the design makes it easier.</b> We have both anchor arrays explicitly — "
              "before and after — so the tween is over two known point sets rather than over measured "
              "DOM. This is also the exact code that caused <b>B1</b>: it derived a scale from "
              "non-uniform rects and stretched a card for a frame."),
    dict(ex="verticalListSortingStrategy<br>horizontalListSortingStrategy", verdict="gain",
         does="Compute each item's transform during a drag, assuming a single-axis list.",
         ours="A layout function returning <code>Anchor[]</code>.",
         note="Replaced by something strictly more general. This is the constraint that made a ring, an "
              "arc, a grid or a <b>tree</b> impossible without leaving sortable anyway."),
    dict(ex="rectSortingStrategy", verdict="gain",
         does="A 2-D grid-ish variant for wrapped rows.",
         ours="A grid layout function — see the demo.",
         note="Same story, and ours is not limited to a wrapping row of equal boxes."),
    dict(ex="rectSwappingStrategy", verdict="loss",
         does="<b>Swap</b> semantics rather than insert: A and B exchange places, everything else "
              "stays put.",
         ours="Nothing, unless we write it.",
         note="<b>An honest small loss.</b> Our model is insert-at-index. Swap is a different data "
              "operation (<code>arraySwap</code>, which we would still import). If any surface wants "
              "swap, it is a second reorder verb, not a layout."),
    dict(ex="SortableContext", verdict="free",
         does="Holds the sorted item ids and their measured rects so every <code>useSortable</code> "
              "can see its neighbours.",
         ours="Not needed. The anchor array already <i>is</i> the ordered geometry.",
         note="Bookkeeping that exists to reconstruct what the layout function hands us directly."),
    dict(ex="arrayMove · arraySwap", verdict="free",
         does="Pure array helpers.",
         ours="Keep importing them.",
         note="They are four lines of array maths with no dnd coupling. Nothing to give up."),
    dict(ex="hasSortableData · SortableData", verdict="free",
         does="Type guards for data sortable attaches to drag events.",
         ours="Our drag payload is an index.",
         note="Not applicable once the payload is an array index."),
]

KEPT = [
    ("DndContext", "the whole drag lifecycle, cancellation, nested contexts"),
    ("PointerSensor · KeyboardSensor · TouchSensor", "input handling, activation constraints"),
    ("collisionDetection", "<b>the extension point this design uses</b> — <code>portEdge.tsx</code> already passes <code>closestCenter</code> here"),
    ("useDraggable · useDroppable", "the primitives <code>useSortable</code> is itself built from"),
    ("DragOverlay", "the portal-rendered drag preview"),
    ("@dnd-kit/accessibility", "screen-reader announcements, live region"),
    ("auto-scroll", "scrolling the container while dragging near its edge"),
]


def v_split(w=980, h=214) -> str:
    s = D.txt(0, 12, "WHAT MOVES, AND WHAT DOES NOT", D.ORANGE, 10, weight="700")

    s += D.box(14, 28, 300, 172, D.PANEL, D.GREEN, rx=10)
    s += D.txt(30, 50, "@dnd-kit/core — all kept", D.GREEN, 10.5, weight="700")
    for i, (a, _b) in enumerate(KEPT):
        s += D.txt(30, 72 + i * 17, "· " + a.split(" · ")[0], D.DIM2, 9, mono=True)
    s += D.txt(30, 192, "nothing here changes", D.GREEN, 9, mono=True)

    s += D.box(340, 28, 300, 172, D.PANEL, D.YELLOW, rx=10)
    s += D.txt(356, 50, "@dnd-kit/sortable — leaving", D.YELLOW, 10.5, weight="700")
    rows = [("sortableKeyboardCoordinates", D.YELLOW), ("useSortable transition", D.YELLOW),
            ("verticalListSortingStrategy", D.GREEN), ("horizontalListSortingStrategy", D.GREEN),
            ("rectSortingStrategy", D.GREEN), ("rectSwappingStrategy", D.RED),
            ("SortableContext", D.DIM2), ("arrayMove / arraySwap", D.DIM2)]
    for i, (a, c) in enumerate(rows):
        s += D.txt(356, 72 + i * 15, "· " + a, c, 8.5, mono=True)
    s += D.txt(356, 194, "2 to rebuild · 1 real loss · rest free", D.YELLOW, 9, mono=True)

    s += D.box(666, 28, 300, 172, D.PANEL, D.ORANGE, rx=10)
    s += D.txt(682, 50, "what replaces them", D.ORANGE, 10.5, weight="700")
    for i, l in enumerate([
        "layout(items, box) → Anchor[]",
        "nearestAnchor(anchors, point)",
        "keyboardAnchor(anchors, i, dir)",
        "flip(oldAnchors, newAnchors)",
    ]):
        s += D.txt(682, 76 + i * 20, l, D.FG, 9.5, mono=True)
    s += D.txt(682, 166, "four pure functions, no DOM,", D.DIM2, 9, mono=True)
    s += D.txt(682, 182, "no measurement, all testable", D.DIM2, 9, mono=True)
    return D.svg(w, h, s, "What is kept, what is left behind, what replaces it")


def v_keyboard(w=980, h=172) -> str:
    s = D.txt(0, 12, "THE KEYBOARD ROW IS THE SURPRISE — READ THEIR SOURCE", D.ORANGE, 10, weight="700")
    s += D.box(14, 28, 470, 118, "#0b0d10", D.LINE, rx=9)
    s += D.txt(30, 50, "sortable.esm.js — sortableKeyboardCoordinates", D.DIM2, 9, mono=True)
    for i, (l, c) in enumerate([
        ("droppableContainers.getEnabled().forEach(entry => {", D.DIM2),
        ("  const rect = droppableRects.get(entry.id);", D.DIM2),
        ("  case KeyboardCode.Down:", D.ORANGE),
        ("    if (collisionRect.top < rect.top) push(entry);", D.GREEN),
    ]):
        s += D.txt(30, 72 + i * 17, l, c, 9, mono=True)
    s += D.txt(30, 140, "it filters by DIRECTION over measured rects", D.GREEN, 9.5, mono=True, weight="700")

    s += (f'<path d="M496,86 H540" stroke="{D.ORANGE}" stroke-width="1.5" marker-end="url(#ao-{w}{h})"/>')
    s += D.box(552, 28, 414, 118, D.PANEL, D.ORANGE, rx=9)
    s += D.txt(568, 50, "so ours is the same algorithm, smaller", D.ORANGE, 10, weight="700")
    s += D.txt(568, 74, "anchors.filter(a => a.y > here.y)", D.FG, 9.5, mono=True)
    s += D.txt(568, 92, "       .sort(byDistanceFrom(here))[0]", D.FG, 9.5, mono=True)
    s += D.txt(568, 118, "no rect measurement — we already have", D.DIM2, 9, mono=True)
    s += D.txt(568, 134, "the points. And it answers “Down” in a", D.DIM2, 9, mono=True)
    s += D.txt(568, 150, "ring, which a list strategy cannot.", D.GREEN, 9, mono=True)
    return D.svg(w, h, s, "sortableKeyboardCoordinates is already geometric")


# ---------------------------------------------------------------------------
# Side-by-side. Both panels are MODELS of the algorithm, in plain JS — the real
# sortable is React and cannot run here. The left one implements what sortable
# actually does (index-based transform over measured rects, including the
# derived scale that B1 neutralises); the right one is the anchor contract.
# ---------------------------------------------------------------------------
DEMO_VS = r"""
<div class="demo">
  <div class="dhd"><h4>The same reorder, both ways &mdash; drag a card in either panel</h4>
    <p>Two models of the <i>algorithm</i>, not the libraries (sortable is React and cannot run on this page).
    Left does what <code>useSortable</code> does: translate siblings by index over measured rects. Right asks
    a layout function for anchors. Turn on <b>non-uniform widths</b> to see B1.</p></div>
  <div class="dbody">
    <svg id="vs-svg" viewBox="0 0 980 300" aria-label="dnd-kit sortable model beside the anchor model">
      <rect x="0" y="0" width="980" height="300" rx="10" fill="#0b0d10"/>
      <line x1="490" y1="16" x2="490" y2="284" stroke="#282d38"/>
      <text x="26" y="34" fill="#8b94a4" font-size="11" font-weight="700">@dnd-kit/sortable — index + measured rects</text>
      <text x="516" y="34" fill="#f0883e" font-size="11" font-weight="700">ours — layout() owns every pixel</text>
      <g id="vs-left"></g><g id="vs-right"></g>
    </svg>
  </div>
  <div class="ctrls">
    <button class="b" id="vs-uniform" aria-pressed="false">non-uniform widths</button>
    <span class="seg" role="group" aria-label="right layout">
      <button class="b" data-vs="line" aria-pressed="true">right: line</button>
      <button class="b" data-vs="arc" aria-pressed="false">right: arc</button>
    </span>
    <button class="b" id="vs-reset">Reset</button>
    <span class="readout" id="vs-read"></span>
  </div>
</div>
<script>
(function(){
  var NAMES=['pose','gain','reset','cmd','status'];
  var WIDE =[58, 96, 74, 130, 86];
  var UNIFORM=86;
  var nonUniform=false, rightMode='line';
  var L={order:[0,1,2,3,4], drag:null}, R={order:[0,1,2,3,4], drag:null};
  var svg=document.getElementById('vs-svg');
  var gL=document.getElementById('vs-left'), gR=document.getElementById('vs-right');
  var H=34, TOP=70, GAP=10;

  function el(n,a){var e=document.createElementNS('http://www.w3.org/2000/svg',n);
    for(var k in a)e.setAttribute(k,a[k]);return e;}
  function widthOf(i){ return nonUniform ? WIDE[i] : UNIFORM; }
  function pt(evt){var r=svg.getBoundingClientRect();
    return {x:(evt.clientX-r.left)*(980/r.width), y:(evt.clientY-r.top)*(300/r.height)};}
  function arrayMove(a,f,t){var c=a.slice(),it=c.splice(f,1)[0];c.splice(t,0,it);return c;}

  /* ---- LEFT: what useSortable does — stack by MEASURED heights/widths, then
     translate siblings by index, and derive a scale from the rect delta ----- */
  function leftTops(order){
    var tops=[], y=TOP;
    for(var i=0;i<order.length;i++){ tops.push(y); y+=H+GAP; }
    return tops;
  }
  function drawLeft(){
    gL.textContent='';
    var tops=leftTops(L.order);
    var shown=L.order;
    if(L.drag && L.drag.target!==null && L.drag.target!==L.drag.index)
      shown=arrayMove(L.order,L.drag.index,L.drag.target);
    shown.forEach(function(item,slot){
      var dragging = L.drag && item===L.order[L.drag.index];
      var w=widthOf(item), x=40, y=tops[slot];
      // sortable's derived scale: the ratio between this item's width and the
      // width of the slot it is animating INTO. Uniform widths -> 1. This is B1.
      var intoItem = L.order[slot]!==undefined ? L.order[slot] : item;
      var sx = (!dragging && L.drag) ? widthOf(intoItem)/w : 1;
      if(dragging){ x = L.drag.p.x-w/2; y = L.drag.p.y-H/2; }
      var g=el('g',{style:'cursor:grab'});
      var cx=x+w/2, cy=y+H/2;
      g.appendChild(el('rect',{x:x,y:y,width:w,height:H,rx:7,
        fill:dragging?'#2a1d10':'#1b1f27',
        stroke:dragging?'#f0883e':(Math.abs(sx-1)>0.02?'#e5534b':'#39404e'),
        'stroke-width':dragging?1.8:(Math.abs(sx-1)>0.02?1.8:1),
        transform:'translate('+cx+' '+cy+') scale('+sx.toFixed(3)+' 1) translate('+(-cx)+' '+(-cy)+')'}));
      var t=el('text',{x:x+11,y:y+H/2+4,fill:dragging?'#ffc794':'#aab2c0','font-size':10,'pointer-events':'none'});
      t.textContent=NAMES[item]; g.appendChild(t);
      if(!dragging && Math.abs(sx-1)>0.02){
        var w2=el('text',{x:x+w+8,y:y+H/2+4,fill:'#e5534b','font-size':9,'font-family':'ui-monospace'});
        w2.textContent='scaleX '+sx.toFixed(2); g.appendChild(w2);
      }
      g.addEventListener('pointerdown',function(e){e.preventDefault();
        L.drag={index:slot,p:pt(e),target:slot}; svg.setPointerCapture(e.pointerId); draw();});
      gL.appendChild(g);
    });
    if(!L.drag){
      var n=el('text',{x:40,y:290,fill:'#6b7383','font-size':9,'font-family':'ui-monospace'});
      n.textContent='one axis only · geometry derived from measured rects'; gL.appendChild(n);
    }
  }

  /* ---- RIGHT: layout() -> anchors; nearest anchor decides the index ------ */
  var LAYOUTS={
    line:function(n){var o=[];for(var i=0;i<n;i++)o.push({x:600,y:TOP+H/2+i*(H+GAP)});return o;},
    arc: function(n){var o=[],cx=580,cy=TOP+82,r=96;
      for(var i=0;i<n;i++){var a=-Math.PI/3+(i/(n-1))*(2*Math.PI/3);
        o.push({x:cx+Math.sin(a)*r*1.5,y:cy-Math.cos(a)*r*0.86});}return o;}
  };
  function nearest(anchors,p){var b=0,bd=Infinity;
    for(var i=0;i<anchors.length;i++){var dx=anchors[i].x-p.x,dy=anchors[i].y-p.y,d=dx*dx+dy*dy;
      if(d<bd){bd=d;b=i;}}return b;}
  function drawRight(){
    gR.textContent='';
    var anchors=LAYOUTS[rightMode](R.order.length);
    var shown=R.order;
    if(R.drag && R.drag.target!==null && R.drag.target!==R.drag.index)
      shown=arrayMove(R.order,R.drag.index,R.drag.target);
    if(R.drag) anchors.forEach(function(a,i){
      var on=i===R.drag.target;
      gR.appendChild(el('circle',{cx:a.x,cy:a.y,r:on?9:4.5,fill:'none',
        stroke:on?'#f0883e':'#39404e','stroke-width':on?2:1.4,'stroke-dasharray':on?'':'3 2'}));
    });
    shown.forEach(function(item,slot){
      var dragging=R.drag && item===R.order[R.drag.index];
      var w=widthOf(item), a=anchors[slot];
      var x=a.x-w/2, y=a.y-H/2;
      if(dragging){x=R.drag.p.x-w/2;y=R.drag.p.y-H/2;}
      var g=el('g',{style:'cursor:grab'});
      g.appendChild(el('rect',{x:x,y:y,width:w,height:H,rx:7,
        fill:dragging?'#2a1d10':'#1b1f27',stroke:dragging?'#f0883e':'#39404e',
        'stroke-width':dragging?1.8:1}));
      var t=el('text',{x:x+11,y:y+H/2+4,fill:dragging?'#ffc794':'#aab2c0','font-size':10,'pointer-events':'none'});
      t.textContent=NAMES[item]; g.appendChild(t);
      g.addEventListener('pointerdown',function(e){e.preventDefault();
        R.drag={index:slot,p:pt(e),target:slot}; svg.setPointerCapture(e.pointerId); draw();});
      gR.appendChild(g);
    });
    if(!R.drag){
      var n=el('text',{x:516,y:290,fill:'#6b7383','font-size':9,'font-family':'ui-monospace'});
      n.textContent='any layout · no rect ever measured'; gR.appendChild(n);
    }
  }
  function draw(){
    drawLeft(); drawRight();
    var r=document.getElementById('vs-read');
    r.innerHTML = nonUniform
      ? 'non-uniform widths on &mdash; <b style="color:#e5534b">left panel derives a scale and stretches</b>; right is unaffected'
      : 'uniform widths &mdash; both look fine. Turn on non-uniform to see B1.';
  }
  svg.addEventListener('pointermove',function(e){
    var p=pt(e);
    if(L.drag){ L.drag.p=p;
      var tops=leftTops(L.order), best=0, bd=Infinity;
      tops.forEach(function(t,i){var d=Math.abs(t+H/2-p.y); if(d<bd){bd=d;best=i;}});
      L.drag.target=best; }
    if(R.drag){ R.drag.p=p; R.drag.target=nearest(LAYOUTS[rightMode](R.order.length),p); }
    if(L.drag||R.drag) draw();
  });
  function end(){
    if(L.drag){ if(L.drag.target!==L.drag.index) L.order=arrayMove(L.order,L.drag.index,L.drag.target); L.drag=null; }
    if(R.drag){ if(R.drag.target!==R.drag.index) R.order=arrayMove(R.order,R.drag.index,R.drag.target); R.drag=null; }
    draw();
  }
  svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
  svg.addEventListener('pointerleave',end);
  document.getElementById('vs-uniform').addEventListener('click',function(){
    nonUniform=!nonUniform; this.setAttribute('aria-pressed',String(nonUniform)); draw();});
  Array.prototype.forEach.call(document.querySelectorAll('[data-vs]'),function(b){
    b.addEventListener('click',function(){rightMode=b.dataset.vs;
      Array.prototype.forEach.call(document.querySelectorAll('[data-vs]'),function(o){
        o.setAttribute('aria-pressed',String(o===b));}); draw();});});
  document.getElementById('vs-reset').addEventListener('click',function(){
    L={order:[0,1,2,3,4],drag:null}; R={order:[0,1,2,3,4],drag:null}; draw();});
  draw();
})();
</script>"""


# ---------------------------------------------------------------------------
# The behaviour tree — Zach raised it, and it is the case sortable cannot do
# at all. Drag a node: nearest anchor among the tree's own computed slots.
# ---------------------------------------------------------------------------
DEMO_TREE = r"""
<div class="demo">
  <div class="dhd"><h4>The behaviour tree &mdash; drag a leaf between parents</h4>
    <p>The layout function is a tree layout. It returns an anchor per slot, including the empty slot
    beside each composite. The drag code is <i>byte for byte the same</i> as the line and arc demos: nearest
    anchor, then rewrite the data.</p></div>
  <div class="dbody">
    <svg id="bt-svg" viewBox="0 0 980 330" aria-label="Dragging a behaviour-tree leaf between two composites">
      <rect x="0" y="0" width="980" height="330" rx="10" fill="#0b0d10"/>
      <g id="bt-edges"></g><g id="bt-ghosts"></g><g id="bt-nodes"></g>
    </svg>
  </div>
  <div class="ctrls">
    <button class="b" id="bt-reset">Reset tree</button>
    <span class="readout" id="bt-read"></span>
  </div>
</div>
<script>
(function(){
  // the DATA: a root with two composites, each holding leaves. Nothing here is geometry.
  var init={Sequence:['detect','grasp','lift'], Fallback:['retry','abort']};
  var tree=JSON.parse(JSON.stringify(init));
  var drag=null;
  var svg=document.getElementById('bt-svg');
  var gE=document.getElementById('bt-edges'), gG=document.getElementById('bt-ghosts'), gN=document.getElementById('bt-nodes');
  var W=92,H=30;

  function el(n,a){var e=document.createElementNS('http://www.w3.org/2000/svg',n);
    for(var k in a)e.setAttribute(k,a[k]);return e;}
  function pt(evt){var r=svg.getBoundingClientRect();
    return {x:(evt.clientX-r.left)*(980/r.width),y:(evt.clientY-r.top)*(330/r.height)};}

  /* ---- THE LAYOUT FUNCTION. Tree in, anchors out. ---------------------- */
  function treeLayout(t){
    var parents=Object.keys(t), out={root:{x:490,y:56}, parents:[], slots:[]};
    var span=880, step=span/parents.length;
    parents.forEach(function(name,pi){
      var px=50+step*pi+step/2;
      out.parents.push({name:name,x:px,y:150});
      var kids=t[name], n=kids.length+1;           // +1 = the empty "drop here" slot
      // pitch must clear the card, or the leaves overlap — measured, they did
      var cw=Math.max(W+10, Math.min(150,(step-24)/n));
      for(var i=0;i<n;i++){
        out.slots.push({parent:name,index:i,
          x:px-((n-1)*cw)/2+i*cw, y:250, empty:i===kids.length});
      }
    });
    return out;
  }
  function nearest(slots,p){var b=0,bd=Infinity;
    for(var i=0;i<slots.length;i++){var dx=slots[i].x-p.x,dy=slots[i].y-p.y,d=dx*dx+dy*dy;
      if(d<bd){bd=d;b=i;}}return b;}

  function draw(){
    gE.textContent='';gG.textContent='';gN.textContent='';
    // the tree we are PREVIEWING
    var shown=tree;
    if(drag && drag.target!==null){
      shown=JSON.parse(JSON.stringify(tree));
      shown[drag.from.parent].splice(drag.from.index,1);
      var t=treeLayout(tree).slots[drag.target];
      var idx=Math.min(t.index, shown[t.parent].length);
      shown[t.parent].splice(idx,0,drag.label);
    }
    var lay=treeLayout(shown);

    lay.parents.forEach(function(p){
      gE.appendChild(el('path',{d:'M490,88 C490,120 '+p.x+',110 '+p.x+','+(p.y-16),
        fill:'none',stroke:'#39404e','stroke-width':1.4}));
    });
    lay.slots.forEach(function(s){
      if(s.empty) return;
      var par=lay.parents.filter(function(p){return p.name===s.parent;})[0];
      gE.appendChild(el('path',{d:'M'+par.x+','+(par.y+16)+' C'+par.x+','+215+' '+s.x+','+215+' '+s.x+','+(s.y-16),
        fill:'none',stroke:'#39404e','stroke-width':1.3}));
    });

    lay.slots.forEach(function(s,i){
      var on=drag && i===drag.target;
      if(!drag && !s.empty) return;          // at rest, only the empty slots show
      gG.appendChild(el('rect',{x:s.x-W/2,y:s.y-H/2,width:W,height:H,rx:7,fill:'none',
        stroke:on?'#f0883e':'#39404e','stroke-width':on?2:1.2,'stroke-dasharray':on?'':'4 3'}));
      if(s.empty && !drag){
        var lbl=el('text',{x:s.x,y:s.y+4,fill:'#4e5768','font-size':9,'text-anchor':'middle',
          'font-family':'ui-monospace','pointer-events':'none'});
        lbl.textContent='drop here'; gG.appendChild(lbl);
      }
    });

    function node(x,y,label,fill,stroke,tc,w){
      var g=el('g',{});
      g.appendChild(el('rect',{x:x-(w||W)/2,y:y-H/2,width:w||W,height:H,rx:7,fill:fill,stroke:stroke}));
      var t=el('text',{x:x,y:y+4,fill:tc,'font-size':10.5,'text-anchor':'middle','pointer-events':'none'});
      t.textContent=label;g.appendChild(t);return g;
    }
    gN.appendChild(node(lay.root.x,lay.root.y,'Root','#1e232c','#4a5364','#d7dbe3',96));
    lay.parents.forEach(function(p){
      gN.appendChild(node(p.x,p.y,p.name,'#15181e','#5aa9f8','#9cc8f5',132));});

    lay.slots.forEach(function(s){
      if(s.empty) return;
      var label=shown[s.parent][s.index];
      var dragging=drag && label===drag.label;
      var x=s.x,y=s.y;
      if(dragging){x=drag.p.x;y=drag.p.y;}
      var g=node(x,y,label,dragging?'#2a1d10':'#1b1f27',dragging?'#f0883e':'#39404e',
                 dragging?'#ffc794':'#aab2c0');
      g.setAttribute('style','cursor:grab');
      g.addEventListener('pointerdown',function(e){e.preventDefault();
        // find this label in the REAL tree
        var fp=null,fi=-1;
        Object.keys(tree).forEach(function(k){var j=tree[k].indexOf(label);if(j>=0){fp=k;fi=j;}});
        drag={label:label,from:{parent:fp,index:fi},p:pt(e),target:null};
        svg.setPointerCapture(e.pointerId);draw();});
      gN.appendChild(g);
    });

    var r=document.getElementById('bt-read');
    if(drag && drag.target!==null){
      var t=treeLayout(tree).slots[drag.target];
      r.innerHTML='nearest slot <b>'+t.parent+'['+t.index+']</b> &nbsp;&middot;&nbsp; one move, two array writes';
    } else {
      r.innerHTML=Object.keys(tree).map(function(k){
        return k+': ['+tree[k].join(', ')+']';}).join(' &nbsp;&middot;&nbsp; ');
    }
  }

  svg.addEventListener('pointermove',function(e){
    if(!drag)return; drag.p=pt(e);
    drag.target=nearest(treeLayout(tree).slots,drag.p); draw();});
  function end(){
    if(!drag)return;
    if(drag.target!==null){
      var t=treeLayout(tree).slots[drag.target];
      tree[drag.from.parent].splice(drag.from.index,1);
      var idx=Math.min(t.index,tree[t.parent].length);
      tree[t.parent].splice(idx,0,drag.label);
    }
    drag=null;draw();}
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  svg.addEventListener('pointerleave',end);
  document.getElementById('bt-reset').addEventListener('click',function(){
    tree=JSON.parse(JSON.stringify(init));drag=null;draw();});
  draw();
})();
</script>"""


VERDICT = {"loss": ("#e5534b", "a real loss"), "work": ("#e8c06a", "we rebuild it"),
           "free": ("#6b7383", "costs nothing"), "gain": ("#3fb950", "we gain")}


def ledger_rows() -> str:
    out = []
    for g in GIVE_UP:
        colour, label = VERDICT[g["verdict"]]
        out.append(
            f'<tr><td class="ex"><code>{g["ex"]}</code>'
            f'<div><span class="vd" style="background:{colour}22;color:{colour}">{label}</span></div></td>'
            f'<td>{g["does"]}</td><td>{g["ours"]}</td><td>{g["note"]}</td></tr>')
    return "".join(out)


CSS = """
  :root { --bg:#0c0d10; --panel:#15171c; --panel2:#1b1e25; --sunk:#0b0d10;
    --line:#282d38; --line2:#343b48; --fg:#e8eaf0; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif }
  .wrap { max-width:1140px; margin:0 auto; padding:0 24px 130px }
  a { color:var(--accent2); text-decoration:none }
  code { font-family:var(--mono); font-size:.86em; background:#0009; padding:1px 5px; border-radius:4px }
  .hero { padding:56px 0 6px }
  .kicker { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent);
    font-weight:700; margin:0 0 15px }
  h1 { font-size:40px; line-height:1.1; margin:0 0 14px; letter-spacing:-.03em; max-width:900px }
  .sub { color:var(--dim); font-size:16.5px; margin:0 0 8px; max-width:860px } .sub b { color:var(--fg) }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
    margin:54px 0 6px; font-weight:700 }
  .h2sub { color:var(--dim); font-size:14.5px; margin:0 0 20px; max-width:860px }
  .fig { background:var(--panel); border:1px solid var(--line); border-radius:13px;
    padding:18px 20px 14px; margin:22px 0 } .fig svg { display:block; width:100%; height:auto }
  table { width:100%; border-collapse:collapse; font-size:13.5px; margin:0 0 10px }
  th { text-align:left; color:var(--dim2); text-transform:uppercase; font-size:10.5px;
    letter-spacing:.08em; padding:8px 10px; border-bottom:1px solid var(--line); font-weight:600 }
  td { padding:12px 10px; border-bottom:1px solid var(--line); vertical-align:top; color:var(--dim) }
  td b { color:var(--fg) }
  td.ex { width:210px; color:var(--fg) } td.ex code { font-size:11.5px }
  .vd { display:inline-block; margin-top:7px; font-size:10px; font-weight:800; letter-spacing:.06em;
    text-transform:uppercase; padding:3px 8px; border-radius:99px }
  .kept { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:10px; margin:16px 0 }
  .kept div { background:var(--panel); border:1px solid var(--line); border-left:2px solid var(--ok);
    border-radius:9px; padding:11px 14px; font-size:12.5px; color:var(--dim) }
  .kept b { display:block; color:var(--fg); font-family:var(--mono); font-size:11.5px; margin-bottom:3px }
  .demo { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:0;
    margin:24px 0; overflow:hidden }
  .demo .dhd { padding:16px 20px 12px; border-bottom:1px solid var(--line); background:var(--panel2) }
  .demo .dhd h4 { margin:0 0 3px; font-size:15.5px } .demo .dhd p { margin:0; color:var(--dim2); font-size:12.5px }
  .demo .dbody { padding:18px 20px 8px } .demo svg { display:block; width:100%; height:auto; touch-action:none;
    user-select:none; -webkit-user-select:none }
  .ctrls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 20px 16px;
    border-top:1px solid var(--line) }
  button.b { font:600 12.5px/1 inherit; font-family:inherit; color:var(--fg); background:#242932;
    border:1px solid var(--line2); border-radius:8px; padding:9px 14px; cursor:pointer }
  button.b:hover { background:#2d333e }
  button.b[aria-pressed="true"] { background:#3a2a17; border-color:#7a4d1f; color:#ffc794 }
  .seg { display:inline-flex; border:1px solid var(--line2); border-radius:8px; overflow:hidden }
  .seg button.b { border:0; border-radius:0; border-right:1px solid var(--line2) }
  .seg button.b:last-child { border-right:0 }
  .readout { margin-left:auto; font-family:var(--mono); font-size:11.5px; color:var(--dim2); text-align:right }
  .readout b { color:var(--accent); font-weight:700 }
  .note { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent2);
    border-radius:12px; padding:18px 22px; margin:22px 0; color:var(--dim); font-size:14.5px }
  .note b { color:var(--fg) }
  footer { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.85 } footer b { color:var(--dim) }
  .hidden { display:none !important }
"""
CSS += FB.CSS

SECTION_IDS = ["The ledger", "The side-by-side", "The behaviour tree"]

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What we give up from dnd-kit — 2026-09-18</title>
<style>{CSS}</style></head>
<body><div class="wrap">

<div class="hero">
  <p class="kicker">bbox-ui &middot; the dnd-kit trade-off &middot; 2026-09-18</p>
  <h1>Two things to rebuild, one real loss, and the rest is a gain.</h1>
  <p class="sub">Every row below is read from the installed <code>@dnd-kit/sortable@10.0.0</code>, export by
  export. <b>We keep all of <code>@dnd-kit/core</code></b> &mdash; sensors, lifecycle, accessibility, the
  overlay. We leave <code>sortable</code>, which is eight exports.</p>
</div>

<div class="fig">{v_split()}</div>

<h2>The ledger</h2>
<p class="h2sub">Every export of <code>@dnd-kit/sortable</code>'s <code>index.d.ts</code>, what it does for us
today, and what takes its place.</p>
<table><tr><th>What we leave</th><th>What it does</th><th>What replaces it</th><th>Cost</th></tr>
{ledger_rows()}</table>

<div class="fig">{v_keyboard()}</div>

<div class="note"><b>The keyboard row is the one to read twice.</b> I expected accessibility to be the
argument against this change. It is not: <code>sortableKeyboardCoordinates</code> is <i>already</i> a
geometric routine &mdash; it filters <code>droppableRects</code> by direction and takes the nearest. Our
version is the same algorithm over a point set we compute anyway, and it answers &ldquo;Down&rdquo; in a ring
or a tree, which a list strategy cannot. It still has to be written, so it is on the bill &mdash; but as work,
not as a loss.</div>

<h2>What we keep, unchanged</h2>
<div class="kept">{''.join(f'<div><b>{a}</b>{b}</div>' for a, b in KEPT)}</div>

<h2>The side-by-side</h2>
<p class="h2sub">Same five cards, same reorder, two algorithms. Turn on <b>non-uniform widths</b> and watch the
left panel derive a scale &mdash; that is <b>B1</b>, the bug <code>neutralizeScale</code> exists to suppress.</p>
{DEMO_VS}

<h2>The behaviour tree &mdash; the case sortable cannot reach at all</h2>
<p class="h2sub">You raised this, and it is the sharpest argument. A behaviour tree's positions come from a
<i>tree layout</i>; there is no list for a list strategy to sort. Under the anchor contract it needs no new
drag code &mdash; only a different layout function, one that also emits an empty slot per composite so a leaf
can be dropped into an empty parent.</p>
{DEMO_TREE}

<div class="note"><b>What the tree demo is really showing.</b> The drag handler is the same three lines as the
line and arc demos: nearest anchor, rewrite the data, re-render. What changed is only that
<code>treeLayout()</code> returns slots keyed by <code>{{parent, index}}</code> instead of a flat index &mdash;
so the &ldquo;data structure dnd-kit modifies&rdquo; is two array operations instead of one. SystemSketch's
behaviour-tree canvas already owns a real tree layout; this is the seam that would let it reuse the same drag.</div>

{FB.ui("the dnd-kit trade-off (2026-09-18)", "section", 3)}

<footer>
<p><b>Read, not recalled.</b> <code>@dnd-kit/sortable@10.0.0</code>'s <code>dist/index.d.ts</code> for the
complete export list, and <code>dist/sortable.esm.js</code> for what
<code>sortableKeyboardCoordinates</code> actually does. <code>portEdge.tsx</code> for comment <b>B1</b>,
<code>neutralizeScale</code>, and the <code>collisionDetection={{closestCenter}}</code> already on the
<code>DndContext</code>.</p>
<p><b>Both panels are models of the algorithms, not the libraries.</b> <code>@dnd-kit/sortable</code> is React
and cannot run on a static page, so the left panel implements what <code>useSortable</code> does &mdash;
index-ordered stacking over measured rects, with the derived scale &mdash; in plain SVG. It is a faithful model
of the mechanism, and it is not the library. The real comparison lives in
<code>apps/storybook-basics</code>'s own <code>DndKitCollisionRects</code> and
<code>DragSmoothnessProfile</code> stories.</p>
<p><b>Still honest about the bill:</b> two things to write (keyboard reordering, the reorder animation) and one
real loss (<code>rectSwappingStrategy</code>'s swap semantics, if any surface ever wants swap rather than
insert).</p>
</footer>

</div>{FB.JS}</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")
