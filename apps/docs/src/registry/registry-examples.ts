import type { Registry } from "shadcn/schema";

// Demos rendered live by <ComponentPreview name="..."/>. Each imports from
// @bbox-ui/core (the workspace package) so a demo can never drift from the
// component it demonstrates — there is no second copy of the source here.
export const examples: Registry["items"] = [
  {
    name: "port-demo",
    type: "registry:example",
    files: [{ path: "examples/port-demo.tsx", type: "registry:example" }],
  },
  {
    name: "port-layouts",
    type: "registry:example",
    files: [{ path: "examples/port-layouts.tsx", type: "registry:example" }],
  },
  {
    name: "port-sizes",
    type: "registry:example",
    files: [{ path: "examples/port-sizes.tsx", type: "registry:example" }],
  },
  {
    name: "block-demo",
    type: "registry:example",
    files: [{ path: "examples/block-demo.tsx", type: "registry:example" }],
  },
  {
    name: "block-with-ports",
    type: "registry:example",
    files: [{ path: "examples/block-with-ports.tsx", type: "registry:example" }],
  },
];
