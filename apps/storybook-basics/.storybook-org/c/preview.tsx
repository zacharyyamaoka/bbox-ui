// C · Objects first — the base preview (skins, glyphs, globals) plus this proposal's section order.
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
        order: ["Port", ["Port", "LabeledPort", "PortEdge", "*"], "Block", ["Block", "BlockPort", "*"], "Trace", ["Trace", "*"], "Region", ["Region", "Branch", "Loop", "*"], "Scene", ["Scene", "*"], "Text & Marks", "Chrome", ["Menus & Bars", "Panels & Dialogs"], "Stock", "Skin"],
      },
    },
  },
};

export default preview;
