import { useMemo, useState, useEffect, useRef } from 'react'
import { resolveEventIds } from './espnGameResolver.js'
import { openTeamSlide, openPlayerSlide } from './slideouts.js'
import { usePlayerDirectory } from './PlayerDirectory.jsx'
import { useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import LiveProjection from './LiveProjection.jsx'

// Real box scores via ESPN's summary API. The week's games are a lightweight, always-visible
// list (scores already live in season_schedule.json, no ESPN call needed just to show them) --
// selecting one resolves its real ESPN event id and fetches its full detail (team box score,
// player/position box score, real play-by-play) on demand, not all 16 games at page load.
//
// 2026-09-09: fixed a real bug found the first time this ran against a genuinely live game
// (NE @ SEA week 1) -- a selected game's detail was fetched ONCE and cached forever, so a live
// box score silently froze at whatever quarter it was first opened in. Now, while a selected
// game's status.state is not 'post', its detail is re-fetched on an interval and an "updated at"
// line is shown so any staleness is visible rather than silent.

const LIVE_BOXSCORE_POLL_MS = 25000

const CATEGORY_LABELS = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  fumbles: 'Fumbles',
  defensive: 'Defensive',
  interceptions: 'Interceptions',
  kickReturns: 'Kick Returns',
  puntReturns: 'Punt Returns',
  kicking: 'Kicking',
  punting: 'Punting',
}

async function fetchGameDetail(eventId) {
  const proxied = await fetch(`/api/summary?event=${eventId}&full=1`).catch(() => null)
  if (proxied && proxied.ok) {
    const data = await proxied.json()
    if (data.boxscore || data.status) return  /* 2026-10-20: pre-game too (lineups) */ { boxscore: data.boxscore, drives: data.drives || [], status: data.status || null, score: data.score || null, injuries: data.injuries || [], fetchedAt: Date.now() }
  }
  const direct = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`
  )
  const data = await direct.json()
  const drives = (data.drives?.previous || []).map((d) => ({
    team: d.team?.abbreviation || '',
    description: d.description || '',
    result: d.result || '',
    displayResult: d.displayResult || '',
    isScore: !!d.isScore,
    plays: (d.plays || []).map((p) => ({
      text: p.text || '',
      period: p.period?.number ?? null,
      clock: p.clock?.displayValue || '',
      scoringPlay: !!p.scoringPlay,
    })),
  }))
  const headerComp = data.header?.competitions?.[0]
  const st = headerComp?.status?.type
  const status = st ? { state: st.state || null, detail: st.detail || st.shortDetail || null, completed: !!st.completed } : null
  const score = {}
  for (const c of headerComp?.competitors || []) {
    if (c.homeAway) score[c.homeAway] = c.score
  }
  return { boxscore: data.boxscore, drives, status, score: Object.keys(score).length ? score : null, fetchedAt: Date.now() }
}

// Live heat on the box score itself (PROMPT_SixPoints_MirrorSlapShot.md §4) -- the same rules
// as Live > Heating Up (useLiveUsage.js): "high usage" = top 35% of touches (carries + targets),
// On Fire = high usage + a TD, Heating Up = high usage + touches rose since the previous poll.
// Computed within the one game being viewed, and only while it's live.
const HIGH_USAGE_PERCENTILE = 0.65

function statOf(cat, athleteId, label) {
  const idx = cat?.labels?.indexOf(label) ?? -1
  if (idx === -1) return 0
  const a = cat.athletes.find((x) => x.athlete?.id === athleteId)
  const n = Number(a?.stats?.[idx])
  return Number.isFinite(n) ? n : 0
}

function boxTouches(boxscore) {
  const out = new Map()
  for (const teamEntry of boxscore?.players || []) {
    const rushing = teamEntry.statistics?.find((c) => c.name === 'rushing')
    const receiving = teamEntry.statistics?.find((c) => c.name === 'receiving')
    const ids = new Set()
    for (const cat of [rushing, receiving]) for (const a of cat?.athletes || []) if (a.athlete?.id) ids.add(a.athlete.id)
    for (const id of ids) {
      out.set(id, {
        touches: statOf(rushing, id, 'CAR') + statOf(receiving, id, 'TGTS'),
        tds: statOf(rushing, id, 'TD') + statOf(receiving, id, 'TD'),
      })
    }
  }
  return out
}

function heatMap(boxscore, prevTouches) {
  const cur = boxTouches(boxscore)
  const withTouches = [...cur.entries()].filter(([, v]) => v.touches > 0).sort((a, b) => b[1].touches - a[1].touches)
  const cutIdx = Math.max(0, Math.ceil(withTouches.length * (1 - HIGH_USAGE_PERCENTILE)) - 1)
  const threshold = withTouches[cutIdx]?.[1].touches ?? Infinity
  const heat = new Map()
  for (const [id, v] of withTouches) {
    if (v.touches < threshold) continue
    const prev = prevTouches?.get(id)
    if (v.tds >= 1) heat.set(id, 'fire')
    else if (prev != null && v.touches > prev) heat.set(id, 'heat')
  }
  return { heat, touches: new Map([...cur.entries()].map(([id, v]) => [id, v.touches])) }
}

function HeatTag({ kind }) {
  if (kind === 'fire') return <span className="heat-tag fire" title="On Fire: high usage in this game and a TD">🔥 On Fire</span>
  if (kind === 'heat') return <span className="heat-tag" title="Heating Up: high usage and touches rising since the last update">▲ Heating Up</span>
  return null
}

function PlayerBoxCategory({ category, espnIdToPlayer, team, heat }) {
  if (!category.athletes || category.athletes.length === 0) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '0 0 4px' }}>
        {CATEGORY_LABELS[category.name] || category.name}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Player</th>
              {category.labels.map((l, i) => (
                <th key={i}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {category.athletes.map((a, i) => {
              const match = espnIdToPlayer.get(a.athlete?.id)
              const hot = heat?.get(a.athlete?.id)
              return (
                <tr key={i} className={hot ? `heat-row ${hot}` : undefined}>
                  <td className="sticky-col">
                    {match ? (
                      <button
                        className="team-link"
                        onClick={() =>
                          openPlayerSlide({
                            player_id: match.playerId,
                            player_name: match.name,
                            team,
                            position: match.position,
                          })
                        }
                      >
                        {a.athlete?.displayName}
                      </button>
                    ) : (
                      a.athlete?.displayName
                    )}
                    {hot && <> <HeatTag kind={hot} /></>}
                  </td>
                  {a.stats.map((s, j) => (
                    <td key={j}>{s}</td>
                  ))}
                </tr>
              )
            })}
            {category.totals && (
              <tr style={{ fontWeight: 700 }}>
                <td className="sticky-col">Total</td>
                {category.totals.map((s, j) => (
                  <td key={j}>{s}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlayerBoxTables({ boxscore, espnIdToPlayer, espnAbbrToNflverse, heat }) {
  if (!boxscore?.players) return null

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 6 }}>
      {boxscore.players.map((teamEntry, i) => {
        const espnAbbr = teamEntry.team?.abbreviation?.toUpperCase()
        const nflverseAbbr = espnAbbrToNflverse.get(espnAbbr) || espnAbbr
        return (
          <div key={i} style={{ flex: '1 1 360px', minWidth: 300 }}>
            <button className="team-link" style={{ fontWeight: 800 }} onClick={() => openTeamSlide({ team: nflverseAbbr })}>
              {nflverseAbbr}
            </button>
            {teamEntry.statistics.map((cat) => (
              <PlayerBoxCategory key={cat.name} category={cat} espnIdToPlayer={espnIdToPlayer} team={nflverseAbbr} heat={heat} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function PlayByPlay({ drives, espnAbbrToNflverse }) {
  if (!drives || drives.length === 0) {
    return <p className="empty-state" style={{ margin: '8px 0 0' }}>No play-by-play available for this game.</p>
  }

  return (
    <div style={{ marginTop: 10 }}>
      {drives.map((d, i) => {
        const nflverseAbbr = espnAbbrToNflverse.get(d.team.toUpperCase()) || d.team
        return (
          <div
            key={i}
            style={{
              marginBottom: 12,
              paddingLeft: 10,
              borderLeft: `3px solid ${d.isScore ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              <button className="team-link" onClick={() => openTeamSlide({ team: nflverseAbbr })}>
                {nflverseAbbr}
              </button>{' '}
              &middot; {d.displayResult}{' '}
              <span className="meta-line" style={{ margin: 0 }}>({d.description})</span>
            </div>
            <div style={{ marginTop: 4 }}>
              {d.plays.map((p, j) => (
                <div
                  key={j}
                  className="meta-line"
                  style={{
                    margin: '2px 0',
                    color: p.scoringPlay ? 'var(--accent)' : undefined,
                    fontWeight: p.scoringPlay ? 700 : 400,
                  }}
                >
                  Q{p.period} {p.clock} &mdash; {p.text}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 2026-10-20 Lineups (user: tap a game -> both teams' lineups): the projected starters from the ESPN depth chart the
// daily refresh pulls (depth_charts.json, injured reserve / out players skipped to the next man up) plus ESPN's game
// injury list -- the NFL posts inactives about 90 minutes before kickoff, and they show here once ESPN has them.
const OFFENSE = [['QB', 1], ['RB', 1], ['WR', 3], ['TE', 1], ['LT', 1], ['LG', 1], ['C', 1], ['RG', 1], ['RT', 1]]
const DEFENSE = ['LDE', 'LDT', 'DT', 'NT', 'RDT', 'RDE', 'WLB', 'LILB', 'MLB', 'RILB', 'SLB', 'LOLB', 'ROLB', 'LCB', 'NB', 'RCB', 'SS', 'FS']
const GONE = /injured reserve|out|suspend|pup|physically|non-football|practice squad|released|inactive/i
function starters(depth, team, outNames = new Set()) {
  const t = depth?.teams?.[team]
  if (!t) return null
  const pick = (pos, n) => (t[pos] || []).filter((p) => p.pos_rank != null && !GONE.test(p.status || '') && !outNames.has(p.name)).sort((a, b) => a.pos_rank - b.pos_rank).slice(0, n)
  return {
    offense: OFFENSE.flatMap(([pos, n]) => pick(pos, n).map((p, i) => ({ ...p, slot: n > 1 ? `${pos}${i + 1}` : pos }))),
    defense: DEFENSE.flatMap((pos) => pick(pos, 1).map((p) => ({ ...p, slot: pos }))),
  }
}
function Lineups({ game, detail, depth, espnAbbrToNflverse }) {
  const inj = new Map()
  for (const t of detail?.injuries || []) inj.set(espnAbbrToNflverse.get(String(t.team).toUpperCase()) || t.team, t.injuries || [])
  const injByName = (team) => new Map((inj.get(team) || []).map((i) => [i.name, i]))
  if (!depth) return <p className="empty-state">Loading depth charts...</p>
  return (
    <div className="lineup-grid">
      {[game.away_team, game.home_team].map((team) => {
        const s = starters(depth, team, new Set((inj.get(team) || []).filter((i) => /^out$|inactive/i.test(i.status)).map((i) => i.name)))
        const ib = injByName(team)
        const out = (inj.get(team) || []).filter((i) => /out|doubtful|questionable|inactive/i.test(i.status))
        const row = (p) => {
          const i = ib.get(p.name)
          return (
            <div key={`${p.slot}-${p.player_id}`} className="lineup-row">
              <span className="lineup-slot">{p.slot}</span>
              <button className="team-link" onClick={() => openPlayerSlide({ player_id: p.player_id, player_name: p.name, team, position: p.pos_abb })}>{p.name}</button>
              {(i?.status || p.status) && <span className="lineup-status">{i?.status || p.status}</span>}
            </div>
          )
        }
        return (
          <div key={team} className="lineup-team">
            <h4><button className="team-link" onClick={() => openTeamSlide({ team })}>{team}</button></h4>
            {!s ? <p className="meta-line small">No depth chart for {team}.</p> : (
              <>
                <div className="lineup-head">Offense</div>
                {s.offense.map(row)}
                <div className="lineup-head">Defense</div>
                {s.defense.map(row)}
              </>
            )}
            <div className="lineup-head">Injury report / inactives (ESPN)</div>
            {out.length ? out.map((i) => (
              <div key={i.name} className="lineup-row"><span className="lineup-slot">{i.position}</span><span>{i.name}</span><span className="lineup-status">{i.status}{i.detail ? ` · ${i.detail}` : ''}</span></div>
            )) : <p className="meta-line small" style={{ margin: 0 }}>None listed.</p>}
          </div>
        )
      })}
    </div>
  )
}

function GameDetail({ game, detail, loading, espnIdToPlayer, espnAbbrToNflverse, heat, depth }) {
  const [showPlayers, setShowPlayers] = useState(false)
  const [showPlays, setShowPlays] = useState(false)
  const [showLineups, setShowLineups] = useState(false)
  const [showProj, setShowProj] = useState(false)  // 2026-10-20 📈 Live projection

  if (loading) return <p className="empty-state" style={{ margin: '10px 0 0' }}>Loading box score...</p>
  const pre = !detail || detail.status?.state === 'pre' || !detail.boxscore?.teams?.[0]?.statistics?.length
  if (pre) {
    return (
      <div style={{ marginTop: 10 }}>
        <p className="meta-line small" style={{ marginTop: 0 }}>{detail?.status?.detail || 'Not started'} · lineups below; the box score appears at kickoff.</p>
        <Lineups game={game} detail={detail} depth={depth} espnAbbrToNflverse={espnAbbrToNflverse} />
      </div>
    )
  }

  const { boxscore, drives } = detail
  const [away, home] = boxscore.teams
  const statRows = away.statistics.map((s, i) => ({
    label: s.label,
    away: s.displayValue,
    home: home.statistics[i]?.displayValue ?? '—',
  }))
  const isLive = detail.status && detail.status.state !== 'post'

  return (
    <div style={{ marginTop: 10 }}>
      {detail.status && (
        <p className="meta-line small" style={{ marginTop: 0 }}>
          {detail.status.detail || (isLive ? 'In progress' : 'Final')}
          {isLive && ' · auto-updating every 25s'}
          {detail.fetchedAt && ` · updated ${new Date(detail.fetchedAt).toLocaleTimeString()}`}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <button className="team-link" onClick={() => openTeamSlide({ team: game.away_team })}>
                  {game.away_team}
                </button>
              </th>
              <th></th>
              <th>
                <button className="team-link" onClick={() => openTeamSlide({ team: game.home_team })}>
                  {game.home_team}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {statRows.map((r, i) => (
              <tr key={i}>
                <td>{r.away}</td>
                <td className="meta-line" style={{ margin: 0, textAlign: 'center' }}>{r.label}</td>
                <td>{r.home}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowProj((v) => !v)}>
          {showProj ? 'Hide live projection ▲' : '📈 Show live projection ▼'}
        </button>
        {boxscore.players && (
          <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowPlayers((v) => !v)}>
            {showPlayers ? 'Hide player box score ▲' : 'Show player box score ▼'}
          </button>
        )}
        <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowPlays((v) => !v)}>
          {showPlays ? 'Hide play-by-play ▲' : 'Show play-by-play ▼'}
        </button>
        <button className="team-link" style={{ fontSize: '0.82rem', fontWeight: 700 }} onClick={() => setShowLineups((v) => !v)}>
          {showLineups ? 'Hide lineups ▲' : 'Show lineups ▼'}
        </button>
      </div>
      {showProj && <LiveProjection game={game} detail={detail} espnIdToPlayer={espnIdToPlayer} espnAbbrToNflverse={espnAbbrToNflverse} />}
      {showLineups && <Lineups game={game} detail={detail} depth={depth} espnAbbrToNflverse={espnAbbrToNflverse} />}

      {showPlayers && (
        <PlayerBoxTables boxscore={boxscore} espnIdToPlayer={espnIdToPlayer} espnAbbrToNflverse={espnAbbrToNflverse} heat={heat} />
      )}
      {showPlays && <PlayByPlay drives={drives} espnAbbrToNflverse={espnAbbrToNflverse} />}
    </div>
  )
}

function GameRow({ game, selected, onSelect, detail, loading, espnIdToPlayer, espnAbbrToNflverse, heat, depth }) {
  // Prefer the live score off the fetched detail -- season_schedule.json's score is stale for a
  // game that's still in progress (and absent entirely for one that hasn't kicked off).
  const liveAway = detail?.score?.away
  const liveHome = detail?.score?.home
  const awayScore = liveAway != null ? liveAway : game.away_score
  const homeScore = liveHome != null ? liveHome : game.home_score
  const statusText =
    detail?.status?.detail ||
    (detail?.status && detail.status.state !== 'post' ? 'In progress' : game.gameday)
  return (
    <div className="weather-card">
      <button
        onClick={onSelect}
        style={{
          all: 'unset',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        <div>
          <strong>{game.away_team}</strong> {awayScore} @ <strong>{game.home_team}</strong> {homeScore}
        </div>
        <div className="meta-line" style={{ margin: 0 }}>
          {statusText} {selected ? '▲' : '▼'}
        </div>
      </button>
      {selected && (
        <GameDetail
          game={game}
          detail={detail}
          loading={loading}
          espnIdToPlayer={espnIdToPlayer}
          espnAbbrToNflverse={espnAbbrToNflverse}
          heat={heat}
          depth={depth}
        />
      )}
    </div>
  )
}

export default function BoxScoreTab() {
  const [schedule, setSchedule] = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [details, setDetails] = useState({})
  const [eventIdByGame, setEventIdByGame] = useState({})
  const [loadingGameId, setLoadingGameId] = useState(null)
  const [error, setError] = useState(null)
  const directory = usePlayerDirectory()
  const [depth, setDepth] = useState(null)
  useEffect(() => { fetch('/data/depth_charts.json').then((r) => (r.ok ? r.json() : null)).then(setDepth).catch(() => setDepth(null)) }, [])

  useEffect(() => {
    Promise.all([
      fetch('/data/season_schedule.json').then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      }),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([sched, stats]) => {
        setSchedule(sched)
        setTeamStats(stats)
        setSelectedWeek(sched.latest_week)
      })
      .catch((e) => setError(e.message))
  }, [])

  // Our players.json stats_url already embeds each player's real ESPN athlete id
  // (espn.com/nfl/player/_/id/<id>/...), verified when the slideout external links were built --
  // reusing that instead of a name match to wire box-score rows to our own player slideout.
  const espnIdToPlayer = useMemo(() => {
    const map = new Map()
    for (const [playerId, info] of Object.entries(directory)) {
      const match = info.stats_url?.match(/\/id\/(\d+)\//)
      if (match) map.set(match[1], { playerId, name: info.name, position: info.position })
    }
    return map
  }, [directory])

  const espnAbbrToNflverse = useMemo(() => {
    const map = new Map()
    for (const [abbr, info] of Object.entries(teamStats || {})) {
      if (info.espn_abbr) map.set(info.espn_abbr.toUpperCase(), abbr)
    }
    return map
  }, [teamStats])

  const [teamFilter, setTeamFilter] = useState('all')

  const weekGames = useMemo(
    () => (schedule && selectedWeek ? schedule.games.filter((g) => g.week === selectedWeek) : []),
    [schedule, selectedWeek]
  )
  const filteredGames = useMemo(
    () => weekGames.filter((g) => teamFilter === 'all' || g.home_team === teamFilter || g.away_team === teamFilter),
    [weekGames, teamFilter]
  )
  const weekTeams = useMemo(
    () => [...new Set(weekGames.flatMap((g) => [g.home_team, g.away_team]))].sort(),
    [weekGames]
  )

  const weekOptions = useMemo(() => {
    if (!schedule) return []
    return [...new Set(schedule.games.map((g) => g.week))].sort((a, b) => b - a)
  }, [schedule])

  async function handleSelect(game) {
    if (selectedGameId === game.game_id) {
      setSelectedGameId(null)
      return
    }
    setSelectedGameId(game.game_id)
    const cached = details[game.game_id]
    // Re-fetch if we've never loaded this game OR if the cached copy is of a game that wasn't
    // finished yet last time we looked (it may well be final -- or further along -- by now).
    if ((cached && cached.status?.state === 'post') || !teamStats) return
    setLoadingGameId(game.game_id)
    try {
      let eventId = eventIdByGame[game.game_id]
      if (!eventId) {
        const eventIds = await resolveEventIds([game], teamStats)
        eventId = eventIds[game.game_id]
        if (!eventId) throw new Error('no matching ESPN event found')
        setEventIdByGame((prev) => ({ ...prev, [game.game_id]: eventId }))
      }
      const detail = await fetchGameDetail(eventId)
      setDetails((prev) => ({ ...prev, [game.game_id]: detail }))
    } catch {
      setDetails((prev) => ({ ...prev, [game.game_id]: null }))
    } finally {
      setLoadingGameId(null)
    }
  }

  // A real global matchup selection auto-selects that specific game's box score, so switching to
  // this tab after picking a matchup elsewhere doesn't require re-finding it in the week's list.
  const { selectedMatchup } = useMatchup()
  useEffect(() => {
    if (!selectedMatchup || weekGames.length === 0) return
    const match = weekGames.find((g) => g.home_team === selectedMatchup.home && g.away_team === selectedMatchup.away)
    if (match && match.game_id !== selectedGameId) handleSelect(match)
  }, [selectedMatchup, weekGames])

  // Keep the selected game's box score / play-by-play fresh while it's still in progress. Stops
  // on its own once ESPN reports the game final (status.state === 'post').
  const selectedStatusState = details[selectedGameId]?.status?.state
  const selectedEventId = eventIdByGame[selectedGameId]

  // Heat for the selected game: compare each new poll's touches with the previous poll's.
  const prevTouchesRef = useRef({ gameId: null, fetchedAt: null, prev: null, cur: null })
  const selectedDetail = details[selectedGameId]
  const heat = useMemo(() => {
    if (!selectedDetail?.boxscore || selectedDetail.status?.state !== 'in') return null
    const ref = prevTouchesRef.current
    if (ref.gameId !== selectedGameId) Object.assign(ref, { gameId: selectedGameId, fetchedAt: null, prev: null, cur: null })
    if (ref.fetchedAt !== selectedDetail.fetchedAt) {
      ref.prev = ref.cur
      ref.fetchedAt = selectedDetail.fetchedAt
      ref.cur = boxTouches(selectedDetail.boxscore)
      ref.cur = new Map([...ref.cur.entries()].map(([id, v]) => [id, v.touches]))
    }
    return heatMap(selectedDetail.boxscore, ref.prev).heat
  }, [selectedDetail, selectedGameId])
  useEffect(() => {
    if (!selectedGameId || !selectedEventId) return
    if (selectedStatusState === 'post') return
    const timer = setInterval(async () => {
      try {
        const detail = await fetchGameDetail(selectedEventId)
        if (detail?.boxscore || detail?.status) setDetails((prev) => ({ ...prev, [selectedGameId]: detail }))
      } catch {
        // a single failed poll shouldn't blank an already-loaded box score
      }
    }, LIVE_BOXSCORE_POLL_MS)
    return () => clearInterval(timer)
  }, [selectedGameId, selectedEventId, selectedStatusState])

  if (error) {
    return (
      <p className="empty-state">
        No schedule data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <div className="calc-block" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, maxWidth: 'none', marginBottom: 12 }}>
        <label style={{ minWidth: 110 }}>
          Week
          <select
            value={selectedWeek || ''}
            onChange={(e) => {
              setSelectedWeek(Number(e.target.value))
              setSelectedGameId(null)
            }}
          >
            {weekOptions.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 110 }}>
          Team
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All</option>
            {weekTeams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <MatchupFilterNote message={selectedMatchup && `${selectedMatchup.away} @ ${selectedMatchup.home} auto-selected below (global matchup selection)`} />
      <p className="meta-line">
        {filteredGames.length} of {weekGames.length} games &middot; click a game for its real box
        score (1st downs, total yards, passing/rushing splits, turnovers, time of possession), a
        full player/position breakdown for both teams, and the real play-by-play, all via ESPN's
        summary API
      </p>
      {filteredGames.map((g) => (
        <GameRow
          key={g.game_id}
          game={g}
          selected={selectedGameId === g.game_id}
          onSelect={() => handleSelect(g)}
          detail={details[g.game_id]}
          loading={loadingGameId === g.game_id}
          espnIdToPlayer={espnIdToPlayer}
          espnAbbrToNflverse={espnAbbrToNflverse}
          heat={selectedGameId === g.game_id ? heat : null}
          depth={depth}
        />
      ))}
    </div>
  )
}
