import { useEffect, useMemo, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide, openTeamSlide } from './slideouts.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import MatchupFilterNote from './MatchupFilterNote.jsx'
import { matchesPosition, usePosition } from './positionFilter.js'
import { useSort, SortTh } from './useSort.jsx'
import { MatchupCell } from './matchupUi.jsx'
import PickButton from './PickButton.jsx'
import KeyMatchupsTab from './KeyMatchupsTab.jsx'
import { BreakoutBadge, fmtPct, GradeBadge, LiveStatusTag, useLiveOutFilter } from './gradeUi.jsx'
import { parseCsv } from './csv.js'
import { LOCK, lockMs, startedTeams, topPicks } from './topPicks.js'

// Breakout Watch (§6) + Top Picks (§7) + the original Key Matchups heuristic, which stays as a
// third view. Breakout Watch and Top Picks only use backtested inputs from the grade model
// (matchup_engine.py apply_grade_model / build_grade_model.py); every backtest number shown here
// is read from grade_model.json -> validation, so a refit updates the page. Top Picks rules live in
// topPicks.js, shared with scripts/lock_top_picks.mjs, which freezes each week's picks at Sunday
// 11:50 AM ET into public/data/top_picks/ (user decision 2026-10-11).

function useJson(url) {
  const [v, setV] = useState(undefined)
  useEffect(() => {
    fetch(url).then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => setV(null))
  }, [url])
  return v
}

function x(n) {
  return n == null ? '—' : `${Number(n).toFixed(2)}x`
}

function TopPickCard({ t, locked }) {
  const m = t.m
  if (!m) {
    return (
      <div className="top-pick-card empty">
        <div className="top-pick-tier">{t.tier}</div>
        <p className="meta-line small">No qualifying player this week.</p>
      </div>
    )
  }
  return (
    <div className="top-pick-card">
      <div className="top-pick-tier">{t.tier}{locked && <span className="lock-tag">🔒 locked</span>}</div>
      <div className="top-pick-head">
        <PlayerAvatar playerId={m.player_id} name={m.player_name} />
        <div style={{ minWidth: 0 }}>
          <div className="player-cell" style={{ padding: 0 }} onClick={() => openPlayerSlide(m)}>
            <strong>{m.player_name}</strong>
          </div>
          <div className="meta-line small" style={{ margin: 0 }}>{m.team} vs {m.opponent} &middot; {m.position}</div>
        </div>
        <PickButton player={m} compact />
      </div>
      <div className="top-pick-stats">
        <GradeBadge grade={m.grade} />
        <span>TD {fmtPct(m.p_td)}</span>
        <span>100+ {fmtPct(m.p_100)}</span>
        <LiveStatusTag m={m} />
      </div>
      <p className="meta-line small" style={{ margin: '6px 0 0' }}>{t.why}</p>
    </div>
  )
}

function lastName(name) {
  const parts = (name || '').split(' ').filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w))
  return parts[parts.length - 1] || name
}

// Record: locked weeks are graded from their lock file (what was actually published before
// kickoff). Weeks before locking existed (2026 weeks 2-5) are recomputed from the graded ledger
// with the same rules and labeled as such. Only weeks before the live slate's week count.
function TopPicksRecord({ currentWeek, locks }) {
  const [rows, setRows] = useState(null)
  const [lockFiles, setLockFiles] = useState({})
  useEffect(() => {
    fetch('/data/grade_record.csv').then((r) => (r.ok ? r.text() : '')).then((t) => setRows(t ? parseCsv(t) : [])).catch(() => setRows([]))
  }, [])
  useEffect(() => {
    for (const l of locks || []) {
      fetch(`/data/top_picks/${l.file}`).then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setLockFiles((prev) => ({ ...prev, [l.week]: d }))).catch(() => {})
    }
  }, [locks])
  const record = useMemo(() => {
    if (!rows) return null
    const outcome = {}
    const byWeek = {}
    for (const r of rows) {
      outcome[`${r.week}-${r.player_id}`] = r
      if (Number(r.week) < 2 || Number(r.week) >= currentWeek) continue
      const row = { ...r, p_td: Number(r.p_td), p_100: Number(r.p_100), injury_gate: 1, breakout: r.breakout === 'True', soft_matchup: r.soft_matchup === 'True', form_ratio: 1.2 }
      ;(byWeek[r.week] = byWeek[r.week] || []).push(row)
    }
    const out = { Chalk: [], Yards: [], Breakout: [] }
    const weeks = new Set([...Object.keys(byWeek), ...Object.keys(lockFiles).filter((w) => Number(w) < currentWeek)])
    for (const week of [...weeks].sort((a, b) => a - b)) {
      const lf = lockFiles[week]
      const tiers = lf
        ? lf.picks.map((p) => ({ tier: p.tier, stat: p.stat, m: p.player, locked: true }))
        : topPicks(byWeek[week] || []).map((t) => ({ ...t, locked: false }))
      for (const t of tiers) {
        if (!t.m) continue
        const res = outcome[`${week}-${t.m.player_id}`]
        if (!res) continue // game not graded yet
        const hit = t.stat === '100' ? Number(res.scrim_yds) >= 100 : Number(res.tds) > 0
        out[t.tier].push({ week, name: t.m.player_name, hit, locked: t.locked })
      }
    }
    return out
  }, [rows, currentWeek, lockFiles])
  if (!record) return null
  return (
    <p className="meta-line small">
      2026 record:{' '}
      {Object.entries(record).map(([tier, list]) => (
        <span key={tier}>
          {tier} {list.filter((r) => r.hit).length}-{list.filter((r) => !r.hit).length}
          {list.length > 0 && ` (${list.map((r) => `wk${r.week}${r.locked ? '🔒' : ''} ${lastName(r.name)} ${r.hit ? '✓' : '✗'}`).join(', ')})`}
          {' · '}
        </span>
      ))}
      🔒 = graded from the Sunday lock. Weeks without it (before locking existed) are recomputed from
      the graded ledger with the same rules.
    </p>
  )
}

function BreakoutTable({ data, bo }) {
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const notOut = useLiveOutFilter()
  const rows = useMemo(
    () => data.matchups
      .filter((m) => m.breakout)
      .filter((m) => matchesPosition(m.position, position))
      .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team))
      .filter(notOut),
    [data, position, selectedMatchup, notOut]
  )
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, 'p_td', 'desc')
  const thProps = { sortKey, sortDir, onSort: toggleSort }
  const main = bo?.find((r) => r.group === 'Breakout Watch')
  const soft = bo?.find((r) => r.group === 'Breakout + soft matchup')
  return (
    <>
      <p className="meta-line">
        Week {data.week} &middot; {rows.length} players &middot; RB/WR/TE outside the week's top 15% by
        grade, whose last-3-week touches are running above 1.2x their season rate.
        {main && <> In the 2023-2025 backtest they beat the grade model's own expectation: TD lift {x(main.td_lift)}
          {' '}({Object.values(main.td_lift_by_season).map((v) => v.toFixed(2)).join(' / ')} by season), 100+ yard
          lift {x(main['100_lift'])}.</>}
        {soft && <> With a soft matchup for his role (📈 soft, top third of yards allowed to his position):
          {' '}{x(soft.td_lift)} / {x(soft['100_lift'])}, but that edge isn't steady by season ({Object.values(soft.td_lift_by_season).map((v) => v.toFixed(2)).join(' / ')}),
          so it's a tag, not a requirement.</>}
        {' '}Full tables: Track Record &gt; Grade Model.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Player" sortKeyName="player_name" className="sticky-col" {...thProps} />
              <th />
              <SortTh label="Team" sortKeyName="team" {...thProps} />
              <SortTh label="Opp" sortKeyName="opponent" {...thProps} />
              <SortTh label="Pos" sortKeyName="position" {...thProps} />
              <SortTh label="Grade" sortKeyName="grade_pct" {...thProps} />
              <SortTh label="TD %" sortKeyName="p_td" {...thProps} />
              <SortTh label="100+ %" sortKeyName="p_100" {...thProps} />
              <SortTh label="L3 touches/G" sortKeyName="l3_tpg_s" {...thProps} />
              <SortTh label="vs season" sortKeyName="form_ratio" {...thProps} />
              <SortTh label="Matchup" sortKeyName="mu_pct" {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.player_id}>
                <td className="sticky-col">
                  <div className="player-cell" onClick={() => openPlayerSlide(m)}>
                    <PlayerAvatar playerId={m.player_id} name={m.player_name} />
                    {m.player_name} <LiveStatusTag m={m} />
                  </div>
                </td>
                <td><PickButton player={m} compact /></td>
                <td><button className="team-link" onClick={() => openTeamSlide({ team: m.team })}>{m.team}</button></td>
                <td><button className="team-link" onClick={() => openTeamSlide({ team: m.opponent, context: 'defense' })}>{m.opponent}</button></td>
                <td>{m.position}</td>
                <td><GradeBadge grade={m.grade} /></td>
                <td>{fmtPct(m.p_td)}</td>
                <td>{fmtPct(m.p_100)}</td>
                <td>{Number(m.l3_tpg_s).toFixed(1)}</td>
                <td>{Number(m.form_ratio).toFixed(2)}x</td>
                <td>{m.mu_pct != null ? <MatchupCell m={m} /> : m.soft_matchup ? <BreakoutBadge m={m} /> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function BreakoutWatchTab() {
  const [view, setView] = useState('top')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const notOut = useLiveOutFilter()
  const schedule = useJson('/data/season_schedule.json')
  const model = useJson('/data/grade_model.json')
  const lockIndex = useJson('/data/top_picks/index.json')
  const [lockFile, setLockFile] = useState(null)

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const thisLock = data && lockIndex?.locks?.find((l) => l.season === data.season && l.week === data.week)
  useEffect(() => {
    if (!thisLock) return
    fetch(`/data/top_picks/${thisLock.file}`).then((r) => (r.ok ? r.json() : null)).then(setLockFile).catch(() => {})
  }, [thisLock?.file])

  const hasGrades = data?.matchups?.some((m) => m.p_td != null)
  const livePicks = useMemo(() => {
    if (!data || !hasGrades) return []
    const started = schedule ? startedTeams(schedule, data.week) : new Set()
    return topPicks(data.matchups.filter(notOut), { excludeTeams: started })
  }, [data, hasGrades, notOut, schedule])
  const picks = lockFile
    ? lockFile.picks.map((p) => ({ tier: p.tier, why: p.why, m: p.player && { ...p.player, week: data.week, season: data.season } }))
    : livePicks
  const lockAt = schedule && data ? lockMs(schedule, data.week) : null
  const tp = model?.validation?.top_picks
  const tier = (name) => tp?.find((t) => t.tier === name)

  return (
    <div>
      <div className="sub-tabs">
        <button className={view === 'top' ? 'active' : ''} onClick={() => setView('top')}>Top Picks</button>
        <button className={view === 'breakout' ? 'active' : ''} onClick={() => setView('breakout')}>Breakout Watch</button>
        <button className={view === 'upside' ? 'active' : ''} onClick={() => setView('upside')}>Matchup Upside</button>
      </div>
      {view === 'upside' && <KeyMatchupsTab />}
      {view !== 'upside' && error && <p className="empty-state">No matchup data yet ({error}).</p>}
      {view !== 'upside' && data && !hasGrades && (
        <p className="empty-state">This week's pool was built before the grade model existed. It appears after the next pipeline run.</p>
      )}
      {view === 'top' && data && hasGrades && (
        <>
          <p className="meta-line">
            Week {data.week} &middot; three picks, one per team: the slate's top TD chance, its best
            100-yard chance, and its best Breakout Watch player (soft matchup first).{' '}
            {lockFile
              ? <>🔒 <strong>Locked {new Date(lockFile.locked_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET</strong>{lockFile.excluded_started_teams?.length ? ` (games already started were left out: ${lockFile.excluded_started_teams.join(' ')})` : ''}. These stay fixed and are what gets graded.</>
              : lockAt && Date.now() > lockAt
                ? <>This week was not locked (the Sunday lock starts with the next slate), so these are live picks; games that have kicked off drop out.</>
                : <>Live until the lock at {LOCK.label}{lockAt ? ` (${new Date(lockAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}; until then they update with injury news, and games that have kicked off drop out.</>}
          </p>
          <div className="top-picks">
            {picks.map((t) => <TopPickCard key={t.tier} t={t} locked={!!lockFile} />)}
          </div>
          {tp && (
            <p className="meta-line small">
              Backtest, 2023-2025 (out of sample): Chalk scored {fmtPct(tier('Chalk')?.hit_rate)} of {tier('Chalk')?.weeks} weeks;
              the Yards pick hit 100+ yards {fmtPct(tier('Yards')?.hit_rate)}; the Breakout pick scored {fmtPct(tier('Breakout')?.hit_rate)}
              {' '}({Object.values(tier('Breakout')?.by_season || {}).map((v) => fmtPct(v)).join(' / ')} by season), about what the
              grade model already expected ({fmtPct(tier('Breakout')?.model_said)}). The Breakout pick is a longer shot, not an edge
              on its own.
            </p>
          )}
          <TopPicksRecord currentWeek={data.week} locks={lockIndex?.locks} />
        </>
      )}
      {view === 'breakout' && data && hasGrades && (
        <>
          <MatchupFilterNote message="Showing the selected matchup only" />
          <BreakoutTable data={data} bo={model?.validation?.breakout} />
        </>
      )}
    </div>
  )
}
