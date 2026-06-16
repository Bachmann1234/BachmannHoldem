---
id: 0083
title: Fix the large gap between "New table" and "View hand history" on the summary
type: bug
status: done
milestone: M4
priority: low
created: 2026-06-16
---

## Context

On the end-of-session summary there's a large empty gap between the **New table →** and **View
hand history** buttons. Cause: both buttons carry `.summary-cta { margin-top: auto }`. In the
`flex-direction: column` `.summary`, the _first_ `margin-top: auto` element (New table) absorbs all
the free space and is shoved to the bottom — so the standings sit at the top, "New table" jumps to
the bottom, and "View hand history" trails right under it. The intent was for the **pair** of CTAs
to sit together at the bottom, not for a gap to open between the standings and the first button.

## Acceptance criteria

- [ ] The two summary CTAs render as a tight pair (separated only by the normal stack gap), pushed
      to the bottom of the summary as a group — no large gap between them.
- [ ] No change to button labels, order, `data-testid`s, or click behaviour — purely visual.
- [ ] The single-button case (no `onShowHistory`) still pins its one CTA to the bottom correctly.
- [ ] `pnpm verify` green.

## Notes

`apps/pwa/src/components/Summary.tsx` renders the two `.summary-cta` buttons; the CSS is in
`apps/pwa/src/styles.css` (`.summary` flex column, `.summary-cta { margin-top: auto; width: 100% }`,
the parent `.summary` uses `gap: 18px`). Cleanest fix is to wrap the CTAs in a flex column group
and move the single `margin-top: auto` to that group (so only the group is pushed to the bottom and
the buttons keep a normal gap between them), rather than putting `margin-top: auto` on each button.
Keep it CSS-only / minimal-markup; don't disturb the standings layout above.
