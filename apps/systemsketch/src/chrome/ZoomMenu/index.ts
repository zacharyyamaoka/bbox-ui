// src/chrome/ZoomMenu/index.ts — the zoom read-out and its dropdown.
//
// WHY a barrel: the FOLDER is the component (ARCHITECTURE.md — "one folder per
// editor component, named for what it IS, never for where it sits on screen").
// Outside this folder, import the folder; inside it, import files by name. That
// is what keeps renaming or splitting the internals a change nobody else sees.
export * from "./zoomMenu";
