/* ============================================================
   Foundations primer — content + grading data.

   This is a FAITHFUL PORT of the real @holdem/curriculum package
   (packages/curriculum/src/foundations.ts) for the design mockup.
   Lesson copy, prompts, choices and correct answers are verbatim
   from that source; the graded-result wording follows grade.ts +
   @holdem/format (pct / signedChips / VERDICT_LABEL) with the
   ENCOURAGING tone wrapping the verdict (the locked M4 tone).

   The displayed equity / EV figures mirror the engine's real,
   tuned output (the spots were tuned until coachDecision returns
   the verdict the lesson teaches — see foundations.test.ts). In the
   shipped app these come live from @holdem/coach; here they are the
   fixed reference values, NOT invented. Price is exact arithmetic
   (toCall / (pot + toCall)); EV is eq·(pot+toCall) − toCall.
   ============================================================ */

/* ---- shared value formatters (mirror @holdem/format) ---- */
// pct: a 0..1 fraction as a one-decimal percent (0.625 -> "62.5%")
const pct = (f) => `${(f * 100).toFixed(1)}%`;
// signedChips: chip EV as a signed number, trimming a trailing .0 ("+4", "-29.5", "0")
const signedChips = (ev) => {
  const r = Math.round(ev * 10) / 10;
  if (r === 0) return '0';
  const mag = Math.abs(r).toFixed(1).replace(/\.0$/, '');
  return r < 0 ? `-${mag}` : `+${mag}`;
};

/* ---- tiny card parser: "As" -> {r:'A', s:0} ; suit index 0..3 = spade,heart,diamond,club ---- */
const SUIT_INDEX = { s: 0, h: 1, d: 2, c: 3 };
const SUIT_GLYPH = ['\u2660', '\u2665', '\u2666', '\u2663']; // ♠ ♥ ♦ ♣
const SUIT_NAME = ['spade', 'heart', 'diamond', 'club'];
function card(text) {
  const r = text[0].toUpperCase();
  return { r: r === 'T' ? '10' : r, s: SUIT_INDEX[text[1].toLowerCase()] };
}
const cards = (str) => str.split(/\s+/).filter(Boolean).map(card);

/* ============================================================
   The six lessons, in teaching order. concept tags + copy are
   verbatim from @holdem/curriculum/src/foundations.ts.
   ============================================================ */

const LESSONS = [
  /* 1. EQUITY — free check (the 'equity' concept) ---------------------------------- */
  {
    id: 'foundations-equity',
    n: 1,
    title: 'Equity',
    subtitle: 'your share of the pot',
    concept: 'equity',
    explanation:
      'Equity is your share of the pot right now — the fraction of the time your hand wins if every ' +
      'card came out with no more betting. A coin-flip is 50% equity; a monster is 90%+; total air is ' +
      'near 0%. It says nothing about price yet — just how good your hand is. When continuing is free, ' +
      'equity is the whole story: any equity beats folding, so you always take the free card.',
    spots: [
      {
        kind: 'coach',
        prompt:
          'You hold A\u2665K\u2665 on Q\u2665 7\u2665 2\u2663 — a flush draw plus two overcards. It checks to you and ' +
          'continuing is FREE (nothing to call). Check or fold?',
        hole: cards('Ah Kh'),
        board: cards('Qh 7h 2c'),
        pot: 100,
        toCall: 0,
        choices: [
          { label: 'Check', key: 'check' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 0,
        // free check: price/EV are not in play (the coach drawer shows "—")
        metrics: { equity: 0.59, price: null, ev: null },
        // tailored, faithful to the lesson's own line
        bodyRight: 'A free card with 59% equity — checking is automatic. Any equity beats folding.',
        bodyWrong: 'Folding a free card throws away 59% equity. With nothing to call, you always take the card.',
        bestLabel: 'Check',
      },
    ],
  },

  /* 2. POT ODDS — price too high (the 'pot-odds' concept) -------------------------- */
  {
    id: 'foundations-pot-odds',
    n: 2,
    title: 'Pot odds',
    subtitle: 'the price of a call',
    concept: 'pot-odds',
    explanation:
      'Pot odds turn the bet into a price: the equity a call needs just to break even. The rule is ' +
      'simple — divide what you must call by the total pot after you call. Call 75 into a pot that ' +
      'becomes 250 and your price is 75 / 250 \u2248 30%; call 75 when it becomes 175 and the price is ' +
      '75 / 175 \u2248 43%. The bigger the bet relative to the pot, the higher the price — and the more ' +
      'equity you need to continue.',
    spots: [
      {
        kind: 'coach',
        prompt:
          'You hold Q\u2660J\u2666 on A\u2663 K\u2666 5\u2665. Your opponent bets, bringing the pot to 100, and you must ' +
          'call 75 — a price of 75 / (100 + 75) \u2248 43% to break even. Your hand is only worth ~26%. Call or fold?',
        hole: cards('Qs Jd'),
        board: cards('Ac Kd 5h'),
        pot: 100,
        toCall: 75,
        choices: [
          { label: 'Call', key: 'call' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 1,
        metrics: { equity: 0.26, price: 75 / 175, ev: 0.26 * 175 - 75 },
        bestLabel: 'Fold',
      },
    ],
  },

  /* 3. EQUITY-VS-PRICE — the continue rule ----------------------------------------- */
  {
    id: 'foundations-equity-vs-price',
    n: 3,
    title: 'The continue rule',
    subtitle: 'equity vs price',
    concept: 'equity-vs-price',
    explanation:
      'Here is the one rule that drives every call-or-fold decision: continue when your equity beats ' +
      'the price, fold when it does not. Equity is how good your hand is; the price is the pot odds the ' +
      'bet sets. Worth 40% and the price is 30%? Continue — you have more than you are paying for. ' +
      'Worth 20% and the price is 33%? Fold. Everything else postflop is detail on top of this single ' +
      'comparison.',
    rule: 'continue when your equity beats the price',
    spots: [
      {
        kind: 'coach',
        prompt:
          'You hold A\u2660A\u2665 on A\u2663 K\u2666 7\u2665 — top set. Your opponent bets, bringing the pot to 100, and you must ' +
          'call just 10 — a price of only ~9%. Your hand is worth ~96%. Call or fold?',
        hole: cards('As Ah'),
        board: cards('Ac Kd 7h'),
        pot: 100,
        toCall: 10,
        choices: [
          { label: 'Call', key: 'call' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 0,
        metrics: { equity: 0.96, price: 10 / 110, ev: 0.96 * 110 - 10 },
        bestLabel: 'Call',
      },
    ],
  },

  /* 4. EV — the decision in chips (two spots: +EV and −EV) ------------------------- */
  {
    id: 'foundations-ev',
    n: 4,
    title: 'EV',
    subtitle: 'counting the decision in chips',
    concept: 'ev',
    explanation:
      'Expected value (EV) is the continue rule measured in chips instead of yes/no: the average ' +
      'chips a decision makes or loses if you faced it again and again. A call with more equity than ' +
      'the price has positive EV — it makes chips long-term, even on the hands it loses. A call with ' +
      'less equity than the price has negative EV — it bleeds chips, even on the hands it wins. You ' +
      'are not playing this one hand; you are playing the decision a thousand times. Take the +EV side.',
    spots: [
      {
        kind: 'coach',
        prompt:
          'You hold A\u2660A\u2665 on A\u2663 K\u2666 7\u2665 — top set. Your opponent bets, bringing the pot to 100, and you must ' +
          'call 50. Over the long run, does calling MAKE or LOSE chips? Call or fold?',
        hole: cards('As Ah'),
        board: cards('Ac Kd 7h'),
        pot: 100,
        toCall: 50,
        choices: [
          { label: 'Call', key: 'call' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 0,
        metrics: { equity: 0.96, price: 50 / 150, ev: 0.96 * 150 - 50 },
        bestLabel: 'Call',
      },
      {
        kind: 'coach',
        prompt:
          'You hold 2\u2663 3\u2666 on A\u2660 K\u2666 Q\u2665 — total air. There is 50 in the pot and your opponent overbets to ' +
          '150 total, so you must call 100 to chase a hand you almost never win. Call or fold?',
        hole: cards('2c 3d'),
        board: cards('As Kd Qh'),
        pot: 150,
        toCall: 100,
        choices: [
          { label: 'Call', key: 'call' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 1,
        metrics: { equity: 0.04, price: 100 / 250, ev: 0.04 * 250 - 100 },
        bestLabel: 'Fold',
      },
    ],
  },

  /* 5. POSITION — same hand, button vs UTG (chart-graded preflop) ------------------ */
  {
    id: 'foundations-position',
    n: 5,
    title: 'Position',
    subtitle: 'acting later is an edge',
    concept: 'position',
    explanation:
      'Position is your seat relative to the action. Acting LAST after the flop is a real edge: you ' +
      'see what everyone does before you decide, so you bluff more, value-bet more, and control the ' +
      'pot size. The button acts last every street — the best seat at the table. The practical upshot: ' +
      'you can profitably play MORE hands in late position than in early position. The same borderline ' +
      'hand that is an open on the button is a fold under the gun.',
    spots: [
      {
        kind: 'preflop',
        prompt:
          "It folds to you on the BUTTON (you act last after the flop) with K\u2663J\u2666. It's a marginal hand. Open or fold?",
        hole: cards('Kc Jd'),
        seat: 1,
        buttonIndex: 1,
        numPlayers: 6,
        posLabel: 'Button',
        posSub: 'you act last',
        choices: [
          { label: 'Open (raise)', key: 'raise' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 0,
        rationale: 'Marginal hand — open only in late position; fold to pressure.',
        bestLabel: 'Open',
      },
      {
        kind: 'preflop',
        prompt:
          'Same hand, K\u2663J\u2666, but now you are UNDER THE GUN (first to act, with five players still behind you). Open or fold?',
        hole: cards('Kc Jd'),
        seat: 0,
        buttonIndex: 5,
        numPlayers: 6,
        posLabel: 'Under the gun',
        posSub: 'first to act',
        choices: [
          { label: 'Open (raise)', key: 'raise' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 1,
        rationale: 'Marginal hand — open only in late position; fold to pressure.',
        bestLabel: 'Fold',
      },
    ],
  },

  /* 6. RANGES — premium vs trash tiers (chart-graded preflop) ---------------------- */
  {
    id: 'foundations-ranges',
    n: 6,
    title: 'Ranges',
    subtitle: 'think in strength tiers',
    concept: 'ranges',
    explanation:
      "You never know an opponent's exact two cards — you reason about their RANGE, the whole set of " +
      'hands they could have. The same lens applies to your own starting hands: sort them into ' +
      'strength tiers. Premium hands (AA, KK, AK) you always play; strong and playable hands you open ' +
      'in most spots; trash (like 7-2 offsuit) you fold every time. A starting-hand chart is just ' +
      'those tiers written down. Play tiers, not feelings.',
    spots: [
      {
        kind: 'preflop',
        prompt: 'You are dealt A\u2660A\u2665 — the best starting hand (the premium tier). Open or fold?',
        hole: cards('As Ah'),
        seat: 1,
        buttonIndex: 1,
        numPlayers: 6,
        posLabel: 'Premium tier',
        posSub: 'the top of the chart',
        choices: [
          { label: 'Open (raise)', key: 'raise' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 0,
        rationale: 'Premium holding — always raise; you want chips in.',
        bestLabel: 'Open',
      },
      {
        kind: 'preflop',
        prompt: 'You are dealt 7\u2663 2\u2666 — the worst starting hand (the trash tier). Open or fold?',
        hole: cards('7c 2d'),
        seat: 0,
        buttonIndex: 5,
        numPlayers: 6,
        posLabel: 'Trash tier',
        posSub: 'the bottom of the chart',
        choices: [
          { label: 'Open (raise)', key: 'raise' },
          { label: 'Fold', key: 'fold' },
        ],
        correctIndex: 1,
        rationale: 'Trash — fold; it makes no money over time.',
        bestLabel: 'Fold',
      },
    ],
  },
];

// propagate each lesson's concept tag onto its spots (the verdict carries it)
LESSONS.forEach((l) => l.spots.forEach((s) => (s.concept = l.concept)));

/* ============================================================
   Grading — mirrors @holdem/curriculum/src/grade.ts.
   Returns the verdict the coach would rule on the player's OWN
   pick, plus the encouraging-tone copy that wraps it.
   ============================================================ */

// encouraging headlines (the locked M4 'encouraging' tone), keyed by correctness
const HEAD_RIGHT = "Nice — that's exactly right.";
const HEAD_WRONG = 'Close one — not quite.';

function gradeSpot(spot, chosenIndex) {
  const correct = chosenIndex === spot.correctIndex;
  const chosen = spot.choices[chosenIndex];
  const result = {
    correct,
    chosenIndex,
    correctIndex: spot.correctIndex,
    bestLabel: spot.bestLabel,
    kind: correct ? 'good' : 'leak',
    headline: correct ? HEAD_RIGHT : HEAD_WRONG,
    concept: spot.concept,
    spotKind: spot.kind,
  };

  if (spot.kind === 'coach') {
    const m = spot.metrics;
    result.metrics = m;
    // the deterministic numbers line (same shape as explainCoach), softened by tone
    if (m.price == null) {
      // free check: no price / EV in play
      result.body = correct ? spot.bodyRight : spot.bodyWrong;
      result.numbersLine = `Equity ${pct(m.equity)} · continuing is free.`;
    } else {
      const numbers = `Equity ${pct(m.equity)} vs pot-odds price ${pct(m.price)}; calling is worth ${signedChips(
        m.ev,
      )} chips.`;
      result.numbersLine = numbers;
      result.body = correct
        ? numbers
        : `The math points to ${spot.bestLabel}. ${numbers}`;
    }
  } else {
    // preflop: chart rationale, no equity/EV cards (coach drawer's preflop mode)
    result.body = correct
      ? spot.rationale
      : `The math points to ${spot.bestLabel}. ${spot.rationale}`;
  }
  return result;
}

window.PrimerCurriculum = {
  LESSONS,
  gradeSpot,
  pct,
  signedChips,
  SUIT_GLYPH,
  SUIT_NAME,
};
