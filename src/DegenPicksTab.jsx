import { useMemo, useState } from 'react'
import {
  START, STAKES, STATS, STAT_SHORT, STAT_LABEL, betKey, cancelBet, clampChance, gamblyLeg, isOpenPick, laddersOf, legLabel, parlayChance, parlayPayout,
  parlayProblem, payoutFor, placeBet, placeParlay, resetCoins, setSlip, summarize, ticket, useCoins, useSlip, useWeek,
} from './coins.js'
import { betText } from './gambly.js'
import ViewPicker from './ViewPicker.jsx'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import GamblyButton from './GamblyButton.jsx'
import { useViewWeek } from './weekView.js'
import './Coins.css'

// 🪙 Degen Picks (2026-11-09, user: CourtIQ's play-money mini game in Six Points). One page: make picks (game / TD or yards / line − / +),
// a slip (singles or a parlay, Gambly), your open slips and your track record vs our chances. coins.js holds the wallet.
const fmt = (n) => Math.round(n).toLocaleString()
const signed = (n) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
const pct = (v) => `${Math.round(v * 100)}%`
const pct2 = (v) => (v < 0.1 ? `${(v * 100).toFixed(1)}%` : pct(v))
const weekLabel = (b) => (b.week ? `Week ${b.week}` : '')
const kickLabel = (t) => (t ? new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '')
const SKIP = new Set(['Out', 'Doubtful', 'IR', 'Injured Reserve', 'Suspended'])
const OWN = (ladder) => { const ok = ladder.filter(([, ch]) => ch >= 0.5); return ok.length ? ok[ok.length - 1][0] : ladder[0][0] }

function Board({ wk, slip }) {
  const coins = useCoins()
  const games = (wk.games || []).filter((g) => isOpenPick(g.kickoff)).sort((a, b) => (a.kickoff || '').localeCompare(b.kickoff || ''))
  const [gameSel, setGame] = useState(null)
  const game = games.find((g) => g.gameId === gameSel) || games[0]
  const [stat, setStat] = useState('TD')
  const [q, setQ] = useState('')
  const [lines, setLines] = useState({})
  const rows = useMemo(() => {
    if (!game) return []
    return (wk.lines?.players || [])
      .filter((p) => (p.team === game.away || p.team === game.home) && wk.active.has(p.id) && !SKIP.has(p.status))
      .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
      .map((p) => ({ p, ladder: (laddersOf(p)[stat] || []).filter(([, ch]) => ch >= 0.03 && ch <= 0.97) }))
      .filter((r) => r.ladder.length)
      .sort((x, y) => { const e = (p) => (stat === 'RUSH' ? p.estRush ?? (p.pos === 'QB' ? p.est : 0) : stat === 'REC' ? p.estRec ?? 0 : p.est ?? 0); return stat === 'TD' ? y.ladder[0][1] - x.ladder[0][1] : e(y.p) - e(x.p) })
  }, [wk, game, stat, q])
  if (!games.length) return <div className="dp-note">Every game this week has kicked off. Picks for next week open when its slate posts.</div>
  if (!wk.lines) return <div className="dp-note">This week's lines aren't priced yet.</div>
  const keyOf = (p) => `${p.id}|${stat}`
  const lineOf = (r) => { const want = lines[keyOf(r.p)]; return r.ladder.some(([T]) => T === want) ? want : OWN(r.ladder) }
  const step = (r, d) => {
    const opts = r.ladder.map(([T]) => T), i = opts.indexOf(lineOf(r))
    setLines({ ...lines, [keyOf(r.p)]: opts[Math.max(0, Math.min(opts.length - 1, i + d))] })
  }
  return (
    <>
      <div className="dp-controls">
        <select value={game.gameId} onChange={(e) => setGame(e.target.value)} aria-label="Game">
          {games.map((g) => <option key={g.gameId} value={g.gameId}>{g.away} @ {g.home} · {kickLabel(g.kickoff)}</option>)}
        </select>
        <div className="dp-stats">{STATS.map(([k, l]) => <button key={k} type="button" className={`pill-btn ${stat === k ? 'active' : ''}`} onClick={() => setStat(k)}>{STAT_SHORT[k]}</button>)}</div>
        <input type="search" placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="dp-card dp-board">
        {rows.length === 0 && <div className="dp-muted dp-small">No priced {STAT_LABEL[stat].toLowerCase()} lines in this game{q ? ' for that name' : ''}.</div>}
        {rows.map((r) => {
          const T = lineOf(r)
          const [, ch, hits] = r.ladder.find(([x]) => x === T)
          const n = stat === 'TD' ? r.p.nTd ?? r.p.n : r.p.n
          const t = ticket(wk, r.p, stat, T, ch)
          const k = t && betKey(t)
          const inSlip = slip.some((x) => betKey(x) === k)
          const placed = coins.bets.some((x) => x.type !== 'parlay' && betKey(x) === k)
          const i = r.ladder.findIndex(([x]) => x === T)
          return (
            <div key={r.p.id} className="dp-row">
              <PlayerAvatar playerId={r.p.id} name={r.p.name} />
              <div className="dp-who"><b>{r.p.name}</b><span className="dp-muted dp-small">{r.p.team} {r.p.pos}{r.p.pos === 'QB' && stat === 'TD' ? ' · rushing / receiving TD (grade model)' : ` · cleared ${hits}/${n} last ${n}`}</span></div>
              <div className="dp-step">
                <button type="button" aria-label="Lower the line" disabled={i <= 0} onClick={() => step(r, -1)}>−</button>
                <b>{stat === 'TD' ? (T === 1 ? 'TD' : `${T}+`) : `${T}+`}</b>
                <button type="button" aria-label="Raise the line" disabled={i >= r.ladder.length - 1} onClick={() => step(r, 1)}>+</button>
              </div>
              <div className="dp-ch"><b>{pct(ch)}</b><span className="dp-muted dp-small">{(1 / clampChance(ch)).toFixed(2)}x</span></div>
              <button type="button" className={`dp-add ${inSlip || placed ? 'on' : ''}`} disabled={placed || !t}
                onClick={() => setSlip((cur) => (cur.some((x) => betKey(x) === k) ? cur.filter((x) => betKey(x) !== k) : [...cur, t]))}>{placed ? '✓' : inSlip ? '−' : '＋'}</button>
            </div>
          )
        })}
      </div>
      <div className="dp-muted dp-small">Lines and chances are the Risk Slider's (each player's ladder, calibrated with his own recent hit rate). Tap any player elsewhere in the app for the same lines in his slideout.</div>
    </>
  )
}

function Slip({ slip }) {
  const coins = useCoins()
  const [stake, setStake] = useState(25)
  const [mode, setMode] = useState('single')
  const [msg, setMsg] = useState(null)
  if (!slip.length) return null
  const parlay = mode === 'parlay' && slip.length > 1
  const problem = parlay ? parlayProblem(slip) : null
  const pc = parlay && !problem ? parlayChance(slip) : null
  const total = parlay ? stake : stake * slip.length
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3500) }
  const place = () => {
    if (total > coins.balance) { say(`That's ${fmt(total)} coins; you have ${fmt(coins.balance)}.`); return }
    if (parlay) { const e = placeParlay(slip, stake); if (e) say(e); else { setSlip([]); say(`✓ ${slip.length}-leg parlay on your slips.`) } return }
    const errs = slip.map((t) => [t, placeBet(t, stake)]).filter(([, e]) => e)
    setSlip(errs.map(([t]) => t))
    say(errs.length ? errs.map(([t, e]) => `${t.name}: ${e}`).join(' · ') : `✓ ${slip.length} pick${slip.length === 1 ? '' : 's'} on your slips.`)
  }
  const label = coins.balance <= 0 ? 'Out of coins: reset under Track record' : problem || (total > coins.balance ? `Need ${fmt(total)} coins`
    : parlay ? `Place ${slip.length}-leg parlay · ${fmt(total)} coins` : `Place ${slip.length} pick${slip.length === 1 ? '' : 's'} · ${fmt(total)} coins`)
  return (
    <div className="dp-slip">
      <div className="dp-slip-head"><b>🧾 Slip · {slip.length}</b><span className="coin-bal">{fmt(coins.balance)} coins</span><button type="button" className="dp-link" onClick={() => setSlip([])}>clear</button></div>
      {slip.length > 1 && (
        <div className="dp-mode">
          <button type="button" className={`pill-btn ${!parlay ? 'active' : ''}`} onClick={() => setMode('single')}>Singles</button>
          <button type="button" className={`pill-btn ${parlay ? 'active' : ''}`} onClick={() => setMode('parlay')}>🔗 Parlay</button>
        </div>
      )}
      {slip.map((t) => (
        <div key={betKey(t)} className="dp-leg">
          <span>{t.name} <b>{legLabel(t)}</b> <span className="dp-muted">{pct(t.chance)}</span></span>
          {!parlay && <span className="dp-muted dp-small">{fmt(stake)} → <b className="coin-good">{fmt(payoutFor(stake, t.chance))}</b></span>}
          <button type="button" className="coin-x" aria-label="Remove" onClick={() => setSlip(slip.filter((x) => betKey(x) !== betKey(t)))}>✕</button>
        </div>
      ))}
      {pc && (
        <div className="dp-parlay">
          <span>All {slip.length} hit: <b>{pct2(pc.chance)}</b>{pc.sameGame && Math.abs(pc.chance - pc.indep) > 0.0005 && <span className="dp-muted dp-small"> ({pct2(pc.indep)} if unrelated; same-game legs adjusted)</span>}</span>
          <span>{fmt(stake)} → <b className="coin-good">{fmt(parlayPayout(stake, pc.chance))}</b> <span className="dp-muted dp-small">{(1 / pc.chance).toFixed(1)}x</span></span>
        </div>
      )}
      <div className="coin-stakes"><span className="dp-muted dp-small">{parlay ? 'Coins' : 'Coins each'}</span>{STAKES.map((v) => <button key={v} type="button" className={`pill-btn ${stake === v ? 'active' : ''}`} onClick={() => setStake(v)}>{v}</button>)}</div>
      <button type="button" className="coin-place" disabled={!!problem || total > coins.balance || coins.balance <= 0} onClick={place}>{label}</button>
      {/* 2026-11-09 (user): the same picks at a real sportsbook through Gambly -- the user's own money, outside the app */}
      <div className="dp-gambly"><GamblyButton compact={false} label={parlay ? 'Send parlay to Gambly' : `Send ${slip.length === 1 ? 'pick' : 'picks'} to Gambly`}
        text={parlay ? betText(slip.map(gamblyLeg), { sameGame: !!pc?.sameGame }) : slip.map(gamblyLeg).join('\n')} /><span className="dp-muted dp-small">Real bets are yours, outside the app.</span></div>
      {parlay && <div className="dp-muted dp-small">Locks at the first leg's kickoff. One miss loses it; a leg who doesn't play drops out and the return is re-priced on the rest. A TD and 100 yards on opposite sides of one game rise together (+7%, measured 2023-25); other pairs count as unrelated.</div>}
      {msg && <div className="dp-small">{msg}</div>}
    </div>
  )
}

const legMark = (l) => (l.status === 'won' ? '✅' : l.status === 'lost' ? '❌' : l.status === 'void' ? '➖' : '⏳')
const stamp = (b) => (b.status === 'open' ? (isOpenPick(b.tip) ? `kicks ${kickLabel(b.tip)}` : 'in play') : b.status === 'void' ? 'void' : b.status === 'won' ? 'hit' : 'miss')
function SlipCard({ b }) {
  const open = b.status === 'open'
  const delta = b.status === 'won' ? b.payout - b.stake : b.status === 'lost' ? -b.stake : 0
  const par = b.type === 'parlay'
  return (
    <div className={`dp-ticket ${b.status}`}>
      <div className="dp-ticket-top">
        {!par && <PlayerAvatar playerId={b.playerId} name={b.name} />}
        <div className="dp-who">{par ? <b>🔗 {b.legs.length}-leg parlay</b> : <b>{b.name}</b>}
          <span className="dp-muted dp-small">{par ? `${weekLabel(b)} · ${b.legs.filter((l) => l.status === 'won').length} of ${b.legs.length} legs hit` : `${b.team} vs ${b.opp} · ${weekLabel(b)}`}</span></div>
        <span className={`dp-stamp ${b.status}`}>{stamp(b)}</span>
      </div>
      {par && b.legs.map((l, i) => (
        <div key={i} className="dp-pleg"><span>{legMark(l)} {l.name} <b>{legLabel(l)}</b> <span className="dp-muted">{pct(l.chance)}</span></span>
          <span className="dp-muted dp-small">{l.status === 'void' ? "didn't play" : l.actual ?? ''}</span></div>
      ))}
      <div className="dp-ticket-line">
        <span>{par ? <>All hit · {pct2(b.chance)}{b.repriced ? ' (re-priced)' : ''}</> : <><b>{legLabel(b)}</b> · {pct(b.chance)}</>}</span>
        <span>{fmt(b.stake)} → {fmt(b.payout)}</span>
      </div>
      <div className="dp-ticket-foot">
        {open ? (isOpenPick(b.tip)
          ? <><button type="button" className="dp-link" onClick={() => cancelBet(b.id)}>cancel (coins back)</button>
            <GamblyButton text={par ? betText(b.legs.map(gamblyLeg), { sameGame: new Set(b.legs.map((l) => l.gameId)).size < b.legs.length }) : gamblyLeg(b)} /></>
          : <span className="dp-muted dp-small">settles with the next data update after the final</span>)
          : b.status === 'void' ? <span className="dp-muted dp-small">{par ? 'no legs played' : "didn't play"} · coins back</span>
          : <><span className="dp-small">{par ? (b.status === 'won' ? 'Every leg hit' : 'A leg missed') : `Finished with ${b.actual}${b.stat === 'YDS' ? ' yds' : b.actual === 1 ? ' TD' : ' TDs'}`}</span><b className={delta >= 0 ? 'coin-good' : 'coin-bad'}>{signed(delta)}</b></>}
      </div>
    </div>
  )
}

function BalanceLine({ coins }) {
  const pts = useMemo(() => {
    const s0 = coins.start || START
    const done = coins.bets.filter((b) => b.settledAt).sort((a, b) => a.settledAt.localeCompare(b.settledAt) || a.placedAt.localeCompare(b.placedAt))
    let bal = s0
    return [s0, ...done.map((b) => (bal += b.status === 'won' ? b.payout - b.stake : b.status === 'lost' ? -b.stake : 0))]
  }, [coins])
  if (pts.length < 3) return null
  const W = 300, H = 70, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1, s0 = coins.start || START
  const x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - 4 - ((v - lo) / span) * (H - 8)
  return (
    <svg className="coin-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Coin balance over your settled picks">
      <line x1="0" x2={W} y1={y(s0)} y2={y(s0)} className="coin-chart-base" />
      <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className={pts[pts.length - 1] >= s0 ? 'coin-chart-up' : 'coin-chart-down'} />
    </svg>
  )
}

function Record({ coins }) {
  const [confirm, setConfirm] = useState(false)
  const s = summarize(coins)
  const start = coins.start || START
  const singles = coins.bets.filter((b) => b.type !== 'parlay' && (b.status === 'won' || b.status === 'lost'))
  const byStat = STATS.map(([k]) => { const r = singles.filter((b) => b.stat === k); return [k, r.length, r.filter((b) => b.status === 'won').length, r.reduce((t, b) => t + b.chance, 0)] }).filter(([, n]) => n)
  const settled = coins.bets.filter((b) => b.status !== 'open').sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''))
  const reset = () => { if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 4000); return } resetCoins(); setConfirm(false) }
  return (
    <>
      {s.done >= 5 ? (
        <div className="dp-card">
          <b>You vs our chances</b>
          <div className="dp-small" style={{ marginTop: 4 }}>You hit <b>{s.won} of {s.done}</b> ({pct(s.won / s.done)}). Our chances on those same picks said <b>{s.said.toFixed(1)}</b> ({pct(s.said / s.done)}).{' '}
            {s.won - s.said >= 1.5 ? 'Your picks are beating our numbers so far.' : s.said - s.won >= 1.5 ? 'Running behind our numbers so far.' : 'Right about where our numbers said.'}
            {s.done < 30 && ' Small sample: luck still swings this a lot.'}</div>
          {s.parlays > 0 && <div className="dp-small" style={{ marginTop: 4 }}>Parlays: <b>{s.parlaysWon} of {s.parlays}</b> hit; our chances said {s.parlaysSaid.toFixed(1)}.</div>}
          {byStat.length > 1 && <div className="dp-bystat">{byStat.map(([k, n, w, said]) => <span key={k}><b>{STAT_SHORT[k]}</b> {w}/{n} <span className="dp-muted">said {said.toFixed(1)}</span></span>)}</div>}
        </div>
      ) : <div className="dp-muted dp-small">After 5 settled picks this shows how you're doing against our chances.</div>}
      <div className="dp-card"><b>Settled</b>{settled.length ? <div className="dp-tickets">{settled.map((b) => <SlipCard key={b.id} b={b} />)}</div> : <div className="dp-muted dp-small">Nothing settled yet.</div>}</div>
      <div className="dp-card dp-reset">
        <span className="dp-small">Run #{coins.run || 1} · started {new Date(coins.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} with {fmt(start)} coins</span>
        <button type="button" className={`pill-btn ${confirm ? 'active' : ''}`} onClick={reset}>{confirm ? `Tap again: back to ${fmt(start)}, all slips cleared` : '↺ Reset coins'}</button>
      </div>
    </>
  )
}

export default function DegenPicksTab() {
  const viewWeek = useViewWeek()
  const wk = useWeek()
  const coins = useCoins()
  const slip = useSlip()
  const s = summarize(coins)
  const [view, setView] = useState('pick')
  const open = coins.bets.filter((b) => b.status === 'open').sort((a, b) => (a.tip || '').localeCompare(b.tip || ''))
  return (
    <div className="coins-page">
      <h2 className="dp-title">🪙 Degen Picks</h2>
      <div className="dp-muted dp-small" style={{ marginBottom: 8 }}>Free play coins to test your picks. No real money, nothing to buy or cash out.</div>
      <div className="dp-card coin-hero">
        <div className="coin-hero-top">
          <div><div className="dp-muted dp-small">Coins</div><div className="coin-big">{fmt(coins.balance)}</div>{s.inPlay > 0 && <div className="dp-muted dp-small">+{fmt(s.inPlay)} in play</div>}</div>
          <div><div className="dp-muted dp-small">P&amp;L</div><div className={`coin-big ${s.pnl >= 0 ? 'coin-good' : 'coin-bad'}`}>{signed(s.pnl)}</div></div>
          <div><div className="dp-muted dp-small">Record</div><div className="coin-big">{s.won}–{s.lost}</div>{s.void > 0 && <div className="dp-muted dp-small">{s.void} void</div>}</div>
        </div>
        <BalanceLine coins={coins} />
      </div>
      <ViewPicker pillClass="pill-btn" value={view} onChange={setView} options={[['pick', '🎯 Make picks'], ['slips', `🧾 My slips${open.length ? ` (${open.length})` : ''}`], ['record', '📈 Track record']]} />
      {view === 'pick' && (wk === undefined ? <div className="dp-muted">Loading this week…</div> : !wk ? <div className="dp-note">This week's slate isn't posted yet.</div>
        : viewWeek ? <div className="dp-note">Picks are made on this week's slate. Switch the week back to the current one to make picks.</div>
        : <><Board wk={wk} slip={slip} /><Slip slip={slip} /></>)}
      {view === 'slips' && (open.length ? <div className="dp-tickets">{open.map((b) => <SlipCard key={b.id} b={b} />)}</div> : <div className="dp-muted">No open slips. Build one under 🎯 Make picks.</div>)}
      {view === 'record' && <Record coins={coins} />}
      <div className="dp-note" style={{ marginTop: 12 }}>
        <b>How it works.</b> Everyone starts with {fmt(START)} free coins. Pick any line we price (anytime TD, 2+ TDs, scrimmage, rushing or receiving yards; starting QBs' rushing yards), add it to
        your slip and choose the coins. A hit returns your coins divided by our chance, so a 25% line returns 4x and a 75% line 1.33x; a miss
        loses them. Quarterbacks: each team's starter, anytime / 2+ TDs from the grade model (a TD he runs or catches; passing TDs don't
        count), settled from ESPN's box score. Parlays (2-6 legs, one per player) multiply the legs' chances (a TD and 100 yards on opposite sides of one game get the
        +7% we measured). Picks lock at kickoff and settle once the game is graded (a few hours after it ends); if he doesn't play, the coins come
        back. If our chances are right, picks break even over time, so finishing ahead means your picks beat our numbers. Reset whenever you
        like. <b>Play coins only:</b> free, can't be bought, can't be cashed out or traded, no prizes. Saved in this browser.
      </div>
    </div>
  )
}
