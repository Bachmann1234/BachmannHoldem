---
name: milestone-review
description: >-
  Whole-repo health audit run at the completion of a project milestone. Sweeps for code smells
  and design drift, documentation drift (README/ROADMAP/tickets vs. reality), dependency issues
  (outdated + known vulnerabilities), security problems, test gaps, and violations of the
  project's architectural conventions — then delivers a prioritized report and files the findings
  you approve as tickets on the board. Use this whenever a milestone (M0–M7) wraps up, when the
  last ticket in a milestone flips to done, or whenever the user asks to "review the repo",
  "audit the codebase", "check for issues/tech debt", run a "milestone review", or invokes
  /milestone-review — even if they don't name a specific milestone.
---

# Milestone Review

A milestone boundary is the right moment to step back from feature work and look at the repo as a
whole: what got messy while we were moving fast, what documentation quietly went stale, what
dependencies drifted, what we'd regret leaving in place before building the next layer on top.

The deliverable is a **prioritized findings report**, reviewed with the user, after which the
**approved findings are filed as tickets** on the board (`tickets/`, `tickets/bugs/`). The
report persuades; the tickets make the work pullable. Nothing is auto-filed without sign-off —
the board stays signal, not noise.

This project's guiding principles (from `README.md` / `docs/ROADMAP.md`) are the rubric to judge
against: the poker brain is the asset and the UI is a swappable shell; the non-UI packages
(`engine`, `odds`, `bots`, `coach`) stay pure TS with no UI/network deps; correctness is
deterministic math we own, and any LLM layer only narrates it; the hard, correctness-critical
work is tested before any pixels exist. Findings that show drift from these principles matter
more than generic nits.

## Step 1 — Establish what just shipped

Read `docs/ROADMAP.md` and scan the tickets to anchor the review:

```bash
grep -l '^status: done$' tickets/*.md          # what's complete
grep -l '^status: in-progress$' tickets/*.md   # what's mid-flight
```

Identify the milestone that just completed (its tickets are `done`). Weight the review toward the
packages that milestone touched, but still do a whole-repo pass — drift often shows up in the
seams between old and new code. If the milestone is ambiguous, ask the user which one to review.

## Step 2 — Run the automated checks first

Cheap, objective signal before any human-judgment review. Capture the output; anything not green
is itself a finding.

```bash
pnpm verify                 # format + lint + typecheck + tests — the baseline gate
pnpm outdated               # dependency drift
pnpm audit                  # known vulnerabilities
pnpm -r exec vitest run --coverage 2>/dev/null || true   # coverage, if configured
```

Note anything surprising: lint suppressions, skipped tests, `any` escapes, `eslint-disable` /
`@ts-expect-error` comments, TODO/FIXME markers.

```bash
grep -rn -E 'TODO|FIXME|HACK|XXX|eslint-disable|ts-expect-error|ts-ignore' packages apps 2>/dev/null
```

## Step 3 — Review across dimensions

For a small repo, review inline. As the repo grows, prefer **fanning out one subagent per
dimension in parallel** (the `Explore` agent is good for read-only sweeps) and synthesizing their
findings — it's faster and each agent stays focused. Cover all of:

- **Code smells & design drift** — duplication, leaky abstractions, functions doing too much,
  encoding/representation details escaping their module, missing error handling, primitive
  obsession. Most important: **layering violations** — a pure package importing UI/DOM/Node-only
  APIs, the engine depending on odds/bots, correctness logic leaking into a place the LLM could
  influence it.
- **Documentation drift** — does `README.md` describe the actual structure? Does `docs/ROADMAP.md`
  match reality (milestone table, "done when" claims)? Are ticket statuses honest — anything
  marked `done` whose acceptance criteria aren't actually met, or `todo` work that's secretly
  finished? Do code comments still describe what the code does?
- **Dependency health** — outdated majors, unused deps, duplicated/competing libraries, anything
  abandoned. Cross-reference `pnpm outdated` / `pnpm audit` from Step 2.
- **Security** — secrets or API keys committed (there should be none — the only future
  server-side code is the M7 key-proxy), unsafe input handling, anything that would bite once
  there's a network boundary. Flag risks early even if the surface doesn't exist yet.
- **Tests** — coverage gaps on correctness-critical paths (evaluator, state machine, equity math
  are the load-bearing ones), missing edge cases (side pots, wheel straights, all-ins, ties),
  tests asserting implementation details instead of behavior, flakiness.
- **Convention adherence** — naming, the ticket conventions in `tickets/README.md`, commit
  hygiene, the branch workflow, anything that contradicts a "decision locked" in the roadmap.

## Step 4 — Synthesize the report

Present findings in the chat using this structure, ordered by severity (high → low). Be concrete:
every finding needs a location (`path:line`) and a specific recommendation, not a vague worry.

```markdown
# Milestone Review — <Mn>: <theme> (<YYYY-MM-DD>)

## Verdict

One paragraph: overall health, and whether it's safe to build the next milestone on top.
Counts by severity (e.g. 2 high, 3 medium, 4 low).

## Automated checks

- verify: <pass/fail + notable output>
- outdated: <summary>
- audit: <summary>
- coverage: <summary if available>

## Findings

### [HIGH] <short title> · <category> · `path:line`

What it is, why it matters here, and the recommended fix. Note suggested ticket type
(feature / task / chore / bug) and priority.

### [MEDIUM] ...

### [LOW] ...
```

Keep severity honest: **high** = blocks or endangers the next milestone / a real security or
correctness risk; **medium** = should fix soon, real cost if ignored; **low** = polish, nits,
nice-to-haves. A clean review with few findings is a perfectly good result — don't pad it.

## Step 5 — File the approved findings

Ask the user which findings to file (e.g. "file all high+medium", or a specific list). Only file
what they approve. For each, create a ticket following `tickets/README.md` conventions:

- **Defects** → `tickets/bugs/BUG-NNNN-slug.md` from `tickets/bugs/TEMPLATE.md`.
- **Everything else** → `tickets/NNNN-slug.md` from `tickets/TEMPLATE.md` (`type: chore` fits
  most cleanup; use `feature`/`task` when appropriate).

Compute the next id by scanning existing files for the current max and incrementing
(zero-padded, e.g. `0013`; bugs `BUG-0001`). Stamp `created` with today's date:

```bash
date +%Y-%m-%d
```

Fill the frontmatter (`status: todo` / `open`, sensible `priority`/`severity`, `milestone` set to
the one just reviewed), write a tight Context + Acceptance criteria, and link related tickets with
`[[id-slug]]`. After filing, give the user the list of created ticket ids and a one-line summary
of what was filed vs. deferred.

This must run on a branch (direct commits to `main` are blocked) — if findings get filed, that's a
normal change set: `git switch -c chore/<Mn>-review` before committing.
