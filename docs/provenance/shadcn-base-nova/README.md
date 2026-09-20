# Stock shadcn `base-nova` sources — snapshot, 2026-09-19

Fetched verbatim by the planning lane of `docs/CHROME-FILES-SETTINGS-PLAN.md`
from `https://ui.shadcn.com/r/styles/base-nova/<name>.json` (HTTP 200, the
stock shadcn registry's Base UI style — the same flavour the trunk's
`context-menu.tsx`/`breadcrumb.tsx` already carry). One file per primitive the
trunk lacked: `dialog`, `switch`, `radio-group`, `select`, `label`, `input`,
`table`, `field`.

Lane `devtools-2026-09-19` added three more the same way, for the quick
switcher: `command` (cmdk inside the Dialog above — the stock answer to "press
S and it should open the quick switcher"), `input-group` (its search field),
and `textarea`. The last one is nobody's design: `input-group.tsx` ships an
`InputGroupTextarea` member, so the file has to exist for the copy above it to
stay verbatim and to resolve.

These JSON files are the ORACLE for lane `stock-primitives`:
`apps/storybook-basics/src/components/stockPrimitives.test.ts` checks every
copied `src/components/<name>.tsx` against the `files[0].content` here — the
same export list, every class string present, and none of the registry-only
specifiers left behind. Do not edit them; re-fetch into a new dated folder if
stock moves.

The registry copies carry three specifiers that only resolve inside the shadcn
monorepo, and the lane rewrites exactly those (the "copy-trap fixes"
`context-menu.tsx`'s header already documents):

| Stock specifier | Rewritten to |
|---|---|
| `import { cn } from "cn"` | `import { cn } from "../lib/utils"` |
| `@/registry/base-nova/ui/<x>` | `./<x>` (the trunk's own sibling) |
| `<IconPlaceholder lucide="XIcon" … />` + its import | `<XIcon … />` imported from `lucide-react` (the icon the placeholder names) |

One caution the oracle itself creates: its three "no registry-only specifier"
regexes scan the WHOLE file, comments included. A header that quotes the banned
strings to explain what it rewrote fails its own test — describe them instead,
the way every copy in `src/components/` already does.
