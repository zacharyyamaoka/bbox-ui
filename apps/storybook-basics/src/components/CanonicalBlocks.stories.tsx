import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { EllipsisVertical } from "lucide-react";

import { Badge } from "./badge";
import { Bar } from "./bar";
import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { BlockOpaqueTitle } from "./blockOpaqueTitle";
import { BlockPort } from "./blockPort";
import { Button } from "./button";
import { CodeEditor } from "./codeEditor";
import { Glyph } from "./glyph";
import type { PortEdgeItem } from "./portEdge";
import type { BlockSide } from "./port.layout";
import { Text } from "./text";

/**
 * Blocks/Canonical views — a gallery of real block TYPES already in this
 * trunk, each rendered in its four canonical presentations (Zach,
 * 2026-09-22): "add story books that shows block in its canonical form
 * (Simple, Port, Expanded, Expanded Opaque) ... I want to see a gallery
 * with 4 columns, and then many rows that show this for different types
 * of blocks!"
 *
 * Every cell composes REAL trunk components (`Block`, `BlockPort`,
 * `BlockOpaqueTitle`, `Bar`, `Glyph`, `CodeEditor`, ...) over data drawn
 * from an existing story fixture — the source file:line is in every row's
 * caption, never invented from scratch. `block.tsx`, `blockPort.tsx`,
 * `blockMembers.tsx`, `blockOpaqueTitle.tsx`, `portEdge.tsx`,
 * `labeledPort.tsx`, `port.tsx` and every `*.layout.ts` are read-only from
 * here — this file only composes them.
 *
 * The Opaque column goes through ONE seam, `renderOpaqueCell` (below): the
 * same frame, same width/height and same ports as the Expanded cell, an
 * empty header `Bar`, no members, and `BlockOpaqueTitle` centred in the
 * body — mirroring `SideEffectPorts.stories.tsx`'s "Expanded View Opaque"
 * case (`SideEffectPorts.stories.tsx:106-118`, `blockOpaqueTitle.tsx`)
 * exactly. There is no fourth `BlockView` id — `BlockPort`'s own `view`
 * stays `"expanded"` for the opaque face too, because that is what the
 * real component that landed does. See the "Gaps vs the canonical sketch"
 * note at the bottom of this file for where that real rendering and
 * Zach's sketch disagree.
 */

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                   */
/* ------------------------------------------------------------------ */

/** `SideEffectPorts.stories.tsx:59` — "port"/"Any" is Zach's own sketch
 *  wording for a generic, untyped port; reused verbatim rather than
 *  inventing a second label grammar for the same thing. */
const anyPort = (id: string, state?: PortEdgeItem["state"]): PortEdgeItem => ({
  id,
  label: "port",
  type: "Any",
  ...(state ? { state } : null),
});

/** `SideEffectPorts.stories.tsx:64-78` — glyph + Title + muted Type, the
 *  header every Port/Expanded/Opaque cell below composes from. */
function TitleTypeHeader({ glyphContent, title, type }: { glyphContent?: string; title: string; type?: string }) {
  return (
    <Bar
      left={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {glyphContent !== undefined && <Glyph content={glyphContent} />}
          <span style={{ fontWeight: 600 }}>{title}</span>
          {type !== undefined && (
            <span className="text-muted-foreground" style={{ fontSize: 12 }}>
              {type}
            </span>
          )}
        </span>
      }
    />
  );
}

/** `SideEffectPorts.stories.tsx:80` — the empty footer band the sketch's
 *  Port column shows. */
const FOOTER = <Bar size="sm" />;

/* ------------------------------------------------------------------ */
/* The Opaque seam — the ONE place every row's Opaque cell is built     */
/* ------------------------------------------------------------------ */

interface OpaqueCellSpec {
  id: string;
  glyphContent?: string;
  title: string;
  type?: string;
  edges?: Partial<Record<BlockSide, PortEdgeItem[]>>;
  footer?: ReactNode;
  width: number;
  height: number;
}

/**
 * The dispatcher, 2026-09-22: the side-effect-ports lane landed
 * `blockOpaqueTitle.tsx` and its reference usage is
 * `SideEffectPorts.stories.tsx`'s "Expanded View Opaque" case
 * (`SideEffectPorts.stories.tsx:106-118`) — mirrored here exactly: the
 * same width/height and ports the row's Expanded cell uses, an empty
 * header `Bar`, NO `members`, and `BlockOpaqueTitle` as the body. `Block`
 * itself is unchanged; only what gets passed to it differs from the
 * Expanded cell.
 *
 * ONE seam for every row — a future row only ever calls this, never
 * hand-rolls its own opaque face.
 */
function renderOpaqueCell(row: OpaqueCellSpec): ReactNode {
  const edges: Partial<Record<BlockSide, { items: PortEdgeItem[] }>> = {};
  for (const side of ["left", "right", "top", "bottom"] as BlockSide[]) {
    const items = row.edges?.[side];
    if (items) edges[side] = { items };
  }
  return (
    <BlockPort id={`${row.id}-opaque`} view="expanded" edges={edges}>
      <Block
        header={<Bar />}
        body={<BlockOpaqueTitle glyph={row.glyphContent !== undefined ? <Glyph content={row.glyphContent} /> : undefined} title={row.title} type={row.type} />}
        footer={row.footer}
        width={row.width}
        height={row.height}
      />
    </BlockPort>
  );
}

/* ------------------------------------------------------------------ */
/* Gallery chrome — grid, sticky headers, row/cell wrappers            */
/* ------------------------------------------------------------------ */

const COLUMN_LABELS = ["Simple", "Port", "Expanded", "Expanded Opaque"] as const;
type ColumnId = "simple" | "port" | "expanded" | "opaque";
const COLUMN_IDS: ColumnId[] = ["simple", "port", "expanded", "opaque"];

function GalleryHeader() {
  return (
    <>
      {COLUMN_LABELS.map((label, i) => (
        <div
          key={label}
          data-slot="canonical-gallery-header-cell"
          data-col={COLUMN_IDS[i]}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "var(--background)",
            borderBottom: "1px solid var(--border)",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "var(--muted-foreground)",
          }}
        >
          {label}
        </div>
      ))}
    </>
  );
}

interface RowSpec {
  id: string;
  name: string;
  source: string;
  caption: string;
  cells: Record<ColumnId, ReactNode>;
}

function GalleryRow({ row }: { row: RowSpec }) {
  return (
    <div data-testid="gallery-row" data-row-id={row.id} style={{ display: "contents" }}>
      <div style={{ gridColumn: "1 / -1", paddingTop: 20, paddingBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{row.name}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {row.source} — {row.caption}
        </div>
      </div>
      {COLUMN_IDS.map((col) => (
        <div
          key={col}
          data-slot="canonical-gallery-cell"
          data-col={col}
          style={{ padding: "4px 12px 20px", display: "flex", alignItems: "flex-start" }}
        >
          {row.cells[col]}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row 1 — controller(): the sketch's own canonical Title/Type block,   */
/* verbatim from SideEffectPorts.stories.tsx's fixture.                 */
/* ------------------------------------------------------------------ */

const BLOCK_WIDTH = 240;
const EXPANDED_WIDTH = 320;
const MEMBER_GUTTER = 88;
const PORT_FACE_HEIGHT = 230;
const EXPANDED_FACE_HEIGHT = 290;
const SIMPLE_HEIGHT = 150;

// `SideEffectPorts.stories.tsx:61-62` — 4 left, 2 right, all "port"/"Any".
const CONTROLLER_LEFT: PortEdgeItem[] = ["p1", "p2", "p3", "p4"].map((id) => anyPort(id));
const CONTROLLER_RIGHT: PortEdgeItem[] = ["q1", "q2"].map((id) => anyPort(id));

/** `SideEffectPorts.stories.tsx:82-87`'s `childMembers()`, extended: the
 *  middle member is wrapped in its own `BlockPort` with a single port —
 *  the sketch's "3 child members, one with its own port Any" — an
 *  extension the fixture itself doesn't carry, called out here rather
 *  than silently presented as verbatim. */
function controllerMembers(): BlockMember[] {
  const plain = (id: string) => <Block header="Child Member" width={EXPANDED_WIDTH - 2 * MEMBER_GUTTER - 2} />;
  return [
    { id: "m1", content: plain("m1") },
    {
      id: "m2",
      content: (
        <BlockPort id="controller-m2" view="port" edges={{ left: { items: [anyPort("m2-signal")] } }}>
          <Block header="Child Member" width={EXPANDED_WIDTH - 2 * MEMBER_GUTTER - 2} />
        </BlockPort>
      ),
    },
    { id: "m3", content: plain("m3") },
  ];
}

function ControllerSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:rocket" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>controller()</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            Function
          </Text>
        </div>
      }
    />
  );
}

const CONTROLLER_ROW: RowSpec = {
  id: "controller",
  name: "controller() — the sketch's Title/Type block",
  source: "SideEffectPorts.stories.tsx:45-118",
  caption: "4 left ports, 2 right ports, 3 members (m2 extended with its own port — see caption above)",
  cells: {
    simple: <ControllerSimple />,
    port: (
      <BlockPort id="controller-port" view="port" edges={{ left: { items: CONTROLLER_LEFT }, right: { items: CONTROLLER_RIGHT } }}>
        <Block header={<TitleTypeHeader glyphContent="lucide:rocket" title="controller()" type="Function" />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />
      </BlockPort>
    ),
    expanded: (
      <BlockPort id="controller-expanded" view="expanded" edges={{ left: { items: CONTROLLER_LEFT }, right: { items: CONTROLLER_RIGHT } }}>
        <Block
          header={<TitleTypeHeader glyphContent="lucide:rocket" title="controller()" type="Function" />}
          members={controllerMembers()}
          membersLayout="stack"
          memberGutter={MEMBER_GUTTER}
          footer={FOOTER}
          width={EXPANDED_WIDTH}
          height={EXPANDED_FACE_HEIGHT}
        />
      </BlockPort>
    ),
    opaque: renderOpaqueCell({
      id: "controller",
      glyphContent: "lucide:rocket",
      title: "controller()",
      type: "Function",
      edges: { left: CONTROLLER_LEFT, right: CONTROLLER_RIGHT },
      footer: FOOTER,
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 2 — planner_node: the classic input/output DAG.                  */
/* ------------------------------------------------------------------ */

// `BlockPort.stories.tsx:127-136` — INPUTS/OUTPUTS recreated by id/label/
// state (that file does not export them).
const PLANNER_LEFT: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "gain", label: "gain", state: "valueSet" },
  { id: "reset", label: "reset", state: "empty" },
];
const PLANNER_RIGHT: PortEdgeItem[] = [
  { id: "cmd", label: "cmd", state: "wired" },
  { id: "status", label: "status", state: "empty" },
];

function PlannerSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:rocket" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>planner_node</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            Node
          </Text>
        </div>
      }
    />
  );
}

const PLANNER_ROW: RowSpec = {
  id: "planner",
  name: "planner_node — classic input/output DAG",
  source: "BlockPort.stories.tsx:127-136, 230-336, 399-...",
  caption: "3 left ports, 2 right ports, no members — the ClassicDag/ExpandedView pair, ported by data",
  cells: {
    simple: <PlannerSimple />,
    port: (
      <BlockPort id="planner-port" view="port" edges={{ left: { items: PLANNER_LEFT }, right: { items: PLANNER_RIGHT } }}>
        <Block header={<TitleTypeHeader glyphContent="lucide:rocket" title="planner_node" type="Node" />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />
      </BlockPort>
    ),
    expanded: (
      <BlockPort id="planner-expanded" view="expanded" edges={{ left: { items: PLANNER_LEFT }, right: { items: PLANNER_RIGHT } }}>
        <Block header={<TitleTypeHeader glyphContent="lucide:rocket" title="planner_node" type="Node" />} footer={FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />
      </BlockPort>
    ),
    opaque: renderOpaqueCell({
      id: "planner",
      glyphContent: "lucide:rocket",
      title: "planner_node",
      type: "Node",
      edges: { left: PLANNER_LEFT, right: PLANNER_RIGHT },
      footer: FOOTER,
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 3 — camera_node: no ports at all, kebab menu in the footer.      */
/* ------------------------------------------------------------------ */

function CameraHeader({ size = "md" as const }: { size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <Bar
      size={size}
      left={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Glyph content="lucide:anchor" />
          <span style={{ fontWeight: 600 }}>camera_node</span>
          <span className="text-muted-foreground" style={{ fontSize: 12 }}>
            Function
          </span>
        </span>
      }
    />
  );
}

const CAMERA_FOOTER = (
  <Bar size="sm" right={<Button variant="ghost" size="icon-sm" aria-label="More options"><EllipsisVertical /></Button>} />
);

function CameraSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:anchor" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>camera_node</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            Function
          </Text>
        </div>
      }
    />
  );
}

const CAMERA_ROW: RowSpec = {
  id: "camera",
  name: "camera_node — no ports, kebab footer",
  source: "BlockLayouts.stories.tsx:239-289 (HeaderKebabBlock) + Block.stories.tsx:240-292 (FooterMenuBlock)",
  caption: "no ports on any wall — header + kebab menu carry the block, matching Zach's own PortView rule",
  cells: {
    simple: <CameraSimple />,
    port: <Block header={<CameraHeader />} body="" footer={CAMERA_FOOTER} width={300} height={PORT_FACE_HEIGHT} />,
    expanded: <Block header={<CameraHeader />} footer={CAMERA_FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />,
    opaque: renderOpaqueCell({
      id: "camera",
      glyphContent: "lucide:anchor",
      title: "camera_node",
      type: "Function",
      footer: CAMERA_FOOTER,
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 4 — Component: a class block, 3 stacked method members, no       */
/* ports at all (the members-without-ports contrast to row 1).          */
/* ------------------------------------------------------------------ */

const METHOD_NAMES = ["__init__()", "__call__()", "in_1_cb()"];

function classMethodMembers(): BlockMember[] {
  return METHOD_NAMES.map((name) => ({
    id: name,
    content: (
      <Block
        style={{ width: "100%" }}
        header={
          <Bar
            size="sm"
            left={
              <span className="font-mono" style={{ fontSize: 12 }}>
                {name}
              </span>
            }
          />
        }
      />
    ),
  }));
}

function ComponentHeader() {
  return (
    <Bar
      left={
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Glyph content="lucide:circle" />
          <span style={{ fontWeight: 600 }}>Component</span>
        </span>
      }
      right={<Badge variant="secondary">class</Badge>}
    />
  );
}

function ComponentSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:circle" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>Component</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            class
          </Text>
        </div>
      }
    />
  );
}

const COMPONENT_ROW: RowSpec = {
  id: "component",
  name: "Component — class, 3 stacked methods, no ports",
  source: "Block.stories.tsx:848-909 (ClassExample)",
  caption: "members carry the row instead of ports — the class/methods pattern, byte-identical members recipe",
  cells: {
    simple: <ComponentSimple />,
    port: <Block header={<ComponentHeader />} body="" footer={<Bar size="sm" center={`${METHOD_NAMES.length} methods`} />} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />,
    expanded: (
      <Block
        header={<ComponentHeader />}
        members={classMethodMembers()}
        membersLayout="stack"
        insetBackground="soft-gray"
        footer={<Bar size="sm" center={`${METHOD_NAMES.length} methods`} />}
        width={EXPANDED_WIDTH}
        height={EXPANDED_FACE_HEIGHT}
      />
    ),
    opaque: renderOpaqueCell({
      id: "component",
      glyphContent: "lucide:circle",
      title: "Component",
      type: "class",
      footer: <Bar size="sm" center={`${METHOD_NAMES.length} methods`} />,
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 5 — Pose: a struct with a real `description`, no ports.          */
/* ------------------------------------------------------------------ */

const POSE_DESCRIPTION = "shared by perception_node and controller()";

function PoseHeader() {
  return <Bar left={<span style={{ fontWeight: 600 }}>Pose</span>} right={<span className="text-muted-foreground" style={{ fontSize: 12 }}>Struct</span>} />;
}

function PoseSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: 600 }}>Pose</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            {POSE_DESCRIPTION}
          </Text>
          <Text tone="muted" style={{ fontSize: 11, fontStyle: "italic" }}>
            Struct
          </Text>
        </div>
      }
    />
  );
}

const POSE_ROW: RowSpec = {
  id: "pose",
  name: "Pose — struct with a real description",
  source: "BlockDescription.stories.tsx:43-58 (the real `description` prop) + BlockLayouts.stories.tsx:116-130",
  caption: "the description region is Block's own `description` prop, not body text this time",
  cells: {
    simple: <PoseSimple />,
    port: <Block header={<PoseHeader />} description={POSE_DESCRIPTION} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />,
    expanded: <Block header={<PoseHeader />} description={POSE_DESCRIPTION} footer={FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />,
    opaque: renderOpaqueCell({ id: "pose", title: "Pose", type: "Struct", footer: FOOTER, width: EXPANDED_WIDTH, height: EXPANDED_FACE_HEIGHT }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 6 — map_loader(): glyph + description together, no ports.        */
/* ------------------------------------------------------------------ */

const MAP_LOADER_DESCRIPTION = "loads the static occupancy map";

function MapLoaderHeader() {
  return <TitleTypeHeader glyphContent="lucide:play" title="map_loader()" type="Function" />;
}

function MapLoaderSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Glyph content="lucide:play" sizePreset="md" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: 600 }}>map_loader()</Text>
            <Text tone="muted" style={{ fontSize: 11 }}>
              {MAP_LOADER_DESCRIPTION}
            </Text>
            <Text tone="muted" style={{ fontSize: 11, fontStyle: "italic" }}>
              Function
            </Text>
          </div>
        </div>
      }
    />
  );
}

const MAP_LOADER_ROW: RowSpec = {
  id: "map-loader",
  name: "map_loader() — glyph + description, no ports",
  source: "BlockLayouts.stories.tsx:132-148 (\"w/ type & description & icon\")",
  caption: "the Simple cell reproduces the whiteboard specimen verbatim; Port/Expanded add the real `description` prop",
  cells: {
    simple: <MapLoaderSimple />,
    port: <Block header={<MapLoaderHeader />} description={MAP_LOADER_DESCRIPTION} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />,
    expanded: <Block header={<MapLoaderHeader />} description={MAP_LOADER_DESCRIPTION} footer={FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />,
    opaque: renderOpaqueCell({ id: "map-loader", glyphContent: "lucide:play", title: "map_loader()", type: "Function", footer: FOOTER, width: EXPANDED_WIDTH, height: EXPANDED_FACE_HEIGHT }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 7 — Attributes: a code-cell block, a CodeEditor as a member.     */
/* ------------------------------------------------------------------ */

const ATTRIBUTES_LEFT: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "quality", label: "quality", state: "valueSet" },
];

function AttributesEditorMember() {
  const [code, setCode] = useState("pose: Pose\nquality: float");
  return <CodeEditor value={code} onWrite={setCode} multiline ariaLabel="attributes" />;
}

function attributesMembers(): BlockMember[] {
  return [{ id: "code", content: <AttributesEditorMember /> }];
}

function AttributesHeader() {
  return <Bar size="sm" left={<Text style={{ fontSize: 12 }}>Attributes</Text>} />;
}

function AttributesSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:circle" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>Attributes</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            code cell
          </Text>
        </div>
      }
    />
  );
}

const ATTRIBUTES_ROW: RowSpec = {
  id: "attributes",
  name: "Attributes — code-cell block (CodeEditor member)",
  source: "Block.stories.tsx:918-989 (AttributesCard / CodeInsideBlock)",
  caption: "a CodeEditor is a member, boxes all the way down; the 2 left ports mirror the fields it edits (this row's own extension)",
  cells: {
    simple: <AttributesSimple />,
    port: (
      <BlockPort id="attributes-port" view="port" edges={{ left: { items: ATTRIBUTES_LEFT } }}>
        <Block header={<AttributesHeader />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />
      </BlockPort>
    ),
    expanded: (
      <BlockPort id="attributes-expanded" view="expanded" edges={{ left: { items: ATTRIBUTES_LEFT } }}>
        <Block header={<AttributesHeader />} members={attributesMembers()} membersLayout="stack" memberGutter={MEMBER_GUTTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />
      </BlockPort>
    ),
    opaque: renderOpaqueCell({
      id: "attributes",
      glyphContent: "lucide:circle",
      title: "Attributes",
      type: "code cell",
      edges: { left: ATTRIBUTES_LEFT },
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 8 — Hub: ports on all four walls.                                */
/* ------------------------------------------------------------------ */

// `BlockPort.stories.tsx:589-607` — FOUR_EDGE_ITEMS recreated by id/label/
// state (that file does not export it).
const HUB_LEFT: PortEdgeItem[] = [
  { id: "in-a", label: "a", state: "wired" },
  { id: "in-b", label: "b", state: "empty" },
  { id: "in-c", label: "c", state: "empty" },
];
const HUB_RIGHT: PortEdgeItem[] = [
  { id: "out-a", label: "x", state: "wired" },
  { id: "out-b", label: "y", state: "empty" },
];
const HUB_TOP: PortEdgeItem[] = [
  { id: "top-a", label: "cfg", state: "valueSet" },
  { id: "top-b", label: "clk", state: "empty" },
];
const HUB_BOTTOM: PortEdgeItem[] = [
  { id: "bot-a", label: "log", state: "empty" },
  { id: "bot-b", label: "err", state: "received" },
];

function HubSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>Hub</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            4 walls
          </Text>
        </div>
      }
    />
  );
}

const HUB_ROW: RowSpec = {
  id: "hub",
  name: "Hub — ports on all four walls",
  source: "BlockPort.stories.tsx:589-645 (FourEdges)",
  caption: "9 ports across left/right/top/bottom, no members — grouped ports (PortEdge groups/groupMode) not exercised here, see the gap list",
  cells: {
    simple: <HubSimple />,
    port: (
      <BlockPort id="hub-port" view="port" edges={{ left: { items: HUB_LEFT }, right: { items: HUB_RIGHT }, top: { items: HUB_TOP }, bottom: { items: HUB_BOTTOM } }}>
        <Block header={<TitleTypeHeader title="Hub" type="Node" />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />
      </BlockPort>
    ),
    expanded: (
      <BlockPort id="hub-expanded" view="expanded" edges={{ left: { items: HUB_LEFT }, right: { items: HUB_RIGHT }, top: { items: HUB_TOP }, bottom: { items: HUB_BOTTOM } }}>
        <Block header={<TitleTypeHeader title="Hub" type="Node" />} footer={FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />
      </BlockPort>
    ),
    opaque: renderOpaqueCell({
      id: "hub",
      title: "Hub",
      type: "Node",
      edges: { left: HUB_LEFT, right: HUB_RIGHT, top: HUB_TOP, bottom: HUB_BOTTOM },
      footer: FOOTER,
      width: EXPANDED_WIDTH,
      height: EXPANDED_FACE_HEIGHT,
    }),
  },
};

/* ------------------------------------------------------------------ */
/* Row 9 — arm_supervisor(): a nested expanded member, boxes all the    */
/* way down two levels deep.                                            */
/* ------------------------------------------------------------------ */

function nestedMembers(): BlockMember[] {
  return [
    {
      id: "inner",
      content: (
        <Block
          style={{ width: "100%" }}
          header={<Bar size="sm" left={<span style={{ fontSize: 12, fontWeight: 600 }}>inner()</span>} />}
          members={[{ id: "leaf", content: <Block style={{ width: "100%" }} header={<Bar size="sm" left={<span style={{ fontSize: 11 }}>leaf()</span>} />} /> }]}
          membersLayout="stack"
        />
      ),
    },
  ];
}

function ArmSupervisorHeader() {
  return <TitleTypeHeader glyphContent="lucide:rocket" title="arm_supervisor()" type="Function" />;
}

function ArmSupervisorSimple() {
  return (
    <Block
      width={BLOCK_WIDTH}
      height={SIMPLE_HEIGHT}
      body={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:rocket" sizePreset="lg" />
          <Text style={{ fontSize: 14, fontWeight: 600 }}>arm_supervisor()</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            Function
          </Text>
        </div>
      }
    />
  );
}

const ARM_SUPERVISOR_ROW: RowSpec = {
  id: "arm-supervisor",
  name: "arm_supervisor() — nested expanded member, two levels deep",
  source: "Block.stories.tsx:844-909 (ClassExample's nesting) + blockMembers.tsx:76 (\"boxes all the way down\")",
  caption: "a member (inner()) whose own content is a Block with its own member (leaf()) — real nesting, not a flat list",
  cells: {
    simple: <ArmSupervisorSimple />,
    port: <Block header={<ArmSupervisorHeader />} body="" footer={FOOTER} width={BLOCK_WIDTH} height={PORT_FACE_HEIGHT} />,
    expanded: <Block header={<ArmSupervisorHeader />} members={nestedMembers()} membersLayout="stack" insetBackground="soft-gray" footer={FOOTER} width={EXPANDED_WIDTH} height={EXPANDED_FACE_HEIGHT} />,
    opaque: renderOpaqueCell({ id: "arm-supervisor", glyphContent: "lucide:rocket", title: "arm_supervisor()", type: "Function", footer: FOOTER, width: EXPANDED_WIDTH, height: EXPANDED_FACE_HEIGHT }),
  },
};

/* ------------------------------------------------------------------ */
/* The gallery                                                          */
/* ------------------------------------------------------------------ */

const ROWS: RowSpec[] = [
  CONTROLLER_ROW,
  PLANNER_ROW,
  CAMERA_ROW,
  COMPONENT_ROW,
  POSE_ROW,
  MAP_LOADER_ROW,
  ATTRIBUTES_ROW,
  HUB_ROW,
  ARM_SUPERVISOR_ROW,
];

/**
 * "Considered but excluded" — the For Loop / Branch corner-card blocks
 * (`presets/loop/loop.ts`, `presets/branch/branch.ts`, `hosts/nodeViews.tsx`
 * §"opaque region"). Their corner interface is a real `BlockPort`
 * (`loop.ts:50,52,129` — `Iterable` in, `Iter` out), but the CARD a region
 * shows is produced by `hosts/nodeViews.tsx`'s region rendering over a full
 * `HostScene`/`DomCanvas` — a scene, a frame, arms and a host adapter, not
 * a standalone Block a caller mounts. Region "opaque" (nodeViews.tsx:547)
 * is also a genuinely different axis from this file's Simple/Port/Expanded/
 * Expanded-Opaque — it toggles a REGION's frame between the corner card and
 * a full card wearing the region's promoted ports, not a block's own body.
 * Forcing it into this table's four columns would mean either dragging the
 * whole scene/host machinery into a components-only gallery (out of this
 * file's write set in spirit, if not by path) or faking a card that only
 * looks like the real one — the brief's own "never a fake drawing that
 * looks real" rule. Left out rather than done dishonestly; see the gap
 * list below for the write-up this decision itself is part of.
 */

function GalleryGaps() {
  return (
    <details style={{ marginTop: 32, fontSize: 12, color: "var(--muted-foreground)", maxWidth: 900 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--foreground)" }}>Gaps vs the canonical sketch</summary>
      <ul style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <li>
          <b>Simple</b> has no single canonical component. The sketch shows one fixed recipe (glyph, large Title, Description, Type,
          all centred); the real trunk has no "SimpleFace" — every caller composes its own <code>body</code> (BlockLayouts.stories.tsx's
          9 different specimens, none matching each other). This file's <code>*Simple</code> helpers are gallery-local compositions of
          real pieces (<code>Glyph</code>, <code>Text</code>), not a trunk component — a future "SimpleFace" would need to be a real
          design decision, not inferred from this gallery.
        </li>
        <li>
          <b>Port</b> matches the sketch closely: header row (glyph + Title + muted Type), ports labelled "port Any" on populated walls,
          empty footer band. One difference not verified here — <code>portLayout="inline"</code> (the default) PACKS ports from the top
          of the body band rather than spreading them across its full height (<code>blockPort.layout.ts</code>'s own donor citation on
          <code>railPlanFor</code>); the sketch's Port column reads as evenly spread. Worth a side-by-side screenshot check, not asserted
          here as fact.
        </li>
        <li>
          <b>Expanded</b> header has no toggle icon at all — <code>TitleTypeHeader</code> (this file, and its donor
          <code>SideEffectPorts.stories.tsx:64-78</code>) never renders one; the sketch shows a small HOLLOW square at the header's
          top-right. Confirmed by the side-effect-ports lane (2026-09-22): no toggle exists anywhere in the trunk yet.
        </li>
        <li>
          <b>Expanded Opaque</b> — confirmed by the side-effect-ports lane, 2026-09-22, against Zach's own sketch:
          <ul style={{ marginTop: 4, paddingLeft: 18 }}>
            <li>
              the header IS empty (<code>header=&#123;&lt;Bar /&gt;&#125;</code>, <code>SideEffectPorts.stories.tsx:111</code>) but carries
              no FILLED square icon at its top-right — the sketch shows one, the real render shows nothing.
            </li>
            <li>
              <code>BlockOpaqueTitle</code> (<code>blockOpaqueTitle.tsx:32-47</code>) lays glyph + Title/Type out as a small INLINE row
              (<code>display: flex; alignItems: center; gap: 8</code>), left-aligned text — the sketch shows a LARGE glyph stacked ABOVE
              a large centred Title and Type, closer in spirit to this file's own <code>*Simple</code> cells than to what
              <code>BlockOpaqueTitle</code> actually renders.
            </li>
          </ul>
        </li>
        <li>
          <b>Hub row</b> (ports on all four walls) does not exercise <code>PortEdge</code>'s <code>groups</code>/<code>groupMode</code> —
          every port on a wall is ungrouped here. A "grouped ports" specimen (e.g. request/response adjacent on one wall,
          <code>blockPort.tsx</code>'s <code>BlockEdgeSpec.groups</code> doc) is a real gap in this gallery's coverage, not in the
          component.
        </li>
        <li>
          <b>For Loop / Branch corner-card blocks</b> are deliberately not rows here — see the code comment above this note for why
          (a region's card is scene/host-rendered, not a standalone Block, and its own "opaque" toggles the FRAME, not a block body).
        </li>
      </ul>
    </details>
  );
}

function CanonicalBlocksGallery() {
  return (
    <div data-testid="canonical-gallery" style={{ maxHeight: "82vh", overflow: "auto", padding: "0 16px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(340px, 1fr))", columnGap: 16 }}>
        <GalleryHeader />
        {ROWS.map((row) => (
          <GalleryRow key={row.id} row={row} />
        ))}
      </div>
      <GalleryGaps />
    </div>
  );
}

const meta = {
  title: "Blocks/Canonical views",
  tags: ["area:blocks", "lane:canonical-block-gallery"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The story + its play function                                        */
/* ------------------------------------------------------------------ */

function headerCells(canvasElement: HTMLElement): HTMLElement[] {
  return Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-slot="canonical-gallery-header-cell"]'));
}

function rowCells(canvasElement: HTMLElement, rowId: string): Record<ColumnId, HTMLElement> {
  const row = canvasElement.querySelector<HTMLElement>(`[data-testid="gallery-row"][data-row-id="${rowId}"]`);
  if (!row) throw new Error(`expected a gallery row for "${rowId}"`);
  const out: Partial<Record<ColumnId, HTMLElement>> = {};
  for (const col of COLUMN_IDS) {
    const cell = row.querySelector<HTMLElement>(`[data-slot="canonical-gallery-cell"][data-col="${col}"]`);
    if (!cell) throw new Error(`expected a "${col}" cell in row "${rowId}"`);
    out[col] = cell;
  }
  return out as Record<ColumnId, HTMLElement>;
}

export const Gallery: Story = {
  render: () => <CanonicalBlocksGallery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // findBy* first — this repo's own rule (CLAUDE.md): don't demand the
    // gallery on the very first tick.
    const gallery = await canvas.findByTestId("canonical-gallery");
    await expect(gallery).toBeInTheDocument();

    /* -------------------------------------------------------------- */
    /* 1. The four headers, left to right, in the exact stated order.   */
    /* -------------------------------------------------------------- */
    const headers = headerCells(canvasElement);
    await expect(headers).toHaveLength(4);
    await expect(headers.map((h) => h.textContent)).toEqual(["Simple", "Port", "Expanded", "Expanded Opaque"]);
    const headerRects = headers.map((h) => h.getBoundingClientRect());
    for (let i = 1; i < headerRects.length; i++) {
      if (!(headerRects[i].left > headerRects[i - 1].left)) {
        throw new Error(`header "${headers[i].textContent}" (left=${headerRects[i].left.toFixed(1)}) is not right of "${headers[i - 1].textContent}" (left=${headerRects[i - 1].left.toFixed(1)})`);
      }
    }

    /* -------------------------------------------------------------- */
    /* 2. Every row: one cell per column, x-aligned with its header.    */
    /* -------------------------------------------------------------- */
    const rows = canvasElement.querySelectorAll('[data-testid="gallery-row"]');
    await expect(rows).toHaveLength(ROWS.length);

    for (const row of ROWS) {
      const cells = rowCells(canvasElement, row.id);
      for (let i = 0; i < COLUMN_IDS.length; i++) {
        const col = COLUMN_IDS[i];
        const cellRect = cells[col].getBoundingClientRect();
        const headerRect = headerRects[i];
        const delta = Math.abs(cellRect.left - headerRect.left);
        if (!(delta <= 2)) {
          throw new Error(`row "${row.id}" cell "${col}" left=${cellRect.left.toFixed(1)} is ${delta.toFixed(1)}px off header left=${headerRect.left.toFixed(1)} (>2px)`);
        }
      }
    }

    /* -------------------------------------------------------------- */
    /* 3. Per-cell rendered view, on every row: the trunk's own          */
    /* data-* marker where one exists, else member/port presence.       */
    /* -------------------------------------------------------------- */
    for (const row of ROWS) {
      const cells = rowCells(canvasElement, row.id);

      // Simple: never a `[data-slot="block-port"]` wrapper (no ports at
      // all in this column), and never a member.
      await expect(cells.simple.querySelector('[data-slot="block-port"]')).toBeNull();
      await expect(cells.simple.querySelector('[data-slot="block-member"]')).toBeNull();
      await expect(cells.simple.querySelector('[data-slot="block"]')).not.toBeNull();

      // Port: no members ever (matches the real trunk's own PortView
      // story — members are never passed alongside a Port face here).
      await expect(cells.port.querySelector('[data-slot="block-member"]')).toBeNull();
      const portWrapper = cells.port.querySelector('[data-slot="block-port"]');
      if (portWrapper) {
        await expect(portWrapper.getAttribute("data-view")).toBe("port");
      }

      // Expanded: BlockPort's own `data-view="expanded"` marker where the
      // row has ports; a members region where the row has members.
      const expandedWrapper = cells.expanded.querySelector('[data-slot="block-port"]');
      if (expandedWrapper) {
        await expect(expandedWrapper.getAttribute("data-view")).toBe("expanded");
      }

      // Opaque: every row goes through the one seam, so every row's
      // Opaque cell carries `data-view="expanded"` (the real component
      // keeps BlockPort's view at "expanded" for the opaque face — see
      // this file's own header comment), a `block-opaque-title` body, and
      // NEVER a members region — the opaque face hides members by
      // construction (renderOpaqueCell never passes `members`).
      const opaqueWrapper = cells.opaque.querySelector('[data-slot="block-port"]');
      if (!opaqueWrapper) throw new Error(`row "${row.id}" — expected the Opaque cell to go through BlockPort`);
      await expect(opaqueWrapper.getAttribute("data-view")).toBe("expanded");
      await expect(cells.opaque.querySelector('[data-slot="block-opaque-title"]')).not.toBeNull();
      await expect(cells.opaque.querySelector('[data-slot="block-member"]')).toBeNull();
    }

    /* -------------------------------------------------------------- */
    /* 4. Rows that DO carry ports show at least one rail somewhere in  */
    /* their Port and Expanded cells (a spot check, not exhaustive —    */
    /* the per-component port geometry is BlockPort.stories.tsx's job). */
    /* -------------------------------------------------------------- */
    for (const rowId of ["controller", "planner", "hub"]) {
      const cells = rowCells(canvasElement, rowId);
      await expect(cells.port.querySelectorAll('[data-slot="block-port-rail"]').length).toBeGreaterThan(0);
      await expect(cells.expanded.querySelectorAll('[data-slot="block-port-rail"]').length).toBeGreaterThan(0);
    }

    // camera_node carries NO ports anywhere — the negative case.
    const camera = rowCells(canvasElement, "camera");
    await expect(camera.port.querySelectorAll('[data-slot="block-port-rail"]')).toHaveLength(0);
    await expect(camera.expanded.querySelectorAll('[data-slot="block-port-rail"]')).toHaveLength(0);

    /* -------------------------------------------------------------- */
    /* 5. Rows that DO carry members show one in their Expanded cell,   */
    /* and none in Simple/Port/Opaque (checked above, generically).     */
    /* -------------------------------------------------------------- */
    for (const rowId of ["controller", "component", "attributes", "arm-supervisor"]) {
      const cells = rowCells(canvasElement, rowId);
      await expect(cells.expanded.querySelectorAll('[data-slot="block-member"]').length).toBeGreaterThan(0);
    }
  },
};
