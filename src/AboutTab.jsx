import { useEffect, useState } from 'react'

// 📌 About (Slap Shot's tabs/AboutTab.jsx, 2026-10-18 revamp): what the numbers are, what's tested, what's context.
export default function AboutTab() {
  const [gm, setGm] = useState(null)
  useEffect(() => {
    fetch('/data/grade_model.json').then((r) => (r.ok ? r.json() : null)).then(setGm).catch(() => {})
  }, [])
  const loso = gm?.validation?.td?.loso || []
  return (
    <div className="about">
      <div className="section-head">
        <h2>📌 About Six Points</h2>
        <p className="meta-line">NFL touchdown and yardage projections from Prism Labs — same build and the same testing habits as Slap Shot (NHL).</p>
      </div>
      <div className="card">
        <b>How a grade is made</b>
        <ul>
          <li><b>TD %</b> — one logistic model on each player's role: carries, targets and red-zone touches (season and last 3
            games, shrunk toward last season), TD rate per touch, snap share, injury status, his team's scoring rate and the
            opponent's TDs allowed, touches inherited from injured teammates, and whether he scored in his last 3 games.
            Fit on 2023-25 and tested one season at a time on data it never saw
            {loso.length ? ` (AUC ${loso.map((s) => s.auc).join(' / ')})` : ''}, then calibrated so 30% means 30%.</li>
          <li><b>2+ TD %</b> — fit on top of the TD chance; a simple Poisson over-states a second TD for the top backs.</li>
          <li><b>100+ %</b> and <b>Est. Yards</b> — the same role inputs plus what the opponent gives up to the position's role (that part held up for yards, not TDs).</li>
          <li><b>Grade</b> — where a player's TD and 100+ chances rank in this week's pool (A+ top 3%).</li>
        </ul>
      </div>
      <div className="card">
        <b>Tested and used vs. shown as context</b>
        <ul>
          <li>Used: the opponent's team TD defense (▲ / ▼ on a grade), recent TDs (🔥 Hot hand), vacated roles (+ role chips), Breakout Watch.</li>
          <li>Context only: defense-vs-position splits, position "leaks", head-to-head history — tested and added nothing for TDs.</li>
          <li>Not used anywhere in a grade: Vegas team totals or spreads. Sportsbook anytime-TD prices are shown for comparison (Book Odds / Edge), never as an input.</li>
          <li>Defense rankings by category (Cheat Sheets): each defense ranked vs TDs and vs RB / WR / TE yards. A defense can be soft in one and tough in another, so TD lists show the TD rank and yardage lists the yards rank. RB / TE yards matchups are in Est. Yards; WR yards matchups are context only (they made held-out WR projections slightly worse).</li>
          <li>Tested as nothing: TD droughts ("due"), opponent EPA ratings on top of the model — for TDs, and (Oct 2026) for yards: team offense / defense EPA moved RB / WR / TE yards estimates by under 0.1 yd a game.</li>
          <li>Tested as nothing (Oct 2026): man / zone coverage and blitz matchups (a receiver's own numbers vs man, zone or the blitz, against how often the defense plays it) and offense-type matchups (play action, shotgun, heavy personnel vs the defense's results against each) — 2023-25, each season held out, no consistent gain for TDs or yards. Last season's man / zone / blitz lines show in a player's game log on 📊 Stats as context.</li>
          <li>💎 PRISM Picks (top of Cheat Sheets) — paused (Oct 2026). The first version picked lines like 25+ scrimmage yards for a WR1: 90% hit in testing, but not a real prop. The other apps now use real lines (lines a player clears about half the time, at a 55-75% chance); for Six Points that rule found only about one pick a week, mostly backup running backs, because the model projects scrimmage yards, not receiving and rushing yards separately. It returns once those lines are modelled and tested. Anytime TD never clears the bar.</li>
        </ul>
      </div>
      <div className="card">
        <b>Schedule</b>
        <ul>
          <li>Tuesday 8 AM ET — full rebuild of the week's slate and grades; last week graded.</li>
          <li>Daily 9 AM ET — injury / roster refresh (ESPN), re-grade, publish. Anytime TD odds: Thursday for TNF, Saturday for Sunday / Monday.</li>
          <li>Sunday 11:50 AM ET — Top Picks locked before the early games.</li>
        </ul>
      </div>
      <p className="meta-line small">For entertainment. Projections are probabilities, not guarantees. Gambling problem? Call 1-800-GAMBLER.</p>
    </div>
  )
}
