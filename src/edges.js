// 2026-11-02 (user: find the "other things" -- edges the box score doesn't carry -- and add them as filters). Each edge was tested
// on the held-out Risk Slider rows 2023-25 against the CALIBRATED chance the app already shows, vs its own season's baseline, and
// kept only if it beat (or missed) that chance in every season (claude/REPORT_ComboFilters_2026-11-02.md). Context only -- grades,
// TD % and yards don't change.
//   📈 High team total   the market's implied team total in the week's top third (Vegas CONTEXT -- never in the grade):
//                        anytime TD +4.8 pts over our chance every season; RBs +8.7; with red-zone touches up +10.3
//   📉 Low team total    bottom third: TD 5.3 pts under our chance every season (WRs -5.9)
//   🔁 QB change         his team is starting a different QB than its usual one (most pass attempts over its last 4 games):
//                        RB / WR / TE lines 4.6 under our chance every season (TDs -5.9, WR TDs -7.8)
//   💨 Wind 15+          yardage lines 3.6 under our chance every season (forecast: the day's top wind 18+ mph, or 15+ right now)
//   🚑 Missed last game  he didn't play his team's last game: yardage lines 6.6 under our chance every season
export const EDGES = [
  { v: 'hightotal', label: '📈 High team total', title: "Market team total in this week's top third (sportsbook context — never in our grade). 2023-25 held out: anytime TD hit 4.8 pts more often than our chance, every season (RBs +8.7)" },
  { v: 'lowtotal', label: '📉 Low team total', title: "Market team total in this week's bottom third. Held out: TDs 5.3 pts UNDER our chance, every season — tap twice to hide them" },
  { v: 'qbchange', label: '🔁 QB change', title: "His team is starting a different QB than the one who threw most of its passes over the last 4 games. Held out: RB / WR / TE lines 4.6 pts under our chance (TDs -5.9), every season — tap twice to hide them" },
  { v: 'wind', label: '💨 Windy', title: 'Outdoor game with 15+ mph wind (forecast day max 18+). Held out: yardage lines 3.6 pts under our chance, every season — tap twice to hide them' },
  { v: 'missedlast', label: '🚑 Missed last game', title: "Didn't play his team's last game. Held out: yardage lines 6.6 pts under our chance, every season — tap twice to hide them" },
]

// slate: the week's matchup rows; logs: player_game_logs.json; wind: team (home side) -> mph on game day
export function edgeIndex(slate, logs, wind, schedule) {
  const ix = new Map()
  const rows = slate?.matchups || []
  if (!rows.length) return ix
  // implied team total thirds across the week's teams
  const tot = {}
  for (const m of rows) if (m.implied_total != null && tot[m.team] == null) tot[m.team] = m.implied_total
  const vals = Object.values(tot).sort((a, b) => a - b)
  const lo = vals[Math.floor(vals.length / 3)], hi = vals[Math.ceil((2 * vals.length) / 3) - 1]
  // usual QB: most pass attempts in the team's last 4 games (game logs, this season)
  const qbChange = {}
  if (logs) {
    const byTeam = {}
    for (const [id, games] of Object.entries(logs)) {
      for (const g of games || []) if ((g.pass_att || 0) >= 5) (byTeam[g.team] = byTeam[g.team] || []).push({ id, week: g.week, att: g.pass_att })
    }
    const qb1 = {}
    for (const m of rows) {
      if (m.position !== 'QB') continue
      if (m.depth_label === 'QB1' || (qb1[m.team] == null && m.use_rank === 1)) qb1[m.team] = m.player_id
    }
    for (const [team, list] of Object.entries(byTeam)) {
      const weeks = [...new Set(list.map((x) => x.week))].sort((a, b) => b - a).slice(0, 4)
      const att = {}
      for (const x of list) if (weeks.includes(x.week)) att[x.id] = (att[x.id] || 0) + x.att
      const usual = Object.entries(att).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (usual && qb1[team] && qb1[team] !== usual) qbChange[team] = true
    }
  }
  const homeOf = {}
  for (const g of schedule?.games || []) if (g.week === slate.week) { homeOf[g.home_team] = g.home_team; homeOf[g.away_team] = g.home_team }
  for (const m of rows) {
    const e = []
    const t = tot[m.team]
    if (t != null && vals.length >= 6) { if (t >= hi) e.push('hightotal'); else if (t <= lo) e.push('lowtotal') }
    if (m.position !== 'QB' && qbChange[m.team]) e.push('qbchange')
    if ((wind?.[homeOf[m.team]] ?? 0) >= 15) e.push('wind')
    if (m.played_last === false && (m.teamGp ?? 1) > 0) e.push('missedlast')
    ix.set(m.player_id, e)
  }
  return ix
}

// game-day wind for each outdoor home team this week (/api/weather: current conditions on game day, else the forecast day max - 3)
export async function loadWind(schedule, week, getJson) {
  const out = {}
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = (schedule?.games || []).filter((g) => g.week === week && g.roof !== 'dome' && g.roof !== 'closed' && g.home_score == null)
  await Promise.all(games.map(async (g) => {
    const w = await getJson(`/api/weather?team=${g.home_team}`)
    if (!w) return
    if (g.gameday === today && w.current?.windMph != null) out[g.home_team] = w.current.windMph
    else {
      const d = (w.forecastDays || []).find((x) => x.date === g.gameday)
      if (d?.maxWindMph != null) out[g.home_team] = d.maxWindMph - 3 // day max runs above game-time wind
    }
  }))
  return out
}
