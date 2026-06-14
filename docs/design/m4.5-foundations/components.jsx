/* Foundations primer — shared primitives (Card, icons, status bar, seat ring).
   Exports to window for the screens + app scripts. */
const { useState, useEffect, useRef } = React;
const PC = window.PrimerCurriculum;

/* ---------------- four-colour card (classic style, matches styles.css) ---------------- */
function Card({ card, size = 'md', hidden }) {
  if (hidden || !card) {
    return (
      <div className={`card back ${size}`}>
        <div className="back-mark">{'\u2663'}</div>
      </div>
    );
  }
  const glyph = PC.SUIT_GLYPH[card.s];
  const suitClass = 'suit-' + PC.SUIT_NAME[card.s];
  return (
    <div className={`card ${suitClass} ${size} cs-classic`}>
      <div className="corner tl">
        <span className="r">{card.r}</span>
        <span className="s">{glyph}</span>
      </div>
      <div className="pip">{glyph}</div>
      <div className="corner br">
        <span className="r">{card.r}</span>
        <span className="s">{glyph}</span>
      </div>
    </div>
  );
}

/* ---------------- minimal line icons (UI glyphs, not illustration) ---------------- */
const Icon = {
  play: (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  ),
  learn: (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" {...p}>
      <path d="M3 6.5L12 4l9 2.5L12 9 3 6.5z" />
      <path d="M7 9v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9" />
    </svg>
  ),
  drills: (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="12" cy="12" r="0.4" fill="currentColor" />
    </svg>
  ),
  back: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  chev: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  check: (p) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  ),
  lock: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  spark: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  ),
  menu: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
};

/* ---------------- iOS-ish status bar (sells the installed PWA) ---------------- */
function StatusBar({ time = '9:41' }) {
  return (
    <div className="statusbar">
      <span>{time}</span>
      <span className="sb-right">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.6" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.6" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.6" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.4c1.9 0 3.6.7 4.9 1.9l1.2-1.3A9 9 0 0 0 7.5.6 9 9 0 0 0 1.4 3l1.2 1.3A7.2 7.2 0 0 1 7.5 2.4z" />
          <path d="M7.5 5.6c1 0 2 .4 2.7 1.1l1.2-1.3a6 6 0 0 0-7.8 0l1.2 1.3c.7-.7 1.6-1.1 2.7-1.1z" />
          <circle cx="7.5" cy="9" r="1.6" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.6" y="0.6" width="21" height="10.8" rx="2.6" stroke="currentColor" strokeOpacity="0.5" />
          <rect x="2" y="2" width="17" height="8" rx="1.4" fill="currentColor" />
          <rect x="22.8" y="3.5" width="1.6" height="5" rx="0.8" fill="currentColor" fillOpacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

/* ---------------- brand mark + name (carries the M4 .topbar look) ---------------- */
function Brand({ sub }) {
  return (
    <div className="brand">
      <div className="brand-mark">B</div>
      <div>
        <div className="brand-name">Bachmann Hold'em</div>
        {sub && <div className="brand-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------- mini seat ring for the position lesson ---------------- */
// 6-seat oval; hero highlighted, button marked. Coords adapted from SEAT_LAYOUTS[6].
const RING_SEATS = [
  [50, 86],
  [12, 60],
  [20, 22],
  [50, 12],
  [80, 22],
  [88, 60],
];
function SeatRing({ heroSeat, buttonIndex, numPlayers = 6 }) {
  return (
    <div className="seat-ring">
      <div className="sr-oval" />
      {RING_SEATS.map(([x, y], i) => {
        const isHero = i === heroSeat;
        const isBtn = i === buttonIndex;
        return (
          <div
            key={i}
            className={'sr-seat' + (isHero ? ' hero' : '')}
            style={{ left: x + '%', top: y + '%' }}
          >
            {isBtn && <span className="btn-dot">B</span>}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { Card, Icon, StatusBar, Brand, SeatRing });
