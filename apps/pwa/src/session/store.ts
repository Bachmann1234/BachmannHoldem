/**
 * The live-session store contract + its `localStorage` implementation (mid-game save/resume).
 *
 * This is the on-device durability seam for the **play-vs-bots game in progress** — distinct from the
 * hand-history seam ({@link ../history/store.HandHistoryStore}, which logs *completed* hands) and the
 * lesson-progress seam ({@link ../learn/progressStore.LessonProgressStore}, which tracks Learn). When
 * the hero closes or reloads the tab mid-game, this is what lets the next launch drop them back into
 * the exact hand they left. It mirrors those seams: a tiny typed interface, an injectable
 * platform-backed default impl, and the same wrapped-call graceful-degradation idiom — a storage
 * failure (private mode, quota, disabled/malformed storage) is swallowed with a `console.warn` and
 * play simply continues without a save, never throwing to the caller.
 *
 * **What is persisted: the whole MVU {@link Model} plus the in-flight hero-decision buffer.** The model
 * is the single source of truth (phase, players, the live hand, stacks, the coach grade) and is plain
 * JSON — it round-trips losslessly. The decision buffer ({@link HeroDecision}[]) is the only live state
 * that lives *outside* the model (in a shell ref, for hand-history recording), so it rides along here
 * to keep a resumed hand's history record faithful. The shell's per-session id (schema v3) rides along
 * for the same reason — it lives outside the model, and a resumed sitting must keep its grouping id.
 * The shell decides whether a loaded snapshot is actually *resumable* (only the live phases) — this
 * store just round-trips whatever it was handed.
 *
 * The on-disk envelope is a small versioned JSON object: `{ v: 1, model, decisions, sessionId? }` under
 * the versioned key `holdem-session-v1`. Missing / malformed JSON / a wrong shape / a stale version all
 * degrade to `null` (no saved game) rather than throwing; a missing `sessionId` (pre-v3 save) degrades
 * to undefined and the shell mints a fresh id.
 */

import type { Model } from '@holdem/session'
import type { HeroDecision } from '../history/index.js'

/** The versioned `localStorage` key the envelope lives under. */
export const SESSION_STORAGE_KEY = 'holdem-session-v1'

/** The envelope schema version; bump alongside the key when the persisted shape changes. */
export const SESSION_ENVELOPE_VERSION = 1

/**
 * Everything needed to resume a game exactly where it was left: the immutable {@link Model} and the
 * hero's voluntary decisions so far this hand (the shell's per-hand history buffer, which is not part
 * of the model). The shell snapshots both together and restores both on resume.
 */
export interface LiveSessionSnapshot {
  /** The full MVU model — phase, players, live hand, stacks, coach grade. */
  readonly model: Model
  /** The hero's voluntary decisions for the in-progress hand (for a faithful history record). */
  readonly decisions: readonly HeroDecision[]
  /**
   * The current session id (schema v3) — like {@link decisions}, shell state that lives *outside* the
   * model (a per-session ref), persisted here so a resumed sitting keeps the same id and its hands stay
   * grouped. Optional: a pre-v3 saved game lacks it, and the shell mints a fresh id on resume in that
   * case.
   */
  readonly sessionId?: string
}

/** The persisted shape: a version tag plus the snapshot. Readers tolerate any malformed variant. */
interface SessionEnvelope {
  /** Envelope version ({@link SESSION_ENVELOPE_VERSION}). */
  readonly v: number
  /** The model at save time. */
  readonly model: Model
  /** The hero-decision buffer at save time. */
  readonly decisions: readonly HeroDecision[]
  /** The session id at save time (schema v3); absent in pre-v3 saves. */
  readonly sessionId?: string
}

/**
 * On-device store of the in-progress game. Synchronous (localStorage is sync — a single small model is
 * trivial) and, like the sibling seams, every method degrades gracefully: a read failure / missing /
 * malformed blob returns `null`, a write or clear failure is swallowed. An interface so tests inject a
 * fake without touching real `localStorage`.
 */
export interface LiveSessionStore {
  /** The saved snapshot, or `null` when there is none (absent/malformed/unavailable storage). */
  load(): LiveSessionSnapshot | null
  /** Persist a snapshot of the live game. Never throws — a failure is swallowed (console.warn). */
  save(snapshot: LiveSessionSnapshot): void
  /** Drop any saved game (the hero quit, or the session ended). Never throws. */
  clear(): void
}

/**
 * Parse a raw `localStorage` string into a {@link LiveSessionSnapshot}, tolerating every malformed
 * case: `null` (key absent), non-JSON, a non-object, a wrong/missing version, or a missing model.
 * Returns `null` in all of those cases. Validation is intentionally shallow — the store only ever
 * reads back its own writes — but it guards the shape enough that a stale or corrupt blob can never
 * crash the resume path; the worst case is "no saved game".
 */
export function parseSnapshot(raw: string | null): LiveSessionSnapshot | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const env = parsed as Partial<SessionEnvelope>
  if (env.v !== SESSION_ENVELOPE_VERSION) return null
  const model = env.model
  // A well-formed model always carries a string `phase`; treat anything else as "no saved game".
  if (typeof model !== 'object' || model === null || typeof model.phase !== 'string') return null
  // Backfill the retained graded decisions ([[0108]]): a save predating that field rehydrates without
  // it, and the game-over recap (`synthesizeSession`) reads `model.gradedDecisions` directly, so an
  // absent array would crash the end-of-session screen. Mirror the `decisions` backfill below.
  const withGraded = model as { gradedDecisions?: unknown }
  if (!Array.isArray(withGraded.gradedDecisions)) withGraded.gradedDecisions = []
  const decisions = Array.isArray(env.decisions) ? env.decisions : []
  // sessionId is best-effort: only a string survives; anything else (absent in pre-v3 saves) drops to
  // undefined and the shell mints a fresh id on resume.
  const sessionId = typeof env.sessionId === 'string' ? env.sessionId : undefined
  return sessionId !== undefined ? { model, decisions, sessionId } : { model, decisions }
}

/**
 * The `localStorage`-backed {@link LiveSessionStore}. The `Storage` is injectable (defaults to the
 * global `localStorage`, resolved LAZILY per-call so merely constructing the store where there is no
 * `localStorage` never throws — the failure surfaces only on an actual read/write, where it is already
 * caught). Tests pass a fake / throwing fake (or use {@link InMemoryLiveSessionStore}).
 */
export class LocalStorageLiveSessionStore implements LiveSessionStore {
  private readonly storage: Storage | undefined

  /** `storage` defaults to the global `localStorage` (resolved lazily in {@link getStorage}). */
  constructor(storage?: Storage) {
    this.storage = storage
  }

  /** Resolve the backing `Storage`, or `undefined` if none is available in this environment. */
  private getStorage(): Storage | undefined {
    return this.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  }

  load(): LiveSessionSnapshot | null {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return null
      return parseSnapshot(storage.getItem(SESSION_STORAGE_KEY))
    } catch (err: unknown) {
      // Reads can throw (e.g. localStorage blocked in some privacy modes). Degrade to "no saved game".
      console.warn('live-session: load failed', err)
      return null
    }
  }

  save(snapshot: LiveSessionSnapshot): void {
    try {
      const storage = this.getStorage()
      if (storage === undefined) return
      const envelope: SessionEnvelope = {
        v: SESSION_ENVELOPE_VERSION,
        model: snapshot.model,
        decisions: [...snapshot.decisions],
        ...(snapshot.sessionId !== undefined ? { sessionId: snapshot.sessionId } : {}),
      }
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(envelope))
    } catch (err: unknown) {
      // Writes can throw (quota, disabled storage, private mode). Never let a persistence failure
      // break play — log and carry on; the game just won't resume after a reload.
      console.warn('live-session: save failed', err)
    }
  }

  clear(): void {
    try {
      this.getStorage()?.removeItem(SESSION_STORAGE_KEY)
    } catch (err: unknown) {
      console.warn('live-session: clear failed', err)
    }
  }
}

/**
 * An in-memory {@link LiveSessionStore} that round-trips a snapshot without touching `localStorage`.
 * For tests (the jsdom `localStorage` is shared across a file's tests, so the default store would
 * leak a saved game between them) and any non-persistent embedding.
 */
export class InMemoryLiveSessionStore implements LiveSessionStore {
  private snapshot: LiveSessionSnapshot | null

  /** Optionally seed a snapshot (a test simulating "the hero reopened mid-game"). */
  constructor(snapshot: LiveSessionSnapshot | null = null) {
    this.snapshot = snapshot
  }

  load(): LiveSessionSnapshot | null {
    return this.snapshot
  }

  save(snapshot: LiveSessionSnapshot): void {
    this.snapshot = snapshot
  }

  clear(): void {
    this.snapshot = null
  }
}
