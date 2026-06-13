# Tickets

A lightweight, file-based ticket board we pull work from. No external tool — just markdown
files in git. **The ticket files are the source of truth** (their frontmatter), so there's
nothing to keep in sync.

## How to pull work

1. The **backlog** is every ticket with `status: todo`, ordered by `priority` then `id`.
2. To start one, set its `status: in-progress`. Keep work-in-progress small (1–2 at a time).
3. When it meets its acceptance criteria, set `status: done`.
4. Found a defect? File it under [`bugs/`](bugs/) using the bug template.

List the board from the shell:

```bash
grep -l '^status: todo$'        tickets/*.md         # what's pullable
grep -l '^status: in-progress$' tickets/*.md         # what's active
grep -l '^status: open$'        tickets/bugs/*.md    # open bugs
```

(The `^...$` anchors match only the frontmatter line, so the template/readme — which mention
these strings in prose — are correctly excluded.)

## Conventions

- **Filename:** `NNNN-short-slug.md` (zero-padded sequential id), e.g. `0002-hand-evaluator.md`.
  Bugs use `BUG-NNNN-slug.md`.
- **One ticket = one unit of pullable work.** Larger milestones are tracked as _epic_ tickets
  that get broken into smaller tickets when pulled.
- Copy [`TEMPLATE.md`](TEMPLATE.md) (or [`bugs/TEMPLATE.md`](bugs/TEMPLATE.md)) to start one.

### Frontmatter fields

| field       | values                                                      |
| ----------- | ----------------------------------------------------------- |
| `id`        | `0001`, `0002`, … (or `BUG-0001` for bugs)                  |
| `title`     | short imperative summary                                    |
| `type`      | `feature` · `task` · `chore` · `epic` · `bug`               |
| `status`    | `todo` · `in-progress` · `blocked` · `review` · `done`      |
| `milestone` | `M0`–`M7` (or a half-step like `M3.5`), `stretch`, or blank |
| `priority`  | `high` · `medium` · `low`                                   |
| `created`   | `YYYY-MM-DD`                                                |

The milestone overview / narrative lives in [`../docs/ROADMAP.md`](../docs/ROADMAP.md); the
executable units live here.
