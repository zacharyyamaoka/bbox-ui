// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/binaryHeap.ts`).
//
// Zero code edits below this banner — a byte-for-byte copy.
//
// WHY a copy and not a dependency, and WHY the comments travel: this folder is
// dependency-free by design — its own header says it "must stay importable from
// a plain node script" — so copying costs nothing and keeps bbox-ui's core rule
// intact (`CLAUDE.md`: the core imports no canvas engine). Zach's rule for the
// copy: "whenever possible just copy pasted code from those libraries. make
// sure to keep that documentation with the functions." Every `@ported
// Excalidraw` tag, PROVENANCE section and WHY comment below is the donor's,
// unedited. Keeping the directory shape file-for-file (docs/TRACE-PLAN.md D3)
// is what makes a future re-sync a plain `diff` rather than an archaeology dig.
// ============================================================================

/**
 * A min-heap keyed by a score function, written for the A* open set in
 * `elbowRouter.ts`. Nothing exotic: `rescore` exists because A* re-scores a node
 * that is already queued and the heap has to be repaired around it.
 *
 * Written for pyblocks — not copied from anywhere.
 */
export class BinaryHeap<T> {
  private readonly items: T[] = []

  constructor(private readonly score: (item: T) => number) {}

  get size(): number {
    return this.items.length
  }

  push(item: T): void {
    this.items.push(item)
    this.bubbleUp(this.items.length - 1)
  }

  pop(): T | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last
      this.sinkDown(0)
    }
    return top
  }

  /** Repair the heap around an item whose score just changed. */
  rescore(item: T): void {
    const index = this.items.indexOf(item)
    if (index === -1) return
    this.bubbleUp(index)
    this.sinkDown(this.items.indexOf(item))
  }

  private bubbleUp(start: number): void {
    let index = start
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.score(this.items[index]) >= this.score(this.items[parent])) break
      this.swap(index, parent)
      index = parent
    }
  }

  private sinkDown(start: number): void {
    let index = start
    const length = this.items.length
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < length && this.score(this.items[left]) < this.score(this.items[smallest])) {
        smallest = left
      }
      if (right < length && this.score(this.items[right]) < this.score(this.items[smallest])) {
        smallest = right
      }
      if (smallest === index) break
      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(first: number, second: number): void {
    const held = this.items[first]
    this.items[first] = this.items[second]
    this.items[second] = held
  }
}
