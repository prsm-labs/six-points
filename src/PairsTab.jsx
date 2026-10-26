import { useEffect, useMemo, useState } from 'react'
import { useSlate } from './slate.js'
import { buildPairs, LEVELS, MODES, notInPairs, PROP_FILTERS, PROPS, relText, STAR_TOP, toAmerican } from './pairs.js'
import { startedTeams } from './topPicks.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import GamblyButton from './GamblyButton.jsx'
import { betLine, betText } from './gambly.js'
import { BestPriceLink, StatePicker } from './BetLink.jsx'
import { BOOK_NAMES, fmtAmerican, multiBetUrl, useBetState } from './bookOdds.js'
import { fmtPct, GradeBadge, LiveStatusTag } from './gradeUi.jsx'
import { HotHandTag } from './revampUi.jsx'
import PairsPage from './PairsPage.jsx'

// 🤝 Pairs (Slap Shot's tabs/PairsTab.jsx, 2026-10-18 revamp): auto-built 2-leg parlays (pairs.js), ★ best pairs,
// profit-boost math on book parlay prices, Gambly per pair, and a 👀 blind-spot strip. Locked at the Sunday lock
// (scripts/lock_pairs.mjs) and graded in Track Record > Pairs. The older scheme-stack page stays as a sub-view.
const BOOSTS = [0, 0.25, 0.5, 1]

function Leg({ l }) {
  const m = l.m
  return (
    <div className="pair-leg">
      <PlayerAvatar playerId={m.player_id} name={m.player_name} />
      <div className="pair-leg-main">
        <div className="pair-leg-name">
          <span className="player-cell" onClick={() => openPlayerSlide(m)}>{m.player_name}</span>
          <span className="meta-line small"> {m.team} · {m.position}</span> <GradeBadge grade={m.grade} m={m} /> <HotHandTag m={m} /> <LiveStatusTag m={m} />
        </div>
        <div className="meta-line small" style={{ margin: 0 }}>
          {PROPS[l.prop].emoji} {PROPS[l.prop].label} <b>{fmtPct(l.chance, 1)}</b>
          {l.prop === 'td' && m.book && <> · <BestPriceLink book={m.book} /></>}
          {' '}· vs {m.opponent}
        </div>
      </div>
      <PickButton player={m} compact prop={l.prop === 'td' ? 'td' : 'yds100'} />
    </div>
  )
}

function PairCard({ pr, boost, started }) {
  useBetState()
  const atLeastOne = 1 - (1 - pr.legs[0].chance) * (1 - pr.legs[1].chance)
  const exactlyOne = atLeastOne - pr.chance
  const why = []
  if (pr.legs.every((l) => (l.m.grade || '').startsWith('A'))) why.push('both A grades')
  if (pr.legs.every((l) => l.m.def_tier === 'soft')) why.push('both vs soft TD defenses ▲')
  if (pr.legs.some((l) => l.m.hotHand)) why.push('🔥 hot hand leg')
  if (pr.legs.some((l) => l.m.def_tier === 'tough')) why.push('⚠ a leg faces a tough defense ▼')
  if (pr.ev != null && pr.ev > 0) why.push('book pays more than the market check price')
  const text = betText(pr.legs.map((l) => betLine(l.m, l.prop === 'td' ? 'td' : 'yds100')), { sameGame: pr.sameGame })
  const legBooks = pr.legs.map((l) => l.m.book)
  const multi = ['FD', 'DK'].map((bk) => ({ bk, link: pr.parlay && pr.legs.every((l) => l.prop === 'td') ? multiBetUrl(legBooks, bk) : null })).filter((x) => x.link?.url)
  return (
    <div className={`card pair-card ${pr.starRank ? 'star' : ''}`}>
      <div className="pair-head">
        <span className="pair-section">{pr.section}</span>
        {pr.starRank && <span className="pair-star" title={`★ score ${pr.star.score.toFixed(2)} = strength ${pr.star.strength.toFixed(2)} (percentile among this week's ${pr.legs.map((l) => l.prop).sort().join('+')} pairs) + value ${pr.star.value.toFixed(2)}`}>★{pr.starRank} BEST</span>}
        {started && <span className="meta-line small">· game started — reference only</span>}
      </div>
      {pr.legs.map((l) => <Leg key={`${l.m.player_id}-${l.prop}`} l={l} />)}
      <div className="pair-foot">
        <div><b>Both hit {fmtPct(pr.chance, 1)}</b> <span className="meta-line small">· at least one {fmtPct(atLeastOne, 0)} · exactly one {fmtPct(exactlyOne, 0)} · fair {fmtAmerican(pr.fair)}</span></div>
        {pr.parlay && (
          <div className="meta-line small" style={{ margin: 0 }}>
            Book parlay {fmtAmerican(pr.parlay.american)} at {BOOK_NAMES[pr.parlay.book] || pr.parlay.book} ({pr.parlay.legs.map(fmtAmerican).join(' × ')})
            {boost > 0 && <> → boosted {fmtAmerican(toAmerican(pr.parlay.boostedDec))}</>}
            {pr.ev != null && <> · <span title="Expected return per 1 unit at the market check: chance both hit (each TD leg half ours, half the book, vig out) x payout - 1">EV</span> <span className={pr.ev > 0 ? 'edge-value' : 'edge-neg'}>{pr.ev > 0 ? '+' : ''}{(pr.ev * 100).toFixed(0)}%</span></>}
          </div>
        )}
        {pr.sameGame && <div className="meta-line small" style={{ margin: 0 }}>Same game: books price their own same-game parlays — our fair price only.</div>}
        <div className="meta-line small" style={{ margin: 0 }}>{relText(pr)}{why.length ? ` · ${why.join(' · ')}` : ''}</div>
        <div className="pair-actions">
          <GamblyButton compact={false} label="Send pair to Gambly" text={text} />
          {multi.map((x) => <a key={x.bk} className="pill-btn" href={x.link.url} target="_blank" rel="noopener noreferrer">Bet pair at {x.bk} ↗</a>)}
        </div>
      </div>
    </div>
  )
}

function LiveBoard() {
  const slate = useSlate()
  const [mode, setMode] = useState('balanced')
  const [level, setLevel] = useState('all')
  const [prop, setProp] = useState(null)
  const [boost, setBoost] = useState(0)
  const [stars, setStars] = useState(null)
  const [sched, setSched] = useState(null)
  const [locked, setLocked] = useState(null)
  const [showLocked, setShowLocked] = useState(false)
  useEffect(() => {
    fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).then(setSched).catch(() => {})
  }, [])
  useEffect(() => {
    if (!slate?.week) return
    fetch(`/data/pairs/${slate.season}-wk${slate.week}.json`).then((r) => (r.ok ? r.json() : null)).then(setLocked).catch(() => {})
  }, [slate?.season, slate?.week])
  const started = useMemo(() => startedTeams(sched, slate?.week), [sched, slate?.week])
  const pairs = useMemo(() => (slate?.matchups ? buildPairs(slate.matchups, { mode, prop, boost, level }) : []), [slate, mode, prop, boost, level])
  const shown = stars ? pairs.filter((p) => p.starRank && p.starRank <= stars).sort((a, b) => a.starRank - b.starRank) : pairs
  const blind = useMemo(() => (slate?.matchups ? notInPairs(slate.matchups, pairs).slice(0, 12) : []), [slate, pairs])
  if (!slate) return <p className="empty-state">Loading…</p>
  const modeInfo = MODES.find((m) => m.key === mode)
  // all = the original boards; safe / mid / long = <level>:<mode> (no prop boards per level -- live only)
  const lockedBoard = locked?.boards?.[level !== 'all' ? (prop ? '' : `${level}:${mode}`) : prop && mode === 'balanced' ? `balanced:${prop}` : mode] || null
  const levelInfo = LEVELS.find((l) => l.key === level)
  return (
    <div>
      <div className="note">
        🤝 Two-leg parlays built from the grade model: <b>Anytime TD</b> legs (with the best book price) and <b>100+ scrimmage
        yards</b> legs. Both-hit chance = leg × leg × how the legs move together — measured on 2023-25: different games and
        teammates ≈ independent, TD + 100 yds on opposite sides of one game +7% (shootouts). ★ = the strongest {STAR_TOP} pairs
        of their kind this week. Pairs lock at the Sunday lock and are graded in Track Record.
        {' '}Levels: 🛡️ Safe (both hit 25%+), ⚖️ Mid-range (10-25%), 🌠 Long shot (3-10%) — the same legs and factors, so a long shot is priced
        as honestly as a safe pair; mid-range and long shots lead with ✨ the shootout link (TD + 100 yds across one game, +7%).
      </div>
      <div className="pill-row">{LEVELS.map((l) => <button key={l.key} className={`pill-btn ${level === l.key ? 'active' : ''}`} onClick={() => setLevel(l.key)} title={l.blurb}>{l.label}</button>)}</div>
      <div className="pill-row">{MODES.map((m) => <button key={m.key} className={`pill-btn ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>{m.label}</button>)}</div>
      <div className="pill-row">
        {PROP_FILTERS.map((p) => <button key={String(p.key)} className={`pill-btn ${prop === p.key ? 'active' : ''}`} onClick={() => setProp(p.key)}>{p.label}</button>)}
        {[null, 3, 5].map((s) => <button key={String(s)} className={`pill-btn ${stars === s ? 'active' : ''}`} onClick={() => setStars(s)}>{s ? `★ Top ${s}` : 'All pairs'}</button>)}
      </div>
      <div className="pill-row">
        <span className="meta-line small">Profit boost:</span>
        {BOOSTS.map((b) => <button key={b} className={`pill-btn ${boost === b ? 'active' : ''}`} onClick={() => setBoost(b)}>{b ? `+${b * 100}%` : 'None'}</button>)}
        <StatePicker />
        {lockedBoard && <button className={`pill-btn ${showLocked ? 'active' : ''}`} onClick={() => setShowLocked((v) => !v)}>{showLocked ? '🔒 Locked' : '🔄 Live'} board</button>}
      </div>
      <p className="meta-line small">{level !== 'all' ? `${levelInfo.blurb} · ` : ''}{modeInfo?.blurb}</p>
      {showLocked && lockedBoard ? (
        <div className="grid-cards">
          {lockedBoard.map((r) => (
            <div key={r.key} className={`card pair-card ${r.starRank ? 'star' : ''}`}>
              <div className="pair-head"><span className="pair-section">{r.section}</span>{r.starRank && <span className="pair-star">★{r.starRank} BEST</span>} <span className="meta-line small">🔒 locked {new Date(locked.locked_at).toLocaleString()}</span></div>
              {r.legs.map((l) => <div key={l.player_id + l.prop} className="meta-line" style={{ margin: '4px 0' }}>{PROPS[l.prop].emoji} <b>{l.name}</b> ({l.team}) {PROPS[l.prop].label} {l.chancePct}%{l.book ? ` · ${fmtAmerican(l.book.best)} ${l.book.bestBook}` : ''}</div>)}
              <div><b>Both hit {r.chancePct}%</b> <span className="meta-line small">fair {fmtAmerican(r.fair)}{r.parlay ? ` · book ${fmtAmerican(r.parlay.american)} ${r.parlay.book}` : ''}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-cards">
          {shown.length === 0 && <p className="empty-state">No pairs for this mode yet{mode === 'value' ? ' — value pairs need anytime TD prices (pulled Thursday / Saturday).' : '.'}</p>}
          {shown.map((pr) => <PairCard key={pr.key} pr={pr} boost={boost} started={pr.legs.some((l) => started.has(l.m.team))} />)}
        </div>
      )}
      {blind.length > 0 && (
        <div className="card">
          <b>👀 Notable this week, not in a pair</b>
          <div className="blind-list">
            {blind.map((b) => (
              <span key={b.m.player_id} className="blind-item" onClick={() => openPlayerSlide(b.m)}>
                {b.m.player_name} <span className="meta-line small">({b.m.team}) {b.why.join(' · ')} · TD {fmtPct(b.m.p_td)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PairsTab() {
  const [view, setView] = useState('pairs')
  return (
    <div>
      <div className="pill-row">
        <button className={`pill-btn ${view === 'pairs' ? 'active' : ''}`} onClick={() => setView('pairs')}>🤝 Pairs</button>
        <button className={`pill-btn ${view === 'scheme' ? 'active' : ''}`} onClick={() => setView('scheme')}>🧩 Scheme stacks (classic)</button>
      </div>
      {view === 'pairs' ? <LiveBoard /> : <PairsPage />}
    </div>
  )
}
