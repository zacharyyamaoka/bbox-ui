# Zach's triage picks — 2026-09-21

Pasted back from `parity-triage-2026-09-20.html`. He did not finish: **43 yes,
3 no, 422 undecided**, so the undecided pile is "not reached", NOT "no".

## Decisions carried in his notes (these are rulings, not preferences)

| # | Ruling | His words |
|---|---|---|
| 1 | **The file format is `.bbox`, not `.systemsketch`** | "lets call this file type .bbox as this project is no longer system sketch its just the bbox whiteboard" |
| 2 | Wheel/zoom mapping is a SETTING, not a hardcode | "Please add the option within settings to do the remapping. its about giving the user flexibility to do what they want" |
| 3 | Connection validation is a LEVEL you choose | "have the connection validation setting in the settings panel so you can switch between what level of linting you want from whiteboard, where anything goes to like evalid code, etc." |
| 4 | Unbind `B` from the pencil outright | "Yes, please unbind B from pencil" |
| 5 | Detach-to-primitive is implemented on the PRIMITIVES so composites get it free | "by making it work on the basic ocmponesents a primative so then it comes for free for the higher level things" |
| 6 | Edge-drop catalogue: 5 presets, not 14 | "but reduce the presets to only the 5 most common" |
| 7 | The `+X more` chip comes from the port-edge component; the chrome belongs in **bbox-editor** | "ideally this just comes from the port edge implementation... but YOu do need to provide the chrome to do this... should be in bbox-editor" |
| 8 | **There is no separate Type concept** — parse it out of the CodeEditor line after the `:` | "right now we just support by default only a single line CodeEditor, we don't have this cnocept of Type as a seperate thing.. You can parse it from the CodeEditor though for what follows the : it just python" |
| 9 | The description eye-toggle lives in the right-hand inspector | "the eye visibility control for this is in the right hand inspector menu" |
| 10 | Compare view is wanted | "we want to support the Compare view" |
| 11 | Multi-line port editor becomes the DEFAULT; don't build hover-to-add-port | "We are goign to change the Ux/UI on this for now like support the multi line port editor as the default one" |
| 12 | Region "add an arm" is on hold pending UX | "um hold off on this for now tbd the ux/ui here.." |

## Explicit NO (3)
- Hide common ports to leave only the data ones
- Hover the end of a port lane to add a port  *(superseded by the multi-line editor)*
- Region: add an arm  *(on hold, UX undecided)*

## Explicit YES (43)
See `parity-picks-2026-09-21.json` for the machine-readable list.
