"""Write story-org.json: every story file's title today and under proposals A, B, C.

    python3 apps/storybook-basics/.storybook-org/build_table.py [index-url]

Today's titles come from a running Storybook's own index (default :5421).
The classification below (owner, aspect, family, object) is by hand; a story
file the table does not know makes the run fail rather than guess.
"""
import json, re, sys, urllib.request
from pathlib import Path

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5421/index.json"
OUT = Path(__file__).with_name("story-org.json")
idx = json.load(urllib.request.urlopen(URL))["entries"]
today = {}
for e in idx.values():
    today[e["importPath"].replace("./src/", "")] = e["title"]

FAM = {  # B: component families (closed vocabulary)
    "Ports": "Port LabeledPort PortEdge",
    "Blocks": "Block BlockPort BlockMembers BlockDescription Bar PaintOrder",
    "Traces": "Trace TraceBadge TraceMark TraceEditor TraceTerminal Elbow WireLayer",
    "Text & Marks": "Text EditableText InlineRename CodeEditor CodeView Glyph Badge OriginBadge BranchChip Highlighter Diagnostics",
    "Menus & Bars": "ChromeBar Toolbar ToolDock FloatingToolbar StatusStrip ControlStrip ControlPanel ControlGlyphs ControlLab SplitButton Breadcrumb FoldingChevron",
    "Panels & Dialogs": "PanelShell FramesPanel FileNavigator SettingsView SettingsCategories ToolAliasEditor DevPanel QuickSwitcher ProblemsPanel HistoryList PropertyTable RecordingControl RecordingViewer CompareDialog CompareReview DraftBar DraftSession ConfirmDialog",
    "Stock": "Button ButtonGroup Command ContextMenu Dialog DropdownMenu Field Input InputGroup Label Popover RadioGroup Select Separator Slider Switch Table Tabs Textarea Toggle ToggleGroup Tooltip",
}
family_of = {o: f for f, os in FAM.items() for o in os.split()}
# C: the domain object each component family belongs to
C_ROOT = {"Ports": "Port", "Blocks": "Block", "Traces": "Trace", "Text & Marks": "Text & Marks",
          "Menus & Bars": "Chrome/Menus & Bars", "Panels & Dialogs": "Chrome/Panels & Dialogs", "Stock": "Stock"}
SCENE_FAM = {  # B: Zach's own split, daily note 2026-09-21 L191 ("layout operations? data validation operations?")
    "Model & Diff": "Scene SceneDiff CodeCell Pyblocks DetachToPrimitive",
    "Wiring": "Linking BatchWiring CollapseWireEndpoints Producers",
    "Validation": "Lint ValidationLevel ValidityPreview FoldBubbling",
    "Layout & Drag": "FitToContent Grouping DragPolicy",
}
scene_family_of = {o: f for f, os in SCENE_FAM.items() for o in os.split()}


def pascal(s):
    return re.sub(r"[^A-Za-z0-9]", "", s.title() if " " in s or "-" in s else s)


# stem -> (kit, owner, aspect, [overrides])
# kit/owner/aspect describe where the file sits after the settled Phase-1 move
# (a story lives beside the code it demonstrates; host-rendered stories stay in hosts/).
R = {}
def comp(stem, owner=None, aspect=None, path=None, **kw):
    R[path or f"components/{stem}.stories.tsx"] = dict(kit="Components", owner=owner or stem[0].upper() + stem[1:], aspect=aspect, **kw)

for s in ("Badge Bar Block BlockDescription BlockPort Breadcrumb Button ButtonGroup ChromeBar CodeEditor CodeView "
          "CompareDialog CompareReview ConfirmDialog ContextMenu ControlLab ControlStrip DevPanel Diagnostics Dialog DraftBar "
          "DraftSession DropdownMenu EditableText Field FileNavigator FloatingToolbar FramesPanel Glyph HistoryList InlineRename "
          "Input Label LabeledPort PaintOrder PanelShell Popover Port PortEdge ProblemsPanel PropertyTable QuickSwitcher RadioGroup "
          "RecordingControl RecordingViewer Select SettingsCategories SettingsView SplitButton StatusStrip Switch Table Tabs Text "
          "Toggle ToggleGroup ToolDock Toolbar Tooltip Trace TraceBadge TraceMark").split():
    comp(s)
for s in "blockMembers branchChip command controlGlyphs controlPanel highlighter originBadge separator slider textarea toolAliasEditor traceEditor traceTerminal".split():
    comp(s)
comp("input-group", owner="InputGroup")
comp("Collapsible", owner="FoldingChevron", note="file is named Collapsible but its component is FoldingChevron")
comp("foldingChevron", owner="FoldingChevron", aspect="Rotation & Reveal")
comp("BlockLayouts", owner="Block", aspect="Layouts")
comp("BlockPortLane", owner="BlockPort", aspect="Lane")
comp("BlockWiring", owner="WireLayer", aspect="Block Wiring")
comp("barSize", owner="Bar", aspect="Size Cascade")
comp("OffsetPaddingFor", owner="PortEdge", aspect="Offset Padding")
comp("FileNavigatorStockParts", owner="FileNavigator", aspect="Stock Parts")
comp("SettingsViewStockParts", owner="SettingsView", aspect="Stock Parts")
for stem, asp in (("TraceArrowhead", "Arrowhead"), ("TraceElbow", "Elbow"), ("TraceInteractive", "Interactive"),
                  ("TracePolarity", "Polarity"), ("TraceRouting", "Routing"), ("TraceTidy", "Tidy"), ("TraceTunnel", "Tunnel & Halo")):
    comp(stem, owner="Trace", aspect=asp)
for stem, asp in (("ElbowBundleAxes", "Bundle Axes"), ("ElbowDirectionMatrix", "Directions"), ("ElbowFanOutDirections", "Fan-Out & Obstacles")):
    comp(stem, owner="Elbow", aspect=asp, path=f"components/elbow/{stem}.stories.tsx")
for o in "Block LabeledPort Port PortEdge Trace TraceEditor".split():
    comp(None, owner=o, aspect="Hit Regions", path=f"components/hitRegions/HitRegions{o}.stories.tsx")
comp(None, owner="ChromeBar", aspect="Rename In Place", path="editor/ChromeRename.stories.tsx")

# moved out of components/ because their code lives elsewhere now
R["components/FitToContent.stories.tsx"] = dict(kit="Scene", owner="FitToContent", aspect=None, c="Block/FitToContent")
R["components/PortVariants.stories.tsx"] = dict(kit="Skin", owner="PortVariants", aspect=None, c="Port/PortVariants")
R["components/Styles.stories.tsx"] = dict(kit="Skin", owner="Styles", aspect=None, c="Skin/Styles")

def ed(stem, c, owner=None, path=None):
    R[path or f"editor/{stem}.stories.tsx"] = dict(kit="Editor", owner=owner or stem, aspect=None, c=c)
ed("AppMenu", "Chrome/Menus & Bars/AppMenu")
ed("EdgeDropMenu", "Trace/EdgeDropMenu")
ed("FocusView", "Scene/FocusView")
ed("InspectorPanel", "Chrome/Panels & Dialogs/InspectorPanel")
ed("MagnetProposals", "Trace/MagnetProposals")
ed("PortOverflowChip", "Port/PortOverflowChip")
ed("SceneCompare", "Scene/SceneCompare")
ed("SourceActions", "Scene/SourceActions")
ed("GlyphPicker", "Text & Marks/GlyphPicker", path="editor/glyphPicker/GlyphPicker.stories.tsx")

def host(stem, b, c, path=None):
    R[path or f"hosts/{stem}.stories.tsx"] = dict(kit="Hosts", owner=stem, aspect=None, b=b, c=c)
host("BlockPortHosts", "Components/Blocks/BlockPort/In A Host", "Block/BlockPort/In A Host")
host("CodeEditorHosts", "Components/Text & Marks/CodeEditor/In A Host", "Text & Marks/CodeEditor/In A Host")
host("GlyphHosts", "Components/Text & Marks/Glyph/In A Host", "Text & Marks/Glyph/In A Host")
host("FitToContentHosts", "Scene/Layout & Drag/FitToContent/In A Host", "Block/FitToContent/In A Host")
host("SceneHosts", "Scene/Model & Diff/Scene/In A Host", "Scene/Scene/In A Host")
host("SceneHostsTldraw", "Scene/Model & Diff/Scene/In tldraw", "Scene/Scene/In tldraw")
host("ValidationHosts", "Scene/Validation/ValidationLevel/In A Host", "Scene/Validation/In A Host")
host("ValidityPreview", "Scene/Validation/ValidityPreview", "Scene/Validation/Validity Preview")
host("FoldBubbling", "Scene/Validation/FoldBubbling", "Scene/Validation/Fold Bubbling")
host("PyblocksScene", "Scene/Model & Diff/Pyblocks", "Scene/Pyblocks")
host("DragPolicy", "Scene/Layout & Drag/DragPolicy", "Scene/DragPolicy")
host("WireLayerOwnership", "Components/Traces/WireLayer/Ownership", "Trace/WireLayer/Ownership")
host("DetachToPrimitive", "Scene/Model & Diff/DetachToPrimitive", "Block/DetachToPrimitive",
     path="hosts/detach/DetachToPrimitive.stories.tsx")
R["hosts/detach/DetachToPrimitive.stories.tsx"]["a"] = "Hosts/Detach/DetachToPrimitive"

def pre(stem, a, c, b=None):
    R[f"presets/{stem}.stories.tsx"] = dict(kit="Presets", owner=None, aspect=None, a=a, b=b or a, c=c)
pre("AsyncRegion", "Presets/AsyncRegion", "Region/AsyncRegion")
pre("ControlFlowBranch", "Presets/Branch", "Region/Branch", b="Presets/ControlFlow/Branch")
pre("ControlFlowLoop", "Presets/Loop", "Region/Loop", b="Presets/ControlFlow/Loop")
for stem, leaf in (("ControlFlowGallery", "Gallery"), ("ControlFlowHostEdges", "HostEdges"), ("ControlFlowRegion", "Region"),
                   ("ControlFlowToggle", "Toggle"), ("ControlFlowWires", "Wires"), ("EdgeDefaults", "EdgeDefaults")):
    pre(stem, f"Presets/ControlFlow/{leaf}", f"Region/{leaf}")
pre("ValuePreset", "Presets/Value", "Block/Value")
pre("ValuePresetHosts", "Presets/Value/ValuePresetHosts", "Block/Value/In A Host", b="Presets/Value/In A Host")

def scn(stem, c):
    R[f"scene/{stem}.stories.tsx"] = dict(kit="Scene", owner=stem, aspect=None, c=c)
scn("BatchWiring", "Trace/BatchWiring")
scn("CodeCell", "Scene/CodeCell")
scn("CollapseWireEndpoints", "Trace/CollapseWireEndpoints")
scn("Grouping", "Scene/Grouping")
scn("Linking", "Trace/Linking")
scn("Lint", "Scene/Validation/Lint")
scn("Producers", "Trace/Producers")
scn("Scene", "Scene/Scene")
scn("SceneDiff", "Scene/SceneDiff")
scn("ValidationLevel", "Scene/Validation/Level")

for stem, c in (("RegionVariants", "Region/RegionVariants"), ("SkinAtTheEdges", "Skin/SkinAtTheEdges"), ("VariantGallery", "Skin/VariantGallery")):
    R[f"skin/{stem}.stories.tsx"] = dict(kit="Skin", owner=stem, aspect=None, c=c)

SUBJECT = {  # what a story is ABOUT, for the "one home per thing" measure
    "hosts/BlockPortHosts.stories.tsx": "BlockPort", "hosts/CodeEditorHosts.stories.tsx": "CodeEditor",
    "hosts/GlyphHosts.stories.tsx": "Glyph", "hosts/FitToContentHosts.stories.tsx": "FitToContent",
    "hosts/SceneHosts.stories.tsx": "Scene", "hosts/SceneHostsTldraw.stories.tsx": "Scene",
    "hosts/ValidationHosts.stories.tsx": "ValidationLevel", "hosts/WireLayerOwnership.stories.tsx": "WireLayer",
    "hosts/PyblocksScene.stories.tsx": "Pyblocks", "hosts/detach/DetachToPrimitive.stories.tsx": "DetachToPrimitive",
    "presets/ValuePresetHosts.stories.tsx": "Value", "presets/ValuePreset.stories.tsx": "Value",
    "presets/ControlFlowBranch.stories.tsx": "Branch", "presets/ControlFlowLoop.stories.tsx": "Loop",
    "presets/AsyncRegion.stories.tsx": "AsyncRegion",
}
rows = []
missing = sorted(set(today) - set(R))
extra = sorted(set(R) - set(today))
assert not missing and not extra, (missing, extra)
for path in sorted(R):
    r = R[path]
    kit, owner, aspect = r["kit"], r["owner"], r["aspect"]
    # A: exactly what Storybook's auto-title makes of <kit>/<Owner>/<AspectStem>.stories.tsx
    a = r.get("a") or "/".join(x for x in (kit, owner, pascal(aspect) if aspect else None) if x)
    if kit == "Scene" and owner == "Scene" and not aspect:
        a = "Scene"  # scene/Scene.stories.tsx: autotitle dedupes Scene/Scene -> Scene
    if kit == "Skin" and owner == "Styles":
        a = "Skin/Styles"
    # B: kit, then a family level wherever a kit holds more than 12 owners
    if "b" in r:
        b = r["b"]
    elif kit == "Components":
        b = "/".join(x for x in ("Components", family_of[owner], owner, aspect) if x)
    elif kit == "Scene":
        b = "/".join(x for x in ("Scene", scene_family_of[owner], owner, aspect) if x)
    else:
        b = "/".join(x for x in (kit, owner, aspect) if x)
    # C: the domain object on top
    if "c" in r:
        c = r["c"]
    else:
        c = "/".join(x for x in (C_ROOT[family_of[owner]], owner, aspect) if x)
    obj = c.split("/")[0]
    subject = SUBJECT.get(path) or owner or "ControlFlow"
    rows.append(dict(path=path, subject=subject, today=today[path], a=a, b=b, c=c, kit=kit.lower(),
                     object=obj.lower().replace(" & ", "-"), note=r.get("note")))

json.dump(dict(generated="2026-09-22", source=f"{URL} (Zach's Storybook, bbox-ui-toolbar @ 194b4a7)",
               rows=rows), open(OUT, "w"), indent=1)
print(len(rows), "rows")
