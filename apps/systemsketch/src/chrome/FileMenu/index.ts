// src/chrome/FileMenu/index.ts — the File group and the board actions behind it, plus tldraw's stock menus.
//
// WHY a barrel: the FOLDER is the component (ARCHITECTURE.md — "one folder per
// editor component, named for what it IS, never for where it sits on screen").
// Outside this folder, import the folder; inside it, import files by name. That
// is what keeps renaming or splitting the internals a change nobody else sees.
export * from "./stockMenus";
export * from "./fileActions";
