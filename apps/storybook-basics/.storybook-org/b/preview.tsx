// B · Kits, then families — the base preview (skins, glyphs, globals) plus this proposal's section order.
// WHY the order is a literal here: Storybook reads `storySort` statically out of this file
// (csf-tools getStorySortParameter), so it cannot be computed or imported.
import base from "../../.storybook/preview";

const preview = {
  ...base,
  parameters: {
    ...base.parameters,
    options: {
      storySort: {
        method: "alphabetical",
        order: ["Components", ["Ports", ["Port", "LabeledPort", "PortEdge"], "Blocks", ["Block", "BlockPort", "*"], "Traces", ["Trace", "*"], "Text & Marks", "Menus & Bars", "Panels & Dialogs", "Stock"], "Scene", ["Model & Diff", ["Scene", "*"], "Wiring", "Validation", "Layout & Drag"], "Editor", "Presets", ["ControlFlow", ["Branch", "Loop", "Region", "*"], "*"], "Skin"],
      },
    },
  },
};

export default preview;
