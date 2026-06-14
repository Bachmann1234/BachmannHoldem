/* Foundations primer — interactive app (the playable loop) + nav variations.
   Wires: tab nav → learn path → lesson player (read → ask → graded → advance) → end-of-primer.
   The loop is DATA-DRIVEN from window.PrimerCurriculum.LESSONS (the real @holdem/curriculum
   content), so every lesson plays for real, graded by the ported gradeSpot. */
const PCur = window.PrimerCurriculum;
const {
  LearnPath: SLearnPath,
  ReadView: SReadView,
  AskView: SAskView,
  ResultSheet: SResultSheet,
  EndOfPrimer: SEndOfPrimer,
  TabBar: STabBar,
  AppBar: SAppBar,
  StatusBar: SStatusBar2,
  Brand: SBrand2,
  Icon: SIcon,
} = window;

const PROGRESS_KEY = 'primer-progress-v1';
function loadProgress() {
  try {
    const v = parseInt(localStorage.getItem(PROGRESS_KEY) || '', 10);
    if (Number.isFinite(v) && v >= 0 && v <= PCur.LESSONS.length) return v;
  } catch (e) {}
  return 2; // demo default: lessons 1–2 done, lesson 3 the resume point
}

/* ---- Play tab placeholder (the real table is the shipped M4 app) ---- */
function PlayHome({ onNav }) {
  return (
    <div className="screen">
      <window.StatusBar />
      <div className="appbar">
        <window.Brand sub="PLAY \u00b7 6-MAX NL" />
      </div>
      <div className="screen-body">
        <div className="hub" style={{ paddingTop: 14 }}>
          <div className="learn-rail" style={{ margin: 0 }}>
            <div className="lr-ic">
              <SIcon.play />
            </div>
            <div className="lr-body">
              <h3>Table setup</h3>
              <p>The live table from M4 lives here — out of scope for this primer pass.</p>
            </div>
          </div>
          <div className="mock-setup" style={{ padding: '8px 0' }}>
            <div className="ms-row tall" />
            <div className="ms-row" />
            <div className="ms-row" />
          </div>
          <button className="cta-primary" disabled style={{ opacity: 0.5 }}>
            Deal in {'\u2192'}
          </button>
        </div>
      </div>
      <STabBar active="play" onNav={onNav} />
    </div>
  );
}

/* ---- the playable lesson loop ---- */
function PrimerApp() {
  const lessons = PCur.LESSONS;
  const [tab, setTab] = React.useState('learn');
  const [progress, setProgress] = React.useState(loadProgress);
  const [lessonIdx, setLessonIdx] = React.useState(null); // null = not in a lesson
  const [phase, setPhase] = React.useState('read'); // read | ask | graded
  const [spotIdx, setSpotIdx] = React.useState(0);
  const [chosen, setChosen] = React.useState(null);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, String(progress));
    } catch (e) {}
  }, [progress]);

  const openLesson = (i) => {
    setLessonIdx(i);
    setSpotIdx(0);
    setPhase('read');
    setChosen(null);
    setResult(null);
  };
  const backToPath = () => {
    setLessonIdx(null);
    setChosen(null);
    setResult(null);
  };
  const startChecks = () => {
    setPhase('ask');
    setChosen(null);
    setResult(null);
  };
  const pick = (choiceIdx) => {
    const spot = lessons[lessonIdx].spots[spotIdx];
    setChosen(choiceIdx);
    setResult(PCur.gradeSpot(spot, choiceIdx));
    setPhase('graded');
  };
  const advance = () => {
    const lesson = lessons[lessonIdx];
    const moreSpots = spotIdx < lesson.spots.length - 1;
    if (moreSpots) {
      setSpotIdx(spotIdx + 1);
      setPhase('ask');
      setChosen(null);
      setResult(null);
      return;
    }
    // lesson complete
    const justFinished = lessonIdx + 1;
    const newProgress = Math.max(progress, justFinished);
    setProgress(newProgress);
    if (justFinished >= lessons.length) {
      setLessonIdx(null);
      setChosen(null);
      setResult(null);
      setScreenEnd(true);
    } else {
      backToPath();
    }
  };

  // a dedicated 'end' view flag (kept separate from tab)
  const [screenEnd, setScreenEnd] = React.useState(false);

  const restart = () => {
    setProgress(0);
    backToPath();
    setScreenEnd(false);
  };

  // ---- render ----
  if (screenEnd) {
    return (
      <SEndOfPrimer
        lessons={lessons}
        onBack={() => setScreenEnd(false)}
        onPlay={() => {
          setScreenEnd(false);
          setTab('play');
        }}
      />
    );
  }

  if (tab === 'play') return <PlayHome onNav={setTab} />;

  // Learn tab
  if (lessonIdx === null) {
    // show the path; add a restart affordance in the header
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <SLearnPath
          lessons={lessons}
          progress={progress}
          onOpen={openLesson}
          onNav={setTab}
        />
        {progress > 0 && (
          <button
            onClick={restart}
            title="Restart primer"
            style={{
              position: 'absolute',
              top: 46,
              right: 18,
              zIndex: 6,
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              color: 'var(--text-3)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // in a lesson
  const lesson = lessons[lessonIdx];
  const spot = lesson.spots[spotIdx];

  if (phase === 'read') {
    return <SReadView lesson={lesson} onBack={backToPath} onStart={startChecks} />;
  }

  // ask / graded share the AskView; graded overlays the result drawer
  const moreSpots = spotIdx < lesson.spots.length - 1;
  const isLastLesson = lessonIdx >= lessons.length - 1;
  const ctaLabel = moreSpots
    ? 'Next check \u2192'
    : isLastLesson
      ? 'Finish \u2192'
      : 'Back to path \u2192';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SAskView
        lesson={lesson}
        spot={spot}
        spotNo={spotIdx}
        onBack={backToPath}
        chosen={phase === 'graded' ? chosen : null}
        onPick={pick}
      />
      <SResultSheet
        result={result}
        open={phase === 'graded'}
        ctaLabel={ctaLabel}
        onContinue={advance}
      />
    </div>
  );
}

/* ============================================================
   §5.1 nav variations B & C (presentational, for the comparison)
   ============================================================ */

/* B · home hub: a menu screen you return to */
function HubHome() {
  return (
    <div className="screen">
      <window.StatusBar />
      <div className="appbar">
        <window.Brand sub="HOME" />
      </div>
      <div className="screen-body">
        <div className="hub">
          <div className="hub-hero">
            <h1>Bachmann Hold'em</h1>
            <p>Train your reads. Pick up where you left off, or jump into a hand.</p>
          </div>
          <div className="resume-strip">
            <span className="rr-check" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
              <SIcon.learn style={{ width: 14, height: 14 }} />
            </span>
            <div className="rs-meta">
              <div className="rs-k">Resume learning</div>
              <div className="rs-v">Lesson 3 · The continue rule</div>
            </div>
            <SIcon.chev style={{ opacity: 0.6 }} />
          </div>
          <button className="dest primary">
            <span className="dest-ic">
              <SIcon.play />
            </span>
            <span className="dest-body">
              <h3>Play</h3>
              <p>Sit down at a 2–6 max table with the on-demand coach.</p>
            </span>
            <SIcon.chev className="chev" />
          </button>
          <button className="dest">
            <span className="dest-ic">
              <SIcon.learn />
            </span>
            <span className="dest-body">
              <h3>Learn the fundamentals</h3>
              <p>Six quick lessons — equity, pot odds, EV, position, ranges.</p>
            </span>
            <SIcon.chev className="chev" />
          </button>
          <button className="dest locked">
            <span className="dest-ic" style={{ color: 'var(--text-3)' }}>
              <SIcon.drills />
            </span>
            <span className="dest-body">
              <h3>Drills <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', border: '1px solid var(--line-2)', borderRadius: 5, padding: '2px 5px', marginLeft: 6 }}>Soon</span></h3>
              <p>Spaced-repetition sets that sharpen each idea. (M5)</p>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* C · play-first launch with a dismissable Learn rail over the table setup */
function PlayRailHome() {
  return (
    <div className="screen">
      <window.StatusBar />
      <div className="appbar">
        <button className="back" aria-label="Menu">
          <SIcon.menu />
        </button>
        <div className="appbar-titles">
          <div className="appbar-eyebrow">NEW GAME</div>
          <div className="appbar-title">Table setup</div>
        </div>
      </div>
      <div className="screen-body">
        <div style={{ padding: '4px 14px 14px' }}>
          <div className="learn-rail">
            <div className="lr-ic">
              <SIcon.learn />
            </div>
            <div className="lr-body">
              <h3>New here? Learn the fundamentals</h3>
              <p>Six 30-second lessons before you sit down.</p>
            </div>
            <button className="lr-close">×</button>
          </div>
        </div>
        <div className="mock-setup">
          <div className="ms-row tall" />
          <div className="ms-row" />
          <div className="ms-row" />
          <div className="ms-row" />
        </div>
      </div>
      <div className="lesson-cta">
        <button className="cta-primary">Deal in {'\u2192'}</button>
      </div>
    </div>
  );
}

Object.assign(window, { PrimerApp, PlayHome, HubHome, PlayRailHome });
