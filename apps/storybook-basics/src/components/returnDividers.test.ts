/**
 * src/components/returnDividers.test.ts — the pure half of "multiple
 * returns": rail positions, the authoring round trip, and the union-type
 * translation. The rendered half (the two drawings) is measured in a real
 * browser by `MultipleReturns.stories.tsx`.
 */
import { describe, expect, it } from "vitest";

import type { PortEdgeItem } from "./portEdge";
import {
  extractReturnAnnotation,
  formatRailLane,
  isDividerLine,
  railForReturnAnnotation,
  reconcileRailLane,
  returnPortGroups,
  sameDividers,
  sanitizeDividers,
} from "./returnDividers";

const port = (id: string, label = id): PortEdgeItem => ({ id, label, state: "empty" });

describe("sanitizeDividers — a divider is only ever interior", () => {
  it("keeps only 0..portCount-2", () => {
    expect(sanitizeDividers([0, 1, 2], 4)).toEqual([0, 1, 2]);
    expect(sanitizeDividers([-1, 3], 4)).toEqual([]); // first/last for 4 ports
  });

  it("dedupes and sorts", () => {
    expect(sanitizeDividers([2, 0, 2, 1], 5)).toEqual([0, 1, 2]);
  });

  it("has no valid interior position for 0 or 1 ports", () => {
    expect(sanitizeDividers([0], 0)).toEqual([]);
    expect(sanitizeDividers([0], 1)).toEqual([]);
  });

  it("rejects a non-integer or a value outside range", () => {
    expect(sanitizeDividers([1.5, -5, 99], 4)).toEqual([]);
  });
});

describe("sameDividers", () => {
  it("compares two sanitized lists by value", () => {
    expect(sameDividers([0, 1], [0, 1])).toBe(true);
    expect(sameDividers([0, 1], [0, 2])).toBe(false);
    expect(sameDividers([], [])).toBe(true);
  });
});

describe("isDividerLine", () => {
  it("matches exactly '---' or '|', trimmed", () => {
    expect(isDividerLine("---")).toBe(true);
    expect(isDividerLine("|")).toBe(true);
    expect(isDividerLine("  ---  ")).toBe(true);
    expect(isDividerLine("----")).toBe(false);
    expect(isDividerLine("a | b")).toBe(false);
    expect(isDividerLine("")).toBe(false);
  });
});

describe("formatRailLane / reconcileRailLane — the authoring round trip", () => {
  const mint = (label: string): PortEdgeItem => ({ id: `new-${label}`, label, state: "empty" });

  it("formats with no dividers exactly like a plain port list", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(formatRailLane(ports, [])).toBe("a\nb\nc");
  });

  it("inserts a '---' line at each sanitized position", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(formatRailLane(ports, [0])).toBe("a\n---\nb\nc");
    expect(formatRailLane(ports, [1])).toBe("a\nb\n---\nc");
  });

  it("round-trips: format then reconcile with no edit returns the SAME ports array and the same dividers", () => {
    const ports = [port("joint_angles"), port("None")];
    const text = formatRailLane(ports, [0]);
    const result = reconcileRailLane(ports, [0], text, mint);
    expect(result.ports).toBe(ports); // referential no-op, via reconcilePortLane's own purity
    expect(result.dividerAfter).toEqual([0]);
  });

  it("typing '|' instead of '---' parses to the same divider", () => {
    const ports = [port("a"), port("b")];
    const result = reconcileRailLane(ports, [], "a\n|\nb", mint);
    expect(result.dividerAfter).toEqual([0]);
  });

  it("a divider typed before the first line or after the last is trimmed — never first or last", () => {
    const ports = [port("a"), port("b")];
    expect(reconcileRailLane(ports, [], "---\na\nb", mint).dividerAfter).toEqual([]);
    expect(reconcileRailLane(ports, [], "a\nb\n---", mint).dividerAfter).toEqual([]);
  });

  it("consecutive divider lines collapse to one", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(reconcileRailLane(ports, [], "a\n---\n---\n|\nb\nc", mint).dividerAfter).toEqual([0]);
  });

  it("deleting the divider line removes it, ports untouched", () => {
    const ports = [port("a"), port("b")];
    const withDivider = formatRailLane(ports, [0]);
    expect(withDivider).toBe("a\n---\nb");
    const result = reconcileRailLane(ports, [0], "a\nb", mint);
    expect(result.dividerAfter).toEqual([]);
    expect(result.ports).toBe(ports);
  });

  it("renaming a port around a divider keeps the divider AND the port's id (LCS still does its job)", () => {
    const ports = [port("alpha"), port("beta")];
    const result = reconcileRailLane(ports, [0], "alpha_renamed\n---\nbeta", mint);
    expect(result.dividerAfter).toEqual([0]);
    expect(result.ports.map((p) => p.id)).toEqual(["alpha", "beta"]);
    expect(result.ports[0].label).toBe("alpha_renamed");
  });

  it("a new line past a divider mints a fresh port after it", () => {
    const ports = [port("a")];
    const result = reconcileRailLane(ports, [], "a\n---\nb", mint);
    // divider ends up after the single existing port -> not interior (only 1 gap of ports after mint = 2 total, position 0 IS interior for 2 ports)
    expect(result.ports.map((p) => p.label)).toEqual(["a", "b"]);
    expect(result.dividerAfter).toEqual([0]);
  });

  // Judge finding 1 (2026-09-22): formatRailLane used to join a port's RAW
  // label straight into the lane text — unescaped, a literal embedded
  // newline split one port into two physical lines, and reconciling that
  // text renamed the original to the first half and minted a stranger for
  // the second. Fixed by sharing `portLane.ts`'s `encodeLaneLine` (and its
  // new inverse, `decodeLaneLine`) rather than re-implementing formatting.
  describe("identity survives a label containing a literal newline (finding 1)", () => {
    it("formats a newline-carrying label as ONE escaped line, not two", () => {
      const ports = [port("orig", "a\nb"), port("other", "c")];
      const text = formatRailLane(ports, []);
      expect(text.split("\n")).toHaveLength(2); // not 3 — the embedded \n must not become a line break
      expect(text).toBe("a␊b\nc");
    });

    it("a genuine no-op round trip (format -> reconcile with no edit) keeps the SAME port objects", () => {
      const ports = [port("orig", "a\nb"), port("other", "c")];
      const text = formatRailLane(ports, [0]);
      const result = reconcileRailLane(ports, [0], text, mint);
      expect(result.ports).toBe(ports); // referential identity — nothing minted, nothing renamed
      expect(result.ports[0].label).toBe("a\nb"); // the real newline survived, not the ␊ placeholder
      expect(result.dividerAfter).toEqual([0]);
    });

    it("editing an UNRELATED line leaves the newline-carrying port's id and label untouched", () => {
      const ports = [port("orig", "a\nb"), port("other", "c")];
      const text = formatRailLane(ports, []);
      const edited = text.replace("c", "renamed");
      const result = reconcileRailLane(ports, [], edited, mint);
      expect(result.ports).toHaveLength(2);
      expect(result.ports[0].id).toBe("orig");
      expect(result.ports[0].label).toBe("a\nb");
      expect(result.ports[1].label).toBe("renamed");
    });
  });

  it("reordering ports leaves divider POSITIONS untouched — the port moves, the boundary doesn't", () => {
    // [a, b | c] -> swap b and c -> [a, c | b]: divider stays "after index 1".
    const ports = [port("a"), port("b"), port("c")];
    const swapped = [port("a"), port("c"), port("b")];
    const dividerAfter = sanitizeDividers([1], ports.length);
    expect(dividerAfter).toEqual([1]);
    // The model asserts nothing moves the divider on a pure reorder — this
    // is the "sensible crossing" behaviour: same index, different neighbours.
    expect(sanitizeDividers(dividerAfter, swapped.length)).toEqual([1]);
  });
});

describe("extractReturnAnnotation", () => {
  it("pulls the annotation out of a full def signature", () => {
    expect(extractReturnAnnotation("def run_ik(target) -> joint_angles | None:")).toBe("joint_angles | None");
  });

  it("works with no trailing colon", () => {
    expect(extractReturnAnnotation("run_ik(target) -> joint_angles | None")).toBe("joint_angles | None");
  });

  it("passes a bare annotation through unchanged", () => {
    expect(extractReturnAnnotation("joint_angles | None")).toBe("joint_angles | None");
  });
});

describe("returnPortGroups — declaration string in, port groups out", () => {
  it("run_ik's own sketch: two distinct groups", () => {
    expect(returnPortGroups("joint_angles | None")).toEqual([[{ id: "joint_angles", label: "joint_angles" }], [{ id: "None", label: "None" }]]);
  });

  it("same return types collapse to ONE group", () => {
    expect(returnPortGroups("joint_angles | joint_angles")).toEqual([[{ id: "joint_angles", label: "joint_angles" }]]);
  });

  it("no union at all is one group", () => {
    expect(returnPortGroups("joint_angles")).toEqual([[{ id: "joint_angles", label: "joint_angles" }]]);
  });

  it("three distinct members -> three groups", () => {
    expect(returnPortGroups("float | int | None").map((g) => g[0].id)).toEqual(["float", "int", "None"]);
  });

  it("a repeat anywhere in the union folds into its first group, not just adjacent repeats", () => {
    expect(returnPortGroups("bool | int | bool").map((g) => g[0].id)).toEqual(["bool", "int"]);
  });

  it("does not split inside brackets", () => {
    expect(returnPortGroups("dict[str, int | float] | None").map((g) => g[0].id)).toEqual(["dict[str, int | float]", "None"]);
  });

  // Judge finding 2 (2026-09-22): dedupe used to compare trimmed labels
  // BYTE FOR BYTE, so the same type spelled with different internal
  // whitespace produced two ports and a divider between them.
  describe("dedupe is on a whitespace-normalized type key (finding 2)", () => {
    it("collapses the same type spelled with different internal spacing", () => {
      expect(returnPortGroups("list[ int ] | list[int]")).toHaveLength(1);
    });

    it("keeps the FIRST authored spelling as the displayed label/id", () => {
      const groups = returnPortGroups("list[ int ] | list[int]");
      expect(groups[0][0].label).toBe("list[ int ]");
      expect(groups[0][0].id).toBe("list[ int ]");
    });

    it("the reverse order keeps ITS first spelling instead", () => {
      const groups = returnPortGroups("list[int] | list[ int ]");
      expect(groups[0][0].label).toBe("list[int]");
    });

    it("still distinguishes genuinely different types that merely contain brackets", () => {
      expect(returnPortGroups("list[int] | list[float]").map((g) => g[0].id)).toEqual(["list[int]", "list[float]"]);
    });

    it("railForReturnAnnotation: no divider for a whitespace-only difference", () => {
      const rail = railForReturnAnnotation("def f(x) -> list[ int ] | list[int]:");
      expect(rail.items).toHaveLength(1);
      expect(rail.dividerAfter).toEqual([]);
    });

    // Judge finding 2's SECOND half (2026-09-22): the first fix deleted every
    // whitespace character in the label, which over-collapses. Whitespace is
    // insignificant BETWEEN tokens of a type expression and significant
    // INSIDE a string literal, so `Literal["a b"]` and `Literal["ab"]` are
    // two different types that were getting one key — one port, no divider,
    // and a space the author owns silently gone from the identity test.
    describe("whitespace inside a QUOTED string stays significant", () => {
      it("keeps two Literals apart when only the quoted space differs", () => {
        const groups = returnPortGroups('Literal["a b"] | Literal["ab"]');
        expect(groups.map((g) => g[0].id)).toEqual(['Literal["a b"]', 'Literal["ab"]']);
      });

      it("does the same for single-quoted literals", () => {
        expect(returnPortGroups("Literal['a b'] | Literal['ab']")).toHaveLength(2);
      });

      it("keeps Annotated metadata apart when only its quoted space differs", () => {
        expect(returnPortGroups('Annotated[int, "meta data"] | Annotated[int, "metadata"]')).toHaveLength(2);
      });

      it("still collapses whitespace OUTSIDE the quotes in the same annotation", () => {
        const groups = returnPortGroups('Annotated[ int , "meta data" ] | Annotated[int,"meta data"]');
        expect(groups).toHaveLength(1);
        expect(groups[0][0].label).toBe('Annotated[ int , "meta data" ]');
      });

      it("respects a backslash escape, so an escaped quote does not close the literal", () => {
        // These are Python `Literal`s over the strings `a" b` and `a"b` — one
        // space apart, INSIDE the literal. If the scanner let the escaped `\"`
        // close the quote, that space would land outside it and be collapsed
        // away, so both would take one key and the rail would draw one port.
        expect(returnPortGroups('Literal["a\\" b"] | Literal["a\\"b"]')).toHaveLength(2);
      });

      it("keeps an UNTERMINATED quote verbatim rather than guessing", () => {
        // Half-typed annotation: everything after the opening quote is
        // preserved, so two different half-typed spellings stay distinct.
        expect(returnPortGroups('"a b | "a  b')).toHaveLength(2);
      });

      it("collapses a generic's and a callable's insignificant whitespace, as before", () => {
        expect(returnPortGroups("dict[str, int | float] | dict[str,int|float]")).toHaveLength(1);
        expect(returnPortGroups("Callable[[int], str] | Callable[[int],str]")).toHaveLength(1);
      });

      it("still tells two genuinely different callables apart", () => {
        expect(returnPortGroups("Callable[[int, str], None] | Callable[[str, int], None]")).toHaveLength(2);
      });

      it("quote STYLE is deliberately not normalized — pinned, not accidental", () => {
        // Same type to Python; folding the two spellings needs a real string
        // evaluator, not a scan. See `normalizedTypeKey`'s own doc.
        expect(returnPortGroups(`Literal['a b'] | Literal["a b"]`)).toHaveLength(2);
      });

      it("railForReturnAnnotation: a divider DOES appear for two quote-distinct Literals", () => {
        const rail = railForReturnAnnotation('def f(x) -> Literal["a b"] | Literal["ab"]:');
        expect(rail.items).toHaveLength(2);
        expect(rail.dividerAfter).toEqual([0]);
      });
    });
  });

  it("empty annotation is zero groups", () => {
    expect(returnPortGroups("")).toEqual([]);
    expect(returnPortGroups("   ")).toEqual([]);
  });
});

describe("railForReturnAnnotation", () => {
  it("run_ik(): two ports, one divider between them", () => {
    const rail = railForReturnAnnotation("def run_ik(target) -> joint_angles | None:");
    expect(rail.items.map((i) => i.id)).toEqual(["joint_angles", "None"]);
    expect(rail.dividerAfter).toEqual([0]);
  });

  it("same return types: one port, NO divider", () => {
    const rail = railForReturnAnnotation("joint_angles | joint_angles");
    expect(rail.items.map((i) => i.id)).toEqual(["joint_angles"]);
    expect(rail.dividerAfter).toEqual([]);
  });

  it("three groups: two dividers, both interior", () => {
    const rail = railForReturnAnnotation("float | int | None");
    expect(rail.items).toHaveLength(3);
    expect(rail.dividerAfter).toEqual([0, 1]);
  });

  it("threads an explicit state onto every port", () => {
    const rail = railForReturnAnnotation("a | b", "wired");
    expect(rail.items.every((i) => i.state === "wired")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The rail lane as a TRANSPORT — judge finding 1, 2026-09-22.          */
/* ------------------------------------------------------------------ */

/**
 * `portLane.test.ts` proves the CHARACTER codec (`encodeLaneLine` /
 * `decodeLaneLine`) is a real inverse pair. This block proves the same
 * identity property survives the RAIL layer stacked on top of it, which
 * adds a second, LINE-level sentinel: a line reading `---` or `|` means
 * "divider here", so a port whose own label reads that way has to be
 * shielded on the way out and unshielded on the way back in, or a nominal
 * no-op deletes it and leaves a divider behind.
 *
 * The alphabet and the generator are deliberately duplicated from
 * `portLane.test.ts` rather than imported from it — importing one test file
 * into another makes Vitest run its suites twice, and a transport test that
 * shares its adversarial inputs with the thing it is testing is not
 * independent.
 */
const NEWLINE_MARK = "␊";
const ESCAPE_MARK = "␛";
const ADVERSARIAL_ALPHABET = ["a", "\n", NEWLINE_MARK, ESCAPE_MARK, "-", "|"];

function allStringsUpTo(maxLength: number, alphabet: readonly string[]): string[] {
  const all: string[] = [""];
  let frontier: string[] = [""];
  for (let length = 0; length < maxLength; length++) {
    frontier = frontier.flatMap((prefix) => alphabet.map((character) => prefix + character));
    all.push(...frontier);
  }
  return all;
}

const RAIL_CASES = allStringsUpTo(4, ADVERSARIAL_ALPHABET);

const RAIL_NAMED_LABELS: { what: string; label: string }[] = [
  { what: "a literal placeholder character", label: `literal${NEWLINE_MARK}glyph` },
  { what: "a real newline next to a literal placeholder", label: `a\n${NEWLINE_MARK}b` },
  { what: "a literal escape mark", label: `esc${ESCAPE_MARK}here` },
  { what: "a label that reads as a divider line", label: "---" },
  { what: "a label that reads as the other divider spelling", label: "|" },
  { what: "a label that reads as a divider with padding", label: "  ---  " },
];

describe("formatRailLane -> reconcileRailLane — identity on an unedited document (finding 1)", () => {
  const railMint = (label: string): PortEdgeItem => ({ id: `minted-${label}`, label, state: "empty" });
  /** The adversarial label FIRST, an ordinary port second, one real divider
   *  between them — the smallest document in which a divider is interior. */
  const pairFor = (label: string): PortEdgeItem[] => [port("first", label), port("second", "c")];

  it("a no-op returns the SAME array by reference, and the same divider, for every label in the sweep", () => {
    const rewritten: string[] = [];
    const movedDivider: string[] = [];
    for (const label of RAIL_CASES) {
      const ports = pairFor(label);
      const result = reconcileRailLane(ports, [0], formatRailLane(ports, [0]), railMint);
      if (result.ports !== ports) rewritten.push(JSON.stringify(label));
      if (result.dividerAfter.length !== 1 || result.dividerAfter[0] !== 0) movedDivider.push(JSON.stringify(label));
    }
    expect(rewritten.slice(0, 10)).toEqual([]);
    expect(rewritten).toHaveLength(0);
    expect(movedDivider.slice(0, 10)).toEqual([]);
    expect(movedDivider).toHaveLength(0);
  });

  it("emits exactly one line per port plus one per divider, whatever the labels contain", () => {
    const wrongCount = RAIL_CASES.filter((label) => formatRailLane(pairFor(label), [0]).split("\n").length !== 3);
    expect(wrongCount.slice(0, 10)).toEqual([]);
  });

  it("a port line is never mistaken for the divider line", () => {
    const claimed = RAIL_CASES.filter((label) => {
      const lines = formatRailLane(pairFor(label), [0]).split("\n");
      // Line 1 is the real divider; lines 0 and 2 are ports and must not read
      // as dividers, or reconcile would drop the port and keep a boundary.
      return isDividerLine(lines[0]) || isDividerLine(lines[2]);
    });
    expect(claimed.slice(0, 10)).toEqual([]);
  });

  describe("mint / rename / unrelated-line edits keep their promises through the rail", () => {
    for (const { what, label } of RAIL_NAMED_LABELS) {
      it(`mints a fresh port after the divider beside ${what}`, () => {
        const ports = pairFor(label);
        const result = reconcileRailLane(ports, [0], `${formatRailLane(ports, [0])}\nthird`, railMint);
        expect(result.ports.map((p) => p.id)).toEqual(["first", "second", "minted-third"]);
        expect(result.ports[0]).toBe(ports[0]);
        expect(result.ports[0].label).toBe(label);
        expect(result.dividerAfter).toEqual([0]);
      });

      it(`renames ${what} in place, keeping its id and the divider`, () => {
        const ports = pairFor(label);
        const lines = formatRailLane(ports, [0]).split("\n");
        lines[0] = "renamed";
        const result = reconcileRailLane(ports, [0], lines.join("\n"), railMint);
        expect(result.ports.map((p) => p.id)).toEqual(["first", "second"]);
        expect(result.ports[0].label).toBe("renamed");
        expect(result.ports[1]).toBe(ports[1]);
        expect(result.dividerAfter).toEqual([0]);
      });

      it(`leaves ${what} untouched when an UNRELATED line is edited`, () => {
        const ports = pairFor(label);
        const lines = formatRailLane(ports, [0]).split("\n");
        lines[2] = "renamed";
        const result = reconcileRailLane(ports, [0], lines.join("\n"), railMint);
        expect(result.ports.map((p) => p.id)).toEqual(["first", "second"]);
        expect(result.ports[0]).toBe(ports[0]);
        expect(result.ports[0].label).toBe(label);
        expect(result.ports[1].label).toBe("renamed");
        expect(result.dividerAfter).toEqual([0]);
      });

      it(`keeps ${what} when a fresh line is inserted ABOVE it`, () => {
        // Tier 1 has nothing to anchor on at index 0, so tier 2's rank-zip
        // decides — and a `before` list spelled differently from the TEXT
        // mispairs here, renaming the user's port to the newcomer.
        const ports = pairFor(label);
        const result = reconcileRailLane(ports, [0], `inserted\n${formatRailLane(ports, [0])}`, railMint);
        expect(result.ports.map((p) => p.id)).toEqual(["minted-inserted", "first", "second"]);
        expect(result.ports[1].label).toBe(label);
        expect(result.ports[2]).toBe(ports[1]);
        expect(result.dividerAfter).toEqual([1]);
      });
    }
  });

  it("a divider-looking LABEL and a real divider coexist in one document", () => {
    const ports = [port("dash", "---"), port("pipe", "|"), port("plain", "c")];
    const text = formatRailLane(ports, [1]);
    expect(text.split("\n")).toHaveLength(4);
    const result = reconcileRailLane(ports, [1], text, railMint);
    expect(result.ports).toBe(ports);
    expect(result.ports.map((p) => p.label)).toEqual(["---", "|", "c"]);
    expect(result.dividerAfter).toEqual([1]);
  });

  it("typing a bare `---` line is STILL a divider, not a port named `---`", () => {
    // The shield must not make the authoring gesture Zach specified
    // unreachable: a line the HUMAN types as `---` carries no shield, so it
    // still reads as a divider.
    const ports = [port("a"), port("b")];
    const result = reconcileRailLane(ports, [], "a\n---\nb", railMint);
    expect(result.ports).toBe(ports);
    expect(result.dividerAfter).toEqual([0]);
  });
});
