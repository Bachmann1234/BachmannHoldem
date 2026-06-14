/* Bachmann Hold'em — interactive multi-way table prototype (2–6 handed) */
const { useState, useEffect, useRef } = React
const E = window.PokerEngine

const SB = 5,
  BB = 10,
  START = 1000
const SUIT_NAMES = ['spade', 'heart', 'diamond', 'club']
const BOT_NAMES = ['Mira', 'Chip', 'Nadia', 'Rounder', 'Gus']
const fmt = (n) => Math.round(n).toLocaleString()

/* seat coordinates (% of felt). index 0 = hero (bottom center) */
const SEAT_LAYOUTS = {
  2: [
    [50, 80],
    [50, 17],
  ],
  3: [
    [50, 81],
    [17, 27],
    [83, 27],
  ],
  4: [
    [50, 81],
    [12, 44],
    [50, 16],
    [88, 44],
  ],
  5: [
    [50, 82],
    [13, 54],
    [27, 19],
    [73, 19],
    [87, 54],
  ],
  6: [
    [50, 83],
    [11, 57],
    [19, 24],
    [50, 15],
    [81, 24],
    [89, 57],
  ],
}
const CENTER = [50, 45]
const lerp = (a, b, t) => a + (b - a) * t

/* ---------------- card view ---------------- */
function Pips({ s }) {
  return <span className="s">{s}</span>
}
function CardView({ card, hidden, size = 'md', style = 'classic', winning, muck }) {
  if (hidden || !card) {
    return (
      <div className={`card back ${size}${muck ? ' muck' : ''}`}>
        <div className="back-mark">♣</div>
      </div>
    )
  }
  const suitClass = 'suit-' + SUIT_NAMES[card.s]
  const r = E.RANK_CHAR[card.r]
  const s = E.SUIT_CHAR[card.s]
  const cls = `card ${suitClass} ${size} cs-${style}${winning ? ' winning' : ''}${muck ? ' muck' : ''}`
  if (style === 'minimal') {
    return (
      <div className={cls}>
        <div className="mini">
          <span className="r">{r}</span>
          <span className="s">{s}</span>
        </div>
      </div>
    )
  }
  if (style === 'modern') {
    return (
      <div className={cls}>
        <div className="m-rank">{r}</div>
        <div className="m-suit">{s}</div>
        <div className="m-pip">{s}</div>
      </div>
    )
  }
  // classic
  return (
    <div className={cls}>
      <div className="corner tl">
        <span className="r">{r}</span>
        <span className="s">{s}</span>
      </div>
      <div className="pip">{s}</div>
      <div className="corner br">
        <span className="r">{r}</span>
        <span className="s">{s}</span>
      </div>
    </div>
  )
}

/* ---------------- poker logic ---------------- */
const clone = (h) => JSON.parse(JSON.stringify(h))
const activeIdx = (pl) => pl.map((p, i) => (!p.folded ? i : -1)).filter((i) => i >= 0)
const canActCount = (pl) => pl.filter((p) => !p.folded && !p.allIn).length

function nextActor(pl, n, from) {
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (!pl[i].folded && !pl[i].allIn) return i
  }
  return -1
}

function newHand(bank, button, count, id) {
  const n = count
  const deck = E.shuffle(E.makeDeck())
  const players = []
  for (let i = 0; i < n; i++) {
    players.push({
      name: i === 0 ? 'You' : BOT_NAMES[i - 1],
      isHero: i === 0,
      stack: bank[i],
      hole: [deck.pop(), deck.pop()],
      bet: 0,
      tc: 0,
      folded: false,
      allIn: false,
      acted: false,
    })
  }
  const sbIdx = n === 2 ? button : (button + 1) % n
  const bbIdx = n === 2 ? (button + 1) % n : (button + 2) % n
  const post = (i, amt) => {
    const a = Math.min(amt, players[i].stack)
    players[i].stack -= a
    players[i].bet += a
    players[i].tc += a
    if (players[i].stack === 0) players[i].allIn = true
  }
  post(sbIdx, SB)
  post(bbIdx, BB)
  const h = {
    id,
    deck,
    players,
    board: [],
    button,
    sbIdx,
    bbIdx,
    count: n,
    street: 'preflop',
    phase: 'betting',
    currentBet: BB,
    minRaise: BB,
    lastAggressor: bbIdx,
    toAct: -1,
    winner: null,
    results: null,
    lastAction: {},
  }
  h.toAct = nextActor(players, n, n === 2 ? button - 1 + n : bbIdx) // preflop: SB(n=2) or UTG
  // for n==2, first actor is button(SB): nextActor from (button-1) => button
  if (n === 2) h.toAct = button
  return h
}

function applyAction(hand, action, amountTo) {
  const h = clone(hand)
  const n = h.count
  const i = h.toAct
  const p = h.players[i]
  h.lastAction = { ...h.lastAction, [i]: { action, amountTo } }

  if (action === 'fold') {
    p.folded = true
  } else if (action === 'check') {
    p.acted = true
  } else if (action === 'call') {
    const need = Math.min(h.currentBet - p.bet, p.stack)
    p.stack -= need
    p.bet += need
    p.tc += need
    p.acted = true
    if (p.stack === 0) p.allIn = true
  } else {
    // bet / raise
    const put = Math.min(amountTo - p.bet, p.stack)
    p.stack -= put
    p.bet += put
    p.tc += put
    if (p.stack === 0) p.allIn = true
    if (p.bet > h.currentBet) {
      const raiseSize = p.bet - h.currentBet
      h.minRaise = Math.max(raiseSize, BB)
      h.currentBet = p.bet
      h.lastAggressor = i
      h.players.forEach((q, qi) => {
        if (qi !== i && !q.folded && !q.allIn) q.acted = false
      })
    }
    p.acted = true
  }

  // hand ends by folds?
  const act = activeIdx(h.players)
  if (act.length === 1) return endByFold(h, act[0])

  // round complete?
  const canAct = h.players.filter((q) => !q.folded && !q.allIn)
  const complete = canAct.length === 0 || canAct.every((q) => q.acted && q.bet === h.currentBet)
  if (complete) return advance(h)

  h.toAct = nextActor(h.players, n, i)
  return h
}

function advance(h) {
  h.players.forEach((p) => {
    p.bet = 0
    p.acted = false
  })
  h.currentBet = 0
  h.minRaise = BB
  h.lastAggressor = null
  h.lastAction = {}
  const deal = (k) => {
    for (let x = 0; x < k; x++) h.board.push(h.deck.pop())
  }
  if (h.street === 'preflop') {
    h.street = 'flop'
    deal(3)
  } else if (h.street === 'flop') {
    h.street = 'turn'
    deal(1)
  } else if (h.street === 'turn') {
    h.street = 'river'
    deal(1)
  } else {
    return showdown(h)
  }
  h.toAct = nextActor(h.players, h.count, h.button)
  if (canActCount(h.players) <= 1) return advance(h) // run it out
  return h
}

function endByFold(h, winnerIdx) {
  const pot = h.players.reduce((s, p) => s + p.tc, 0)
  h.players[winnerIdx].stack += pot
  h.phase = 'folded'
  h.winner = winnerIdx
  h.results = { pot, foldWin: true }
  return h
}

function showdown(h) {
  while (h.board.length < 5) h.board.push(h.deck.pop())
  const names = {}
  const scores = {}
  h.players.forEach((p, i) => {
    if (!p.folded) {
      const hn = E.handName(p.hole.concat(h.board))
      names[i] = hn
      scores[i] = E.evaluate7(p.hole.concat(h.board))
    }
  })
  const pots = E.computePots(h.players.map((p) => ({ tc: p.tc, folded: p.folded })))
  const potResults = pots.map((pot) => {
    let best = -1
    pot.eligible.forEach((i) => {
      if (scores[i] > best) best = scores[i]
    })
    const winners = pot.eligible.filter((i) => scores[i] === best)
    const share = Math.floor(pot.amount / winners.length)
    winners.forEach((i, k) => {
      h.players[i].stack += share + (k === 0 ? pot.amount - share * winners.length : 0)
    })
    return { amount: pot.amount, winners, best }
  })
  h.phase = 'showdown'
  h.results = { potResults, names, scores }
  // main pot winner for banner / highlight
  const main = potResults[0]
  h.winner = main ? main.winners[0] : null
  return h
}

/* ---------------- coaching analysis ---------------- */
function analyze(hand) {
  const hero = hand.players[0]
  const toCall = Math.min(hand.currentBet - hero.bet, hero.stack)
  const pot = hand.players.reduce((s, p) => s + p.tc, 0)
  const numOpp = hand.players.filter((p, i) => i !== 0 && !p.folded).length
  const eq = E.equity(hero.hole, hand.board, 300, Math.max(numOpp, 1))
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0
  const evCall = E.callEV(eq, pot, toCall)
  let rec
  if (toCall === 0) {
    if (eq >= 0.55) rec = { best: 'bet', good: ['bet'], soft: ['check'] }
    else if (eq >= 0.4) rec = { best: 'check', good: ['check', 'bet'], soft: [] }
    else rec = { best: 'check', good: ['check'], soft: ['bet'] }
  } else {
    if (eq >= 0.66) rec = { best: 'raise', good: ['raise', 'call'], soft: [] }
    else if (eq >= potOdds) rec = { best: 'call', good: ['call', 'raise'], soft: [] }
    else rec = { best: 'fold', good: ['fold'], soft: [] }
  }
  return { eq, toCall, pot, potOdds, evCall, rec, numOpp }
}
function verdictFor(a, action) {
  const good = a.rec.good.includes(action)
  const soft = a.rec.soft.includes(action)
  return { ...a, action, kind: good ? 'good' : soft ? 'soft' : 'leak' }
}
function labelAct(x) {
  return { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' }[x] || x
}

const TONE_COPY = {
  neutral: {
    good: (a) => `${labelAct(a.action)} is the +EV play here.`,
    soft: (a) => `${labelAct(a.action)} is playable, but not the highest-EV line.`,
    leak: (a) =>
      `${labelAct(a.action)} is a leak — the math favors ${labelAct(a.rec.best).toLowerCase()}.`,
  },
  encouraging: {
    good: (a) =>
      `Nice — ${labelAct(a.action).toLowerCase()} is exactly right. Keep trusting the odds.`,
    soft: (a) =>
      `Solid instinct. ${labelAct(a.action)} works, though ${labelAct(a.rec.best).toLowerCase()} squeezes a bit more.`,
    leak: (a) =>
      `Close one! The numbers point to ${labelAct(a.rec.best).toLowerCase()} — you'll catch it next time.`,
  },
  strict: {
    good: (a) => `Correct. ${labelAct(a.action)}. Don't deviate.`,
    soft: (a) => `Acceptable, but lazy. ${labelAct(a.rec.best)} is the disciplined line.`,
    leak: (a) =>
      `That's a leak. ${labelAct(a.action)} burns chips — you must ${labelAct(a.rec.best).toLowerCase()} here.`,
  },
}
function reasonLine(a) {
  const eqp = Math.round(a.eq * 100)
  const vs = a.numOpp === 1 ? '1 opponent' : `${a.numOpp} opponents`
  if (a.toCall > 0) {
    return (
      `You hold ${eqp}% equity vs ${vs}, and the pot lays ${Math.round(a.potOdds * 100)}% odds. ` +
      (a.eq >= a.potOdds
        ? `Calling is profitable by ~${a.evCall >= 0 ? '+' : ''}${Math.round(a.evCall)} chips long-run.`
        : `You need ${Math.round(a.potOdds * 100)}% to break even, so calling loses ~${Math.round(-a.evCall)} chips over time.`)
    )
  }
  return (
    `You hold ${eqp}% equity vs ${vs} with no bet to call. ` +
    (a.eq >= 0.55
      ? `Strong enough to bet for value.`
      : a.eq >= 0.4
        ? `Marginal — checking controls the pot.`
        : `Weak — check and see a free card.`)
  )
}

/* ---------------- main app ---------------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  dir: 'playful',
  accent: '#3ddc84',
  coachTone: 'encouraging',
  fourColor: true,
  players: 6,
  cardStyle: 'classic',
} /*EDITMODE-END*/

const ACCENTS = {
  '#3ddc84': 'oklch(0.82 0.16 158)',
  '#ffb020': 'oklch(0.82 0.15 80)',
  '#5aa6ff': 'oklch(0.74 0.14 250)',
  '#c879ff': 'oklch(0.74 0.17 310)',
}
const ACCENT_INK = {
  '#3ddc84': '#06120c',
  '#ffb020': '#1a1200',
  '#5aa6ff': '#04101f',
  '#c879ff': '#160422',
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const count = Math.max(2, Math.min(6, t.players || 6))
  const [bank, setBank] = useState(() => Array(count).fill(START))
  const [button, setButton] = useState(0)
  const [handNo, setHandNo] = useState(1)
  const [hand, setHand] = useState(() => newHand(Array(count).fill(START), 0, count, 1))
  const [betTo, setBetTo] = useState(BB * 2)
  const [sizeKey, setSizeKey] = useState(null)
  const [coachOpen, setCoachOpen] = useState(false)
  const [coachMode, setCoachMode] = useState('live')
  const [liveA, setLiveA] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [hintViewed, setHintViewed] = useState(true)
  const botTimer = useRef(null)

  // reset when player count changes
  useEffect(() => {
    const nb = Array(count).fill(START)
    setBank(nb)
    setButton(0)
    setHandNo(1)
    setHand(newHand(nb, 0, count, Date.now()))
    setVerdict(null)
    setHintViewed(true)
    setCoachOpen(false)
    setCoachMode('live')
  }, [count])

  const accentVar = ACCENTS[t.accent] || ACCENTS['#3ddc84']
  const rootStyle = { '--accent': accentVar, '--accent-ink': ACCENT_INK[t.accent] || '#06120c' }

  const hero = hand.players[0]
  const heroTurn = hand.phase === 'betting' && hand.toAct === 0
  const legal = heroTurn
    ? (() => {
        const toCall = Math.min(hand.currentBet - hero.bet, hero.stack)
        const maxTo = hero.bet + hero.stack
        let minRaiseTo = hand.currentBet === 0 ? BB : hand.currentBet + hand.minRaise
        minRaiseTo = Math.min(minRaiseTo, maxTo)
        return { toCall, canCheck: toCall <= 0, minRaiseTo, maxTo }
      })()
    : null

  const pot = hand.players.reduce((s, p) => s + p.tc, 0)

  // init bet slider on hero turn
  useEffect(() => {
    if (legal) {
      const start = Math.min(Math.max(legal.minRaiseTo, Math.round(pot * 0.66)), legal.maxTo)
      setBetTo(start)
      setSizeKey(null)
    }
  }, [hand.id, hand.street, hand.toAct, hand.phase])

  // bot turns
  useEffect(() => {
    if (hand.phase === 'betting' && hand.toAct >= 0 && !hand.players[hand.toAct].isHero) {
      const i = hand.toAct
      const p = hand.players[i]
      botTimer.current = setTimeout(() => {
        const numOpp = hand.players.filter((q, qi) => qi !== i && !q.folded).length
        const s = {
          hole: p.hole,
          board: hand.board,
          toCall: hand.currentBet - p.bet,
          pot,
          stack: p.stack,
          minRaise: hand.minRaise,
          numOpp: Math.max(numOpp, 1),
        }
        const d = E.botDecide(s)
        let amountTo
        if (d.action === 'bet' || d.action === 'raise') amountTo = p.bet + d.amount
        setHand((h) => applyAction(h, d.action, amountTo))
      }, 560)
      return () => clearTimeout(botTimer.current)
    }
  }, [hand.toAct, hand.phase, hand.id, hand.street])

  // sync bank when hand resolves
  useEffect(() => {
    if (hand.phase !== 'betting') setBank(hand.players.map((p) => p.stack))
  }, [hand.phase])

  const heroAct = (action) => {
    if (!legal) return
    const a = analyze(hand)
    setVerdict(verdictFor(a, action))
    setHintViewed(false)
    const amountTo = action === 'bet' || action === 'raise' ? betTo : undefined
    setHand((h) => applyAction(h, action, amountTo))
    if (coachOpen) setCoachMode('verdict')
  }

  const nextHand = () => {
    const nb = hand.players.map((p) => (p.stack <= 0 ? START : p.stack))
    const nbtn = (button + 1) % count
    setBank(nb)
    setButton(nbtn)
    setHandNo((x) => x + 1)
    setHand(newHand(nb, nbtn, count, Date.now()))
    setVerdict(null)
    setHintViewed(true)
    setCoachMode('live')
    setCoachOpen(false)
  }

  const openCoach = () => {
    if (heroTurn) {
      setLiveA(analyze(hand))
      setCoachMode('live')
    } else if (verdict) setCoachMode('verdict')
    else {
      setLiveA(analyze(hand))
      setCoachMode('live')
    }
    setCoachOpen(true)
    setHintViewed(true)
  }

  const applySize = (key) => {
    if (!legal) return
    let to
    if (key === 'min') to = legal.minRaiseTo
    else if (key === 'half') to = hero.bet + legal.toCall + Math.round(pot * 0.5)
    else if (key === 'pot') to = hero.bet + legal.toCall + pot
    else if (key === 'allin') to = legal.maxTo
    to = Math.min(Math.max(to, legal.minRaiseTo), legal.maxTo)
    setBetTo(to)
    setSizeKey(key)
  }

  const layout = SEAT_LAYOUTS[count]
  const posTag = (i) =>
    i === hand.button ? 'BTN' : i === hand.sbIdx ? 'SB' : i === hand.bbIdx ? 'BB' : null
  const showNext = hand.phase !== 'betting'
  const raiseLabel = legal && legal.toCall > 0 ? 'Raise to' : 'Bet'

  return (
    <div
      className="room"
      data-dir={t.dir}
      data-deck={t.fourColor ? 'four' : 'two'}
      style={rootStyle}
    >
      <div className="app">
        {/* top bar */}
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">B</div>
            <div>
              <div className="brand-name">Bachmann Hold'em</div>
              <div className="brand-sub">
                HAND #{handNo} · {count}-MAX NL
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="chip-counter">BANK {fmt(hero.stack)}</div>
            <button
              className={'icon-btn' + (coachOpen ? ' active' : '')}
              onClick={openCoach}
              title="Coach"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6 7 18.2l1.9-5.8L4 8.8h6.1z" />
              </svg>
            </button>
          </div>
        </div>

        {/* table */}
        <div className="table">
          <div className="felt">
            {/* center pot + board */}
            <div className="center" style={{ left: CENTER[0] + '%', top: CENTER[1] + '%' }}>
              <div className="pot">
                <div className="pot-label">Pot</div>
                <div className="pot-amt">
                  <span className="disc" />
                  {fmt(pot)}
                </div>
              </div>
              <div className="board">
                {hand.board.length === 0 ? (
                  <div className="street-tag">
                    {hand.phase === 'betting' ? 'preflop · ' + SB + '/' + BB : ''}
                  </div>
                ) : (
                  hand.board.map((c, i) => {
                    const w =
                      hand.phase === 'showdown' &&
                      hand.winner != null &&
                      hand.results.names[hand.winner] &&
                      hand.results.names[hand.winner].cards.some(
                        (wc) => wc.r === c.r && wc.s === c.s,
                      )
                    return <CardView key={i} card={c} size="md" style={t.cardStyle} winning={w} />
                  })
                )}
              </div>
              <ResultBanner hand={hand} />
            </div>

            {/* wager chips */}
            {hand.players.map((p, i) => {
              if (p.bet <= 0) return null
              const [sx, sy] = layout[i]
              const wx = lerp(sx, CENTER[0], 0.34),
                wy = lerp(sy, CENTER[1], 0.34)
              return (
                <div className="wager" key={'w' + i} style={{ left: wx + '%', top: wy + '%' }}>
                  <span className="disc" />
                  {fmt(p.bet)}
                </div>
              )
            })}

            {/* seats */}
            {hand.players.map((p, i) => {
              const [x, y] = layout[i]
              const acting = hand.phase === 'betting' && hand.toAct === i
              const reveal = p.isHero || (hand.phase === 'showdown' && !p.folded)
              const la = hand.lastAction[i]
              return (
                <div
                  key={i}
                  className={
                    'pseat' +
                    (p.isHero ? ' hero' : '') +
                    (acting ? ' acting' : '') +
                    (p.folded ? ' folded' : '')
                  }
                  style={{ left: x + '%', top: y + '%' }}
                >
                  <div className="pseat-cards">
                    {p.hole.map((c, k) => (
                      <CardView
                        key={k}
                        card={reveal ? c : null}
                        hidden={!reveal}
                        muck={p.folded}
                        size={p.isHero ? 'lg' : 'sm'}
                        style={t.cardStyle}
                        winning={hand.phase === 'showdown' && hand.winner === i}
                      />
                    ))}
                  </div>
                  <div className="pseat-info">
                    <div className={'avatar' + (p.isHero ? '' : ' bot')}>
                      {p.isHero ? 'YOU' : p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="seat-meta">
                      <div className="seat-name">
                        {p.name}
                        {posTag(i) && (
                          <span className={'postag' + (i === hand.button ? ' btn' : '')}>
                            {posTag(i)}
                          </span>
                        )}
                      </div>
                      <div className="seat-stack">
                        {p.allIn && p.stack === 0 ? 'ALL-IN' : fmt(p.stack)}
                      </div>
                    </div>
                  </div>
                  {acting && <div className="turn-timer" />}
                  {la && hand.phase === 'betting' && (
                    <div
                      className={
                        'action-flash ' +
                        (la.action === 'fold'
                          ? 'fold'
                          : la.action === 'bet' || la.action === 'raise'
                            ? 'aggressive'
                            : '')
                      }
                    >
                      {labelAct(la.action)}
                    </div>
                  )}
                </div>
              )
            })}

            {/* coach FAB */}
            <div className="coach-fab" onClick={openCoach}>
              <div
                className="ring"
                style={
                  !hintViewed && verdict
                    ? {
                        borderColor:
                          verdict.kind === 'good'
                            ? 'var(--good)'
                            : verdict.kind === 'leak'
                              ? 'var(--bad)'
                              : 'var(--accent)',
                        color:
                          verdict.kind === 'good'
                            ? 'var(--good)'
                            : verdict.kind === 'leak'
                              ? 'var(--bad)'
                              : 'var(--accent)',
                      }
                    : {}
                }
              >
                {!hintViewed && verdict
                  ? verdict.kind === 'good'
                    ? '✓'
                    : verdict.kind === 'leak'
                      ? '!'
                      : '·'
                  : '?'}
              </div>
              <div className="lab">COACH</div>
            </div>
          </div>
        </div>

        {/* action bar */}
        <div className="actionbar">
          {showNext ? (
            <div className="actions">
              <button className="btn next-cta" onClick={nextHand}>
                Deal next hand →
              </button>
            </div>
          ) : legal ? (
            <>
              <div className="bet-row">
                <div className="bet-amount">
                  {fmt(betTo)} <span>to</span>
                </div>
                <input
                  className="slider"
                  type="range"
                  min={legal.minRaiseTo}
                  max={legal.maxTo}
                  step={5}
                  value={Math.min(betTo, legal.maxTo)}
                  onChange={(e) => {
                    setBetTo(+e.target.value)
                    setSizeKey(null)
                  }}
                />
                <div className="sizes">
                  {legal.toCall > 0 && (
                    <button
                      className={'size-btn' + (sizeKey === 'min' ? ' active' : '')}
                      onClick={() => applySize('min')}
                    >
                      min
                    </button>
                  )}
                  <button
                    className={'size-btn' + (sizeKey === 'half' ? ' active' : '')}
                    onClick={() => applySize('half')}
                  >
                    ½
                  </button>
                  <button
                    className={'size-btn' + (sizeKey === 'pot' ? ' active' : '')}
                    onClick={() => applySize('pot')}
                  >
                    pot
                  </button>
                  <button
                    className={'size-btn' + (sizeKey === 'allin' ? ' active' : '')}
                    onClick={() => applySize('allin')}
                  >
                    all-in
                  </button>
                </div>
              </div>
              <div className="actions">
                <button className="btn fold" onClick={() => heroAct('fold')}>
                  Fold
                </button>
                {legal.canCheck ? (
                  <button className="btn call" onClick={() => heroAct('check')}>
                    Check
                  </button>
                ) : (
                  <button className="btn call" onClick={() => heroAct('call')}>
                    Call<small>{fmt(legal.toCall)}</small>
                  </button>
                )}
                <button
                  className="btn raise"
                  disabled={legal.maxTo <= legal.toCall + hero.bet && legal.toCall > 0}
                  onClick={() => heroAct(legal.toCall > 0 ? 'raise' : 'bet')}
                >
                  {raiseLabel}
                  <small>{fmt(betTo)}</small>
                </button>
              </div>
            </>
          ) : (
            <div className="actions">
              <button className="btn call" disabled style={{ gridColumn: '1 / -1' }}>
                {hand.toAct >= 0 ? hand.players[hand.toAct].name + ' is thinking…' : '…'}
              </button>
            </div>
          )}
        </div>

        <div className={'scrim' + (coachOpen ? ' show' : '')} onClick={() => setCoachOpen(false)} />
        <CoachDrawer
          open={coachOpen}
          mode={coachMode}
          live={liveA}
          verdict={verdict}
          tone={t.coachTone}
          onClose={() => setCoachOpen(false)}
        />

        <TweaksPanel>
          <TweakSection label="Table" />
          <TweakRadio
            label="Players"
            value={String(count)}
            options={['2', '4', '6']}
            onChange={(v) => setTweak('players', +v)}
          />
          <TweakSection label="Cards" />
          <TweakRadio
            label="Card style"
            value={t.cardStyle}
            options={['classic', 'modern', 'minimal']}
            onChange={(v) => setTweak('cardStyle', v)}
          />
          <TweakToggle
            label="Four-color deck"
            value={t.fourColor}
            onChange={(v) => setTweak('fourColor', v)}
          />
          <TweakSection label="Visual direction" />
          <TweakRadio
            label="Style"
            value={t.dir}
            options={['editorial', 'playful']}
            onChange={(v) => setTweak('dir', v)}
          />
          <TweakColor
            label="Accent"
            value={t.accent}
            options={['#3ddc84', '#ffb020', '#5aa6ff', '#c879ff']}
            onChange={(v) => setTweak('accent', v)}
          />
          <TweakSection label="Coaching" />
          <TweakRadio
            label="Coach tone"
            value={t.coachTone}
            options={['neutral', 'encouraging', 'strict']}
            onChange={(v) => setTweak('coachTone', v)}
          />
        </TweaksPanel>
      </div>
    </div>
  )
}

function ResultBanner({ hand }) {
  if (hand.phase === 'betting') return null
  if (hand.phase === 'folded') {
    const w = hand.players[hand.winner]
    return (
      <div className="result-banner">
        <div className={'who ' + (w.isHero ? 'win' : 'lose')}>
          {w.isHero ? 'You take it' : w.name + ' wins'}
        </div>
        <div className="what">Everyone else folded · {fmt(hand.results.pot)}</div>
      </div>
    )
  }
  const w = hand.players[hand.winner]
  const main = hand.results.potResults[0]
  const split = main.winners.length > 1
  const name = hand.results.names[hand.winner]
  return (
    <div className="result-banner">
      <div className={'who ' + (w.isHero ? 'win' : 'lose')}>
        {split ? 'Split pot' : w.isHero ? 'You win' : w.name + ' wins'} · {fmt(main.amount)}
      </div>
      <div className="what">{name ? name.name : ''}</div>
    </div>
  )
}

function CoachDrawer({ open, mode, live, verdict, tone, onClose }) {
  const a = mode === 'verdict' ? verdict : live
  if (!a)
    return (
      <div className={'drawer' + (open ? ' open' : '')}>
        <div className="grab" />
        <div className="coach-note">Open during your turn for live odds and a recommendation.</div>
      </div>
    )
  const eqp = Math.round(a.eq * 100)
  const isVerdict = mode === 'verdict'
  const kind = isVerdict ? a.kind : 'neutral'
  const copy = isVerdict ? TONE_COPY[tone][a.kind](a) : null
  return (
    <div className={'drawer' + (open ? ' open' : '')}>
      <div className="grab" />
      <div className="drawer-head">
        <div className="drawer-title">
          {isVerdict ? 'Decision review' : 'Live read · your turn'}
        </div>
        <button className="drawer-close" onClick={onClose}>
          ×
        </button>
      </div>
      {isVerdict ? (
        <div className={'verdict ' + kind}>
          <div className="verdict-badge">{kind === 'good' ? '✓' : kind === 'soft' ? '~' : '!'}</div>
          <div className="verdict-body">
            <h4>
              {kind === 'good' ? 'Good decision' : kind === 'soft' ? 'Playable' : 'Leak spotted'}
            </h4>
            <p>{copy}</p>
          </div>
        </div>
      ) : (
        <div className="verdict neutral">
          <div className="verdict-badge" style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
            {labelAct(a.rec.best)[0]}
          </div>
          <div className="verdict-body">
            <h4>Coach would {labelAct(a.rec.best).toLowerCase()}</h4>
            <p>{reasonLine(a)}</p>
          </div>
        </div>
      )}
      <div className="metrics">
        <div className="metric">
          <div className="k">Your equity</div>
          <div className="v accent">{eqp}%</div>
          <div className="sub">vs {a.numOpp} live</div>
        </div>
        <div className="metric">
          <div className="k">Pot odds</div>
          <div className="v">{a.toCall > 0 ? Math.round(a.potOdds * 100) + '%' : '—'}</div>
          <div className="sub">{a.toCall > 0 ? 'to call' : 'no bet'}</div>
        </div>
        <div className="metric">
          <div className="k">EV of call</div>
          <div className={'v ' + (a.evCall >= 0 ? 'good' : 'bad')}>
            {a.toCall > 0 ? (a.evCall >= 0 ? '+' : '') + Math.round(a.evCall) : '—'}
          </div>
          <div className="sub">chips</div>
        </div>
      </div>
      <div className="eq-bar">
        <div className="win" style={{ width: eqp + '%' }} />
      </div>
      <div className="eq-fill-note">
        <span>win {eqp}%</span>
        <span>lose {100 - eqp}%</span>
      </div>
      <div className="coach-note">
        Equity is a Monte-Carlo estimate against {a.numOpp} random{' '}
        {a.numOpp === 1 ? 'hand' : 'hands'} on this board. <b>Pot odds</b> are the price you're laid
        — call when equity beats the price.
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
