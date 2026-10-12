import { useEffect, useMemo, useState } from 'react'
import { parseCsv } from './csv.js'
import { fmtPct, GRADE_ORDER, GradeBadge } from './gradeUi.jsx'

// Track Record > Grade Model (§1, §9's "show your work" page). Two halves: (1) the live 2026
// ledger (grade_record.csv, out of sample -- the model never saw 2026), graded only once a
// player's own game is final; (2) the walk-forward backtest that justified shipping it
// (grade_model.json -> validation, written by build_grade_model.py).

const FEATURE_LABELS = {
  usage_sig: 'Usage Sig (red-zone role share)',
  redzone_touches_per_game: 'Red-zone touches / game',
  touches_per_game: 'Touches / game (season)',
  td_rate_per_touch: 'TD rate per touch',
  snap_pct_fill: 'Snap share',
  opp_td_rate_allowed: "Opponent's TD rate allowed (position)",
  implied_total: 'Team implied points (Vegas)',
  injury_gate: 'Injury status gate',
  is_QB: 'Is QB',
  is_RB: 'Is RB',
  is_WR: 'Is WR',
  l3_tpg_s: 'Touches / game, last 3 weeks',
  l3_rz_s: 'Red-zone touches / game, last 3 weeks',
  ypg: 'Scrimmage yards / game (season)',
  l3_ypg: 'Scrimmage yards / game, last 3 weeks',
  ypt: 'Yards per touch',
  opp_def_rank_pct: "Opponent's yards-allowed rank (position)",
  t_off: 'Own offense TDs / game (vs league)',
  t_def: "Opponent defense TDs allowed / game",
  t_rz: 'Red-zone trips: own offense x opponent defense',
  m_rz: 'Red-zone touches opponent allows the position',
  m_td: 'TDs opponent allows the position',
  rz_leak: "Opponent's red-zone leak x his red-zone role",
  yds_leak: "Yards the opponent's leak adds to his role",
  mu_yds_mult: 'Yardage matchup multiplier for his role',
}

const fmtSigned = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${Number(x).toFixed(1)}`)

function auc(rows, score, hit) {
  const xs = rows.map((r) => ({ s: Number(r[score]), y: hit(r) ? 1 : 0 })).sort((a, b) => a.s - b.s)
  let rankSum = 0
  let n1 = 0
  let i = 0
  while (i < xs.length) {
    let j = i
    while (j + 1 < xs.length && xs[j + 1].s === xs[i].s) j++
    const avg = (i + j + 2) / 2
    for (let k = i; k <= j; k++) if (xs[k].y) { rankSum += avg; n1++ }
    i = j + 1
  }
  const n0 = xs.length - n1
  if (!n1 || !n0) return null
  return (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0)
}

export default function GradeModelSection() {
  const [model, setModel] = useState(null)
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetch('/data/grade_model.json').then((r) => (r.ok ? r.json() : null)).then(setModel).catch(() => {})
    fetch('/data/grade_record.csv').then((r) => (r.ok ? r.text() : '')).then((t) => setRows(t ? parseCsv(t) : [])).catch(() => setRows([]))
  }, [])

  // Week 1 has no current-season games to compute the model's inputs from (the backtest only
  // covered weeks 2-18 for the same reason) -- shown separately, not mixed into the summary.
  const live = useMemo(() => (rows || []).filter((r) => Number(r.week) >= 2), [rows])
  const liveStats = useMemo(() => {
    if (!live.length) return null
    const td = (r) => Number(r.tds) > 0
    const y100 = (r) => Number(r.scrim_yds) >= 100
    const byGrade = GRADE_ORDER.map((g) => {
      const rs = live.filter((r) => r.grade === g)
      return {
        grade: g, n: rs.length,
        td: rs.length ? rs.filter(td).length / rs.length : null,
        exp: rs.length ? rs.reduce((a, r) => a + Number(r.p_td), 0) / rs.length : null,
        y100: rs.length ? rs.filter(y100).length / rs.length : null,
      }
    })
    const bo = live.filter((r) => r.breakout === 'True')
    return {
      n: live.length,
      weeks: [...new Set(live.map((r) => r.week))].sort((a, b) => a - b),
      aucTd: auc(live, 'p_td', td), aucZoneTd: auc(live, 'zone_score', td),
      auc100: auc(live, 'p_100', y100), aucZone100: auc(live, 'zone_score', y100),
      byGrade,
      breakout: { n: bo.length, td: bo.length ? bo.filter(td).length / bo.length : null, exp: bo.length ? bo.reduce((a, r) => a + Number(r.p_td), 0) / bo.length : null },
    }
  }, [live])

  if (!model) return null
  const v = model.validation

  return (
    <div className="grade-model-section">
      <h2 className="section-title">Grade Model</h2>
      <p className="meta-line">
        Every skill player gets two calibrated probabilities: <strong>TD %</strong> (scores a
        rushing or receiving TD) and <strong>100+ %</strong> (100+ scrimmage yards). The letter grade
        is where the average of the two ranks in this week's pool (A+ = top 3%, A = next 7%, A- =
        next 10%, B = next 15%, C = next 20%, D = next 20%, F = bottom 25%). Adapted from Slap Shot's
        grade model and refit on NFL data: one logistic regression per outcome, trained on
        {' '}{model.n_rows.toLocaleString()} point-in-time player-weeks ({model.seasons.join(', ')}). Every input
        uses only games played before that week.
      </p>

      <h3>2026 so far: out of sample</h3>
      {!liveStats && <p className="empty-state">No graded 2026 weeks yet.</p>}
      {liveStats && (
        <>
          <p className="meta-line small">
            Weeks {liveStats.weeks.join(', ')} &middot; {liveStats.n.toLocaleString()} graded player-games
            &middot; ranking accuracy (AUC, 0.5 = coin flip): TD {liveStats.aucTd?.toFixed(3)} vs Zone
            Score {liveStats.aucZoneTd?.toFixed(3)}; 100+ yds {liveStats.auc100?.toFixed(3)} vs Zone
            Score {liveStats.aucZone100?.toFixed(3)}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Grade</th><th>Players</th><th>Scored a TD</th><th>Model said</th><th>100+ yds</th></tr>
              </thead>
              <tbody>
                {liveStats.byGrade.map((g) => (
                  <tr key={g.grade}>
                    <td><GradeBadge grade={g.grade} /></td>
                    <td>{g.n}</td>
                    <td>{fmtPct(g.td, 1)}</td>
                    <td>{fmtPct(g.exp, 1)}</td>
                    <td>{fmtPct(g.y100, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Breakout Watch so far: {liveStats.breakout.n} players, {fmtPct(liveStats.breakout.td, 1)} scored
            (model said {fmtPct(liveStats.breakout.exp, 1)}). Too few to judge yet.
            {(rows || []).some((r) => Number(r.week) === 1) && ' Week 1 is left out: no 2026 games existed yet to compute the model inputs from.'}
            {' '}Weeks 1-5 were replayed on 10/11 through the same pipeline code, not frozen pre-game snapshots.
            Later weeks are recorded by the Tuesday run.
          </p>
        </>
      )}

      <h3>Backtest: each season predicted by a model that never saw it</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Test season</th><th>Player-weeks</th><th>TD AUC</th><th>Zone Score</th><th>100+ AUC</th><th>Zone Score</th></tr>
          </thead>
          <tbody>
            {v.td.loso.map((r, i) => (
              <tr key={r.test_season}>
                <td>{r.test_season}</td>
                <td>{r.n.toLocaleString()}</td>
                <td><strong>{r.auc.toFixed(3)}</strong></td>
                <td>{r.zone_auc.toFixed(3)}</td>
                <td><strong>{v['100'].loso[i].auc.toFixed(3)}</strong></td>
                <td>{v['100'].loso[i].zone_auc.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grade-model-grid">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Grade</th><th>n</th><th>TD</th><th>100+</th></tr></thead>
            <tbody>
              {v.letters.map((r) => (
                <tr key={r.grade}>
                  <td><GradeBadge grade={r.grade} /></td><td>{r.n.toLocaleString()}</td>
                  <td>{fmtPct(r.td_rate, 1)}</td><td>{fmtPct(r.y100_rate, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Zone tier</th><th>n</th><th>TD</th><th>100+</th></tr></thead>
            <tbody>
              {v.zone_tiers.map((r) => (
                <tr key={r.tier}>
                  <td>{r.tier}</td><td>{r.n.toLocaleString()}</td>
                  <td>{fmtPct(r.td_rate, 1)}</td><td>{fmtPct(r.y100_rate, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="meta-line small">
        Same player-weeks graded both ways. The grade model separates the top and bottom more sharply
        (A+ vs F) than Zone Score's tiers, most of all for 100+ yard games.
      </p>

      <h3>Calibration: when it says X%, does X% happen?</h3>
      <div className="grade-model-grid">
        {['td', '100'].map((t) => (
          <div className="table-wrap" key={t}>
            <table>
              <thead><tr><th>{t === 'td' ? 'TD %' : '100+ %'} said</th><th>n</th><th>Happened</th></tr></thead>
              <tbody>
                {v[t].calibration.map((r) => (
                  <tr key={r.bucket}><td>{fmtPct(r.said, 1)}</td><td>{r.n.toLocaleString()}</td><td>{fmtPct(r.happened, 1)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <h3>Breakout Watch backtest</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Group</th><th>n</th><th>TD rate</th><th>Model said</th><th>TD lift</th><th>by season</th><th>100+ lift</th><th>by season</th></tr></thead>
          <tbody>
            {v.breakout.map((r) => (
              <tr key={r.group}>
                <td>{r.group}</td><td>{r.n.toLocaleString()}</td>
                <td>{fmtPct(r.td_rate, 1)}</td><td>{fmtPct(r.td_expected, 1)}</td>
                <td><strong>{r.td_lift.toFixed(2)}x</strong></td>
                <td className="meta-line small">{Object.values(r.td_lift_by_season).map((x) => x.toFixed(2)).join(' / ')}</td>
                <td><strong>{r['100_lift'].toFixed(2)}x</strong></td>
                <td className="meta-line small">{Object.values(r['100_lift_by_season']).map((x) => x.toFixed(2)).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta-line small">
        Lift = actual results divided by what the grade model already expected for those same
        players. 1.00x means no edge beyond the grade. Breakout Watch = RB/WR/TE outside the week's
        top 15% by grade, with last-3-week touches above 1.2x their season rate. The soft-matchup
        add-on's TD lift isn't steady by season, so it's shown as a tag, not required.
      </p>

      {v.top_picks && (
        <>
          <h3>Top Picks backtest</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tier</th><th>Weeks</th><th>Hit</th><th>Model said</th><th>by season</th></tr></thead>
              <tbody>
                {v.top_picks.map((r) => (
                  <tr key={r.tier}>
                    <td>{r.tier}{r.tier === 'Yards' ? ' (100+ yds)' : ' (TD)'}</td><td>{r.weeks}</td>
                    <td><strong>{fmtPct(r.hit_rate, 1)}</strong></td><td>{fmtPct(r.model_said, 1)}</td>
                    <td className="meta-line small">{Object.values(r.by_season).map((x) => fmtPct(x)).join(' / ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {v.feature_sets && (
        <>
          <h3>What drives the grades: Vegas vs our own team model, and position matchups</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Inputs (each season held out)</th><th>TD AUC</th><th>TD top 15 / wk</th><th>100+ AUC</th><th>100+ top 15 / wk</th></tr></thead>
              <tbody>
                {Object.keys(v.feature_sets.td.candidates).map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v.feature_sets.td.candidates[k].auc.toFixed(3)}</td>
                    <td>{fmtPct(v.feature_sets.td.candidates[k].top15_hit, 1)}</td>
                    <td>{v.feature_sets['100'].candidates[k]?.auc.toFixed(3)}</td>
                    <td>{fmtPct(v.feature_sets['100'].candidates[k]?.top15_hit, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Since 2026-10-12 the grades don't use the Vegas line (your call: not Vegas-driven). Our own team environment
            (each offense's TD and red-zone rate vs the opponent defense's, shrunk toward last season) replaces it, at the
            small cost shown above. Position matchup terms are kept when they don't hurt held-out accuracy
            (TD: {v.feature_sets.td.matchup_kept ? 'kept' : 'dropped'}, 100+: {v.feature_sets['100'].matchup_kept ? 'kept' : 'dropped'});
            they move the grades very little because, once a player's role is known, what a defense allows his position
            barely changes his TD odds. The matchup shows up in yards, below.
          </p>
        </>
      )}

      {v.role && (
        <>
          <h3>Who's on the slate, and who inherits the role</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vacated-role terms (each season held out)</th><th>TD AUC</th><th>TD top 15 / wk</th><th>100+ AUC</th><th>100+ top 15 / wk</th></tr></thead>
              <tbody>
                {Object.keys(v.role.td.candidates).map((k) => (
                  <tr key={k}>
                    <td>{{ none: 'None (usage, team, matchup only)', all: 'Every absent teammate', new: 'Newly absent teammates only' }[k] || k}
                      {(v.role.td.kept === k || v.role['100'].kept === k) && <span className="meta-line small"> (used: {[v.role.td.kept === k && 'TD', v.role['100'].kept === k && '100+'].filter(Boolean).join(', ')})</span>}</td>
                    <td>{v.role.td.candidates[k].auc.toFixed(3)}</td>
                    <td>{fmtPct(v.role.td.candidates[k].top15_hit, 1)}</td>
                    <td>{v.role['100'].candidates[k]?.auc.toFixed(3)}</td>
                    <td>{fmtPct(v.role['100'].candidates[k]?.top15_hit, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Since 2026-10-12 the slate is built from ESPN's live team rosters and depth charts. Players on injured reserve,
            the practice squad, released or traded, or Out on this week's report are taken off it; in the 2023-25 history
            that was 15.6% of the old rows, and they scored a TD 0.6% of the time, so they were also dragging the model
            down. Each absent player's trailing carries, targets and red-zone touches are handed to the teammates still
            playing, in proportion to each one's own share (the <em>+role</em> chip). A set of these terms is used only when
            it improves held-out accuracy.{v.yards && <> In yards it is used for {Object.entries(v.yards)
              .filter(([, y]) => y.role_used && y.role_used !== 'none').map(([pos, y]) => `${pos} (${y.role_used === 'new' ? 'new absences' : 'all absences'}, miss ${y.role[y.role_used]} vs ${(y.matchup_used ? y.with_matchup : y.usage_only).mae} yds)`).join(', ') || 'no position'}.</>}
          </p>
        </>
      )}

      {v.matchup && v.yards && (
        <>
          <h3>Position matchups and yards</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pos</th><th>Tough third</th><th>Middle</th><th>Soft third</th><th>Est. Yards miss (with / without matchup)</th><th>Used</th></tr></thead>
              <tbody>
                {Object.entries(v.matchup.yards_vs_usage_by_tercile).map(([pos, t]) => (
                  <tr key={pos}>
                    <td>{pos}</td>
                    {['tough', 'mid', 'soft'].map((k) => (
                      <td key={k} className="meta-line small">{Object.values(t[k]).map(fmtSigned).join(' / ')}</td>
                    ))}
                    <td>{v.yards[pos]?.with_matchup?.mae} / {v.yards[pos]?.usage_only?.mae} yds</td>
                    <td>{v.yards[pos]?.matchup_used ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Each cell: actual scrimmage yards minus the usage-only projection, per game, 2023 / 2024 / 2025, by how soft
            the opponent was for the player's role (yards it allowed his position on deep vs short targets and carries,
            this season so far, shrunk toward last season and the league). RBs and TEs did better in soft matchups every
            season; WRs didn't, so WR matchups add 0 yards to Est. Yards. The effect is real but small next to the typical
            miss, so it adjusts the projection rather than driving it.
          </p>
        </>
      )}

      {v.yardage_lab && (
        <>
          <h3>Yardage Signal backtest</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Group (RB 60+ / WR-TE 75+ scrimmage yds)</th><th>n</th><th>Hit the line</th><th>by season</th></tr></thead>
              <tbody>
                {v.yardage_lab.gates.map((r) => (
                  <tr key={r.group}>
                    <td>{r.group}</td><td>{r.n.toLocaleString()}</td><td><strong>{fmtPct(r.hit_rate, 1)}</strong></td>
                    <td className="meta-line small">{Object.values(r.by_season).map((x) => fmtPct(x)).join(' / ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Ranking accuracy: Line % AUC {v.yardage_lab.auc_line_pct.toFixed(3)} vs the old SimYard% {v.yardage_lab.auc_old_sim.toFixed(3)}.
            Line % calibration (said / happened): {v.yardage_lab.calibration.filter((c) => c.n >= 100).map((c) => `${fmtPct(c.said)}/${fmtPct(c.happened)}`).join(', ')}.
          </p>
        </>
      )}

      {v.paydirt && (
        <>
          {v.paydirt.pools && (
            <>
              <h3>Paydirt Lab pool</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Pool</th><th>Players / wk</th><th>Holds this share of real TD scorers</th><th>Top 15 / wk scored</th><th>by season</th></tr></thead>
                  <tbody>
                    {v.paydirt.pools.map((r) => (
                      <tr key={r.pool}>
                        <td>{r.pool}</td><td>{r.players_per_slate}</td><td>{fmtPct(r.share_of_td_scorers_in_pool, 1)}</td>
                        <td><strong>{fmtPct(r.signal_td_rate, 1)}</strong></td>
                        <td className="meta-line small">{Object.values(r.signal_by_season).map((x) => fmtPct(x)).join(' / ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="meta-line small">
                The old pool (top 2 red-zone players per team, 4 a game) left out about two thirds of the players who
                actually scored. Since 2026-10-12 the pool is everyone with {v.paydirt.min_rz}+ red-zone touches a game.
              </p>
            </>
          )}
          <h3>Paydirt Signal: old gate vs grade gate</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Group (Paydirt Lab's eligible pool)</th><th>n</th><th>Scored a TD</th><th>by season</th></tr></thead>
              <tbody>
                {v.paydirt.gates.map((r) => (
                  <tr key={r.group}>
                    <td>{r.group}</td><td>{r.n.toLocaleString()}</td><td><strong>{fmtPct(r.td_rate, 1)}</strong></td>
                    <td className="meta-line small">{Object.values(r.by_season).map((x) => fmtPct(x)).join(' / ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta-line small">
            Ranking accuracy in the same pool: SimTD% AUC {v.paydirt.auc_sim.toFixed(3)} vs grade model {v.paydirt.auc_grade.toFixed(3)}.
            Paydirt Lab's signal used the grade gate from 2026-10-11 (this table: the old top-2 pool) and the wider pool's top 15 from 2026-10-12.
          </p>
        </>
      )}

      <h3>How the model weighs things</h3>
      <div className="grade-model-grid">
        {['td', '100'].map((t) => {
          const m = model.models[t]
          const items = m.features.map((f, i) => ({ f, w: m.w[i + 1] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
          const max = Math.max(...items.map((x) => Math.abs(x.w)))
          return (
            <div className="table-wrap" key={t} style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t === 'td' ? 'Anytime TD' : '100+ scrimmage yards'}</div>
              {items.map((x) => (
                <div key={x.f} className="coef-row">
                  <span className="coef-label">{FEATURE_LABELS[x.f] || x.f}</span>
                  <span className="coef-bar-track">
                    <span className={x.w >= 0 ? 'coef-bar pos' : 'coef-bar neg'} style={{ width: `${(Math.abs(x.w) / max) * 100}%` }} />
                  </span>
                  <span className="coef-val">{x.w >= 0 ? '+' : ''}{x.w.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <p className="meta-line small">
        Weights are per standard deviation of each input, so they're comparable. Inputs overlap a lot
        (touches, red-zone touches and Usage Sig move together), so read single weights loosely: the
        recent (last-3-week) usage terms carry most of what the season-long ones would. Matchup inputs
        (opponent rank and TD rate allowed) earn almost no weight once usage is known, the same finding
        as the Zone Score v2 regression. Refit by hand with <code>build_grade_model.py</code>.
      </p>
    </div>
  )
}
