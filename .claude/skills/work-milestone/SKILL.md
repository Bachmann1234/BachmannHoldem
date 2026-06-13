---
name: work-milestone
description: >-
  Project workflow for executing a whole milestone (M0–M7 or stretch) ticket by ticket the way M1
  and M2 were done: decompose the milestone's epic into per-feature tickets, then spawn a fresh
  subagent per ticket, verify its work and run a /code-review pass before committing each one, and
  finish at the milestone boundary with a review summary plus a /milestone-review audit. This is a
  heavyweight, code-committing orchestration that the USER starts explicitly by running
  /work-milestone (optionally with a milestone, e.g. /work-milestone M3). Do NOT auto-invoke it —
  if a milestone or epic looks ready to start, suggest that the user run /work-milestone and let
  them decide; wait for the explicit command.
---

# Work a Milestone

A milestone is a batch of related, dependent tickets behind one **epic** ticket. The job here is to
take that epic from `todo` to a pushed, reviewed branch — not by writing all the code in one head,
but by **orchestrating**: decompose the epic into pullable tickets, hand each to a fresh subagent,
and act as the integrator who verifies and commits. You are the senior engineer running the board;
the subagents are the pair of hands on each ticket.

Why orchestrate instead of doing it all inline: each ticket gets a clean context focused on one
unit of work (no drift, no contamination from the previous ticket's details), and you stay in the
integrator's seat — reviewing scope, purity, and correctness with fresh eyes the implementer
doesn't have. That division is what kept M1 and M2 clean.

**Default mode: supervised, one ticket at a time, you commit between them.** Stop at the milestone
boundary and let the user merge. (For a fully-unattended run, see [Modes](#modes) — the user opts
in by saying "use a workflow".)

The board (`tickets/`) is the source of truth; `docs/ROADMAP.md` is the narrative; the existing
pure packages (`packages/engine`, `packages/odds`, …) are the conventions template. Read, don't
assume.

## Step 1 — Anchor

Read enough to know what "done" means and what good looks like before touching anything:

- `docs/ROADMAP.md` — where this milestone sits and why; the locked decisions and principles.
- `README.md` — the architecture and the `pnpm verify` gate.
- `docs/LEARNING-APPROACH.md` — the pedagogy balance (matters most for bots/coach/drills work).
- `tickets/README.md` — the board conventions (frontmatter, ids, statuses, branch workflow).
- The **epic ticket** for this milestone (e.g. `tickets/0007-coaching-engine.md`) — your scope.
- The nearest **existing sibling package** as the style template (for a pure-TS package, read
  `packages/engine` and `packages/odds`: `package.json`/`tsconfig.json` shape, `.js` import
  specifiers, heavy doc comments, co-located `*.test.ts`, project references).

Confirm you're starting from a clean tree on `main` (`git status`). If the milestone is ambiguous
or its epic isn't on the board yet, ask the user before proceeding.

## Step 2 — Branch and decompose

Create the milestone branch off `main` (never commit to `main` directly):

```bash
git checkout -b feat/m<N>-<slug>     # e.g. feat/m3-coach
```

Break the epic into **per-feature tickets** — one ticket = one pullable, independently-committable
unit, in dependency order. Use `tickets/TEMPLATE.md`. Compute the next ids by scanning for the
current max and incrementing (zero-padded):

```bash
ls tickets/*.md      # find the current max id
```

Each new ticket gets: a tight Context, concrete Acceptance criteria (checkbox list), and Notes that
link dependencies with `[[id-slug]]` and call out the design decisions that matter. Aim for the
same granularity the epic implies — M1 and M2 each split into ~4 tickets. Then:

- Add a decomposition note + the new ticket links to the epic ticket, and flip the **epic** to
  `status: in-progress`.
- Commit the decomposition: `chore(M<N>): decompose <epic> into per-feature tickets`.

## Step 3 — Per ticket (sequential)

Tickets depend on each other, so do them in order. Track progress with a task list if it helps. For
each ticket:

### 3a — Spawn a fresh subagent for ONE ticket

Use a fresh `general-purpose` subagent per ticket (fresh context each time). The prompt is the
heart of this skill — give it everything it needs to match the house style and nothing it can use
to wander. Template:

```
You are implementing ONE ticket in <repo> (pure-TS packages). Repo root: <path>. You are on
branch feat/m<N>-<slug>. Do NOT touch git at all — the orchestrator handles all git.

## Read first (in order)
1. Your ticket: tickets/<id>-<slug>.md — your spec; satisfy its acceptance criteria.
2. The convention template — study and mirror EXACTLY (pure TS, .js import specifiers, heavy doc
   comments, co-located *.test.ts, package.json/tsconfig shape, project references):
   <list the specific existing files: the sibling package's package.json/tsconfig/index, and the
   exact engine/odds modules whose API this ticket consumes>
3. The build/config you must wire: root tsconfig.json references, pnpm-workspace.yaml, and
   vitest.config.ts coverage `include` (gate any new pure package like engine/odds).
4. docs/ROADMAP.md principles and docs/LEARNING-APPROACH.md.

## Build
<what to build, in this package, reusing these deps — do NOT reimplement engine/odds math.>

## Constraints
- ZERO UI/DOM/Node/network deps in pure packages. Match doc-comment density and idiom exactly.
- Export public API from src/index.ts. <plus any ticket-specific seam/interface requirements.>
- <If the ticket has a subtle correctness pitfall, NAME IT HERE explicitly — see the note below.>

## Verify before returning
Run `pnpm verify` from the repo root and iterate until FULLY GREEN. Coverage gate is in
vitest.config.ts (keep above the thresholds).

## Return (factual summary, no fluff)
Files created/modified (full paths); the exact exported API surface; key design decisions; how you
verified + the final `pnpm verify` result (paste the tail); anything punted to later tickets.
```

**Flag known pitfalls proactively.** If you can foresee a subtle trap (e.g. in M2, the odds helpers
define `pot` as the money _before_ the call, so a bot must map `DecisionContext.pot`/`toCall`
directly without double-counting), spell it out in the subagent prompt. Catching it up front is far
cheaper than catching it in review.

### 3b — Verify yourself before committing

The subagent self-reports green; trust but verify. The implementer can't see its own blind spots —
you can. Before committing, confirm:

```bash
git status                  # scope is ONLY the expected package + expected root files
pnpm verify                 # run it yourself — don't take "green" on faith
```

- **Scope** — only the intended package and expected root files (`tsconfig.json`,
  `vitest.config.ts`, `pnpm-lock.yaml`) changed; nothing leaked into other packages or the UI.
- **Purity** — for a pure package, no UI/DOM/Node/network imports crept in. Grep the new source for
  imports outside `@holdem/*`/relative/`vitest`, and for `process.`/`fetch(`/`window.`/`document.`/
  `node:`/`require(`. (Skip for UI milestones, which have their own tooling.)
- **Spot-check the core** — read the central file(s), not just the test summary. Does the public
  API match the ticket? Are the doc comments accurate (no drift between a comment and the value it
  describes)?

If something's off, send the subagent back (continue it with `SendMessage`) rather than patching it
yourself — keep the implementer responsible for its ticket. Tiny fixes (a stale comment, a
one-line doc correction) you can make directly.

### 3c — Code-review the ticket diff

Before committing, run the **`/code-review`** skill on the ticket's working-tree diff (it's still
uncommitted, so the review sees exactly this ticket's changes). A fresh adversarial read catches
correctness bugs and reuse/simplification opportunities that neither the implementer nor your
spot-check will — it's the cheapest place to catch them, before the code is baked into history and
the next ticket builds on it. Medium/high effort is a good default; dial it down for a trivial
ticket, up for a load-bearing one.

**Triage the findings — apply judgment, don't apply blindly.** Implement the ones that are clearly
right and in scope; for substantial logic changes send the subagent back (it owns the ticket), for
trivial ones fix directly. Skip findings that are wrong, out of scope, or noise, and say so. Then
re-run `pnpm verify` so the fixes are green too. (The review fixes fold into this ticket's commit.)

### 3d — Commit the ticket

Commit that ticket's changes (implementation + any review fixes), flip its `status: done`, and
check its acceptance boxes:

```bash
# commit message: feat(<pkg>): <summary> (ticket <id>)
# body explains the what/why; end with the Co-Authored-By trailer the harness requires.
```

Then move to the next ticket. (The repo's pre-commit hook runs lint/format on staged files; the
pre-push hook runs full `verify`.)

## Step 4 — Close the epic and finish

When the last ticket is `done`:

- Flip the **epic** ticket to `status: done` and check its acceptance criteria. Commit:
  `chore(M<N>): close <epic> epic (<id>)`.
- Run a final full `pnpm verify` on the branch.
- Push so CI (and the pre-push hook) run verify:

  ```bash
  git push -u origin feat/m<N>-<slug>
  ```

- **Stop at the milestone boundary.** Do **not** merge unless the user chose auto-merge or asks.
  Write a **review summary**: what landed per ticket, how each was verified (scope/purity/verify/
  code-review), and a short "what to eyeball" list (the load-bearing seam, any judgment-call tuning,
  anything punted). The point is to make the user's review fast and honest.
- **Run the `/milestone-review` skill.** The per-ticket `/code-review` passes kept each unit clean;
  this is the whole-repo capstone — it sweeps for code smells, doc drift, dependency/security
  issues, test gaps, and convention violations across the milestone, and files the findings you
  approve as tickets. The milestone boundary is exactly when `docs/ROADMAP.md` says to run it. It
  has its own report-and-approve flow, so let it drive that. Run it before merge so anything it
  surfaces is on the table when the user decides.

## Milestone-specific guidance

Each milestone has a "what matters most" that should shape the tickets and the subagent prompts.
Derive it from the epic ticket + ROADMAP + LEARNING-APPROACH rather than guessing. Examples from
past runs:

- **M1 (odds, 0005)** — correctness is everything; the exact-enumeration oracle is the reference the
  Monte-Carlo path is tested against.
- **M2 (bots, 0006)** — the `Opponent` interface is THE deliverable (a stable seam a GTO bot drops
  into later); bots decide via the equity engine + pot odds with a personality matrix; hold the
  "plausible over strong, and genuinely fun" balance.
- **M3 (coach, 0007)** — deterministic per-decision verdicts; still no AI; reuses the M1 math.

When you start a milestone, write its "what matters most" into the decomposition and thread it
through every subagent prompt.

### The M4 exception

**M4 (PWA app shell, `0008`) is different — don't fully auto-orchestrate it.** It's the first UI,
and the user wants a designer in the loop on the look and feel before implementation. Do the
anchoring and decomposition, but **stop before the design step and hand off to the user / a
designer** rather than spawning subagents to build screens. Also: the purity check doesn't apply to
the app, and the UI has its own tooling/coverage story. Confirm the design direction before any
implementation tickets.

## Modes

- **Supervised (default).** One ticket at a time, you verify and commit between them, you stop
  before merge. This is what M1 and M2 used and what most milestones should use — the per-ticket
  review gate is where problems get caught.
- **Fully unattended.** If the user says "use a workflow", drive the whole milestone with the
  `Workflow` tool instead: a pipeline that decomposes, then runs each ticket through
  implement → verify → commit stages. Faster and hands-off, but you lose the between-ticket human
  checkpoint, so only do this when the user explicitly opts in.

## Quick reference

| Phase      | Action                                                                             |
| ---------- | ---------------------------------------------------------------------------------- |
| Anchor     | ROADMAP, README, LEARNING-APPROACH, tickets/README, the epic, sibling pkg          |
| Branch     | `git checkout -b feat/m<N>-<slug>` off clean `main`                                |
| Decompose  | epic → per-feature tickets (TEMPLATE.md), epic → in-progress, commit               |
| Per ticket | fresh subagent → verify (scope/purity/verify/spot-check) → `/code-review` → commit |
| Close      | epic → done, final verify, push branch                                             |
| Boundary   | review summary; stop before merge; run `/milestone-review`                         |
