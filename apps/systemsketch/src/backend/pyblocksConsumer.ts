// src/backend/pyblocksConsumer.ts — the pyblocks side of this app that is
// NOT React: what the backend setting turns on, where the setting is
// remembered, and the consumer that listens on the scene-event seam while
// the setting says `pyblocks`.
//
// WHY the policy (`pyblocksSurfaces`) lives beside the consumer rather than
// in the settings component: `backend.test.ts` runs in the `unit` project
// (`environment: "node"`, no DOM), so the rule that decides what renders has
// to be readable without rendering anything. Keeping it here makes "when the
// setting is `none`, nothing pyblocks exists" a function a test can call,
// instead of a claim about a tree it cannot mount.
//
// Provenance: the coalesce-then-POST shape is the notebook lab's
// `labClient.ts` posture the plan cites (§3.5 "Rejected transport: a
// WebSocket" — plain POST, no protocol layer). The self-skip is
// `@trunk/scene/history.ts`'s `shouldNotify`, reached through the seam's own
// `subscribe(listener, subscriber)`, not re-derived here. The queue policy
// (cap 20, drop oldest, drain on the next batch) is ours, ad hoc — see
// docs/ALGORITHM-PROVENANCE.md's classes.
import {
  BACKEND_SETTING_STORAGE_KEY,
  NO_BACKEND,
  parseBackendSetting,
  serializeBackendSetting,
  type BackendSetting,
} from "@trunk/backend/backendSetting";
import {
  createPyblocksClient,
  type FetchLike,
  type PyblocksClient,
  type PyblocksEventsEcho,
  type PyblocksHealthResult,
} from "@trunk/backend/pyblocksClient";
import { authorId } from "@trunk/scene/history";
import type { SceneEventBatch, SceneEventSeam } from "@trunk/scene/sceneEvents";

/* ------------------------------------------------------------------ */
/* Who is speaking                                                     */
/* ------------------------------------------------------------------ */

/**
 * The consumer's own author id.
 *
 * WHY it is stamped on the SUBSCRIPTION rather than only on what pyblocks
 * would one day write back: the seam skips a batch whose author equals the
 * subscriber (`sceneEvents.ts`'s `publish` → `history.ts`'s `shouldNotify`).
 * The write path is follow-up F1, and the day it lands, pyblocks' own edits
 * will be published onto this same seam — a consumer without a name would
 * then hear its own echo and POST it straight back. Naming it now costs one
 * line and closes that loop before it can exist.
 */
export const PYBLOCKS_CONSUMER_AUTHOR = authorId("pyblocks");

/** The author every batch the whiteboard derives carries. The bridge stamps
 *  it; it lives here so the consumer's self-skip and the bridge's stamp
 *  cannot drift into two spellings. */
export const BRIDGE_AUTHOR = authorId("tldraw");

/* ------------------------------------------------------------------ */
/* What the setting turns on                                           */
/* ------------------------------------------------------------------ */

export interface PyblocksSurfaces {
  /** The health pill in the settings row — the ONE thing that shows as soon
   *  as the person opts in, because "the server is down" is an answer they
   *  asked for. */
  healthPill: boolean;
  /** `Open Python file…`. */
  menuItem: boolean;
  /** `N batch · K semantic · A applied`. */
  statusLine: boolean;
  /** Whether the seam gets a subscriber at all. */
  consumer: boolean;
}

/**
 * The whole visibility rule, in one total function.
 *
 * WHY `none` turns EVERYTHING off rather than merely disabling it: Zach —
 * "System sketch should be able to be used with no real backend, then its
 * truly like a whiteboard." A greyed-out row still says a backend exists;
 * the promise is that nothing about pyblocks is on the board, in the DOM or
 * on the wire. The one surface that survives is the Backend control itself,
 * which reads `none` and mentions nothing else — that is what the person
 * flips to change their mind.
 *
 * WHY the capabilities and not just `ok`: `/api/health` carries
 * `systemsketch: {scene, events}` precisely so an OLDER pyblocks — reachable,
 * healthy, and 404 on both new routes — hides the two surfaces instead of
 * failing in the person's face. Never assumed, always read.
 */
export function pyblocksSurfaces(setting: BackendSetting, health: PyblocksHealthResult | null | undefined): PyblocksSurfaces {
  if (setting.kind !== "pyblocks") return { healthPill: false, menuItem: false, statusLine: false, consumer: false };
  const ok = health?.ok === true;
  const capabilities = health?.ok === true ? health.capabilities : { scene: false, events: false };
  const consumer = ok && capabilities.events;
  return { healthPill: true, menuItem: ok && capabilities.scene, statusLine: consumer, consumer };
}

/**
 * The client for a setting, or `null` when there is no backend to talk to.
 *
 * WHY `fetch` is wrapped in an arrow instead of passed by reference: the
 * acceptance installs its spy on `window.fetch` before the app's modules
 * evaluate, and a captured reference would sail straight past it. Calling
 * through the live global is also what makes "the fetch spy records zero
 * calls" a statement about the app rather than about module order.
 */
export function backendClientFor(setting: BackendSetting, fetchImpl?: FetchLike): PyblocksClient | null {
  if (setting.kind !== "pyblocks") return null;
  return createPyblocksClient(setting.url, fetchImpl ?? ((input, init) => fetch(input, init)));
}

/* ------------------------------------------------------------------ */
/* Where the setting is remembered                                     */
/* ------------------------------------------------------------------ */

/**
 * The stored setting, or `NO_BACKEND`.
 *
 * Every read is wrapped: a private window, blocked site data or a storage
 * quota error must cost the person their remembered URL, never the app. Both
 * the JSON parse and `parseBackendSetting` already fail closed
 * (`backendSetting.ts`: "a stored value nobody here understands must fail
 * CLOSED"), so the only thing left to catch is the accessor itself throwing.
 */
export function readStoredSetting(storage: Storage | null | undefined): BackendSetting {
  try {
    const raw = storage?.getItem(BACKEND_SETTING_STORAGE_KEY);
    if (!raw) return NO_BACKEND;
    return parseBackendSetting(JSON.parse(raw));
  } catch {
    return NO_BACKEND;
  }
}

/** The inverse, equally silent about a storage that refuses. */
export function writeStoredSetting(storage: Storage | null | undefined, setting: BackendSetting): void {
  try {
    storage?.setItem(BACKEND_SETTING_STORAGE_KEY, serializeBackendSetting(setting));
  } catch {
    /* a remembered URL is a convenience; losing it is not an error */
  }
}

/* ------------------------------------------------------------------ */
/* The status line                                                     */
/* ------------------------------------------------------------------ */

/**
 * The last echo, as the one line the status strip shows.
 *
 * WHY `applied` is printed even though it is always `0` tonight: it is the
 * contract's own promise made visible (plan §5.4, F1 is the write path). A
 * line that quietly omitted it would make the day it becomes non-zero
 * invisible, and would hide from the person that pyblocks is currently
 * READING their edits and changing nothing.
 */
export function echoSummary(echo: PyblocksEventsEcho | null | undefined): string {
  if (!echo) return "";
  const semantic = echo.classified.reduce(
    (total, one) => total + one.events.filter((event) => event.class === "semantic").length,
    0,
  );
  return `${echo.accepted} batch · ${semantic} semantic · ${echo.applied} applied`;
}

/* ------------------------------------------------------------------ */
/* The consumer                                                        */
/* ------------------------------------------------------------------ */

export interface PyblocksConsumerOptions {
  onEcho?(echo: PyblocksEventsEcho): void;
  /** The server's own error text, surfaced ONCE per distinct message — a
   *  backend that is down produces one batch per gesture, and a toast per
   *  gesture is how a person learns to stop reading toasts. */
  onError?(message: string): void;
  /** How long a batch waits for its neighbours. */
  coalesceMs?: number;
  /** The retry queue's ceiling. */
  maxQueued?: number;
}

const DEFAULT_COALESCE_MS = 250;
const DEFAULT_MAX_QUEUED = 20;

/**
 * Subscribe to the seam and POST what it publishes, coalesced.
 *
 * Returns the detach. `seam.size` goes back to `0` after it — the seam is
 * the app's, not the backend's, and a whiteboard with no backend has to be
 * indistinguishable from one that never had one.
 *
 * WHY a failed POST is requeued but NOT re-scheduled on a timer: the queue
 * exists so a backend that blinked does not lose the gesture that happened
 * during the blink — it drains on the next batch, which is the next thing
 * the person does. A self-scheduling retry loop would keep a dead server
 * warm forever behind a whiteboard that has stopped caring, and tonight
 * nothing downstream acts on the events anyway (`applied: 0`). The honest
 * cost is stated here rather than hidden: if the person stops editing while
 * the server is down, the last batches never arrive.
 */
export function attachPyblocksConsumer(seam: SceneEventSeam, client: PyblocksClient, options: PyblocksConsumerOptions): () => void {
  const coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
  const maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED;

  let queue: SceneEventBatch[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let detached = false;
  /** The last error already shown, so a run of identical failures is one
   *  message and not one per gesture. */
  let surfaced: string | null = null;

  const capped = (batches: SceneEventBatch[]) => (batches.length <= maxQueued ? batches : batches.slice(batches.length - maxQueued));

  const flush = async () => {
    timer = null;
    if (detached || queue.length === 0) return;
    const sending = queue;
    queue = [];
    try {
      const echo = await client.events(sending);
      surfaced = null;
      if (!detached) options.onEcho?.(echo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Back on the queue, oldest first, so the next gesture carries them.
      queue = capped([...sending, ...queue]);
      if (!detached && message !== surfaced) {
        surfaced = message;
        options.onError?.(message);
      }
    }
  };

  const unsubscribe = seam.subscribe((batch) => {
    if (detached) return;
    queue = capped([...queue, batch]);
    if (timer === null) timer = setTimeout(() => void flush(), coalesceMs);
  }, PYBLOCKS_CONSUMER_AUTHOR);

  return () => {
    detached = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queue = [];
    unsubscribe();
  };
}
