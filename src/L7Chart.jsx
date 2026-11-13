import StatGrid from './StatGrid.jsx'

// Per PROMPT_SixPoints_PlayerTeamSlideouts.md §4: pill-toggle row switches the active stat
// category, 7 bars scaled to that category's
// 7-game max, hit/miss coloring (not just bar height) so the "did this clear the bar" read is
// immediate. Colors are the app's own accent/muted tokens (validated via the dataviz skill's
// contrast check: >=6:1 dark, >=4.2:1 light against surface) -- not a fresh categorical pair,
// since hit-vs-miss here is a status/recessive pairing, not two competing identities.

// +250 pass yds and +4 receptions are placeholder thresholds -- not derived from any real
// distribution yet, per spec §4's explicit instruction not to ship these as if validated.
const CATEGORIES = {
  any_td: { label: '🎯 TD', getValue: (g) => g.any_td, threshold: 1, positions: ['QB', 'RB', 'WR', 'TE'] },
  pass_yards: { label: '🎯 +250 Pass Yd', getValue: (g) => g.pass_yards, threshold: 250, positions: ['QB'] },
  pass_td: { label: '🎯 +1 Pass TD', getValue: (g) => g.pass_td, threshold: 1, positions: ['QB'] },
  rush_yards: { label: '🎯 +20 Rush Yd', getValue: (g) => g.rush_yards, threshold: 20, positions: ['RB', 'QB', 'WR'] },
  receptions: { label: '🎯 +4 Rec', getValue: (g) => g.receptions, threshold: 4, positions: ['WR', 'TE', 'RB'] },
  rec_yards: { label: '🎯 +20 Rec Yd', getValue: (g) => g.rec_yards, threshold: 20, positions: ['WR', 'TE', 'RB'] },
  // 2026-11-07: scrimmage yards (rush + rec) -- the stat our Est. Yards projects, so this view gets the dashed projection line
  scrim_yards: { label: '🎯 +50 Scrim Yd', getValue: (g) => (g.rush_yards || 0) + (g.rec_yards || 0), threshold: 50, positions: ['RB', 'WR', 'TE'] },
  // 2026-10-26 defenders (DefenseSlideout.jsx passes position 'DEF'); thresholds are placeholders like the ones above
  def_tkl: { label: '🎯 5+ Tkl', getValue: (g) => g.tkl, threshold: 5, positions: ['DEF'] },
  def_sk: { label: '🎯 Sack', getValue: (g) => g.sk, threshold: 0.5, positions: ['DEF'] },
  def_qbh: { label: '🎯 QB Hit', getValue: (g) => g.qbh, threshold: 1, positions: ['DEF'] },
  def_tfl: { label: '🎯 TFL', getValue: (g) => g.tfl, threshold: 1, positions: ['DEF'] },
  def_pd: { label: '🎯 Pass Def', getValue: (g) => g.pd, threshold: 1, positions: ['DEF'] },
  def_int: { label: '🎯 INT', getValue: (g) => g.int, threshold: 1, positions: ['DEF'] },
}

function secondaryStat(category, game) {
  if (category.startsWith('def_')) return game.snap_pct != null ? `${game.snap_pct}% snp` : 'live'
  switch (category) {
    case 'pass_yards':
    case 'pass_td':
      return `${game.pass_att} att`
    case 'rush_yards':
      return `${game.rush_att} car`
    case 'receptions':
    case 'rec_yards':
      return `${game.targets} tgt`
    case 'scrim_yards':
      return `${game.rush_att + game.targets} opp`
    default:
      return `${game.pass_att + game.rush_att + game.targets} opp`
  }
}

export function defaultCategory(position, recentTargetsPerGame) {
  if (position === 'QB') return 'pass_yards'
  if (position === 'RB') return recentTargetsPerGame >= 3 ? 'receptions' : 'rush_yards'
  return 'rec_yards'
}

// 2026-10-21 (user: dates under the bars): M/D from game_date; games from an earlier season (H2H / home-road views) add the year
const NOW = new Date()
const CUR_SEASON = NOW.getMonth() >= 2 ? NOW.getFullYear() : NOW.getFullYear() - 1 // NFL season year (Sept-Feb)
function barDate(g) {
  if (!g.game_date) return ''
  const [y, m, d] = String(g.game_date).slice(0, 10).split('-')
  return g.season != null && g.season < CUR_SEASON ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : `${Number(m)}/${Number(d)}`
}

function hitRateClass(pct) {
  if (pct >= 57) return 'hit-rate-good'
  if (pct >= 43) return 'hit-rate-mid'
  return 'hit-rate-low'
}

// 2026-11-13 (user: CourtIQ's layout -- one small chart per prop, not one chart with buttons): every category for his position
// gets its own chart (StatGrid.jsx, same file as Slap Shot); the stat picked in the Hit rates card comes first on the picked
// line, else initialCategory. trend: last-5 average through the bars; proj = { category: this week's projection } (dashed).
// pick = { cat, line } from the Hit rates card.
const NAMES = { any_td: 'TDs', pass_yards: 'Pass yards', pass_td: 'Pass TDs', rush_yards: 'Rush yards', receptions: 'Catches', rec_yards: 'Rec yards',
  scrim_yards: 'Scrim yards', def_tkl: 'Tackles', def_sk: 'Sacks', def_qbh: 'QB hits', def_tfl: 'TFL', def_pd: 'Passes def.', def_int: 'INTs' }
export default function L7Chart({ gameLog, position, initialCategory, trend = false, proj = null, pick = null }) {
  const games = gameLog.slice(-7)
  if (games.length === 0) {
    return <p className="empty-state">No games logged yet this season.</p>
  }
  let charts = Object.entries(CATEGORIES).filter(([, c]) => c.positions.includes(position))
    .map(([k, c]) => ({ k, label: NAMES[k] || c.label, get: (g) => c.getValue(g) ?? 0, line: c.threshold, proj: proj?.[k] ?? null }))
  const first = pick && charts.find((c) => c.k === pick.cat) ? pick.cat : initialCategory
  const pc = charts.find((c) => c.k === first)
  if (pc) charts = [pick && pick.cat === pc.k ? { ...pc, line: pick.line, mine: true } : pc, ...charts.filter((c) => c !== pc)]
  return (
    <StatGrid charts={charts} games={games} all={gameLog} trend={trend} projLabel="this week's projection"
      labels={(g) => [g.today ? (g.live ? 'LIVE' : 'This wk') : barDate(g), `${g.home_or_away === '@' ? '@' : 'vs'}${g.opponent}`]}
      sub={(k, g) => (g.today && g.live ? null : secondaryStat(k, g))} />
  )
}
