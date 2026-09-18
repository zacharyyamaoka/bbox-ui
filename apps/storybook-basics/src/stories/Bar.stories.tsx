import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Play, Square } from "lucide-react";

import { Badge } from "../components/badge";
import { Bar, BAR_SIZES } from "../components/bar";
import { Button } from "../components/button";
import { EditableText } from "../components/editableText";
import type { EditableTextProps } from "../components/editableText";
import { FoldingChevron } from "../components/foldingChevron";
import { Glyph } from "../components/glyph";
import { Text } from "../components/text";
import { Toggle } from "../components/toggle";

/**
 * WHY this lives here rather than being imported from
 * `EditableText.stories.tsx`: that file's own `ControlledEditableText` is a
 * private, unexported story helper — the reusable PIECE is the pattern
 * (controlled `editing`/`value` + a snapshot for Escape-cancel), which this
 * copies exactly (same commit/cancel/click wiring), generalized only to
 * forward the rest of `EditableTextProps` (`size`/`className`/`style`) so it
 * can drop into `TitleCluster`/`SizeCascadeCluster` unchanged. Zach: "the
 * title and type in the bar should be EditableText... I should be able to
 * click it and edit it" — every Title/Type below gets ITS OWN instance of
 * this, so each has independent `editing` state (R2: editing one never
 * puts a sibling into edit mode).
 */
function ControlledEditableText({
  initial,
  ...props
}: { initial: string } & Omit<
  EditableTextProps,
  "editing" | "onChange" | "onCommit" | "onCancel" | "onClick" | "children"
>) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef(initial);
  return (
    <EditableText
      {...props}
      editing={editing}
      onChange={setValue}
      onCommit={(next) => {
        setValue(next);
        setEditing(false);
      }}
      onCancel={() => {
        setValue(snapshotRef.current);
        setEditing(false);
      }}
      onClick={() => {
        snapshotRef.current = value;
        setEditing(true);
      }}
    >
      {value}
    </EditableText>
  );
}

// WHY a dashed wrapper here and not a border baked back onto `Bar` itself:
// `Bar` paints nothing of its own now (see bar.tsx's own WHY) — composed
// into a Block it should be invisible as a shape, but a STANDALONE Bar
// story still needs to show the strip's own extent to be legible on its
// own. The dashes are this story's device, not the component's.
function BarSwatch({ width = 420, children }: { width?: number; children: ReactNode }) {
  return (
    <div style={{ width, border: "1px dashed var(--border)", borderRadius: 4 }}>{children}</div>
  );
}

/**
 * The size-cascade gallery Zach asked for: "show a story in bar that shows
 * how you can do different sizes and then various things inside of the bar
 * will size themselves correctly... with a 'large bar' vs small bar you
 * don't need to hand tune each element inside." Every element below —
 * `Glyph`, the title/type `EditableText`s, the `Badge`, the `Toggle`
 * control — is rendered with NO `size` prop of its own. The only thing
 * that changes between the four rows is `<Bar size={...}>`; each child
 * picks up its own scale from the ambient cascade (barSize.tsx). This is
 * deliberately the same cluster shape as `HeaderLayouts`' `TitleCluster`
 * below, minus every hand-tuned `size`/`fontSize` — that hand-tuning is
 * exactly what the cascade exists to make unnecessary.
 */
function SizeCascadeCluster() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <Glyph content="lucide:rocket" />
      <ControlledEditableText initial="Title" />
      <ControlledEditableText initial="Type" className="text-muted-foreground" />
      <Badge variant="secondary">Draft 1</Badge>
      <Toggle variant="outline" aria-label="Blackbox">
        <Square />
      </Toggle>
    </div>
  );
}

const meta = {
  title: "Blocks/Bar",
  tags: ["area:blocks", "lane:baseline"],
  component: Bar,
  args: {
    left: "Left",
    center: "Center",
    right: "Right",
    size: "md",
  },
  render: (args) => (
    <BarSwatch>
      <Bar {...args} />
    </BarSwatch>
  ),
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three slots, one row. The play function proves the DOM has all three. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="bar"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="bar"]');
    await expect(el.querySelectorAll("[data-slot^='bar-']")).toHaveLength(3);
  },
};

/**
 * The four size rungs, stacked — the SAME `SizeCascadeCluster` in each row,
 * nothing size-related set on any child. Only `<Bar size={...}>` changes;
 * the play function proves the cascade actually reached every consumer
 * (Glyph/EditableText/Badge/Toggle), not merely that it renders.
 */
export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 420 }}>
      {BAR_SIZES.map((size) => (
        // WHY `left`, and the default 420px swatch: this used to be
        // `center` on a widened 520px swatch, worked around because the OLD
        // fixed `1fr auto 1fr` grid gave an unused `center`/`right` track
        // half the row's width regardless, truncating `left`'s cascade
        // cluster against that artificial ceiling at the `xl` rung — see
        // bar.tsx's own WHY on `barGridTemplateColumns`. With the cause
        // fixed (an empty `center`/`right` track collapses instead of
        // claiming space), `left` alone gets the room it actually needs,
        // so both the slot and the swatch width revert to what they were.
        <BarSwatch key={size} width={420}>
          <Bar size={size} left={<SizeCascadeCluster />} />
        </BarSwatch>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The mapping barSize.tsx declares — pinned here so this story fails
    // loudly if the cascade or its mapping table ever drifts apart.
    const expected: Record<string, { glyph: string; text: string; badge: string; toggle: string }> = {
      sm: { glyph: "sm", text: "sm", badge: "sm", toggle: "sm" },
      md: { glyph: "md", text: "md", badge: "md", toggle: "default" },
      lg: { glyph: "lg", text: "lg", badge: "lg", toggle: "lg" },
      xl: { glyph: "xl", text: "xl", badge: "xl", toggle: "lg" },
    };

    const bars = canvasElement.querySelectorAll('[data-slot="bar"]');
    await expect(bars).toHaveLength(4);

    for (const bar of bars) {
      const barSize = bar.getAttribute("data-size");
      if (!barSize || !(barSize in expected)) throw new Error(`unexpected bar size ${barSize}`);
      const want = expected[barSize];

      const glyph = bar.querySelector('[data-slot="glyph"]');
      await expect(glyph?.getAttribute("data-size-preset")).toBe(want.glyph);

      const texts = bar.querySelectorAll('[data-slot="editable-text"]');
      await expect(texts).toHaveLength(2);
      for (const text of texts) {
        await expect(text.getAttribute("data-size")).toBe(want.text);
      }

      const badge = bar.querySelector('[data-slot="badge"]');
      await expect(badge?.getAttribute("data-size")).toBe(want.badge);

      const toggle = bar.querySelector('[data-slot="toggle"]');
      await expect(toggle?.getAttribute("data-size")).toBe(want.toggle);
    }

    // R5: the cascade must still hold WHILE editing, not just at rest — the
    // `xl` row (want.text === "xl") is the one that would visibly regress
    // first if editing ever fell back to `resolvedSize`'s "md" floor.
    const xlBar = [...bars].find((bar) => bar.getAttribute("data-size") === "xl");
    if (!xlBar) throw new Error("expected an xl bar");
    const [xlTitleBox] = xlBar.querySelectorAll('[data-slot="editable-text"]');
    if (!(xlTitleBox instanceof HTMLElement)) throw new Error("expected a Title editable-text on the xl bar");
    const restFontSize = getComputedStyle(xlTitleBox).fontSize;

    await userEvent.click(xlTitleBox);
    const xlInput = await waitFor(() => {
      const el = xlTitleBox.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the xl Title's editing <input> to mount");
      return el;
    });
    // `data-size` is unchanged (it reflects `resolvedSize`, not `editing`),
    // and the mounted <input> inherits the SAME computed font-size the
    // resting box had — proof the control is drawn at the cascade's size,
    // not some independent default.
    await expect(xlTitleBox.getAttribute("data-size")).toBe("xl");
    await expect(getComputedStyle(xlInput).fontSize).toBe(restFontSize);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      if (xlTitleBox.getAttribute("data-editing") !== "false") throw new Error("expected xl Title back at rest");
    });
  },
};

/** An empty bar — no slots filled. Still a real, visible strip. */
export const Empty: Story = { args: { left: undefined, center: undefined, right: undefined } };

/**
 * The `[Glyph] Title  Type` cluster every "Header Layouts" sketch variant
 * shares — a bold-ish Title next to a dimmer, smaller Type label, tightly
 * spaced. Built purely from Phase-1 primitives (Glyph + EditableText in its
 * resting, non-editing state); Type's muted/smaller look is EditableText's own
 * `className`/`size` props, not a new one.
 */
function TitleCluster() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <Glyph content="lucide:rocket" />
      <ControlledEditableText initial="Title" size="sm" />
      <ControlledEditableText
        initial="Type"
        size="sm"
        className="text-muted-foreground"
        style={{ fontSize: 12 }}
      />
    </div>
  );
}

function HeaderLayout({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <BarSwatch>{children}</BarSwatch>
    </div>
  );
}

/**
 * The sketch, answered directly: 7 header treatments, each a `<Bar>` with
 * nothing but its existing `left`/`center`/`right` slots filled differently
 * — no new `Bar` props for any of them ("Centered" is the same cluster in
 * `center` instead of `left`).
 */
export const HeaderLayouts: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 420 }}>
      <HeaderLayout caption="w/ Type compact">
        <Bar left={<TitleCluster />} />
      </HeaderLayout>

      <HeaderLayout caption="w/ folding left">
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <FoldingChevron open onClick={() => {}} />
              <TitleCluster />
            </div>
          }
        />
      </HeaderLayout>

      <HeaderLayout caption="w/ folding right">
        <Bar left={<TitleCluster />} right={<FoldingChevron open onClick={() => {}} />} />
      </HeaderLayout>

      <HeaderLayout caption="w/ Title Badge">
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Glyph content="lucide:rocket" />
              <ControlledEditableText initial="Title" size="sm" />
              <Badge variant="secondary">Draft 1</Badge>
              <ControlledEditableText
                initial="Type"
                size="sm"
                className="text-muted-foreground"
                style={{ fontSize: 12 }}
              />
            </div>
          }
        />
      </HeaderLayout>

      <HeaderLayout caption="w/ various other tools, text">
        <Bar
          left={<TitleCluster />}
          right={
            <div style={{ display: "flex", gap: 4 }}>
              <Toggle size="sm" variant="outline" aria-label="Tool 1">
                <Square />
              </Toggle>
              <Toggle size="sm" variant="outline" aria-label="Tool 2">
                <Square />
              </Toggle>
              <Toggle size="sm" variant="outline" aria-label="Tool 3">
                <Square />
              </Toggle>
            </div>
          }
        />
      </HeaderLayout>

      <HeaderLayout caption="w/ play button + text">
        <Bar
          left={<TitleCluster />}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Text tone="muted" style={{ fontSize: 12 }}>
                15.1ms
              </Text>
              <Button size="icon-sm" aria-label="Play">
                <Play />
              </Button>
            </div>
          }
        />
      </HeaderLayout>

      <HeaderLayout caption="Centered">
        <Bar center={<TitleCluster />} />
      </HeaderLayout>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bars = canvasElement.querySelectorAll('[data-slot="bar"]');
    await expect(bars).toHaveLength(7);
    const chevrons = canvasElement.querySelectorAll('[data-slot="folding-chevron"]');
    await expect(chevrons).toHaveLength(2);
    const toggles = canvasElement.querySelectorAll('[data-slot="toggle"]');
    await expect(toggles).toHaveLength(3);

    // R1/R2/R3: Title and Type on the "w/ Type compact" bar (bars[0], the
    // plainest TitleCluster — no Badge/chevron sharing the row) are
    // independently click-to-edit, real typed input, Enter commits, the
    // committed value survives back at rest.
    const bar0 = bars[0];
    const [titleBox, typeBox] = bar0.querySelectorAll('[data-slot="editable-text"]');
    if (!(titleBox instanceof HTMLElement) || !(typeBox instanceof HTMLElement)) {
      throw new Error("expected Title and Type editable-text boxes on the first bar");
    }
    const glyph = bar0.querySelector('[data-slot="glyph"]');
    if (!(glyph instanceof HTMLElement)) throw new Error("expected a glyph on the first bar");
    // WHY relative to the BAR's own left, not a raw viewport-absolute
    // `getBoundingClientRect().left`: found live — this gallery's 420px
    // swatches genuinely overflow the narrow Storybook MANAGER preview pane
    // (measured 175px wide, addons panel + sidebar eating the rest), so a
    // `userEvent.click` on a DIFFERENT, far-away bar earlier in this same
    // play function can trigger the browser's native scroll-into-view and
    // shift every absolute rect that follows — a real environmental effect,
    // not a layout bug (independently reverified with real cursor clicks:
    // nothing actually moves). Scrolling moves the bar and its children
    // together, so `child.left - bar.left` cancels it out and only trips on
    // a REAL internal reflow.
    const relLeft = (el: Element, bar: Element) => el.getBoundingClientRect().left - bar.getBoundingClientRect().left;
    const glyphOffsetAtRest = relLeft(glyph, bar0);

    await userEvent.click(titleBox);
    const titleInput = await waitFor(() => {
      const el = titleBox.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected Title's editing <input> to mount");
      return el;
    });
    // R2: editing Title must not put Type into edit mode too.
    await expect(typeBox.getAttribute("data-editing")).toBe("false");
    // R4: the glyph beside it must not have shifted while Title edits.
    await expect(relLeft(glyph, bar0)).toBe(glyphOffsetAtRest);

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Renamed Title", { delay: 0 });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      if (titleBox.getAttribute("data-editing") !== "false") throw new Error("expected Title back at rest");
    });
    await expect(within(bar0 as HTMLElement).getByText("Renamed Title")).toBeInTheDocument();

    // Same, independently, for Type — and Title must stay at rest this time.
    await userEvent.click(typeBox);
    const typeInput = await waitFor(() => {
      const el = typeBox.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected Type's editing <input> to mount");
      return el;
    });
    await expect(titleBox.getAttribute("data-editing")).toBe("false");
    await userEvent.clear(typeInput);
    await userEvent.type(typeInput, "renamed-type", { delay: 0 });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      if (typeBox.getAttribute("data-editing") !== "false") throw new Error("expected Type back at rest");
    });
    await expect(within(bar0 as HTMLElement).getByText("renamed-type")).toBeInTheDocument();

    // R4, the other half of Zach's ask: the Badge on "w/ Title Badge"
    // (bars[3]) must not shift either, while ITS Title edits.
    const bar3 = bars[3];
    const badge = bar3.querySelector('[data-slot="badge"]');
    const badgeTitleBox = bar3.querySelector('[data-slot="editable-text"]');
    if (!(badge instanceof HTMLElement) || !(badgeTitleBox instanceof HTMLElement)) {
      throw new Error("expected a badge and a Title editable-text on the 'w/ Title Badge' bar");
    }
    const badgeOffsetAtRest = relLeft(badge, bar3);
    await userEvent.click(badgeTitleBox);
    await waitFor(() => {
      const el = badgeTitleBox.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the 'w/ Title Badge' Title <input> to mount");
    });
    await expect(relLeft(badge, bar3)).toBe(badgeOffsetAtRest);
    // Leave it as found: cancel back to rest rather than committing a change.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      if (badgeTitleBox.getAttribute("data-editing") !== "false") throw new Error("expected Title back at rest");
    });
  },
};

// Long enough that it needs real room: at the narrowest test width (240px)
// there isn't enough, at the widest (800px) there's room to spare — the
// same string in both rows is what makes the top/bottom contrast legible.
const LONG_LABEL = "A genuinely long label that keeps going until the bar runs out of room to hold it";

const WIDTHS = [240, 360, 520, 800];

/**
 * Zach: "add a story for bar that tests out different widths... so perhaps
 * you can test that with slot width limit and without." Same `LONG_LABEL`
 * in `left`, `center`/`right` empty, at each of `WIDTHS` — top row plain
 * (no wrapper: truncates only once the BAR itself runs out of room, per
 * `barGridTemplateColumns`'s fix), bottom row with the label wrapped in an
 * explicit `width: 140` box (the caller-sets-a-limit path this file's own
 * WHY comment on `bar.tsx` points to, rather than a new `Bar` prop) —
 * truncates at 140px regardless of how much spare room the bar has. Reading
 * down a column at a fixed width shows the contrast the story is FOR.
 */
export const Widths: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>
          No slot width limit — left expands into whatever center/right leave unused
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {WIDTHS.map((w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{w}px</span>
              <BarSwatch width={w}>
                <Bar left={<EditableText size="sm">{LONG_LABEL}</EditableText>} />
              </BarSwatch>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 8 }}>
          Explicit slot width limit (140px) — truncates at the limit regardless of spare room
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {WIDTHS.map((w) => (
            <div key={w} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{w}px</span>
              <BarSwatch width={w}>
                <Bar
                  left={
                    // WHY `display: flex` on this wrapper, not just a plain
                    // block `width: 140`: EditableText's own root is
                    // `width: fit-content` (`w-fit`) — per editableText.tsx's
                    // own header comment, that only gets CLAMPED once it is
                    // a flex/grid ITEM being squeezed by its host; a plain
                    // block parent's fixed `width` does not itself bound a
                    // `fit-content` child (measured live: the text rendered
                    // at its full ~638px regardless of a 140px block
                    // parent). A flex wrapper is the documented way to
                    // impose a width limit on this component from outside.
                    <div style={{ width: 140, minWidth: 0, display: "flex" }}>
                      <EditableText size="sm">{LONG_LABEL}</EditableText>
                    </div>
                  }
                />
              </BarSwatch>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-slot="bar"]');
    await expect(rows).toHaveLength(WIDTHS.length * 2);
    const unlimited = [...rows].slice(0, WIDTHS.length);
    const limited = [...rows].slice(WIDTHS.length);

    // W1: at the WIDEST unlimited bar, the label has room to spare — it
    // must render at its full intrinsic width, no ellipsis at all.
    const widest = unlimited[unlimited.length - 1];
    const widestSpan = widest.querySelector('[data-slot="editable-text-content"]');
    if (!(widestSpan instanceof HTMLElement)) throw new Error("expected the label's content span");
    await expect(widestSpan.scrollWidth).toBe(widestSpan.clientWidth);
    await expect(widestSpan.textContent).toBe(LONG_LABEL);

    // W2: at the NARROWEST unlimited bar, the same label genuinely doesn't
    // fit — it DOES truncate, with the full value still recoverable (the
    // box's own `title`, per editableText.tsx's truthful-truncation rule).
    const narrowest = unlimited[0];
    const narrowestSpan = narrowest.querySelector('[data-slot="editable-text-content"]');
    const narrowestBox = narrowest.querySelector('[data-slot="editable-text"]');
    if (!(narrowestSpan instanceof HTMLElement) || !(narrowestBox instanceof HTMLElement)) {
      throw new Error("expected the narrowest label's box and content span");
    }
    await expect(narrowestSpan.scrollWidth).toBeGreaterThan(narrowestSpan.clientWidth);
    await expect(narrowestBox.getAttribute("title")).toBe(LONG_LABEL);

    // W4: EVERY "with limit" row truncates at the 140px box regardless of
    // the bar's own width — including the widest bar, which has plenty of
    // spare room it is deliberately not allowed to use.
    for (const bar of limited) {
      const span = bar.querySelector('[data-slot="editable-text-content"]');
      const box = bar.querySelector('[data-slot="editable-text"]');
      if (!(span instanceof HTMLElement) || !(box instanceof HTMLElement)) {
        throw new Error("expected a limited label's box and content span");
      }
      await expect(span.scrollWidth).toBeGreaterThan(span.clientWidth);
      await expect(box.getAttribute("title")).toBe(LONG_LABEL);
    }
  },
};
