# Why the app is built this way — the learning approach

This is the **pedagogy rationale** behind Bachmann Hold'em: why the design front-loads a
deterministic math coach and treats the UI/bots as a swappable shell. The [ROADMAP](ROADMAP.md)
covers _what_ we build and in _what order_; this covers _why that order is the right way to
actually get better at poker_.

The claims below were checked against a 2026-06-13 deep-research pass (24 sources, 25 claims
adversarially verified). Treat this as a living document — update it if we learn more.

## The core thesis: coach the decision, not the result

Poker is a **"wicked" learning environment** — short-term results are dominated by variance, so
learning from outcomes actively misleads you (you can play a hand correctly and lose, or badly and
win). Result variance swamps the skill signal over any small sample.

By scoring **decisions** against equity / pot odds / EV rather than results, the app converts poker
into a **"kind" learning environment**: immediate, accurate, decision-quality feedback that
decouples "did I play well?" from "did I win?". This is the single strongest justification for the
whole deterministic-coaching design, and it's why the coach — not the UI or the opponents — is the
asset.

- Hogarth et al., _kind vs. wicked learning environments_ — feedback must be immediate/accurate and
  the learning setting must match the inference setting:
  <https://journals.sagepub.com/doi/abs/10.1177/0963721415591878>
- Palomäki et al., poker skill vs. variance (result SD ~20× over ~1,471 hands):
  <https://www.journalofexpertise.org/articles/volume3_issue2/JoE_3_2_Palomaki_etal.pdf>
- DeDonno (2008) — explicitly teaching strategy/probability measurably improved play.

## What the evidence supports

- **Explicit instruction (M4.5 — Foundations primer).** DeDonno (2008), cited above, found that
  explicitly teaching strategy/probability _measurably improved play_. The coach scores decisions
  but assumes the player already holds the framework (equity, pot odds, EV, position, ranges) — so a
  short primer that teaches those models, by retrieval check rather than prose, is the
  declarative-knowledge layer the feedback loop rests on. It precedes the drills (a skill you have
  no concept for can't be usefully drilled). See
  [../tickets/0042-foundations-primer.md](../tickets/0042-foundations-primer.md).
- **Drills & quizzes (M5).** Interleaved/randomized practice and retrieval practice (being _tested_,
  not re-reading) both produce more durable learning and transfer. So: **randomize spot types**
  within a drill set, and lean on the quiz/test format as a learning mechanism, not just assessment.
  Caveat: "drills beat playing volume" is _overstated_ — drills **complement** volume, they don't
  replace it.
- **Leak detection (M6).** Reviewing your own tracked hand history is high-value. **Required guard:**
  HUD stats (VPIP/PFR/aggression) are only reliable at large samples — gate any "you have a leak"
  claim behind a minimum sample size, or it's noise.
- **Math-first, defer GTO/solvers.** Reinforced: several "solvers/GTO are good for beginners" claims
  were _refuted_. Beginners should learn GTO **principles**, not solver outputs — which is exactly
  why the GTO solver ([../tickets/0012-gto-solver.md](../tickets/0012-gto-solver.md)) is a deferred
  stretch goal, not a starting point.

## The one weak pillar: bots as a _learning_ spine

"Play vs. bots" is the **least evidence-backed** learning mechanism here. By the match principle,
practicing against weak/exploitable heuristic bots is an environment mismatch with real (tougher,
human) games — it can fail to transfer, or teach exploit-y habits that lose to real players.

The fix is **framing, not a rebuild**, and the architecture already supports it:

- Treat bots as a **decision-point generator for the coach**, not as the thing you're trying to beat.
- Don't measure improvement as win-rate-vs-bots; measure it via the coach's decision-quality scores.
- Make M2 bots _plausible_ rather than _strong_, so they don't reward degenerate exploits.

### …but playing the bots is also just _fun_, and that's a real goal

Important counterweight: a poker app you actually enjoy playing is a **goal in itself**, not only a
vehicle for generating coachable decisions. The point above is about not using bots as the _measure
of learning_ — it is **not** a reason to strip the play experience down to "just a drill."
Enjoyment and engagement are part of the product's value, and the play-vs-bots loop stays a
first-class feature.

## Honest caveat

Deliberate practice explains only a modest share of skill variance (Hambrick 2020, ~14% — the exact
figure is contested). The app is a strong **multiplier**, not a sufficient condition: volume, review,
and range work all still matter.
