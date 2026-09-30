# LEDGER — finish-2026-09-29

The resume record for `WORK-ORDER.md` §5. The dispatcher updates a row and
**commits this file** after every state change. A resumed session reads it
first and skips `merged` rows.

status ∈ queued · acceptance · building · auditing · merged · failed · skipped

## Baseline (W0)

- integration branch: 
- typecheck: 
- studio suite: 
- storybook-basics suite (×2, flaky set): 
- live peers in a write set: 

## Lanes

| lane | wave | model | status | branch | tip | audit | user action (file:line) | evidence |
|---|---|---|---|---|---|---|---|---|
| W1-LAND | W1 | opus | queued | | | | | |
| G-FLAKE | W2 | sonnet | queued | | | | | |
| G-STALE | W2 | sonnet | queued | | | | | |
| B-RENAME | W2 | sonnet | queued | | | | | |
| B-SCHEMA | W2 | opus | queued | | | | | |
| B-SHELL-P1 | W3 | opus | queued | | | | | |
| L-WIRE-GESTURE | W3 | sonnet | queued | | | | | |
| L-WIRE-PAINT | W3 | sonnet | queued | | | | | |
| L-ROUTE | W3 | sonnet | queued | | | | | |
| L-BLOCK-VIEWS | W3 | sonnet | queued | | | | | |
| L-PORTS-RAIL | W3 | sonnet | queued | | | | | |
| L-PORTS-SHAPE | W3 | sonnet | queued | | | | | |
| L-MEMBERS | W3 | opus | queued | | | | | |
| L-CODE | W3 | sonnet | queued | | | | | |
| L-DIAG | W3 | sonnet | queued | | | | | |
| L-LINKING | W3 | opus | queued | | | | | |
| L-GLYPH | W3 | sonnet | queued | | | | | |
| L-COMPARE | W3 | sonnet | queued | | | | | |
| L-GESTURES | W3 | sonnet | queued | | | | | |
| L-MENU-CONTEXT | W4 | sonnet | queued | | | | | |
| L-PILL | W4 | sonnet | queued | | | | | |
| L-INSPECTOR | W4 | opus | queued | | | | | |
| L-FILES | W4 | sonnet | queued | | | | | |
| L-NAV | W4 | sonnet | queued | | | | | |
| L-RF-HOST | W4 | opus | queued | | | | | |
| L-CHANNELS | W4 | sonnet | queued | | | | | |
| L-REG | W3 | opus | queued | | | | | |
| L-DOCS-COMPONENTS | W3 | sonnet | queued | | | | | |
| L-DOCS-EDITOR | W3 | sonnet | queued | | | | | |
| L-DOCS-SCENE-HOSTS | W4 | sonnet | queued | | | | | |
| W5-VERIFY | W5 | opus | queued | | | | | |

## Items found done or obsolete at dispatch

| id | verdict | evidence |
|---|---|---|

## Finish-line gates (W5)

| gate | evidence |
|---|---|
| G1 nothing stranded | |
| G2 green ×5 | |
| G3 studio parity | |
| G4 one shell, two hosts | |
| G5 registry ships | |
| G6 stable / preview | |
