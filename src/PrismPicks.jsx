import { useEffect, useState } from 'react'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'

// 💎 PRISM Picks (2026-10-20, nfl_project/build_prism_picks.py -> public/data/prism_picks.json): this week's few props with
// the highest tested hit rates that aren't the obvious ones (lines a player clears every week are left out). The big number
// is the track record -- how often past PRISM Picks at that chance hit -- not the raw model chance.
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const share = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : '—')
const RESULT = { hit: '✅', miss: '✗', void: 'void' }
// 2026-10-23 pick levels (user: mid-range + long shots, all data-backed) -- week.tiers.mid / .long from build_prism_picks.py,
// each with its own rule, held-out backtest and live record (d.tiers). Touchdowns enter here (anytime TD, 2+ TDs).
const LEVELS = [
  { key: 'safe', label: '💎 PRISM Picks', sub: "This week's highest-hitting props that aren't the obvious ones" },
  { key: 'mid', label: '⚖️ Mid-range', sub: 'Not too safe, not too risky — bigger yard lines and touchdowns' },
  { key: 'long', label: '🌠 Long shots', sub: 'If the stars align — about 1 in 5' },
]
const fair = (p) => (p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : `+${Math.round((100 * (1 - p)) / p)}`)

export default function PrismPicks({ slate, notOut }) {
  const [d, setD] = useState(null)
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState('safe')
  useEffect(() => {
    fetch('/data/prism_picks.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null))
  }, [])
  if (!d) return null
  const wk = d.weeks.find((w) => w.week === d.week)
  const byId = new Map((slate?.matchups || []).map((m) => [m.player_id, m]))
  const list = (w) => (level === 'safe' ? w?.picks : w?.tiers?.[level]) || []
  const picks = list(wk)
  const count = (k) => (k === 'safe' ? wk?.picks : wk?.tiers?.[k])?.length || 0
  const tier = level === 'safe' ? null : d.tiers?.[level]
  const L = LEVELS.find((x) => x.key === level)
  // 2026-10-23: only last week here -- any week is one pick away in the 📅 week picker at the top
  const past = d.weeks.filter((w) => w.week < d.week && list(w).some((p) => p.result)).slice(-1)
  const bt = tier ? tier.backtest : d.backtest
  return (
    <div className={`card prism-card ${open ? 'open' : 'collapsed'}`}>
      <div className="prism-head">
        <span className="prism-gem" aria-hidden="true">💎</span>
        <div>
          <div className="prism-title">PRISM Picks</div>
          <div className="meta-line small" style={{ margin: 0 }}>{L.sub}</div>
        </div>
        {/* 2026-10-22 (user): collapsed by default -- tap to expand */}
        <button type="button" className="prism-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? '▴ Hide' : `▾ Show${count('safe') + count('mid') + count('long') ? ` ${count('safe') + count('mid') + count('long')} picks` : ''}`}</button>
      </div>
      {d.tiers && (
        <div className="pill-row" style={{ width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap', margin: '8px 0 4px' }}>
          {LEVELS.map((x) => <button key={x.key} type="button" className={`pill-btn ${level === x.key ? 'active' : ''}`} onClick={() => setLevel(x.key)}>{x.label}{count(x.key) ? ` · ${count(x.key)}` : ''}</button>)}
        </div>
      )}
      {picks.length === 0 && tier && <div className="meta-line small">{wk && !wk.tiers ? 'Pick levels started in week 7 of 2026.' : `No line clears this level's bar this week yet — it only shows looks like the ones that have hit ${share(bt.hits, bt.n)} of the time.`}</div>}
      {picks.length === 0 && !tier && (d.paused
        ? <div className="meta-line small"><b>None this week.</b> {d.paused}</div>
        : <div className="meta-line small">No line clears the bar this week yet — PRISM Picks only shows looks like the ones that have hit {share(bt.hits, bt.n)} of the time. Open slots refill daily until the last game starts.</div>)}
      {/* 2026-10-22 (user): the next game always gets its best qualifying pick; when none clears the bar, say so */}
      {!tier && wk?.nextGame && !picks.some((c) => wk.nextGame.teams.includes(c.team)) && (
        <div className="meta-line small">Next up: <b>{wk.nextGame.label || wk.nextGame.teams.join(' / ')}</b> ({new Date(wk.nextGame.kickoff).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}) — no line clears the {pct(d.rule.floor)} bar
          {wk.nextGame.closest ? ` (closest: ${wk.nextGame.closest.name} ${wk.nextGame.closest.label}, ${pct(wk.nextGame.closest.chance)})` : ''}.</div>
      )}
      {picks.map((c, i) => {
        const m = byId.get(c.player_id)
        const out = m && notOut && !notOut(m)
        return (
          <div key={`${c.player_id}-${c.line}`} className={`prism-row ${out ? 'out' : ''}`} onClick={() => m && openPlayerSlide(m)}>
            <span className="meta-line small">{i + 1}.</span>
            <PlayerAvatar playerId={c.player_id} name={c.name} />
            <div className="prism-main">
              <div>{c.name} <span className="meta-line small">({c.pos}{c.depth ? ` · ${c.depth}` : ''} · {c.team} vs {c.opp})</span> {m && <PickButton player={m} compact prop={c.label} />}</div>
              <div className="prism-line">{c.label}{c.result ? <span className={`prism-result ${c.result}`}> {RESULT[c.result]}{c.actual != null ? ` (${c.actual})` : ''}</span> : null}{out ? <span className="meta-line small"> · OUT</span> : null}</div>
              <div className="meta-line small" style={{ margin: 0 }}>Est. {c.est} yds · {c.stat && c.stat !== 'YDS' ? 'scored' : 'cleared'} it in {c.last[1]} of his last {c.last[0]}{tier ? ` · fair ${fair(c.chance)} · about 1 in ${Math.round(1 / c.track)}` : ''}</div>
            </div>
            <div className="prism-stat" title={`Past ${tier ? tier.label.toLowerCase() : 'PRISM Picks'} at a ${pct(c.chance)} chance hit ${pct(c.track)} (${c.trackN} picks; small samples lean on the chance itself, trimmed by how far past picks fell short of it). The model alone says ${pct(c.chance)}.`}>
              <b>{pct(c.track)}</b>
              <span className="meta-line small">track record</span>
              <span className="meta-line small">model {pct(c.chance)}</span>
            </div>
          </div>
        )
      })}
      {tier && (
        <div className="prism-foot meta-line small">
          Track record: {bt.hits} of {bt.n} hit ({share(bt.hits, bt.n)}, the model said {pct(bt.said)}) over {bt.weeks} weeks, 2023-25, held out
          {tier.live.n ? ` · this season: ${tier.live.hits} of ${tier.live.n} (${share(tier.live.hits, tier.live.n)})` : ' · live record starts this week'}.
          {' '}On those same lines the players' own last-8 rate was {Math.round(bt.own * 1000) / 10}%{level === 'long' ? ' — lines they had not cleared once lately, and still about 1 in 4 came in' : ''}.
          {' '}Rule: scrimmage-yard lines ({tier.rule.min_line.YDS}+ yds), an anytime TD or 2+ TDs that he cleared in {pct(tier.rule.real)} or fewer of his last {d.rule.last_n} games, where the model gives him {pct(tier.rule.floor)} to {pct(tier.rule.cap)}
          {level === 'long' ? ', ranked by how far the model sits above his own recent rate' : ', highest chance first'}; one per player, {d.rule.per_game} per game, {tier.rule.stat_cap} per prop type, top {d.rule.picks} a week, nobody in two levels. The chance is calibrated on held-out games against how often he cleared the line lately. NFL samples are small ({bt.n} backtest picks), so the big number is the track record. A pick freezes at its kickoff; open slots refill daily.
        </div>
      )}
      {!tier && !d.paused && <div className="prism-foot meta-line small">
        Track record: {bt.hits} of {bt.n} hit ({share(bt.hits, bt.n)}) over {bt.weeks} weeks, 2023-25, held out
        {d.live.n ? ` · this season: ${d.live.hits} of ${d.live.n} (${share(d.live.hits, d.live.n)})` : ''}.
        Rule: real scrimmage-yard lines — ones he cleared in {pct(d.rule.real)} or fewer of his last {d.rule.last_n} games, {d.rule.min_line}+ yds — at a {pct(d.rule.floor)}+ chance; one per player, {d.rule.per_game} per game, top {d.rule.picks} a week, and the next game to kick off always gets its best one. By season: {Object.entries(bt.seasons || {}).map(([s, [n, h]]) => `${s} ${share(h, n)}`).join(' · ')}. Anytime TD never clears the bar (top TD chances sit near 60%). A pick freezes at its kickoff; open slots refill daily until the last game starts.
      </div>}
      {past.length > 0 && (
        <details className="prism-past">
          <summary>Last week</summary>
          {past.map((w) => {
            const g = list(w).filter((p) => p.result === 'hit' || p.result === 'miss')
            return (
              <div key={w.week} className="prism-past-row">
                <b>Week {w.week}</b> {g.filter((p) => p.result === 'hit').length}/{g.length}
                <span className="meta-line small"> {list(w).map((p) => `${RESULT[p.result] || '…'} ${p.name} ${p.stat && p.stat !== 'YDS' ? p.label : `${p.line}+ yds`}${p.actual != null ? ` (${p.actual})` : ''}`).join(' · ')}{w.source !== 'live' ? ' — rebuilt from the frozen pre-kickoff slate' : ''}</span>
              </div>
            )
          })}
        </details>
      )}
    </div>
  )
}
