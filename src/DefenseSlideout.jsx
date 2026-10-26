import { useEffect, useState } from 'react'
import L7Chart from './L7Chart.jsx'
import { openPlayerSlide } from './slideouts.js'

// 2026-10-26 (user: tapping a defender in Lineups / Depth Chart showed an empty offensive slideout -- "seeing a defense's
// stats and players stats can help as well in their slideouts"). Defenders get their own slideout body: this week's live
// line, season totals (+ last season), share of his defense, his team's defense ranks, a Last 7 chart and the game log.
// Data: public/data/def_players.json (nfl_project/build_defense.py, daily; play-by-play credits match ESPN's box score).
// Context only -- nothing here feeds a grade.

const DEF_POS = new Set(['DE', 'DT', 'NT', 'DL', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'SS', 'FS', 'SAF', 'DB',
  'LDE', 'RDE', 'LDT', 'RDT', 'WLB', 'SLB', 'LILB', 'RILB', 'LOLB', 'ROLB', 'LCB', 'RCB', 'NB'])
export const isDefensePos = (pos) => DEF_POS.has(String(pos || '').toUpperCase())

let cache = null
export function loadDefense() {
  if (!cache) cache = fetch('/data/def_players.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return cache
}
let rankCache = null
const loadRankings = () => (rankCache = rankCache || fetch('/data/team_rankings.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))
export function useDefense() {
  const [d, setD] = useState(null)
  useEffect(() => { loadDefense().then(setD); loadRankings() }, [])
  return d
}

// group for the chart default + which team ranks lead
export function defGroup(pos) {
  const p = String(pos || '').toUpperCase()
  if (/CB|NB|^S$|SS|FS|SAF|DB/.test(p)) return 'DB'
  if (/LB/.test(p)) return 'LB'
  return 'DL'
}
const DEFAULT_CAT = { DL: 'def_qbh', LB: 'def_tkl', DB: 'def_pd' }

const sum = (games, k) => games.reduce((a, g) => a + (g[k] || 0), 0)
const fmtSk = (v) => (Number.isInteger(v) ? v : v.toFixed(1))

function Tiles({ tiles }) {
  return (
    <div className="stat-grid">
      {tiles.map(([label, value, sub]) => (
        <div className="stat-tile" key={label}>
          <div className="value">{value}</div>
          <div className="label">{label}{sub && <div className="meta-line small" style={{ margin: '2px 0 0' }}>{sub}</div>}</div>
        </div>
      ))}
    </div>
  )
}

const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

// This week's line from ESPN's box score (defensive / interceptions / fumbles), live while his game is on.
export function DefWeekCard({ t }) {
  if (!t?.started) return null
  const l = t.def
  const g = t.game
  const score = t.score ? `${g.away_team} ${t.score.away ?? 0} – ${g.home_team} ${t.score.home ?? 0}` : `${g.away_team} @ ${g.home_team}`
  return (
    <div className={`slideout-section week-live ${t.live ? 'is-live' : ''}`}>
      <div className="week-live-head">
        <span className={t.live ? 'live-tag' : 'final-tag'}>{t.live ? '● LIVE' : 'FINAL'}</span>
        <strong>{score}</strong>
        {t.live && t.detail && <span className="meta-line small" style={{ margin: 0 }}>{t.detail}</span>}
      </div>
      {!l ? <p className="meta-line small">{t.out ? `${t.out.status} for this game.` : 'No defensive stats in the box score yet.'}</p> : (
        <Tiles tiles={[['Tackles', l.tkl, `${l.solo} solo`], ['Sacks', fmtSk(l.sk)], ['TFL', l.tfl], ['QB Hits', l.qbh], ['PD', l.pd], ['INT', l.int]]} />
      )}
      <p className="meta-line small">{t.live ? 'Live from ESPN — updates every 25 seconds.' : 'Final line.'}</p>
    </div>
  )
}

export default function DefenseBody({ player, entry, d, thisWeek }) {
  const [rankings, setRankings] = useState(null)
  useEffect(() => { loadRankings().then(setRankings) }, [])
  if (!d) return <p className="empty-state">Loading...</p>
  if (!entry) return <p className="empty-state">No defensive stats for {player.player_name || 'this player'} yet this season.</p>

  const team = entry.team || player.team
  const games = entry.games || []
  const n = games.length
  const per = (k) => (n ? (sum(games, k) / n).toFixed(1) : '0.0')
  const tm = d.teams?.[team]
  const share = (k) => (tm?.totals?.[k] ? `${Math.round((100 * sum(games, k)) / tm.totals[k])}% of ${team}` : null)
  const last = entry.last
  const group = defGroup(entry.position || player.position)
  const r = rankings?.teams?.[team]?.def
  const nTeams = rankings?.n_teams || 32
  const rk = (x) => (x?.rank ? `${ordinal(x.rank)} of ${nTeams}` : '—')
  const pr = (k) => (tm?.[k] ? `${ordinal(tm[k].rank)} most` : null)
  const live = thisWeek?.started && thisWeek.def
  const chartGames = live
    ? [...games.filter((g) => g.week !== thisWeek.game.week), { ...thisWeek.def, week: thisWeek.game.week, opponent: thisWeek.game.home_team === team ? thisWeek.game.away_team : thisWeek.game.home_team, home_or_away: thisWeek.game.home_team === team ? 'vs' : '@', snap_pct: null, today: true, live: thisWeek.live }]
    : games

  // team defense ranks: what a defender at this spot is part of (1st = allows the fewest)
  const teamTiles = [
    ['Pts allowed/G', r?.points?.v ?? '—', rk(r?.points)],
    group === 'DB' ? ['Pass yds/G', r?.pass_yds?.v ?? '—', rk(r?.pass_yds)] : ['Rush yds/G', r?.rush_yds?.v ?? '—', rk(r?.rush_yds)],
    group === 'DB' ? ['Rush yds/G', r?.rush_yds?.v ?? '—', rk(r?.rush_yds)] : ['Pass yds/G', r?.pass_yds?.v ?? '—', rk(r?.pass_yds)],
    ['TDs allowed/G', r?.tds?.v ?? '—', rk(r?.tds)],
    ['Sacks/G', tm?.sk?.v ?? '—', pr('sk')],
    ['Takeaways/G', tm?.takeaways?.v ?? '—', pr('takeaways')],
    ['QB hits/G', tm?.qbh?.v ?? '—', pr('qbh')],
    ['Passes def/G', tm?.pd?.v ?? '—', pr('pd')],
  ]

  return (
    <>
      <DefWeekCard t={thisWeek} />
      <div className="slideout-section">
        <h3>{d.season} Season{n ? ` · ${n} game${n === 1 ? '' : 's'}` : ''}</h3>
        {!n ? <p className="meta-line small">No defensive snaps yet this season.</p> : (
          <Tiles tiles={[
            ['Tackles', sum(games, 'tkl'), `${per('tkl')}/g · ${share('tkl') || ''}`],
            ['Solo', sum(games, 'solo'), `${sum(games, 'ast')} assisted`],
            ['TFL', sum(games, 'tfl'), share('tfl')],
            ['Sacks', fmtSk(sum(games, 'sk')), share('sk')],
            ['QB Hits', sum(games, 'qbh'), share('qbh')],
            ['INT', sum(games, 'int')],
            ['Passes Def', sum(games, 'pd'), share('pd')],
            ['FF / FR', `${sum(games, 'ff')} / ${sum(games, 'fr')}`],
            ['Snap %', n ? `${Math.round(sum(games, 'snap_pct') / n)}%` : '—', 'defense, per game'],
            ...(sum(games, 'td') ? [['TD', sum(games, 'td'), 'defense / return']] : []),
          ]} />
        )}
        {last && <p className="meta-line small">{last.season}: {last.gp} games · {last.tkl} tackles · {fmtSk(last.sk)} sacks · {last.tfl} TFL · {last.qbh} QB hits · {last.int} INT · {last.pd} PD · {last.ff} FF</p>}
      </div>

      <div className="slideout-section">
        <h3>{team} defense <span className="meta-line small">(through week {rankings?.through_week ?? d.through_week})</span></h3>
        <Tiles tiles={teamTiles} />
        <p className="meta-line small">Yards / points ranks: 1st = allows the fewest. Playmaking ranks: 1st = the most per game. Context — the TD and yards models use the team's TD and yards allowed, not these.</p>
      </div>

      <div className="slideout-section">
        <h3>{live ? 'Last 7 Games (this game live)' : 'Last 7 Games'}</h3>
        <L7Chart key={group} gameLog={chartGames} position="DEF" initialCategory={DEFAULT_CAT[group]} />
      </div>

      <div className="slideout-section">
        <h3>Game Log</h3>
        {!n ? <p className="empty-state">No games logged yet this season.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Wk</th><th>Opp</th><th>Snap</th><th>Tkl</th><th>Solo</th><th>TFL</th><th>Sk</th><th>QBH</th><th>PD</th><th>INT</th><th>FF</th></tr></thead>
              <tbody>
                {games.slice().reverse().map((g) => (
                  <tr key={`${g.season}-${g.week}`}>
                    <td>{g.week}</td><td>{g.home_or_away}{g.opponent}</td><td>{g.snap_pct}%</td><td>{g.tkl}</td><td>{g.solo}</td>
                    <td>{g.tfl}</td><td>{fmtSk(g.sk)}</td><td>{g.qbh}</td><td>{g.pd}</td><td>{g.int}</td><td>{g.ff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// Team slideout: the defense's top playmakers this season, each opens its slideout.
export function DefenseLeaders({ team }) {
  const d = useDefense()
  if (!d) return null
  const roster = Object.entries(d.players || {}).filter(([, e]) => e.team === team && e.games?.length)
  if (!roster.length) return null
  const lead = (k, label, fmt = (v) => v) => {
    const top = roster.map(([pid, e]) => [pid, e, sum(e.games.filter((g) => g.team === team), k)]).filter((x) => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3)
    return (
      <div key={k} className="def-leaders-col">
        <div className="meta-line small" style={{ margin: '0 0 2px' }}>{label}</div>
        {top.length ? top.map(([pid, e, v]) => (
          <div key={pid}>
            <button className="team-link" onClick={() => openPlayerSlide({ player_id: pid, player_name: e.name, team, position: e.position })}>{e.name}</button>{' '}
            <span className="meta-line small" style={{ margin: 0 }}>{e.position} · {fmt(v)}</span>
          </div>
        )) : <span className="meta-line small">—</span>}
      </div>
    )
  }
  const tm = d.teams?.[team]
  return (
    <div className="slideout-section">
      <h3>Defensive playmakers</h3>
      {tm && (
        <p className="meta-line small" style={{ marginTop: 0 }}>
          Per game: {tm.sk.v} sacks ({ordinal(tm.sk.rank)} most) · {tm.takeaways.v} takeaways ({ordinal(tm.takeaways.rank)}) · {tm.qbh.v} QB hits ({ordinal(tm.qbh.rank)}) · {tm.pd.v} passes defended ({ordinal(tm.pd.rank)})
        </p>
      )}
      <div className="def-leaders" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {lead('tkl', 'Tackles')}
        {lead('sk', 'Sacks', fmtSk)}
        {lead('qbh', 'QB hits')}
        {lead('pd', 'Passes defended')}
        {lead('int', 'Interceptions')}
        {lead('tfl', 'Tackles for loss')}
      </div>
    </div>
  )
}
