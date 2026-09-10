// Real live-gamecast-style field tracker (down/distance, ball spot, timeouts, last play) --
// requested against a generic gamecast-style reference image, not attributed to any specific
// competitor's app. The underlying data is real ESPN scoreboard data (the same site.api.espn.com
// source every other live feature in this app already uses) -- specifically each event's
// `situation` object, verified live 2026-09-09 against the actual first live game this app has
// ever seen (NE @ SEA, real kickoff week 1): down/distance/yardLine/possessionText/isRedZone/
// home&awayTimeouts/lastPlay are all real, populated fields.
//
// Deliberately does NOT copy a competitor's red/green team-colored endzones -- this app has a
// standing, explicit "no red anywhere, hierarchy through green brightness" rule (see App.css/
// index.css) that applies here too. Endzones are neutral (bg/border tones) labeled by team text,
// same "identity via text/logo, never color" convention the rest of the app already follows;
// timeouts are colored by REMAINING (accent) vs USED (muted) rather than by team, which is
// actually more informative than a fixed team-color scheme.
//
// Field-position math: ESPN's `situation.yardLine` is the CURRENT POSSESSOR's own distance to
// their opponent's end zone (verified live: it decreases play-over-play as the possessing team
// gains yards -- 79 -> 77 on a real 2-yard NE gain). It is NOT possession-relative, though --
// real-checking a SECOND live snapshot (SEA/home possessing, yardLine=10, real position "SEA
// 10") against the first (NE/away possessing, yardLine=77, real position "NE 23") together only
// make sense as one FIXED scale: yardLine = distance from the HOME team's own goal line,
// regardless of who has the ball (home goal = 0, away goal = 100). An earlier version of this
// function guessed a possession-relative formula that happened to match the first data point by
// coincidence and was real-verified wrong against the second (it placed a ball deep in a team's
// own territory near midfield instead). Away's own goal line is drawn at visual position 0 here,
// home's at 100, so ballPosition = 100 - yardLine converts the fixed ESPN scale directly.
// Direction (which way the first-down marker moves) DOES still depend on possession -- the
// possessing team always advances toward the OTHER team's goal.

function fieldPositions(situation, awayTeamId) {
  const ballPosition = 100 - situation.yardLine
  const isAwayPossessing = situation.possession === awayTeamId
  const direction = isAwayPossessing ? 1 : -1
  const firstDownPosition = Math.max(0, Math.min(100, ballPosition + direction * (situation.distance ?? 0)))
  return { ballPosition, firstDownPosition, direction }
}

function TimeoutDashes({ remaining, total = 3 }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 4,
            borderRadius: 2,
            background: i < remaining ? 'var(--accent)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  )
}

export default function FieldTracker({ game }) {
  const { away, home, awayScore, homeScore, awayId, homeId, period, clockDisplay, situation } = game
  if (!situation) return null

  const { ballPosition, firstDownPosition, direction } = fieldPositions(situation, awayId)
  const possessionIsAway = situation.possession === awayId
  const possessionIsHome = situation.possession === homeId

  return (
    <div className="field-tracker">
      <div className="field-tracker-scores">
        <div className="field-tracker-team-row">
          <span className="field-tracker-team">{away}</span>
          {possessionIsAway && <span className="field-tracker-ball">🏈</span>}
          <span className="field-tracker-score">{awayScore}</span>
        </div>
        <div className="field-tracker-team-row">
          <span className="field-tracker-team">{home}</span>
          {possessionIsHome && <span className="field-tracker-ball">🏈</span>}
          <span className="field-tracker-score">{homeScore}</span>
        </div>
      </div>

      <div className="field-tracker-clock">
        Q{period}, {clockDisplay}
      </div>

      <div className="field-tracker-situation">
        <div>
          <div className="field-tracker-downdistance">{situation.shortDownDistanceText}</div>
          <div className="meta-line" style={{ margin: 0 }}>ball on {situation.possessionText}</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <div>
            <div className="meta-line small" style={{ margin: '0 0 3px' }}>{away}</div>
            <TimeoutDashes remaining={situation.awayTimeouts ?? 0} />
          </div>
          <div>
            <div className="meta-line small" style={{ margin: '0 0 3px' }}>{home}</div>
            <TimeoutDashes remaining={situation.homeTimeouts ?? 0} />
          </div>
        </div>
      </div>
      {situation.isRedZone && <span className="tier tier-lock" style={{ marginBottom: 8, display: 'inline-block' }}>Red Zone</span>}

      <div className="field-track-wrap">
        <div className="field-endzone">{away}</div>
        <div className="field-track">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((tick) => (
            <div key={tick} className="field-tick" style={{ left: `${tick}%` }} />
          ))}
          <div className="field-firstdown-line" style={{ left: `${firstDownPosition}%` }} />
          <div
            className="field-ball-marker"
            style={{ left: `${ballPosition}%`, transform: `translateX(-50%) scaleX(${direction})` }}
          >
            &#9654;
          </div>
        </div>
        <div className="field-endzone">{home}</div>
      </div>

      {situation.lastPlay?.text && (
        <div className="field-tracker-lastplay">
          <div className="meta-line small" style={{ margin: '0 0 2px' }}>LAST PLAY</div>
          {situation.lastPlay.text}
        </div>
      )}
    </div>
  )
}
