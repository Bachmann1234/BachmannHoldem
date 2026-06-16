/**
 * The lesson-progress store contract + its `localStorage` implementation (ticket 0048).
 *
 * This is the on-device durability seam for the Foundations primer (§5.4): which lessons the learner
 * has completed, persisted across reloads with **no backend** (the app is an offline static shell).
 * It mirrors the hand-history seam ({@link ../history/store.HandHistoryStore}) exactly — a tiny typed
 * interface, an injectable platform-backed default impl, and the same wrapped-call graceful-degradation
 * idiom: a storage failure (private mode, quota, disabled storage, malformed data) is swallowed with a
 * `console.warn` and the primer keeps working in-memory, never throwing to the caller.
 *
 * **What is persisted: the SET of completed lesson IDS** — the stable {@link Lesson.id} strings, NOT a
 * bare count. Storing ids (rather than a number) makes the stored shape version-tolerant: when the
 * lesson set changes, on load we filter to ids that still exist in `FOUNDATIONS` and ignore unknown
 * ids, so a blob written by an older (or newer) lesson set can never crash or mislead the path. The
 * shell maps that id set back to the numeric `progress` the {@link ../components/LearnView} wants (the
 * length of the leading run of completed lessons in `FOUNDATIONS` order — the unlocked prefix / resume
 * point).
 *
 * The on-disk envelope is a small versioned JSON object: `{ v: 1, completed: string[] }` under the
 * versioned key `primer-progress-v1`. Missing / malformed JSON / a wrong shape all degrade to "no
 * progress" (an empty array) rather than throwing.
 */

/** The versioned `localStorage` key the envelope lives under (matches the §5.4 prototype). */
export const PROGRESS_STORAGE_KEY = 'primer-progress-v1'

/** The envelope schema version; bump alongside the key when the persisted shape changes. */
export const PROGRESS_ENVELOPE_VERSION = 1

/**
 * The persisted shape: a version tag plus the set of completed lesson ids (as an array — JSON has no
 * sets). Kept minimal and tolerant; readers must not assume any ordering or that ids still exist.
 */
export interface ProgressEnvelope {
  /** Envelope version ({@link PROGRESS_ENVELOPE_VERSION}). */
  readonly v: number
  /** The stable ids of completed lessons. Order is not significant. */
  readonly completed: readonly string[]
}

/**
 * On-device store of primer progress. Synchronous (localStorage is sync — ample for a short primer) and,
 * like the history seam, every method degrades gracefully: a read failure returns `[]`, a write
 * failure is swallowed. Defining it as an interface keeps the platform bit injectable so tests pass a
 * fake / throwing fake without touching real `localStorage`.
 */
export interface LessonProgressStore {
  /** The completed lesson ids. Returns `[]` on any failure (missing/malformed/unavailable storage). */
  load(): string[]
  /** Persist the given completed lesson ids. Never throws — a failure is swallowed (console.warn). */
  save(completedIds: readonly string[]): void
}

/**
 * Parse a raw `localStorage` string into the completed-id list, tolerating every malformed case:
 * `null` (key absent), non-JSON, a non-object, a missing/non-array `completed`, or non-string entries.
 * Returns `[]` in all of those cases. Does NOT filter against the live lesson set — that is the
 * caller's job (the shell knows `FOUNDATIONS`) — but it does coerce to a clean `string[]`.
 */
export function parseProgress(raw: string | null): string[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const completed = (parsed as { completed?: unknown }).completed
  if (!Array.isArray(completed)) return []
  return completed.filter((id): id is string => typeof id === 'string')
}

/**
 * The `localStorage`-backed {@link LessonProgressStore}. The `Storage` is injectable (defaults to the
 * global `localStorage`, resolved LAZILY per-call so merely constructing the store in an environment
 * without `localStorage` never throws — the failure surfaces only on an actual read/write, where it is
 * already caught). Tests pass a fake / a throwing fake.
 */
export class LocalStorageLessonProgressStore implements LessonProgressStore {
  private readonly storage: Storage | undefined

  /** `storage` defaults to the global `localStorage` (resolved lazily in {@link getStorage}). */
  constructor(storage?: Storage) {
    this.storage = storage
  }

  /** Resolve the backing `Storage`, or `undefined` if none is available in this environment. */
  private getStorage(): Storage | undefined {
    return this.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  }

  load(): string[] {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return []
      return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY))
    } catch (err: unknown) {
      // Reads can throw (e.g. accessing localStorage is blocked in some privacy modes). Degrade to
      // "no progress" so the primer still works in-memory.
      console.warn('primer-progress: load failed', err)
      return []
    }
  }

  save(completedIds: readonly string[]): void {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return
      const envelope: ProgressEnvelope = {
        v: PROGRESS_ENVELOPE_VERSION,
        completed: [...completedIds],
      }
      storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(envelope))
    } catch (err: unknown) {
      // Writes can throw (quota, disabled storage, private mode). Never let a persistence failure
      // break the primer — log and carry on in-memory.
      console.warn('primer-progress: save failed', err)
    }
  }
}
