// Top Picks rules (PROMPT_SixPoints_MirrorSlapShot.md §7) -- plain JS (no React) so the browser
// (BreakoutWatchTab.jsx) and the Sunday lock script (scripts/lock_top_picks.mjs) run the exact same
// code. Mirrors build_grade_model.py's backtest of these rules (grade_model.json -> top_picks).
//
// One player per team, in order: Chalk = highest TD %, Yards = highest 100+ %, Breakout = best
// Breakout Watch player (soft matchup first, then TD %). Players with injury_gate < 0.75
// (Doubtful/Out) and teams whose game has already kicked off are skipped.

export const LOCK = { weekday: 'Sunday', hourET: 11, minuteET: 50, label: 'Sunday 11:50 AM ET' }

/** Kickoff of a season_schedule.json game as epoch ms (gameday + gametime are Eastern time). */
export function kickoffMs(game) {
  if (!game?.gameday) return null
  const [y, m, d] = game.gameday.split('-').map(Number)
  const [hh, mm] = (game.gametime || '13:00').split(':').map(Number)
  // ET is UTC-4 (EDT) or UTC-5 (EST); pick the offset whose ET wall clock matches.
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, hh + off, mm)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(t))
    const h = Number(parts.find((p) => p.type === 'hour').value) % 24
    const mi = Number(parts.find((p) => p.type === 'minute').value)
    if (h === hh && mi === mm) return t
  }
  return Date.UTC(y, m - 1, d, hh + 4, mm)
}

/** Teams whose week-`week` game kicked off before `nowMs`. */
export function startedTeams(schedule, week, nowMs = Date.now()) {
  const out = new Set()
  for (const g of schedule?.games || []) {
    if (g.week !== week) continue
    const k = kickoffMs(g)
    if (k != null && k <= nowMs) {
      out.add(g.home_team)
      out.add(g.away_team)
    }
  }
  return out
}

/** The Sunday 11:50 AM ET lock moment for a week's slate (the Sunday on or after its first game). */
export function lockMs(schedule, week) {
  const sundays = (schedule?.games || [])
    .filter((g) => g.week === week && g.gameday)
    .map((g) => g.gameday)
    .filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0)
    .sort()
  if (!sundays.length) return null
  return kickoffMs({ gameday: sundays[0], gametime: `${LOCK.hourET}:${String(LOCK.minuteET).padStart(2, '0')}` })
}

function pct(p) {
  return `${Math.round((p || 0) * 100)}%`
}

export function topPicks(rows, { excludeTeams } = {}) {
  // 2026-10-22: role-flagged players (build_role_check.py: < 3 team games, depth chart below our usage rank) sit out
  const pool = rows.filter((m) => m.injury_gate >= 0.75 && m.p_td != null && !m.roleFlag && !m.starterBack && !(excludeTeams && excludeTeams.has(m.team)))
  const used = new Set()
  const take = (list) => {
    const p = list.find((m) => !used.has(m.team))
    if (p) used.add(p.team)
    return p || null
  }
  const chalk = take([...pool].sort((a, b) => b.p_td - a.p_td))
  const yards = take([...pool].sort((a, b) => b.p_100 - a.p_100))
  const breakout = take(pool.filter((m) => m.breakout).sort((a, b) => (b.soft_matchup - a.soft_matchup) || (b.p_td - a.p_td)))
  return [
    { tier: 'Chalk', stat: 'td', m: chalk, why: chalk ? `Highest TD chance on the slate (${pct(chalk.p_td)}).` : '' },
    { tier: 'Yards', stat: '100', m: yards, why: yards ? `Best shot at a 100-yard game (${pct(yards.p_100)}), from another team.` : '' },
    {
      tier: 'Breakout', stat: 'td', m: breakout,
      why: breakout ? `Touches up ${Math.round((breakout.form_ratio - 1) * 100)}% over the last 3 weeks${breakout.soft_matchup ? ', in a top-third matchup for his role (yards the defense allows his position)' : ''}.` : '',
    },
  ]
}
