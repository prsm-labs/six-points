import { useEffect, useMemo, useState } from 'react'
import { useSlate } from './slate.js'
import { LADDER_BANDS, ladderPrice, teamLadder } from './ladder.js'
import { booksText, edgeClass, fmtAmerican, fmtEdge } from './bookOdds.js'
import { BestPriceLink, StatePicker } from './BetLink.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import { defRankText, fmtPct, GradeBadge, LiveStatusTag } from './gradeUi.jsx'
import { DepthTag, RoleChip } from './matchupUi.jsx'
import { HotHandTag } from './revampUi.jsx'
import { matchesPosition, usePosition } from './positionFilter.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'

// 🪜 Game Ladder (Slap Shot's tabs/LadderTab.jsx, 2026-10-18 revamp) -- one card per game, each team's anytime-TD
// picks from favorite to super-deep longshot (ladder.js). TD % = the same grade model used everywhere else.
function kickLabel(g) {
  if (!g) return ''
  const d = new Date(`${g.gameday}T12:00:00`)
  const [h, m] = (g.gametime || '0:0').split(':').map(Number)
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`
}

function PickLine({ m, alt }) {
  const price = ladderPrice(m)
  return (
    <div className={alt ? 'ladder-line alt' : 'ladder-line'}>
      <PlayerAvatar playerId={m.player_id} name={m.player_name} />
      <div className="ladder-line-main">
        <div className="ladder-name">
          <span className="player-cell" onClick={() => openPlayerSlide(m)}>{m.player_name}</span>
          <span className="meta-line small"> {m.position}</span><DepthTag m={m} /> <HotHandTag m={m} /> <RoleChip m={m} /> <LiveStatusTag m={m} />
        </div>
        <div className="ladder-stats">
          <b>{fmtPct(m.p_td, 1)}</b>{' '}
          <span title={m.book ? booksText(m.book) : 'No sportsbook price yet — banded by our fair price'}>
            {price?.priced ? <BestPriceLink book={m.book} /> : <span className="meta-line small">fair {fmtAmerican(price?.am)}</span>}
          </span>
          {m.edge != null && <span className={edgeClass(m.edge)}> {fmtEdge(m.edge)}</span>}
        </div>
      </div>
      {!alt && <GradeBadge grade={m.grade} m={m} />}
      {!alt && <PickButton player={m} compact />}
    </div>
  )
}

function TeamSide({ team, opp, players }) {
  const ladder = useMemo(() => teamLadder(players), [players])
  const any = players.find((m) => m.def_rank)
  return (
    <div className="ladder-side">
      <div className="ladder-side-head">
        <b>{team}</b> <span className="meta-line small">vs {opp}</span>
        {any && (
          <span className={`meta-line small ${any.def_tier === 'soft' ? 'edge-value' : ''}`} title="Opponent's TDs allowed among this week's defenses — the defense factor in every TD %">
            {' '}· {defRankText(any)}
          </span>
        )}
      </div>
      {ladder.bands.map((b) => (
        <div key={b.key} className="ladder-band">
          <div className={`ladder-band-label ${b.key === 'fav' ? 'fav' : ''}`} title={b.title}>{b.short}</div>
          <div>
            {b.pick ? <PickLine m={b.pick} /> : <span className="meta-line small">Nobody in this band</span>}
            {b.alts.length > 0 && <div className="ladder-alts">{b.alts.map((a) => <PickLine key={a.player_id} m={a} alt />)}</div>}
          </div>
        </div>
      ))}
      <div className="ladder-band">
        <div className="ladder-band-label" title="Best value on the team not already shown above">HM</div>
        <div>{ladder.honorable ? <PickLine m={ladder.honorable} /> : <span className="meta-line small">—</span>}</div>
      </div>
    </div>
  )
}

export default function LadderTab() {
  const slate = useSlate()
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const [sched, setSched] = useState(null)
  useEffect(() => {
    fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).then(setSched).catch(() => setSched(null))
  }, [])

  const games = useMemo(() => {
    if (!slate?.matchups) return []
    const players = slate.matchups.filter((m) => matchesPosition(m.position, position))
    const wk = (sched?.games || []).filter((g) => g.week === slate.week)
    const pairs = wk.length
      ? wk.map((g) => ({ away: g.away_team, home: g.home_team, g }))
      : [...new Set(slate.matchups.map((m) => [m.team, m.opponent].sort().join('@')))].map((k) => ({ away: k.split('@')[0], home: k.split('@')[1] }))
    return pairs
      .filter((p) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, p.away) || isInSelectedMatchup(selectedMatchup, p.home))
      .map((p) => ({ ...p, sides: [p.away, p.home].map((t) => ({ team: t, opp: t === p.away ? p.home : p.away, list: players.filter((m) => m.team === t) })) }))
      .filter((p) => p.sides.some((s) => s.list.length))
      .sort((a, b) => `${a.g?.gameday}${a.g?.gametime}`.localeCompare(`${b.g?.gameday}${b.g?.gametime}`))
  }, [slate, sched, position, selectedMatchup])

  if (!slate) return <p className="empty-state">Loading…</p>
  return (
    <div>
      <div className="note">
        🪜 <b>Game Ladder</b> — each team's anytime-TD picks from favorite to super-deep longshot, banded by the best sportsbook
        price ({LADDER_BANDS.map((b) => `${b.short} ${b.title.replace('Best price ', '')}`).join(' · ')}). Inside a band the pick is
        the best value — our TD % minus the book's implied % — with the next two below it. HM = best value left on the team.
        No price yet = banded by our fair price. The defense line is context: the TD % already includes the opponent's TD defense.
      </div>
      <MatchupFilterNote />
      <div className="toolbar-row"><StatePicker /></div>
      {games.length === 0 ? <p className="empty-state">No games with these filters.</p> : games.map((g) => (
        <div key={`${g.away}@${g.home}`} className="ladder-game">
          <div className="ladder-game-head">{g.away} @ {g.home} <span className="meta-line small">{kickLabel(g.g)}</span></div>
          <div className="ladder-grid">
            {g.sides.map((s) => <TeamSide key={s.team} team={s.team} opp={s.opp} players={s.list} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
