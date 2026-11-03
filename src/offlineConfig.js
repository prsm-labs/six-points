import { pct } from './offline.js'

// 2026-11-02 (user): what Six Points' 📦 offline snapshot and data download hold (offline.js does the work).
// Snapshot = every top-level data file + this week's dated files. Download = our own numbers only (no book prices).
const j = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const TOP = ['all_matchups_latest', 'bounce', 'def_players', 'depth_charts', 'fades', 'first_td_stats', 'game_sim_inputs', 'grade_model', 'h2h_today',
  'injury_report', 'kote_model', 'line_board', 'player_game_logs', 'player_situational_splits', 'players', 'prism_picks', 'radar', 'route_profiles',
  'scheme_splits', 'season_schedule', 'stats_book', 'stats_book_2025', 'team_rankings', 'team_stats', 'sims/index', 'pairs/index', 'top_picks/index',
  'snapshots/index', 'weeks/index']
const slate = () => j('/data/all_matchups_latest.json')

export default {
  app: 'Six Points',
  league: 'NFL',
  url: 'https://nfl.degenlabs.app',
  what: 'this week’s slate (projections, Cheat Sheets, Scouting, sims, Track Record)',
  tablesWhat: 'this week’s projections, every yardage / TD line with our chance, Game Sims, PRISM Picks',
  async label() {
    const s = await slate()
    return s?.week ? `${s.season} week ${s.week}` : ''
  },
  async files() {
    const [s, sims] = await Promise.all([slate(), j('/data/sims/index.json')])
    const key = s?.week ? `${s.season}-wk${s.week}` : null
    const teams = new Set((s?.matchups || []).map((r) => r.team))
    return [
      ...TOP.map((f) => `/data/${f}.json`),
      '/data/grade_record.csv', '/data/track_record.csv',
      ...(key ? ['lines', 'pairs', 'top_picks', 'snapshots', 'odds'].map((d) => `/data/${d}/${key}.json`) : []),
      ...(sims?.games || []).map((g) => `/data/sims/${g.game_id}.json`),
      ...[...teams].map((t) => `/data/onoff/${t}.json`),
    ]
  },
  async tables() {
    const s = await slate()
    const key = s?.week ? `${s.season}-wk${s.week}` : null
    const [lines, sims, picks] = await Promise.all([key ? j(`/data/lines/${key}.json`) : null, j('/data/sims/index.json'), j('/data/prism_picks.json')])
    const lineRows = (lines?.players || []).flatMap((p) => [
      ...(p.lines?.YDS || []).map(([T, ch, hits]) => ({ p, prop: `${T}+ ${p.pos === 'WR' || p.pos === 'TE' ? 'receiving' : 'scrimmage'} yards`, ch, hits, n: p.n })),
      ...(p.lines?.TD || []).map(([, ch, hits]) => ({ p, prop: 'anytime TD', ch, hits, n: p.nTd })),
      ...(p.lines?.TD2 || []).map(([, ch, hits]) => ({ p, prop: '2+ TDs', ch, hits, n: p.nTd })),
    ])
    return [
      {
        name: 'projections.csv', about: 'every player on this week’s slate: TD / 2+ TD / 100+ yard chances, est. yards, grade', rows: s?.matchups || [],
        cols: [
          ['Season', (r) => r.season], ['Week', (r) => r.week], ['Player', (r) => r.player_name], ['Team', (r) => r.team], ['Opp', (r) => r.opponent], ['Pos', (r) => r.position],
          ['Depth', (r) => r.depth_label], ['Status', (r) => r.week_status], ['Grade', (r) => r.grade], ['TD %', (r) => pct(r.p_td)], ['2+ TD %', (r) => pct(r.p_td2)],
          ['100+ yds %', (r) => pct(r.p_100)], ['First TD %', (r) => r.first_td_pct], ['Est. yards', (r) => r.est_yards], ['Touches / game', (r) => r.touches_per_game?.toFixed(1)],
          ['Red-zone touches / game', (r) => r.redzone_touches_per_game?.toFixed(2)], ['Opp TD defense rank (1 = softest)', (r) => r.def_rank], ['Team TDs projected', (r) => r.team_td_proj],
        ],
      },
      {
        name: 'lines.csv', about: 'every yardage / TD line on the Risk Slider ladder with our chance and how often he cleared it lately', rows: lineRows,
        cols: [['Week', () => s?.week], ['Player', (r) => r.p.name], ['Team', (r) => r.p.team], ['Opp', (r) => r.p.opp], ['Pos', (r) => r.p.pos], ['Line', (r) => r.prop],
          ['Our chance %', (r) => pct(r.ch)], ['Cleared (recent games)', (r) => r.hits], ['Of games', (r) => r.n]],
      },
      {
        name: 'game_sims.csv', about: '15,000 simulated games per matchup', rows: sims?.games || [],
        cols: [['Week', () => sims?.week], ['Away', (g) => g.away], ['Home', (g) => g.home], ['Home win %', (g) => pct(g.homeWin)],
          ['Typical away', (g) => g.typical?.[1]], ['Typical home', (g) => g.typical?.[0]], ['Median away', (g) => g.median?.[1]], ['Median home', (g) => g.median?.[0]]],
      },
      {
        name: 'prism_picks.csv', about: 'every PRISM Pick so far this season with its result', rows: (picks?.weeks || []).flatMap((w) => (w.picks || []).map((k) => ({ w, k }))),
        cols: [['Week', (r) => r.w.week], ['Player', (r) => r.k.name], ['Team', (r) => r.k.team], ['Opp', (r) => r.k.opp], ['Pick', (r) => r.k.label], ['Our chance %', (r) => pct(r.k.chance)],
          ['Past picks at this chance hit %', (r) => pct(r.k.track)], ['Cleared (recent games)', (r) => r.k.last?.[1]], ['Of games', (r) => r.k.last?.[0]], ['Result', (r) => r.k.result], ['Actual', (r) => r.k.actual]],
      },
    ]
  },
}
