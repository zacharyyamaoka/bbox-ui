import { createElement, isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { Port } from "../src/port";
import { cascadeInto } from "../src/portEdge";

/**
 * `cascadeInto` stamps a lane's `textLayout` onto every Port it can reach
 * by walking `children`. The walk must NOT rewrite a Port's own string
 * label on the way through: `Children.map` wraps a lone string in an array,
 * and the Port's label slot mounts that string as a CodeBlock `value` —
 * an array there throws inside CodeMirror and takes the whole bench down
 * (portEdge.tsx's own WHY at the primitive guard). Pure element algebra,
 * no DOM: `cascadeInto` returns cloned elements, never renders them.
 */
function firstElement(node: unknown): ReactElement<Record<string, unknown>> {
  const list = Array.isArray(node) ? node : [node];
  const found = list.find((n) => isValidElement(n));
  if (!found) throw new Error("cascadeInto returned no element");
  return found as ReactElement<Record<string, unknown>>;
}

describe("cascadeInto — a Port's string label survives the walk", () => {
  it("keeps `children: \"in\"` a string (not [\"in\"]) while still stamping textLayout", () => {
    const port = createElement(Port, { edge: "left" } as never, "in");
    const cloned = firstElement(cascadeInto(port, "top"));
    expect(cloned.props.textLayout).toBe("top");
    expect(cloned.props.children).toBe("in");
    expect(typeof cloned.props.children).toBe("string");
  });

  it("a primitive handed to cascadeInto directly comes back as itself", () => {
    expect(cascadeInto("bare text", "right")).toBe("bare text");
    expect(cascadeInto(3, "right")).toBe(3);
  });

  it("still recurses through a host element to reach a nested Port", () => {
    const nested = createElement("span", { "data-slot": "port-group" }, createElement(Port, {} as never, "cfg"));
    const span = firstElement(cascadeInto(nested, "bot"));
    const innerPort = firstElement(span.props.children);
    expect(innerPort.props.textLayout).toBe("bot");
    expect(innerPort.props.children).toBe("cfg");
  });

  it("never overrides a Port's own explicit textLayout", () => {
    const port = createElement(Port, { textLayout: "left" } as never, "out");
    const cloned = firstElement(cascadeInto(port, "top"));
    expect(cloned.props.textLayout).toBe("left");
  });
});
