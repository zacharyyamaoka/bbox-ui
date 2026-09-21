// src/chrome/CompareView/index.ts — the Compare view's barrel.
//
// WHY a barrel: the FOLDER is the component (ARCHITECTURE.md — "one folder per
// editor component, named for what it IS, never for where it sits on screen").
// Outside this folder, import the folder; inside it, import files by name.
export * from "./compareView";
