# Decision records

Durable, dated records of architecture decisions in this repo. One file per
decision: `NNNN-slug.md`, numbered in the order they were written, never
renumbered.

## What earns a record

A record is for a **genuine fork a future rewrite must not silently
re-litigate** — a choice with real alternatives, where the losing options
were plausible and someone will eventually be tempted by them again.

Not for bug fixes. Not for obvious calls. If the alternative was never
seriously in play, there is no decision to record, and adding one makes the
directory noise instead of signal.

The bar is deliberately high. A handful of these over the life of the repo
is the expected volume.

## Why this exists at all

Up to now every piece of architecture reasoning in this repo lived in
**file-header comments** — which are excellent for "why is this line like
this" and useless for "which of three designs did we pick, and what did we
give up". The failure that produced this directory: a contradiction between
two components' stated rules sat undetected for a day because the reasoning
for each lived only next to its own code, where nothing could compare them.

A header comment answers a question you are already standing in front of.
A record answers a question you have not thought to ask yet.

## Shape

```
# NNNN — <title>

- **Status**: accepted | superseded by NNNN | withdrawn
- **Date**: YYYY-MM-DD
- **Decided by**: <who made the call>
- **Seam**: <file:line where the code carries a WHY pointing back here>

## The ruling            what was actually decided, in one paragraph
## What forced it        the measured problem, with numbers
## Options weighed       each one, and why it lost
## What we give up       stated plainly, not hedged
## What would reopen it  the observation that should make someone revisit
```

## The link must not rot

A record is linked from a `WHY:` comment at the seam it governs, and the
seam is named in the record's own header. Those two references point at each
other on purpose: either one alone decays silently.

Keep both current when code moves.
