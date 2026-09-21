// src/chrome/ContextualPopupMenu/index.ts — the selection pill — the contextual popup that follows a selection.
//
// WHY a barrel: the FOLDER is the component (ARCHITECTURE.md — "one folder per
// editor component, named for what it IS, never for where it sits on screen").
// Outside this folder, import the folder; inside it, import files by name. That
// is what keeps renaming or splitting the internals a change nobody else sees.
export * from "./floatingToolbar";
export * from "./selectionClusters";
export * from "./arrangeActions";
export * from "./selectionActions";
