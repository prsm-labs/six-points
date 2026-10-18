import { useEffect, useMemo, useState } from 'react'
import { useSlate } from './slate.js'
import { decimalOf, projectedPayout, setKoteOverride, simulateGame, useKoteModel, useKoteOverrides, useKoteStatus } from './kote.js'
import KotePayoutChart from './KotePayoutChart.jsx'
import { BestPriceLink, StatePicker } from './BetLink.jsx'
import { booksText, fmtAmerican } from './bookOdds.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import { openPlayerSlide } from './slideouts.js'
import PickButton from './PickButton.jsx'
import { fmtPct, GradeBadge, LiveStatusTag } from './gradeUi.jsx'
import { DepthTag } from './matchupUi.jsx'
import { resolveEventIds } from './espnGameResolver.js'
import { parseScoringPlay } from './scoringPlays.js'
import { useSort, SortTh } from './useSort.jsx'

// 👑 King of the End Zone (2026-10-18 revamp; Slap Shot's IcebreakerView.jsx, football). See kote.js for the promo,
// the simulation, its backtest and the payout model.
const fmtUsd = (v) => (v == null ? '—' : v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : `$${v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v)}`)
const kickText = (g) => {
  const d = new Date(`${g.gameday}T12:00:00`)
  const [h, m] = (g.gametime || '0:0').split(':').map(Number)
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`
}
const short = (name) => { const p = name.split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : name }

// Live: the longest non-passing TD so far in the promo game (ESPN scoring plays via /api/summary).
function useLiveKing(game) {
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!game) return undefined
    let alive = true
    let timer = null
    const run = async () => {
      try {
        const ts = await fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {}))
        const ids = await resolveEventIds([game], ts)
        const ev = ids[game.game_id]
        if (!ev) return
        const data = await fetch(`/api/summary?event=${ev}`).then((r) => (r.ok ? r.json() : null))
        const tds = (data?.scoringPlays || []).map(parseScoringPlay).filter((p) => p.isTouchdown && p.yards != null)
        const ret = (p) => /return|interception|fumble|blocked|defensive/i.test(p.tdTypeLabel)
        const plays = tds.map((p) => ({ ...p, who: ret(p) ? `${p.teamAbbr} D/ST` : p.scorerName }))
        const best = plays.reduce((b, p) => (!b || p.yards > b.yards ? p : b), null)
        const kings = best ? plays.filter((p) => p.yards === best.yards) : []
        if (alive) setState({ plays, best, kings, final: /final/i.test(data?.header?.competitions?.[0]?.status?.type?.description || '') })
        if (alive) timer = setTimeout(run, 30000)
      } catch {
        if (alive) timer = setTimeout(run, 60000)
      }
    }
    const kick = new Date(`${game.gameday}T${game.gametime}:00-04:00`).getTime()
    if (Date.now() > kick - 5 * 60000) run()
    return () => { alive = false; clearTimeout(timer) }
  }, [game])
  return state
}

export default function KingOfEndZone() {
  const slate = useSlate()
  const model = useKoteModel()
  const ov = useKoteOverrides()
  const [sched, setSched] = useState(null)
  const [gameId, setGameId] = useState(null)
  const [pool, setPool] = useState(2000000)
  const [showChart, setShowChart] = useState(true)
  const [picked, setPicked] = useState(() => new Set())
  const [pickedOnly, setPickedOnly] = useState(false)
  useEffect(() => {
    fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).then(setSched).catch(() => setSched(null))
  }, [])

  const games = useMemo(() => (sched?.games || []).filter((g) => slate && g.week === slate.week), [sched, slate])
  const dates = useMemo(() => [...new Set(games.map((g) => g.gameday))].sort(), [games])
  const byDate = useKoteStatus(dates)
  const lastStatus = Object.values(byDate)[0]
  const history = lastStatus?.history || []

  // promo status per game: confirmed (DK Network names it), likely (a Monday), else off; viewer can switch any game on
  const gameRows = useMemo(() => games.map((g) => {
    const s = byDate[g.gameday]
    let status = 'off'
    if (s?.status === 'confirmed') {
      status = !s.teams || (s.teams.includes(g.home_team) && s.teams.includes(g.away_team)) ? 'confirmed' : 'off'
    } else if (s?.status === 'likely') status = 'likely'
    else if (!s && new Date(`${g.gameday}T12:00:00Z`).getUTCDay() === 1) status = 'likely' // DK check unavailable: Monday night = the usual promo
    const override = ov[g.game_id]
    return { ...g, status, on: override ?? (status !== 'off'), override, pool: s?.pool, source: s?.source }
  }).sort((a, b) => `${a.gameday}${a.gametime}`.localeCompare(`${b.gameday}${b.gametime}`)), [games, byDate, ov])
  const promoGames = gameRows.filter((g) => g.on)
  const game = gameRows.find((g) => g.game_id === gameId) || promoGames.find((g) => g.home_score == null) || promoGames[0]
    || gameRows[gameRows.length - 1] || null
  useEffect(() => { if (game?.pool) setPool(game.pool) }, [game?.game_id, game?.pool])

  const rows = useMemo(() => {
    if (!slate?.matchups || !game || !model) return []
    const teams = [game.away_team, game.home_team]
    const players = slate.matchups.filter((m) => teams.includes(m.team))
    const sim = simulateGame(players, teams, model)
    return [...sim.values()].map((e) => {
      const m = e.m || null
      const pTd = m ? m.p_td : e.scores
      const payout = projectedPayout(pTd, pool, model)
      const best = m?.book?.best ?? (e.dst ? slate.odds?.dst?.[e.dst] && Math.max(...Object.values(slate.odds.dst[e.dst])) : null)
      return {
        id: e.id, m, dst: e.dst, name: m ? m.player_name : `${e.dst} D/ST`, short: m ? short(m.player_name) : `${e.dst} D/ST`,
        team: m ? m.team : e.dst, position: m ? m.position : 'D/ST', p_td: pTd, king: e.king, payout,
        promoEv: payout != null ? e.king * payout : null,
        betEv: best != null && pTd != null ? 5 * (pTd * decimalOf(best) - 1) : null,
        bestPrice: best ?? null,
      }
    })
  }, [slate, game, model, pool])
  const shown = pickedOnly && picked.size ? rows.filter((r) => picked.has(r.id)) : rows
  const { sorted, sortKey, sortDir, toggleSort } = useSort(shown, 'king', 'desc')
  const th = { sortKey, sortDir, onSort: toggleSort }
  const live = useLiveKing(game)
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (!slate || !model) return <p className="empty-state">Loading…</p>
  const v = model.validation?.by_season || []

  return (
    <div>
      <div className="note">
        👑 <b>King of the End Zone</b> — DraftKings' promo (usually Monday Night Football): opt in, bet $5+ on any TD scorer
        with the token, and if he scores the game's <b>longest touchdown</b> (rushing, receiving or a return — a QB gets no
        credit for a passing TD) everyone who picked him splits the bonus-bet pool. Ties split; a defensive / return TD pays
        that team's D/ST. <b>King %</b> = our chance he scores the longest TD: {Math.round(20000 / 1000)}k simulated games from each
        player's TD % (the grade model) and how long his position's TDs really run (4 seasons of play-by-play). Backtest
        2023-25, every game: our favorite won {v.map((s) => `${Math.round(s.fav_won_sim * 100)}%`).join(' / ')} vs
        {' '}{v.map((s) => `${Math.round(s.fav_won_naive * 100)}%`).join(' / ')} for the plain top TD scorer.
        <b> Payout</b> = pool ÷ projected bettors on him (fit to the two 2026 payouts DraftKings published — a rough guide).
      </div>

      <div className="card kote-promo-bar">
        <div className="kote-games">
          {gameRows.length === 0 && <span className="meta-line small">No games found for week {slate.week}.</span>}
          {gameRows.map((g) => (
            <button key={g.game_id} className={`pill-btn ${game?.game_id === g.game_id ? 'active' : ''}`} onClick={() => setGameId(g.game_id)}
              title={g.status === 'confirmed' ? `DK Network: ${g.source?.title || 'promo post'}` : g.status === 'likely' ? 'Monday Night Football — the promo has run every MNF game since week 3; no DK Network post yet' : 'No promo found for this game'}>
              {g.on ? '👑 ' : ''}{g.away_team} @ {g.home_team} <span className="meta-line small">{kickText(g)}</span>
              {g.status === 'confirmed' && <span className="kote-status ok"> ✓ promo</span>}
              {g.status === 'likely' && <span className="kote-status maybe"> likely</span>}
            </button>
          ))}
        </div>
        {game && (
          <div className="kote-controls">
            <label className="inline-check">
              <input type="checkbox" checked={game.on} onChange={(e) => setKoteOverride(game.game_id, e.target.checked)} />
              Promo on for {game.away_team} @ {game.home_team}
            </label>
            <label>Pool $ <input type="number" value={pool} step={500000} min={100000} onChange={(e) => setPool(Number(e.target.value) || 2000000)} style={{ width: 110 }} /></label>
            <button className={`pill-btn ${showChart ? 'active' : ''}`} onClick={() => setShowChart((s) => !s)}>📈 Payout graph</button>
            <StatePicker />
          </div>
        )}
      </div>

      {game && live?.best && (
        <div className="card kote-live">
          <b>👑 {live.final ? 'King of the End Zone' : 'Current king'}: {live.kings.map((k) => k.who).join(' & ')} — {live.best.yards}-yard TD</b>
          <span className="meta-line small"> ({live.plays.length} TD{live.plays.length === 1 ? '' : 's'} so far: {live.plays.map((p) => `${p.who} ${p.yards}`).join(' · ')})</span>
          {!live.final && (() => {
            const ours = sorted.find((r) => r.name === live.kings[0]?.who)
            return <div className="meta-line small">Any TD longer than {live.best.yards} yards takes the crown{ours ? ` · our pre-game King % for him: ${fmtPct(ours.king, 1)}` : ''}.</div>
          })()}
        </div>
      )}

      {game && showChart && <div className="card"><KotePayoutChart rows={rows} picked={picked} onToggle={toggle} /></div>}

      {game && (
        <>
          <div className="toolbar-row">
            <span className="meta-line small">{game.away_team} @ {game.home_team} · {rows.length} players + both D/ST · pool {fmtUsd(pool)}</span>
            {picked.size > 0 && (
              <>
                <button className={`pill-btn ${pickedOnly ? 'active' : ''}`} onClick={() => setPickedOnly((v) => !v)}>Table: {pickedOnly ? 'picked only' : 'everyone'}</button>
                <button className="pill-btn" onClick={() => { setPicked(new Set()); setPickedOnly(false) }}>✕ Clear picked</button>
              </>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh label="Player" sortKeyName="name" className="sticky-col" {...th} />
                  <SortTh label="Pos" sortKeyName="position" {...th} />
                  <SortTh label="👑 King %" sortKeyName="king" {...th} />
                  <SortTh label="TD %" sortKeyName="p_td" {...th} />
                  <SortTh label="Anytime TD" sortKeyName="bestPrice" {...th} />
                  <SortTh label="Payout if king" sortKeyName="payout" {...th} />
                  <SortTh label="Promo EV" sortKeyName="promoEv" {...th} />
                  <SortTh label="$5 bet EV" sortKeyName="betEv" {...th} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className={picked.has(r.id) ? 'row-picked' : ''}>
                    <td className="sticky-col">
                      <div className="player-cell" onClick={() => (r.m ? openPlayerSlide(r.m) : toggle(r.id))}>
                        {r.m && <PlayerAvatar playerId={r.m.player_id} name={r.name} />}
                        <div>
                          <span>{r.name}</span> {r.m && <PickButton player={r.m} compact />}
                          <span className="pick-star" onClick={(e) => { e.stopPropagation(); toggle(r.id) }} title="Add to the graph / picked list">{picked.has(r.id) ? '★' : '☆'}</span>
                          <div className="cell-sub">{r.team}{r.m && <DepthTag m={r.m} />} {r.m && <GradeBadge grade={r.m.grade} m={r.m} />} {r.m && <LiveStatusTag m={r.m} />}</div>
                        </div>
                      </div>
                    </td>
                    <td>{r.position}</td>
                    <td className="num"><b>{fmtPct(r.king, 1)}</b></td>
                    <td className="num">{fmtPct(r.p_td, 1)}</td>
                    <td className="num nowrap" title={r.m ? booksText(r.m.book) : 'D/ST anytime TD price (when the books list it)'}>
                      {r.m ? <BestPriceLink book={r.m.book} /> : r.bestPrice != null ? fmtAmerican(r.bestPrice) : '—'}
                    </td>
                    <td className="num">{fmtUsd(r.payout)}</td>
                    <td className={`num ${r.promoEv >= 25 ? 'edge-value' : ''}`}>{r.promoEv != null ? `$${r.promoEv.toFixed(2)}` : '—'}</td>
                    <td className={`num ${r.betEv > 0 ? 'edge-value' : ''}`} title="The $5 qualifying anytime-TD bet itself at the best price, with our TD %">{r.betEv != null ? `${r.betEv >= 0 ? '+' : '-'}$${Math.abs(r.betEv).toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Promo EV = King % × payout, in bonus bets (face value). Payout scales with how many people pick him — the
            likeliest scorers are the most crowded. Payouts are projections from two published 2026 payouts; DraftKings
            publishes only the winner's.
          </p>
        </>
      )}

      {history.length > 0 && (
        <div className="card">
          <b>Past Kings of the End Zone</b> <span className="meta-line small">(DK Network posts)</span>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>King</th><th>TD</th><th>Bettors</th><th>Paid each</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.date}-${h.name}`}>
                    <td>{h.date}</td><td>{h.name}</td><td>{h.yards != null ? `${h.yards} yds` : '—'}</td>
                    <td>{h.bettors != null ? h.bettors.toLocaleString() : 'not published'}</td>
                    <td>{h.payout != null ? `$${h.payout}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
