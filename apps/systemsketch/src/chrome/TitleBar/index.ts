// src/chrome/TitleBar/index.ts — the top bar: app menu, file navigator, board title.
//
// WHY a barrel: the FOLDER is the component (ARCHITECTURE.md — "one folder per
// editor component, named for what it IS, never for where it sits on screen").
// Outside this folder, import the folder; inside it, import files by name. That
// is what keeps renaming or splitting the internals a change nobody else sees.
export * from "./chromeBar";
