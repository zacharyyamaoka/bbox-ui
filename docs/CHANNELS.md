# Stable / Preview / Remote — one launcher per product

Zach, 2026-09-22: *"I want to make sure I am getting the latest version on
bbox ui... right now I am not sure I am on the latest?"* This is the answer:
every local bbox-ui surface now tells you, on screen, which of three things
it is and how fresh it is — and a launcher script gets you to whichever one
you want.

The model (full rationale in `scripts/bbox_release.py`'s module docstring):

- **Stable** — a pinned local build, content-hash addressed. Never changes
  until you explicitly `--promote` again, even if the checkout moves on.
- **Preview** — a real local dev server with HMR, showing this checkout's
  disk right now, uncommitted edits included.
- **Remote** — the actual deployed site. bbox-ui.com only; the Storybook
  workbench has no public deploy, so it has no Remote channel.

Two products share this one model (`bbox_release.ProductConfig` — a second
product is a table entry, never a fork):

| Product | Launcher | Stable | Preview | Remote |
|---|---|---|---|---|
| bbox-ui.com | `scripts/launch_bboxui.py` | `:5194` | `:5196` | https://bbox-ui.com/ |
| Storybook workbench | `scripts/launch_bbox_storybook.py` | `:5430` | `:5431` | — |

**The Storybook workbench's Stable/Preview pair here is a SEPARATE, additional
thing from Zach's own persistent review Storybook on `:5421`.** That port
stays exactly what it always was — the live trunk lanes deliver into, meant
to be watched change, never pinned (see `apps/systemsketch/src/chrome/
sites.ts`'s own WHY on that). `:5430`/`:5431` are for anyone who specifically
wants a frozen, reproducible Storybook build, or a second live one that isn't
:5421.

## Commands

Every command is one absolute-path line, run from anywhere:

```bash
python3 /home/bam/bbox-ui/scripts/launch_bboxui.py
```

*bbox-ui.com Stable (default). Add `--preview` for the local `next dev` HMR
server, `--remote` for the deployed site, `--promote` to snapshot Preview's
current tree as the new Stable, `--rollback` to restore the previous one,
`--status` to check, `--stop [--all]` to stop what this launcher started.*

```bash
python3 /home/bam/bbox-ui/scripts/launch_bbox_storybook.py
```

*The same flags, for the Storybook Stable/Preview pair (`--remote` refuses —
there is none). `--no-open` skips opening a Chrome window (useful when
driving it headlessly, e.g. from CI or a verification script).*

## The badge

Every page — Stable and Preview alike, on both products — carries a small
corner badge naming its channel, branch, short commit, and (Stable) how
fresh it is against your checkout right now: "up to date", "N commits behind
your checkout", or "your checkout has changes Stable doesn't have". One
click switches to the other channel; from Preview (once Stable is known
reachable), one click promotes.

- bbox-ui.com: `scripts/bboxui_badge.js` (Stable, server-injected) +
  `apps/docs/src/components/dev/preview-channel-badge.tsx` (Preview, a real
  React component env-gated to the local `next dev` process only).
- Storybook: `apps/storybook-basics/.storybook/manager-head.html` — one
  script covers BOTH channels (Storybook bakes `manager-head.html` into
  `storybook build`'s static output the same way it loads it under
  `storybook dev`), telling them apart from `window.location.port` rather
  than an env var baked into the bundle at build time.

## The whiteboard's own "open another surface" rows

`apps/systemsketch`'s burger menu ("Open bbox-ui.com", "Open Storybook")
labels each row with what it would actually open right now — `(remote)`,
`(preview · branch · commit)`, `(stable · commit)`, or `(not running)` (and
disables the row rather than opening a connection-refused tab) — and flags
when that differs from the board you're looking at. See
`apps/systemsketch/src/chrome/siteStatus.ts`. This reads the same
`/api/health` contract as the badges above; `apps/systemsketch/
statusEndpoint.ts` and `apps/storybook-basics/.storybook/statusEndpoint.ts`
are what let a bare dev server (no Python Stable server involved) answer it
too, so the whiteboard's own `:4572` dev instance can report on itself.

## Ports this deliberately never binds

`:5421` (Zach's review Storybook), `:4572` / `:4340` (his apps), `:63315`
(the shared vitest port). Every default above was picked and verified clear
of these — see `bbox_release.py`'s `STORYBOOK` config comment for how.
