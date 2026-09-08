/**
 * A real tldraw `Editor` with no browser: the store, the shape utils, the
 * grouping/rotation/transform machinery are all the genuine article — only
 * the DOM the engine expects to measure against is stubbed out.
 *
 * WHY this exists: the detach acceptance matrix must exercise the actual
 * `Editor` operations (createShapes, groupShapes, rotateShapesBy, page
 * transforms) that lowering and rebuild run through, not a hand-rolled stub
 * board that would quietly agree with the implementation. The engine only
 * touches the DOM for text measurement and event plumbing, so a few inert
 * elements are enough; `measureText` in `stockPartials` falls back to its
 * deterministic ratio because the stub canvas has no 2d context.
 */

function stubElement(): any {
  const el: any = {
    nodeType: 1,
    style: {
      setProperty: () => {},
      removeProperty: () => {},
      getPropertyValue: () => "",
    },
    get ownerDocument() {
      return (globalThis as any).document;
    },
    dataset: {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: (child: any) => child,
    insertBefore: (child: any) => child,
    cloneNode: () => stubElement(),
    removeChild: () => {},
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    focus: () => {},
    blur: () => {},
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width: 1600,
      height: 1000,
      top: 0,
      left: 0,
      right: 1600,
      bottom: 1000,
    }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: "",
    innerHTML: "",
    childNodes: [],
    scrollWidth: 0,
    scrollHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    // A stub canvas has no drawing context — measureText falls back.
    getContext: () => null,
  };
  return el;
}

if (typeof (globalThis as any).document === "undefined") {
  (globalThis as any).document = {
    createElement: stubElement,
    createElementNS: stubElement,
    createDocumentFragment: stubElement,
    createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text, textContent: text }),
    body: stubElement(),
    documentElement: stubElement(),
    addEventListener: () => {},
    removeEventListener: () => {},
    fonts: {
      addEventListener: () => {},
      removeEventListener: () => {},
      add: () => {},
      ready: Promise.resolve(),
      load: () => Promise.resolve([]),
      check: () => true,
    },
    hidden: false,
    visibilityState: "visible",
    implementation: {
      createHTMLDocument: () => (globalThis as any).document,
    },
  };
}
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = {
    // prosemirror's DOMSerializer reaches for window.document when no
    // document option is passed.
    get document() {
      return (globalThis as any).document;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    devicePixelRatio: 1,
    location: { href: "http://localhost/" },
    requestAnimationFrame: (cb: (t: number) => void) =>
      setTimeout(() => cb(0), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    innerWidth: 1600,
    innerHeight: 1000,
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node", maxTouchPoints: 0 },
    configurable: true,
  });
  (globalThis as any).requestAnimationFrame = (globalThis as any).window
    .requestAnimationFrame;
  (globalThis as any).cancelAnimationFrame = (globalThis as any).window
    .cancelAnimationFrame;
}

import {
  Editor,
  createTLStore,
  defaultAddFontsFromNode,
  defaultBindingUtils,
  defaultShapeUtils,
  defaultTools,
  tipTapDefaultExtensions,
} from "tldraw";

import { BBoxBlockShapeUtil } from "../src/block-shape-util";
import { BBoxPortShapeUtil } from "../src/port-shape-util";

export function createHeadlessEditor(): Editor {
  const shapeUtils = [...defaultShapeUtils, BBoxBlockShapeUtil, BBoxPortShapeUtil];
  const store = createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils });
  const editor = new Editor({
    store,
    shapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: defaultTools,
    getContainer: () => stubElement(),
    // What the <Tldraw> component wires in by default; without it any use
    // of a text shape throws "Cannot use text without setting textOptions".
    textOptions: {
      addFontsFromNode: defaultAddFontsFromNode,
      tipTapConfig: { extensions: tipTapDefaultExtensions },
    },
  });
  editor.setCurrentTool("select");
  return editor;
}
