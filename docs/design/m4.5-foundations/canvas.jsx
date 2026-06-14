/* Foundations primer — design canvas composition.
   Lays out: the interactive loop, the §5.1 nav patterns, the §5.2 learn-path
   states, and the §5.3 lesson-player states — each in a phone-sized artboard. */
const { DesignCanvas, DCSection, DCArtboard, DCPostIt } = window;
const C = window.PrimerCurriculum;
const {
  PrimerApp: APrimerApp,
  HubHome: AHubHome,
  PlayRailHome: APlayRailHome,
  LearnPath: ALearnPath,
  ReadView: AReadView,
  AskView: AAskView,
  ResultSheet: AResultSheet,
  EndOfPrimer: AEndOfPrimer,
} = window;

const L = C.LESSONS;
const byId = (id) => L.find((x) => x.id === id);
const CONT = byId('foundations-equity-vs-price'); // postflop, single spot
const POS = byId('foundations-position'); // preflop, two spots

const PHONE = { background: 'var(--bg)', borderRadius: 40 };
const noop = () => {};

/* static lesson-state composers ------------------------------------------------ */
function ReadFrame({ lesson }) {
  return <AReadView lesson={lesson} onBack={noop} onStart={noop} />;
}
function AskFrame({ lesson, spotIdx = 0 }) {
  return <AAskView lesson={lesson} spot={lesson.spots[spotIdx]} spotNo={spotIdx} onBack={noop} chosen={null} onPick={noop} />;
}
function GradedFrame({ lesson, spotIdx = 0, choice }) {
  const result = C.gradeSpot(lesson.spots[spotIdx], choice);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <AAskView lesson={lesson} spot={lesson.spots[spotIdx]} spotNo={spotIdx} onBack={noop} chosen={choice} onPick={noop} />
      <AResultSheet result={result} open={true} ctaLabel={result ? (result.correct ? 'Next \u2192' : 'Next \u2192') : ''} onContinue={noop} />
    </div>
  );
}

function Canvas() {
  return (
    <DesignCanvas>
      {/* ---------------------------------------------------------------- */}
      <DCSection
        id="interactive"
        title="▶ Play the whole loop"
        subtitle="Live prototype — tap the resume node, read, answer, see the graded result. All six lessons play for real."
      >
        <DCArtboard id="app" label="Interactive · Learn → lesson → graded → end" width={390} height={844} style={PHONE}>
          <APrimerApp />
        </DCArtboard>
        <DCPostIt top={40} left={470} rotate={2} width={210}>
          Data-driven from the real @holdem/curriculum content. Progress persists; the ↻ button restarts.
        </DCPostIt>
      </DCSection>

      {/* ---------------------------------------------------------------- */}
      <DCSection
        id="nav"
        title="Navigation — §5.1"
        subtitle="Three ways in, scaling to Play / Learn / Drills. Recommendation: A."
      >
        <DCArtboard id="nav-a" label="A · Bottom tab bar  ★ recommended" width={390} height={844} style={PHONE}>
          <ALearnPath lessons={L} progress={2} onOpen={noop} onNav={noop} />
        </DCArtboard>
        <DCArtboard id="nav-b" label="B · Home hub (return-to-menu)" width={390} height={844} style={PHONE}>
          <AHubHome />
        </DCArtboard>
        <DCArtboard id="nav-c" label="C · Play-first + Learn rail" width={390} height={844} style={PHONE}>
          <APlayRailHome />
        </DCArtboard>
        <DCPostIt top={40} left={1240} rotate={-2} width={220}>
          A scales cleanly to a 3rd destination (Drills, M5), is phone-native, and keeps Learn one tap from anywhere.
        </DCPostIt>
      </DCSection>

      {/* ---------------------------------------------------------------- */}
      <DCSection
        id="path"
        title="Learn path — §5.2"
        subtitle="A light game-like vertical path: done ✓ / current (pulsing) / locked, with a resume affordance."
      >
        <DCArtboard id="path-fresh" label="Fresh · 0 of 6 (Start here)" width={390} height={1120} style={PHONE}>
          <ALearnPath lessons={L} progress={0} onOpen={noop} onNav={noop} />
        </DCArtboard>
        <DCArtboard id="path-mid" label="In progress · 2 of 6 (Resume here)" width={390} height={1120} style={PHONE}>
          <ALearnPath lessons={L} progress={2} onOpen={noop} onNav={noop} />
        </DCArtboard>
        <DCArtboard id="path-done" label="Complete · 6 of 6" width={390} height={1120} style={PHONE}>
          <ALearnPath lessons={L} progress={6} onOpen={noop} onNav={noop} />
        </DCArtboard>
      </DCSection>

      {/* ---------------------------------------------------------------- */}
      <DCSection
        id="player"
        title="Lesson player — §5.3 states"
        subtitle="read → ask → graded. The graded sheet is a sibling of the table's coach drawer (slim metric row)."
      >
        <DCArtboard id="read" label="1 · Read (the ~30s teach)" width={390} height={844} style={PHONE}>
          <ReadFrame lesson={CONT} />
        </DCArtboard>
        <DCArtboard id="ask-post" label="2 · Ask · postflop (coach-graded)" width={390} height={844} style={PHONE}>
          <AskFrame lesson={CONT} spotIdx={0} />
        </DCArtboard>
        <DCArtboard id="graded-right" label="3 · Graded · correct ✓" width={390} height={844} style={PHONE}>
          <GradedFrame lesson={CONT} spotIdx={0} choice={0} />
        </DCArtboard>
        <DCArtboard id="graded-leak" label="4 · Graded · leak (encouraging)" width={390} height={844} style={PHONE}>
          <GradedFrame lesson={CONT} spotIdx={0} choice={1} />
        </DCArtboard>
        <DCArtboard id="ask-pre" label="5 · Ask · preflop (chart-graded)" width={390} height={844} style={PHONE}>
          <AskFrame lesson={POS} spotIdx={0} />
        </DCArtboard>
        <DCArtboard id="graded-pre" label="6 · Graded · preflop (no metrics)" width={390} height={844} style={PHONE}>
          <GradedFrame lesson={POS} spotIdx={0} choice={0} />
        </DCArtboard>
        <DCArtboard id="graded-pre-leak" label="7 · Graded · preflop leak" width={390} height={844} style={PHONE}>
          <GradedFrame lesson={POS} spotIdx={1} choice={0} />
        </DCArtboard>
        <DCArtboard id="end" label="8 · End-of-primer hand-off" width={390} height={844} style={PHONE}>
          <AEndOfPrimer lessons={L} onBack={noop} onPlay={noop} />
        </DCArtboard>
        <DCPostIt top={40} left={3230} rotate={2} width={210}>
          Wrong answers stay warm — "Close one" + the correct line, never "WRONG". The right choice lights green.
        </DCPostIt>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Canvas />);
