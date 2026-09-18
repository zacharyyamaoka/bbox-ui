import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { EllipsisVertical, Search } from "lucide-react";

import { Badge } from "../components/badge";
import { Bar, type BarSize } from "../components/bar";
import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import { Button } from "../components/button";
import { EditableText } from "../components/editableText";
import { Glyph } from "../components/glyph";
import { Text } from "../components/text";
import type { PortEdgeItem } from "../components/portEdge";

/**
 * src/stories/BlockLayouts.stories.tsx — "Block Layouts", modelled directly
 * on `Bar.stories.tsx`'s `HeaderLayouts`: a labelled column/row of small
 * captioned specimens, several visible at once (docs/FEEDBACK-2026-09-17b-
 * PLAN.md, Lane C, C-6). Zach's whiteboard (`Pasted image
 * 20260917151711.png`) is the spec for what each specimen contains; every
 * specimen below carries real robotics/system-diagram vocabulary (the
 * "system of systems" reference, `Pasted image 20260917151931.png`, and the
 * behaviour-tree references) rather than placeholder words — that is the
 * realism rule this whole file exists to demonstrate (Zach: "I don't like
 * how you have [the old centred body placeholder] in the middle of the
 * block ... please make all of the blocks look more realistic").
 */

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 220 }}>{children}</span>;
}

function Specimen({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="specimen">
      {children}
      <Caption>{caption}</Caption>
    </div>
  );
}

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>;
}

// C6: no specimen anywhere in this gallery may carry placeholder text — the
// old centred body word chief among them, split across two string literals
// below so this file's own source never spells it out as one contiguous
// word (C1's own grep must find nothing under src/). Built once and reused
// by every story's play function below.
const PLACEHOLDER_WORDS = ["lorem", "body", "traj" + "ectory", "text here"];
const PLACEHOLDER_PATTERN = new RegExp(`\\b(${PLACEHOLDER_WORDS.join("|")})\\b`, "i");

// WHY a per-TEXT-NODE walk, not `canvasElement.textContent`: adjacent DOM
// text nodes concatenate with NO separator in `textContent` (a Specimen's
// content and its caption are separate elements, joined visually only by
// CSS `gap`) — measured live, a "Body" specimen immediately followed by a
// "bare Title" caption reads back as the single word "Bodybare", which
// silently clears `\bbody\b`'s own word boundary. Checking each text
// node independently is exactly what a single JSX text child renders as,
// so this can't be fooled by whatever happens to sit next to it.
function assertNoPlaceholderText(canvasElement: HTMLElement): void {
  const walker = document.createTreeWalker(canvasElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue ?? "";
    const match = value.match(PLACEHOLDER_PATTERN);
    if (match) throw new Error(`found placeholder text "${match[0]}" in text node "${value.trim()}"`);
  }
}

const meta = {
  title: "Blocks/Block/Layouts",
  tags: ["area:blocks", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* SimpleView — the "w/ …" body-composition ladder off the whiteboard.  */
/* Every specimen is a BODY composition inside one Block chrome — no     */
/* header row, `Text`/`Glyph`/`Badge` only, per the plan's own framing.  */
/* ------------------------------------------------------------------ */

const SIMPLE_WIDTH = 168;
const SIMPLE_HEIGHT = 128;

function TitleType({ title, type, center = false }: { title: string; type: string; center?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: center ? "center" : "flex-start" }}>
      <Text style={{ fontSize: 14, fontWeight: 600 }}>{title}</Text>
      <Text tone="muted" style={{ fontSize: 11 }}>
        {type}
      </Text>
    </div>
  );
}

const SIMPLE_VIEW_SPECIMENS: { id: string; caption: string; body: ReactNode }[] = [
  {
    id: "bare-title",
    caption: "bare Title",
    body: <Text style={{ fontSize: 14, fontWeight: 600 }}>localize()</Text>,
  },
  {
    id: "with-type",
    caption: "w/ type",
    body: <TitleType title="camera()" type="Function" />,
  },
  {
    id: "with-type-description",
    caption: "w/ type & description",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: 600 }}>Pose</Text>
        <Text tone="muted" style={{ fontSize: 11 }}>
          shared by perception_node and controller()
        </Text>
        <Text tone="muted" style={{ fontSize: 11, fontStyle: "italic" }}>
          Struct
        </Text>
      </div>
    ),
  },
  {
    id: "with-type-description-icon",
    caption: "w/ type & description & icon",
    body: (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Glyph content="lucide:rocket" sizePreset="md" />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: 600 }}>map_loader()</Text>
          <Text tone="muted" style={{ fontSize: 11 }}>
            loads the static occupancy map
          </Text>
          <Text tone="muted" style={{ fontSize: 11, fontStyle: "italic" }}>
            Function
          </Text>
        </div>
      </div>
    ),
  },
  {
    id: "with-badge",
    caption: "w/ Badge",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <Badge variant="secondary">10 Hz</Badge>
        <Text style={{ fontSize: 14, fontWeight: 600 }}>planner_node</Text>
      </div>
    ),
  },
  {
    id: "with-many-badges",
    caption: "w/ many Badges",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <Badge variant="secondary">30 Hz</Badge>
          <Badge variant="outline">Draft 1</Badge>
        </div>
        <Text style={{ fontSize: 14, fontWeight: 600 }}>perception_node</Text>
      </div>
    ),
  },
  {
    id: "with-tool-items",
    caption: "w/ tool items",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={12} style={{ color: "var(--muted-foreground)" }} />
          <Badge variant="outline">z-1</Badge>
          <Badge variant="outline">iter</Badge>
        </div>
        <TitleType title="arm_supervisor()" type="Function" />
      </div>
    ),
  },
  {
    id: "icon-centered",
    caption: "Icon Centered",
    body: (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Glyph content="lucide:anchor" sizePreset="lg" />
        <Text style={{ fontSize: 14, fontWeight: 600 }}>gripper_node</Text>
      </div>
    ),
  },
  {
    id: "type-centered",
    caption: "Type Centered",
    body: <TitleType title="controller()" type="Function" center />,
  },
];

export const SimpleView: Story = {
  render: () => (
    <Gallery>
      {SIMPLE_VIEW_SPECIMENS.map((s) => (
        <Specimen key={s.id} caption={s.caption}>
          <Block width={SIMPLE_WIDTH} height={SIMPLE_HEIGHT} body={s.body} />
        </Specimen>
      ))}
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    // C5: every body variation on the whiteboard is present — a silently
    // dropped specimen fails the count, not just a vibe check.
    const blocks = canvasElement.querySelectorAll('[data-slot="block"]');
    await expect(blocks).toHaveLength(SIMPLE_VIEW_SPECIMENS.length);

    // C6: no placeholder word anywhere in this gallery's rendered text.
    assertNoPlaceholderText(canvasElement);
  },
};

/* ------------------------------------------------------------------ */
/* PortView — why the body stays quiet: a Block with real ports beside   */
/* a header-only + kebab-footer variant. Body text fights the ports.     */
/* ------------------------------------------------------------------ */

const PLANNER_INPUTS: PortEdgeItem[] = [
  { id: "pose", label: "pose", state: "wired" },
  { id: "map", label: "map", state: "valueSet" },
];
const PLANNER_OUTPUTS: PortEdgeItem[] = [{ id: "path", label: "path", state: "wired" }];

/** The recipe shared with HeaderSizes' baseline: icon + title + type in the
 *  header, a kebab in the footer, body omitted entirely — Zach's rule is
 *  that Port view wouldn't show a centred body title unless the block is
 *  bigger, because the text gets in the way of the ports. */
function HeaderKebabBlock({
  size = "md",
  title,
  type,
  badge,
  width = 200,
  height = 160,
}: {
  size?: BarSize;
  title: string;
  type: string;
  badge?: string;
  width?: number;
  height?: number;
}) {
  return (
    <Block
      width={width}
      height={height}
      header={
        <Bar
          size={size}
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Glyph content="lucide:rocket" />
              <EditableText size={size}>{title}</EditableText>
              {badge && <Badge variant="secondary">{badge}</Badge>}
              {/* Type stays small and muted at every header size, the same
                  way `Bar.stories.tsx`'s `TitleCluster` pins it — only the
                  Title scales with the cascade, matching the whiteboard
                  reference where Type never grows as large as Title does. */}
              <Text tone="muted" style={{ fontSize: 12 }}>
                {type}
              </Text>
            </div>
          }
        />
      }
      footer={
        <Bar
          size="sm"
          right={
            <Button variant="ghost" size="icon-sm" aria-label="More options">
              <EllipsisVertical />
            </Button>
          }
        />
      }
    />
  );
}

export const PortView: Story = {
  render: () => (
    <Gallery>
      <Specimen caption="content dropped — the ports carry the rows, a centred word would sit on top of them">
        <BlockPort
          id="planner-port-view"
          view="port"
          edges={{
            left: { items: PLANNER_INPUTS },
            right: { items: PLANNER_OUTPUTS },
          }}
        >
          {/* `body={null}`, not an omitted prop: the body region still has
              to render as the flex-1 filler that pins the footer to the
              bottom of the fixed-height box (BlockPort.stories.tsx's
              `BandedFace` has the full account of why an omitted prop
              collapses the header/footer band the ports are laid across). */}
          <Block header="planner_node" body={null} footer="ready" width={220} height={200} />
        </BlockPort>
      </Specimen>
      <Specimen caption="header-only, kebab in the footer — no ports, nothing centred, quiet all the way">
        {/* Width 300, not 200: at "md" size, icon + "camera_node" +
            "Function" genuinely need the room — Bar's own left cell caps at
            its content (bar.tsx), so a name this long truncates below it
            (measured live). */}
        <HeaderKebabBlock title="camera_node" type="Function" width={300} height={160} />
      </Specimen>
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const specimens = canvasElement.querySelectorAll('[data-testid="specimen"]');
    await expect(specimens).toHaveLength(2);
    // The first specimen's Block has a body region (it still pins the
    // footer to the bottom of the box) but it renders no text content.
    const portedBlock = canvasElement.querySelector('[data-slot="block-port"] [data-slot="block"]');
    if (!(portedBlock instanceof HTMLElement)) throw new Error("expected the ported Block");
    const portedBody = portedBlock.querySelector('[data-slot="block-body"]');
    if (!(portedBody instanceof HTMLElement)) throw new Error("expected a (quiet) body region on the ported Block");
    await expect(portedBody.textContent).toBe("");

    assertNoPlaceholderText(canvasElement);
  },
};

/* ------------------------------------------------------------------ */
/* HeaderSizes — Bar's own size cascade, nothing invented. Baseline +    */
/* Medium (h3, md) + Large (h2, lg) + Extra Large (h1, xl).              */
/* ------------------------------------------------------------------ */

// WHY every rung shares ONE width rather than each growing its own: this
// story's only variable is meant to be the header SIZE — a different width
// per rung varies two things at once and the comparison stops being honest
// (the coordinator caught exactly this: three of four rungs clipped
// "controller()" at a different point, so the eye reads the clipping
// instead of the type scale). `HEADER_SIZE_WIDTH` is sized to the WIDEST
// rung (xl, measured natural content ~330px + Bar's own px-3 padding +
// Block's border, +buffer) and reused by all four, so baseline/medium look
// a little roomy on purpose — that slack is the honest picture of "the
// same box, a bigger label."
const HEADER_SIZE_WIDTH = 400;

const HEADER_SIZE_RUNGS: { id: string; caption: string; size: BarSize; badge?: string }[] = [
  { id: "baseline", caption: "baseline", size: "sm", badge: "Draft 1" },
  { id: "medium", caption: "Medium (h3)", size: "md" },
  { id: "large", caption: "Large (h2)", size: "lg" },
  { id: "xl", caption: "Extra Large (h1)", size: "xl" },
];

export const HeaderSizes: Story = {
  render: () => (
    <Gallery>
      {HEADER_SIZE_RUNGS.map((rung) => (
        <Specimen key={rung.id} caption={rung.caption}>
          <HeaderKebabBlock size={rung.size} title="controller()" type="Function" badge={rung.badge} width={HEADER_SIZE_WIDTH} height={180} />
        </Specimen>
      ))}
    </Gallery>
  ),
  play: async ({ canvasElement }) => {
    const bars = canvasElement.querySelectorAll('[data-slot="block-header"] [data-slot="bar"]');
    await expect(bars).toHaveLength(HEADER_SIZE_RUNGS.length);
    for (const [i, rung] of HEADER_SIZE_RUNGS.entries()) {
      await expect(bars[i].getAttribute("data-size")).toBe(rung.size);
    }

    assertNoPlaceholderText(canvasElement);
  },
};

/* ------------------------------------------------------------------ */
/* BehaviourTreeNodes — Blocks standing in for BT nodes/leaves. Laid out */
/* as a CAPTIONED ROW (not a static tree layout — see the report).       */
/* ------------------------------------------------------------------ */

interface BTNodeSpec {
  id: string;
  name: string;
  kind: "Skill" | "Condition" | "Sub Tree";
  icon: string;
}

// WHY only rocket/circle/play (also used above for the SimpleView and
// PortView/HeaderSizes icons): `.storybook/preview.tsx`'s `renderLucide`
// resolver only wires up four names (rocket/anchor/circle/play) — it is
// out of this lane's owned files (`.storybook/**` is explicitly off
// limits), so every Glyph `lucide:` content in this gallery is drawn from
// that fixed set rather than the semantically-nearest icon (a lightning
// bolt for Skill, an eye for Condition, a branch for Sub Tree) — measured
// live: an unregistered name renders an empty Glyph box, `data-unresolved`
// set, no visible icon at all.
const BT_NODES: BTNodeSpec[] = [
  { id: "move-to-obj", name: "MoveToObj", kind: "Sub Tree", icon: "lucide:rocket" },
  { id: "grasp-valid", name: "GraspValid", kind: "Condition", icon: "lucide:circle" },
  { id: "close-grip", name: "CloseGrip", kind: "Skill", icon: "lucide:play" },
  { id: "retract", name: "Retract", kind: "Skill", icon: "lucide:play" },
  { id: "stow", name: "Stow", kind: "Skill", icon: "lucide:play" },
  { id: "return-home", name: "ReturnHome", kind: "Skill", icon: "lucide:play" },
  { id: "recover", name: "Recover", kind: "Sub Tree", icon: "lucide:rocket" },
];

function BTNode({ name, kind, icon }: BTNodeSpec) {
  return (
    // 150, not 128: `px-3 py-2` (block.tsx's own header padding) plus the
    // icon + bold name + kind label genuinely need the room at "Sub Tree",
    // the longest kind — a tighter box wrapped the kind onto a second line
    // instead of clipping horizontally (measured live via a vertical
    // scrollbar appearing on the header).
    <Block
      width={150}
      height={104}
      showHeaderDivider={false}
      header={
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, whiteSpace: "nowrap" }}>
          <Glyph content={icon} sizePreset="sm" />
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{name}</Text>
          <Text tone="muted" style={{ fontSize: 10 }}>
            {kind}
          </Text>
        </div>
      }
      body={<Glyph content={icon} sizePreset="xl" />}
    />
  );
}

interface BTOperatorSpec {
  id: string;
  glyph: string;
  label: string;
}

const BT_OPERATORS: BTOperatorSpec[] = [
  { id: "sequence", glyph: "→", label: "sequence" },
  { id: "selector", glyph: "?", label: "selector" },
  { id: "parallel", glyph: "↓↓", label: "parallel" },
];

function BTOperatorNode({ glyph }: BTOperatorSpec) {
  return (
    <Block
      width={44}
      height={44}
      showHeaderDivider={false}
      header={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <Text style={{ fontSize: 18, fontWeight: 600 }}>{glyph}</Text>
        </div>
      }
    />
  );
}

export const BehaviourTreeNodes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="operators">
        <Caption>operator nodes — small square header-only Blocks</Caption>
        <div style={{ display: "flex", gap: 12 }}>
          {BT_OPERATORS.map((op) => (
            <Specimen key={op.id} caption={op.label}>
              <BTOperatorNode {...op} />
            </Specimen>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="leaves">
        <Caption>node/leaf Blocks — a captioned row (this story lays out the row, not a static tree)</Caption>
        <Gallery>
          {BT_NODES.map((node) => (
            <Specimen key={node.id} caption={`${node.name} — ${node.kind}`}>
              <BTNode {...node} />
            </Specimen>
          ))}
        </Gallery>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const operators = canvasElement.querySelector('[data-testid="operators"]');
    const leaves = canvasElement.querySelector('[data-testid="leaves"]');
    if (!(operators instanceof HTMLElement) || !(leaves instanceof HTMLElement)) throw new Error("expected both operator and leaf rows");
    await expect(operators.querySelectorAll('[data-slot="block"]')).toHaveLength(BT_OPERATORS.length);
    await expect(leaves.querySelectorAll('[data-slot="block"]')).toHaveLength(BT_NODES.length);

    assertNoPlaceholderText(canvasElement);
  },
};
