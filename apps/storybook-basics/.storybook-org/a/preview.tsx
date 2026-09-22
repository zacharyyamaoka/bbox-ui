// A · Mirror the repo — the base preview (skins, glyphs, globals) plus this proposal's section order.
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
        order: ["Components", "Scene", "Editor", "Presets", "Hosts", "Skin"],
      },
    },
  },
};

export default preview;
