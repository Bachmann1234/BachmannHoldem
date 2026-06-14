/* Foundations primer — screens (controlled/presentational).
   Reused by primer-app.jsx (interactive) and canvas.jsx (static state frames). */
const { Card: PCard, Icon: PIcon, StatusBar: PStatusBar, Brand: PBrand, SeatRing: PSeatRing } = window;
const CUR = window.PrimerCurriculum;

/* concept → one-line teaser for the path/recap */
const TEASER = {
  equity: 'Your share of the pot, right now.',
  'pot-odds': 'The break-even price of a call.',
  'equity-vs-price': 'Continue when equity beats the price.',
  ev: 'The same decision, counted in chips.',
  position: 'Acting later lets you play more hands.',
  ranges: 'Sort hands into strength tiers.',
};

/* ============================================================ AppBar ============ */
function AppBar({ eyebrow, title, onBack, right }) {
  return (
    <div className="appbar">
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Back">
          <PIcon.back />
        </button>
      )}
      <div className="appbar-titles">
        {eyebrow && <div className="appbar-eyebrow">{eyebrow}</div>}
        <div className="appbar-title">{title}</div>
      </div>
      <div className="appbar-spacer" />
      {right}
    </div>
  );
}

/* ============================================================ Tab bar (§5.1 A) == */
function TabBar({ active, onNav }) {
  const tabs = [
    { id: 'play', label: 'Play', icon: PIcon.play },
    { id: 'learn', label: 'Learn', icon: PIcon.learn },
    { id: 'drills', label: 'Drills', icon: PIcon.drills, locked: true },
  ];
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={'tab' + (active === t.id ? ' active' : '') + (t.locked ? ' locked' : '')}
          onClick={() => !t.locked && onNav && onNav(t.id)}
        >
          {t.locked && <span className="soon">Soon</span>}
          <span className="tab-icon">
            <t.icon />
          </span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ============================================================ Learn path (§5.2) = */
const ROW_H = 104;
function LearnPath({ lessons, progress, onOpen, onNav, withTabs = true }) {
  // progress = number of completed lessons; current = first unfinished
  const currentIdx = Math.min(progress, lessons.length - 1);
  const allDone = progress >= lessons.length;
  const medCenter = (i) => i * ROW_H + 52;
  const fillTo = allDone ? medCenter(lessons.length - 1) : medCenter(currentIdx);

  return (
    <div className="screen">
      <PStatusBar />
      <div className="appbar">
        <PBrand sub="FOUNDATIONS" />
      </div>
      <div className="screen-body">
        <div className="learn">
          <div className="learn-head">
            <h1>Learn the fundamentals</h1>
            <div className="lh-sub">Six ideas the coach assumes you know. ~30 seconds each.</div>
            <div className="progress-meter">
              <div className="pm-track">
                <div
                  className="pm-fill"
                  style={{ width: (progress / lessons.length) * 100 + '%' }}
                />
              </div>
              <div className="pm-count">
                {progress} / {lessons.length}
              </div>
            </div>
          </div>

          <div className="path" style={{ height: lessons.length * ROW_H + 8 }}>
            {/* spine */}
            <div
              style={{
                position: 'absolute',
                left: 53,
                top: medCenter(0),
                width: 5,
                height: medCenter(lessons.length - 1) - medCenter(0),
                borderRadius: 5,
                background: 'var(--surface-3)',
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 53,
                top: medCenter(0),
                width: 5,
                height: Math.max(0, fillTo - medCenter(0)),
                borderRadius: 5,
                background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent-soft)',
                zIndex: 0,
              }}
            />
            {lessons.map((l, i) => {
              const done = i < progress;
              const current = i === currentIdx && !allDone;
              const locked = i > currentIdx && !allDone;
              const cls =
                'node-row ' + (done ? 'done' : current ? 'current' : allDone ? 'done' : 'locked');
              const open = (done || current || allDone) && onOpen ? () => onOpen(i) : undefined;
              return (
                <div className={cls} key={l.id}>
                  <div className="medallion" onClick={open} style={open ? { cursor: 'pointer' } : null}>
                    {done || allDone ? <PIcon.check /> : locked ? <PIcon.lock /> : l.n}
                  </div>
                  <div className="node-label" onClick={open} style={open ? { cursor: 'pointer' } : null}>
                    <div className="nl-tier">Lesson {l.n}</div>
                    <h3>
                      {l.title}
                      {l.subtitle ? ' · ' + l.subtitle : ''}
                    </h3>
                    <p>{TEASER[l.concept]}</p>
                    {current && (
                      <span className="start-tag">
                        {progress > 0 ? 'Resume here' : 'Start here'} <PIcon.chev style={{ width: 13, height: 13 }} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* resume bar */}
      <div className="resume-bar">
        <button className="resume-cta" onClick={() => onOpen && onOpen(allDone ? lessons.length - 1 : currentIdx)}>
          <span>
            {allDone ? 'Review · ' : progress > 0 ? 'Resume · ' : 'Start · '}
            {lessons[allDone ? lessons.length - 1 : currentIdx].title}
            <span className="rc-sub"> Lesson {lessons[allDone ? lessons.length - 1 : currentIdx].n} of {lessons.length}</span>
          </span>
          <PIcon.chev />
        </button>
      </div>

      {withTabs && <TabBar active="learn" onNav={onNav} />}
    </div>
  );
}

/* ============================================================ Lesson — READ ===== */
function LessonShell({ lesson, spotNo, spotCount, onBack, children, footer }) {
  return (
    <div className="screen">
      <PStatusBar />
      <AppBar eyebrow={`LESSON ${lesson.n} OF 6`} title={lesson.title} onBack={onBack} />
      <div className="lesson-head">
        <div className="lesson-steps">
          {Array.from({ length: spotCount }).map((_, i) => (
            <div className="ls-seg" key={i}>
              <span
                className="fill"
                style={{ width: i < spotNo ? '100%' : i === spotNo ? '50%' : '0%' }}
              />
            </div>
          ))}
        </div>
        <span className="concept-tag">
          <PIcon.spark style={{ width: 12, height: 12 }} /> {lesson.concept.replace(/-/g, ' ')}
        </span>
      </div>
      {children}
      {footer}
    </div>
  );
}

function ReadView({ lesson, onBack, onStart }) {
  // bold the rule clause for the continue-rule lesson
  let teach = lesson.explanation;
  let htmlTeach = null;
  if (lesson.rule && teach.indexOf(lesson.rule) >= 0) {
    const idx = teach.indexOf(lesson.rule);
    htmlTeach = [
      teach.slice(0, idx),
      <b key="r">{lesson.rule}</b>,
      teach.slice(idx + lesson.rule.length),
    ];
  }
  return (
    <LessonShell
      lesson={lesson}
      spotNo={0}
      spotCount={lesson.spots.length}
      onBack={onBack}
      footer={
        <div className="lesson-cta">
          <button className="cta-primary" onClick={onStart}>
            {lesson.spots.length > 1 ? 'Start the checks \u2192' : 'Start the check \u2192'}
          </button>
        </div>
      }
    >
      <div className="lesson-body">
        <div className="nl-tier" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 4 }}>
          The idea
        </div>
        <h2 className="teach-title">
          {lesson.title}
          <span className="tt-sub">{lesson.subtitle}</span>
        </h2>
        <p className="teach">{htmlTeach || teach}</p>
        {lesson.rule && (
          <div className="teach-rule">
            <span className="tr-k">The one rule</span>
            Continue when your equity beats the price; fold when it doesn't.
          </div>
        )}
      </div>
    </LessonShell>
  );
}

/* ============================================================ Lesson — ASK ====== */
function SpotView({ spot }) {
  if (spot.kind === 'preflop') {
    return (
      <div className="spot">
        <div className="spot-pre">
          <PSeatRing heroSeat={spot.seat} buttonIndex={spot.buttonIndex} numPlayers={spot.numPlayers} />
          <div className="spot-pre-body">
            <div className="pre-pos">{spot.posLabel}</div>
            <div className="pre-sub">{spot.posSub}</div>
            <div className="pre-hand">
              {spot.hole.map((c, i) => (
                <PCard key={i} card={c} size="lg" />
              ))}
            </div>
          </div>
        </div>
        <p className="spot-prompt">{spot.prompt}</p>
      </div>
    );
  }
  // postflop coach spot
  const free = spot.toCall === 0;
  return (
    <div className="spot">
      <div className="spot-felt">
        <div className="spot-pot">
          <div className="sp-k">Pot</div>
          <div className="sp-v">
            <span className="disc" />
            {spot.pot}
          </div>
        </div>
        <div className="spot-board">
          {spot.board.map((c, i) => (
            <PCard key={i} card={c} size="md" />
          ))}
        </div>
        <div className="spot-hand">
          <div className="sh-k">Your hand</div>
          <div className="sh-cards">
            {spot.hole.map((c, i) => (
              <PCard key={i} card={c} size="lg" />
            ))}
          </div>
        </div>
        <div className="price-chip">
          <span className="pc-k">{free ? '' : 'To call'}</span>
          {free ? 'Free \u00b7 nothing to call' : spot.toCall}
        </div>
      </div>
      <p className="spot-prompt">{spot.prompt}</p>
    </div>
  );
}

function AskView({ lesson, spot, spotNo, onBack, chosen = null, onPick }) {
  const locked = chosen !== null;
  return (
    <LessonShell
      lesson={lesson}
      spotNo={spotNo}
      spotCount={lesson.spots.length}
      onBack={onBack}
      footer={
        <div className="answers">
          {spot.choices.map((c, i) => {
            let cls = 'answer';
            if (locked) {
              if (i === spot.correctIndex) cls += ' is-correct';
              else if (i === chosen) cls += ' is-wrong';
              else cls += ' dim';
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={locked}
                onClick={() => !locked && onPick && onPick(i)}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="lesson-body">
        <SpotView spot={spot} />
      </div>
    </LessonShell>
  );
}

/* ============================================================ GRADED result ===== */
// Slide-up drawer — sibling to the table's coach drawer (.drawer/.verdict/.eq-bar),
// with a SLIM inline metric row instead of the big 3-card grid.
function ResultSheet({ result, open, ctaLabel, onContinue }) {
  if (!result) return <div className={'drawer' + (open ? ' open' : '')} />;
  const m = result.metrics;
  const eqp = m ? Math.round(m.equity * 100) : null;
  const kind = result.correct ? 'good' : 'leak';
  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} />
      <div className={'drawer' + (open ? ' open' : '')}>
        <div className="grab" />
        <div className="drawer-head">
          <div className="drawer-title">Decision review · {result.concept.replace(/-/g, ' ')}</div>
        </div>
        <div className={'verdict ' + kind}>
          <div className="verdict-badge">{result.correct ? '\u2713' : '!'}</div>
          <div className="verdict-body">
            <h4>{result.headline}</h4>
            <p>{result.body}</p>
          </div>
        </div>

        {/* postflop priced spot: slim metric row + equity bar */}
        {m && m.price != null && (
          <>
            <div className="metric-row">
              <div className="metric-inline">
                <div className="k">Your equity</div>
                <div className="v accent">{CUR.pct(m.equity)}</div>
              </div>
              <div className="metric-inline">
                <div className="k">Pot-odds price</div>
                <div className="v">{CUR.pct(m.price)}</div>
              </div>
              <div className="metric-inline">
                <div className="k">EV of call</div>
                <div className={'v ' + (m.ev >= 0 ? 'good' : 'bad')}>{CUR.signedChips(m.ev)}</div>
              </div>
            </div>
            <div className="eq-bar slim">
              <div className="win" style={{ width: eqp + '%' }} />
            </div>
            <div className="eq-fill-note">
              <span>win {eqp}%</span>
              <span>lose {100 - eqp}%</span>
            </div>
          </>
        )}
        {/* free check: equity only */}
        {m && m.price == null && (
          <div className="metric-row">
            <div className="metric-inline">
              <div className="k">Your equity</div>
              <div className="v accent">{CUR.pct(m.equity)}</div>
            </div>
            <div className="metric-inline">
              <div className="k">Price</div>
              <div className="v">{'\u2014'}</div>
            </div>
            <div className="metric-inline">
              <div className="k">To call</div>
              <div className="v">0</div>
            </div>
          </div>
        )}

        <button className="result-cta" onClick={onContinue}>
          {ctaLabel}
        </button>
      </div>
    </>
  );
}

/* ============================================================ End of primer ===== */
function EndOfPrimer({ lessons, onPlay, onBack, onReview }) {
  return (
    <div className="screen">
      <PStatusBar />
      <AppBar eyebrow="FOUNDATIONS" title="Complete" onBack={onBack} />
      <div className="endprimer">
        <div className="endprimer-body">
          <div className="ep-medal">
            <PIcon.check style={{ width: 34, height: 34 }} />
          </div>
          <h1>You've got the fundamentals.</h1>
          <p className="ep-lede">
            All six ideas the coach speaks in. Now the numbers at the table will mean something —
            go put them to work.
          </p>
          <div className="recap">
            {lessons.map((l) => (
              <div className="recap-row" key={l.id}>
                <span className="rr-check">
                  <PIcon.check />
                </span>
                <span className="rr-name">{l.title}</span>
                <span className="rr-sub">{l.concept.replace(/-/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="endprimer-cta">
          <button className="cta-primary" onClick={onPlay}>
            Play a hand {'\u2192'}
          </button>
          <div className="drills-soon">
            <span className="ds-tag">Next</span> Drill sets to sharpen each idea — coming soon
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  AppBar,
  TabBar,
  LearnPath,
  ReadView,
  AskView,
  SpotView,
  ResultSheet,
  EndOfPrimer,
  LessonShell,
  TEASER,
});
