/**
 * The **rules-reference soft-gate** seen-flag store (ticket 0075).
 *
 * The Foundations primer assumes a learner already knows the ground rules — what a flush draw or an
 * overcard *is* — before the first graded lesson. To keep a true beginner from hitting the equity
 * lesson cold, the Learn screen shows a prominent one-time "start with the rules" gate. This is a
 * *soft* gate: a nudge the learner can open or dismiss, never a hard block — once acted on, it stays
 * dismissed across reloads.
 *
 * That one bit ("has the learner seen/dismissed the gate?") is persisted here, on-device, with **no
 * backend** — and it deliberately mirrors {@link ./progressStore.LocalStorageLessonProgressStore}: a
 * tiny typed interface, a `localStorage`-backed default whose `Storage` is injectable + resolved
 * lazily, and the same wrapped-call graceful-degradation idiom (a storage failure — private mode,
 * quota, disabled storage — is swallowed with a `console.warn` and the gate simply behaves as
 * "unseen", never throwing to the caller). Tests pass a fake.
 */

/** The versioned `localStorage` key the seen-flag lives under. */
export const RULES_GATE_STORAGE_KEY = 'primer-rules-gate-v1'

/** The value written once the gate has been seen/dismissed (any non-empty string reads as "seen"). */
const SEEN_VALUE = '1'

/**
 * On-device store of the rules-gate seen flag. Synchronous (localStorage is sync), and like the
 * progress seam every method degrades gracefully: a read failure reads as "unseen", a write failure is
 * swallowed. An interface keeps the platform bit injectable so tests use a fake without real storage.
 */
export interface RulesGateStore {
  /** Whether the gate has already been seen/dismissed. Returns `false` on any failure (unavailable storage). */
  seen(): boolean
  /** Mark the gate seen/dismissed. Never throws — a failure is swallowed (console.warn). */
  markSeen(): void
}

/**
 * The `localStorage`-backed {@link RulesGateStore}. The `Storage` is injectable (defaults to the global
 * `localStorage`, resolved LAZILY per-call so merely constructing the store where no `localStorage`
 * exists never throws — the failure surfaces only on an actual read/write, where it is already caught).
 */
export class LocalStorageRulesGateStore implements RulesGateStore {
  private readonly storage: Storage | undefined

  /** `storage` defaults to the global `localStorage` (resolved lazily in {@link getStorage}). */
  constructor(storage?: Storage) {
    this.storage = storage
  }

  /** Resolve the backing `Storage`, or `undefined` if none is available in this environment. */
  private getStorage(): Storage | undefined {
    return this.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  }

  seen(): boolean {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return false
      return Boolean(storage.getItem(RULES_GATE_STORAGE_KEY))
    } catch (err: unknown) {
      // Reads can throw (e.g. localStorage blocked in some privacy modes). Treat as unseen so the gate
      // still shows once; it costs only a dismissible nudge if storage never persists it.
      console.warn('primer-rules-gate: load failed', err)
      return false
    }
  }

  markSeen(): void {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return
      storage.setItem(RULES_GATE_STORAGE_KEY, SEEN_VALUE)
    } catch (err: unknown) {
      // Writes can throw (quota, disabled storage, private mode). Never let it break the primer.
      console.warn('primer-rules-gate: save failed', err)
    }
  }
}
