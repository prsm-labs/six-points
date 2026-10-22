import { useState } from 'react'

// 🏈 Game Tracker (2026-10-22, user: Slap Shot's rink tracker for Six Points) -- a field drawn from ESPN's drive-by-drive
// play-by-play (api/summary.js `track`). The ball sits on the spot where the last play ended, the current drive is the
// band from where it started, the blue line is the line of scrimmage and the gold line the first-down marker. The AWAY
// team's end zone is on the left and the HOME team's on the right (same as the Themes field tracker), so the away team
// attacks to the right. Tap a play to see where it started and ended. It moves play to play with ESPN's feed
// (refreshed with the box score), not continuously, and runs a little behind the broadcast.
//
// Field position: ESPN's play `yardLine` is a fixed scale -- distance from the HOME team's goal line (checked
// 2026-10-22 on WSH @ SF: "WSH 43" = 57, "SF 36" = 36). Drawn position from the left goal line = 100 - yardLine.

const FIELD = '#2f6b3a', FIELD2 = '#2a6234', LINE = 'rgba(255,255,255,.75)', ZONE = '#24502c'
const BALL = '#7a4a22', LOS = '#4aa3df', FIRST = '#e8c547'
const X = (pos) => 10 + pos                       // 0..100 field position -> 10..110 in the drawing
const posOf = (spot) => (spot?.yardLine == null ? null : Math.max(0, Math.min(100, 100 - spot.yardLine)))
const QL = (q) => (q > 4 ? 'OT' : `Q${q}`)

function Field({ track, focus, clockText }) {
  const { away, home, plays, drives } = track
  const located = plays.filter((p) => posOf(p.end) != null || posOf(p.start) != null)
  const last = located[located.length - 1]
  const cur = focus || last
  const drive = cur ? drives[cur.drive] : null
  const ballPos = focus ? posOf(focus.start) : posOf(last?.end) ?? posOf(last?.start)
  const endPos = focus ? posOf(focus.end) : null
  // attack direction of the team with the ball: away attacks right (+1), home left (-1)
  const offSide = (focus ? focus.start?.side : last?.end?.side) || cur?.side
  const dir = offSide === 'home' ? -1 : 1
  const spot = focus ? focus.start : last?.end
  const firstPos = spot?.down && spot?.dist != null && ballPos != null ? Math.max(0, Math.min(100, ballPos + dir * spot.dist)) : null
  const driveStart = !focus && drive ? posOf({ yardLine: drive.start }) : null
  const H = 53.3
  return (
    <svg viewBox="-2 -9 124 70" style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }} role="img"
      aria-label={drive ? `${drive.team} drive` : 'Field'}>
      <rect x={0} y={0} width={120} height={H} fill={FIELD} rx={1} />
      {[...Array(10)].map((_, i) => <rect key={i} x={X(i * 10)} y={0} width={5} height={H} fill={FIELD2} />)}
      <rect x={0} y={0} width={10} height={H} fill={ZONE} />
      <rect x={110} y={0} width={10} height={H} fill={ZONE} />
      <text x={5} y={H / 2} textAnchor="middle" dominantBaseline="middle" fontSize="5" fontWeight="800" fill="rgba(255,255,255,.55)" transform={`rotate(-90 5 ${H / 2})`} fontFamily="Inter,sans-serif">{away}</text>
      <text x={115} y={H / 2} textAnchor="middle" dominantBaseline="middle" fontSize="5" fontWeight="800" fill="rgba(255,255,255,.55)" transform={`rotate(90 115 ${H / 2})`} fontFamily="Inter,sans-serif">{home}</text>
      {[...Array(21)].map((_, i) => <line key={i} x1={X(i * 5)} x2={X(i * 5)} y1={0} y2={H} stroke={LINE} strokeWidth={i % 2 ? 0.15 : 0.35} />)}
      {[...Array(99)].map((_, i) => (i + 1) % 5 ? (
        <g key={i}>
          <line x1={X(i + 1)} x2={X(i + 1)} y1={22.6} y2={23.4} stroke={LINE} strokeWidth=".15" />
          <line x1={X(i + 1)} x2={X(i + 1)} y1={29.9} y2={30.7} stroke={LINE} strokeWidth=".15" />
        </g>
      ) : null)}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => (
        <g key={p} fontSize="3.4" fill="rgba(255,255,255,.7)" fontFamily="Inter,sans-serif" fontWeight="700" textAnchor="middle">
          <text x={X(p)} y={H - 5}>{p <= 50 ? p : 100 - p}</text>
          <text x={X(p)} y={7.5} transform={`rotate(180 ${X(p)} 6.3)`}>{p <= 50 ? p : 100 - p}</text>
        </g>
      ))}
      {driveStart != null && ballPos != null && (
        <rect x={X(Math.min(driveStart, ballPos))} y={18} width={Math.abs(ballPos - driveStart)} height={17.3} fill="rgba(255,255,255,.14)" />
      )}
      {endPos != null && ballPos != null && (
        <g>
          <line x1={X(ballPos)} x2={X(endPos)} y1={H / 2} y2={H / 2} stroke="#fff" strokeWidth=".6" strokeDasharray="1.2 .8" />
          <circle cx={X(endPos)} cy={H / 2} r={1} fill="#fff" />
        </g>
      )}
      {ballPos != null && <line x1={X(ballPos)} x2={X(ballPos)} y1={0} y2={H} stroke={LOS} strokeWidth=".6" />}
      {firstPos != null && <line x1={X(firstPos)} x2={X(firstPos)} y1={0} y2={H} stroke={FIRST} strokeWidth=".6" />}
      {ballPos != null && (
        <g>
          <ellipse cx={X(ballPos)} cy={H / 2} rx="2.4" ry="1.5" fill="none" stroke="#fff" strokeWidth=".4">
            <animate attributeName="rx" values="2;4.5;2" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="ry" values="1.3;3;1.3" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values=".9;0;.9" dur="1.8s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={X(ballPos)} cy={H / 2} rx="1.9" ry="1.15" fill={BALL} stroke="#3b2210" strokeWidth=".25" />
          <line x1={X(ballPos) - 0.8} x2={X(ballPos) + 0.8} y1={H / 2} y2={H / 2} stroke="#fff" strokeWidth=".2" />
          <text x={X(ballPos) + dir * 4} y={H / 2 + 1.2} textAnchor="middle" fontSize="3.5" fill="#fff">{dir > 0 ? '▶' : '◀'}</text>
        </g>
      )}
      {clockText && (
        <g>
          <rect x={60 - 18} y={-8.4} width={36} height={6} rx={3} fill="#10151b" />
          <text x={60} y={-4.3} textAnchor="middle" fontSize="3.2" fill="#fff" fontFamily="'Share Tech Mono',monospace">{clockText}</text>
        </g>
      )}
      <text x={0} y={H + 5} fontSize="2.8" fill="var(--muted)" fontFamily="'Share Tech Mono',monospace">{away} attacks this way ▶</text>
      <text x={120} y={H + 5} textAnchor="end" fontSize="2.8" fill="var(--muted)" fontFamily="'Share Tech Mono',monospace">◀ {home} attacks this way</text>
    </svg>
  )
}

export default function FieldGameTracker({ detail }) {
  const [focusId, setFocusId] = useState(null)
  const track = detail?.track
  if (!track || !track.plays?.length) return <p className="meta-line">Play-by-play isn't available for this game yet.</p>
  const st = detail.status
  const live = st?.state === 'in'
  const focus = focusId ? track.plays.find((p) => p.id === focusId) : null
  const last = track.plays[track.plays.length - 1]
  const drive = track.drives[(focus || last).drive]
  const clockText = live ? (st.detail || '').replace(' - ', ' | ') : st?.state === 'post' ? 'FINAL' : ''
  const spot = focus ? focus.start : last.end
  const recent = [...track.plays].reverse().slice(0, 60)
  return (
    <div style={{ marginTop: 8 }}>
      <Field track={track} focus={focus} clockText={clockText} />
      <div className="meta-line" style={{ textAlign: 'center', margin: '6px 0 0' }}>
        {spot?.dd && <b style={{ color: 'var(--fg)' }}>{spot.dd} · </b>}
        <span>{focus ? 'Showing' : 'Last play'} · {QL(focus?.period || last.period)} {(focus || last).clock} · </span>
        <b style={{ color: 'var(--fg)' }}>{(focus || last).team} </b>{(focus || last).text}
        {focus && <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => setFocusId(null)}>back to live</button>}
      </div>
      {drive && (
        <div className="meta-line small" style={{ textAlign: 'center', margin: '2px 0 0' }}>
          {drive.team} drive{drive.startText ? ` from ${drive.startText}` : ''}{drive.description ? ` · ${drive.description}` : ''}{drive.result ? ` · ${drive.result}` : ''}
        </div>
      )}
      <div className="meta-line small" style={{ margin: '12px 0 4px' }}>RECENT PLAYS (tap one to see where it started and ended)</div>
      <div className="card" style={{ maxHeight: 320, overflowY: 'auto', padding: 0 }}>
        {recent.map((p) => {
          const has = posOf(p.start) != null
          const active = focusId === p.id
          return (
            <div key={p.id} onClick={() => has && setFocusId(active ? null : p.id)}
              style={{ display: 'flex', gap: 8, fontSize: '0.8rem', padding: '5px 10px', borderBottom: '1px solid var(--border)',
                cursor: has ? 'pointer' : 'default', fontWeight: p.scoring ? 700 : 400,
                background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : p.scoring ? 'color-mix(in srgb, var(--gold) 12%, transparent)' : undefined }}>
              <span className="meta-line small" style={{ margin: 0, minWidth: 64 }}>{QL(p.period)} {p.clock}</span>
              <span style={{ minWidth: 36, fontWeight: 700 }}>{p.team}</span>
              <span style={{ flex: 1 }}>{p.start?.dd ? <span className="meta-line small" style={{ margin: 0 }}>{p.start.dd} · </span> : null}{p.text}</span>
            </div>
          )
        })}
      </div>
      <p className="meta-line small">From ESPN's play-by-play, refreshed with the box score while the game is live -- it jumps play to play and runs a
        little behind the broadcast. Blue = line of scrimmage, gold = first-down marker, light band = the current drive. {track.away} (away) attacks
        to the right, {track.home} (home) to the left.</p>
    </div>
  )
}
