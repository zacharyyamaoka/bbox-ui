# The ask — 2026-09-18 evening (verbatim from Zach's daily note)

Source: `/home/bam/zach_brain/Sources/Daily Notes/Daily Note - Sep 18 2026.md`,
sections "### Redoing system sketch design primatives with new bbox ui components"
and the two "### Feedback on stock react flow viewer" sections. Images referenced
by `![[Pasted image …]]` live at `/home/bam/zach_brain/Pasted image <stamp>.png`
— agents must `Read` them; the prose cannot carry the pixels.

## The four items

> OK what remains?
>
> **1.** Please start a fable 5.1 agent to make a plan to implement the for loops,
> while loops, and branch conditional presets and region. I think this is missing
> right now, and then start a ultracode workflow with opus builder agents to
> implement it. References for this work include the obsidian vault but also most
> recently this work here: `PROJECT - pyblocks#How to show the different parts of
> the code in stock reactflow` (copied below). … so this should be enough
> information to finish those parts of the bbox-ui off. thinking about it in the
> rear view mirror I kinda feel I overcomplicated it... I mean this stock reactflow
> thing did it so fast and easily...
>
> **2.** Start a fable 5.1 agent to make a plan to redo the system sketch system
> design primitives using our new bbox ui. Right now we currently have two tool bar
> icons: the original system sketch ones, the older bbox ones
> (`Pasted image 20260918201649.png`). Get rid of both of those and instead lets
> just have the 1 icon. As a phase 1 please just start with importing in the
> block, and code editor, and also our code for layout and traces, and then
> importing in Port, Branch, Loop. Also you can start to port over the
> editor-menus where applicable... Basically there is SO MUCH to port over.. we
> have kinda like continually extracted from system sketch and now we are basically
> going to reimport it. Honestly I actually don't consider this a refactor. Lets
> archive this old system sketch. still keep the source code there in case we want
> to run it, etc. but now lets start again from scratch. Start with the plain
> tldraw viewer and build up from there adding the bbox functionality. That way we
> know that systemsketch will just be bbox-ui + tldraw stock. Start a ultracode
> workflow on this with opus builder agents.
>
> **3.** Start a fable 5.1 agent on this. In addition to this, please add the option
> to enable the pyblocks back end. System sketch should be able to be used with no
> real backend, then its truly like a whiteboard. but the real power comes when we
> connect it to pyblocks which turns the files now into basically a view of a real
> python file. Please check out the pyblocks repo to see the latest code. Right now
> we have a stock reactflow viewer we are using to render the BlockView. to wire it
> together should be now about implementing a `._to_systemsketch()` function instead
> and then also wiring the edits together, so system sketch should kinda like emit
> UI edit events, that I guess normally have no consumer, but now pyblocks could
> consume it or something... idk a lot of work there I leave up to you.
>
> **4.** There are also some functionalities like converting codeeditor blocks into
> blocks that we want to get from pyblocks. Please start a fable 5.1 agent to
> implement this: `/home/bam/bbox-ui/reports/source-code-view-plan-2026-09-18.html`
> (the plan itself is `docs/SOURCE-CODE-VIEW-PLAN.md` on this branch). You may need
> to wait until pyblocks is integrated first though. You can definitely kinda like
> add the menu items, etc. that could appear if pyblocks is enabled to start.

## The pyblocks note Zach copied in (the visual language)

> ### How to show the different parts of the code in stock reactflow
> UI render only... we are just doing UI static so that makes it much easier...
> we basically just do expanded or port view maybe. Actually we can almost always
> just show port view no? and then the calls?
>
> **Function** — Port View (function call): `Pasted image 20260918142330.png`;
> Expanded (function definition): `Pasted image 20260918142346.png`;
> Literal argument: `Pasted image 20260918143132.png`;
> default value: `Pasted image 20260918143158.png`.
>
> **Class** — we show the function definitions and functions within the frame
> (`Pasted image 20260904182048.png`).
>
> **For Loop** `for iter in iterable:` — `Pasted image 20260918145132.png`. This
> white image (`Pasted image 20260918145709.png`) has the old method of ports on
> the header bottom edge, now we just want it to be a normal block. I like how it
> shows though how you consume the data from the iter, and then also how we show
> the z⁻¹ labels. We don't show state with like values. we directly draw the arrows
> that show the dataflow. its just they are delayed! Also `Pasted image 20260903005653.png`.
>
> **While Loop** `while conditional_statement()` — `Pasted image 20260918145125.png`,
> `Pasted image 20260903175205.png`.
>
> **Conditional Branches** — Example with 1 input `Pasted image 20260918143241.png`;
> example with many inputs `Pasted image 20260918144504.png`. (if/elif/else and
> match/case both map to it.) Nested: `Pasted image 20260918144705.png`.
> Prior report: `file:///home/bam/systemsketch/docs/branch-regions-2026-09-02.html`
> (`Pasted image 20260918145419.png`). One thing that is different from this html
> report is that instead of just a single port on the header, now instead we put a
> full block up top. When routing around the branch, data cables that aren't
> flowing through the branch should actively avoid the branch — bypass by going
> above or below it. One thing TBD when we have this control flow splitting.. it
> does almost split all the code into 3 sections right. there is always the bypass
> as well...
>
> **Break and Continue and Pass** — (no drawing given).
>
> **Mutating functions** — Key idea is that if it edits in place, then we don't
> show an output port we show a side effect! `Pasted image 20260918150335.png`;
> inside it looks like `Pasted image 20260918150403.png`; you just continue to
> nest the mutations `Pasted image 20260918150621.png`. They keep on propagating
> outwards until you get to the level that the mutations affect. see
> `file:///home/bam/systemsketch/docs/mutating-line-review-2026-09-03.html`.
>
> **Splitter** — `Pasted image 20260902233817.png`, `Pasted image 20260902233831.png`.
>
> The rest: refer to `/home/bam/zach_brain/Projects/bbox-ui/MOC - bbox-ui Components.md`.
>
> The key idea I think was shifting from this view of kinda having these like
> ports on the headers to this idea of a region with a real block. which makes
> perfect sense as like everything is really a block :)
> `Pasted image 20260918150916.png` (OLD: BAD — ports on the region header /
> NEW: GOOD — a real `For Loop` block with `Iterable`→`iter` ports sitting in the
> top-left corner of an otherwise empty frame). And then this idea of just
> truthfully showing the dataflow, and then this understanding that data and
> control flow are very different. that is ultimately what basically determined
> how the visual language looks like.

## Zach's feedback on the five drawn proposals (P1–P5)

Proposals report: `file:///home/bam/pyblocks/reports/media/pyblocks-viewer-display-proposals-2026-09-18.html`
(P1 everything-is-a-block · P2 two axes · P3 composite is one node · P4 flat
truthful dataflow with select · P5 honest port view first).

> I think the key thing I wanted to achieve with the proposal one vocabulary was:
> I didn't want to mix data lines and control lines. Because when you read Python
> code, the control is apparent from the structure itself. And I wanted to create
> that view too. By using regions and arms, it kind of overlays that structure on
> the canvas. Of course, there's then the option of your proposal four, which is
> flat truthful data flow using these select switchers. I think this feels very
> much like Unreal Blueprints and that is technically what is happening, and I see
> how that is truthful. I think the idea though is, it makes you feel like there's
> a select function there, which in reality there's not — it's really these two
> branches and only one of the branches is active. So I like how you can just
> visually see at a glance the conditional execution. I really like proposal five;
> I think we can support that regardless — when you collapse one of these regions,
> it can look like this honest port view first, and we get that already for free
> as a starting point. Proposal 2 I don't like, that's just bad. Proposal three is
> kind of similar to what I wanted to do with proposal one and it was kind of my
> initial idea actually, but I think the key idea was with the region you give
> more space for the stuff inside — that's why I liked it. **The key thing is we
> really want the region to look connected to that block.**
> `Pasted image 20260918192040.png` — https://reactflow.dev/ui/components/labeled-group-node
> I think the React Flow labeled group node is actually the perfect design
> reference. I like how the label looks integral to the group. That's how I
> imagine these blocks looking like.
>
> Please start a ultracode workflow to migrate to Proposal 1, with also proposal 5
> view supported — that is a toggle between showing it as an opaque vs expanded view.

## Settled rulings already on disk (do not re-open)

- `apps/storybook-basics/src/scene/region.ts` — "100% it's a node. it's just a
  unique type of node that is different from block." Regions are isolated
  (never carry a `definitionId`).
- `DP - Region` (vault): a region is *composed using* a block, with a block in its
  top-left corner. `DP - Loop`: header contract is typed and unnamed (`for` =
  `Iterable` in / `Iter` out; `while` = `Bool` in, no item outlet). `DP - Branch`:
  V1 — no ports on the region, arms fan in at the consumer. `DP - Break &
  Continue`: break is a mark, not a cable. `DP - Mutation & Side Effects`: three
  states — pure / mutates / unknown — never two.
- Dispatcher's location decision for item 2 (reversible, stated so Zach can veto):
  the from-scratch SystemSketch lives at **`apps/systemsketch` inside this
  monorepo**, importing the trunk (`apps/storybook-basics/src/*`) through one
  path alias — so it is literally "bbox-ui + stock tldraw" with zero vendoring
  drift. `/home/bam/systemsketch` is left untouched as the archive (its root
  checkout is dirty with a peer's in-flight work and has 258 worktrees; moving
  its `src/` would be churn for nothing).
