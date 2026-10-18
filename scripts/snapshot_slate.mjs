// Frozen pre-kickoff snapshot of the WHOLE graded slate (2026-10-18 revamp, Phase C; Slap Shot's
// snapshot_projections.mjs) -> public/data/snapshots/<season>-wk<week>.json. Track Record > Cheat Sheets rebuilds each
// week's lists from it (what was actually published before the Sunday 1 PM window), so the record can't drift when the
// model is refit. Runs in run_sunday_lock.bat right after the Top Picks lock (same 11:50 AM - 12:59 PM ET window).
//
//   node scripts/snapshot_slate.mjs                      # Sunday-window rule, never rewrites an existing snapshot
//   node scripts/snapshot_slate.mjs --force              # snapshot now / rewrite
//   node scripts/snapshot_slate.mjs --backfill <all_matchups json> [--odds <odds json>]
//                                                        # a past week's pre-kickoff pool (from git), marked backfilled
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockMs, startedTeams } from '../src/topPicks.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null)
const force = process.argv.includes('--force')
const backfill = arg('--backfill')
const readData = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'))
const data = backfill ? JSON.parse(fs.readFileSync(backfill, 'utf8')) : readData('all_matchups_latest.json')
const schedule = readData('season_schedule.json')
const outDir = path.join(root, 'public/data/snapshots')
const outPath = path.join(outDir, `${data.season}-wk${data.week}.json`)

if (fs.existsSync(outPath) && !force && !backfill) {
  console.log(`Snapshot for ${data.season} week ${data.week} already taken -- left unchanged.`)
  process.exit(0)
}
const now = Date.now()
if (!backfill && !force) {
  const lockAt = lockMs(schedule, data.week)
  if (lockAt == null || now < lockAt || now > lockAt + 69 * 60 * 1000) {
    console.log(`Not in the Sunday lock window for week ${data.week} -- no snapshot.`)
    process.exit(0)
  }
}
let odds = null
const oddsPath = arg('--odds') || path.join(root, 'public/data/odds', `${data.season}-wk${data.week}.json`)
if (fs.existsSync(oddsPath)) odds = JSON.parse(fs.readFileSync(oddsPath, 'utf8'))

const rows = data.matchups || []
const tdSorted = rows.map((m) => m.p_td ?? 0).sort((a, b) => a - b)
const rankPct = (v) => { let i = 0; while (i < tdSorted.length && tdSorted[i] < v) i += 1; return tdSorted.length ? i / tdSorted.length : 0 }
const started = backfill ? new Set() : startedTeams(schedule, data.week, now)
const keep = ['player_id', 'player_name', 'team', 'opponent', 'position', 'grade', 'grade_pct', 'p_td', 'p_td2', 'p_100', 'est_yards',
  'td_l3', 'def_tier', 'def_rank', 'breakout', 'role_gain', 'week_status', 'depth_label']
const players = rows.map((m) => {
  const book = odds?.players?.[m.player_id]
  const r = Object.fromEntries(keep.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]))
  r.hotHand = (m.td_l3 ?? 0) > 0 && rankPct(m.p_td ?? 0) < 0.75
  if (book) {
    r.book = { best: book.best, bestBook: book.bestBook, bestImplied: book.bestImplied }
    r.edge = m.p_td != null ? Math.round((m.p_td * 100 - book.bestImplied) * 10) / 10 : null
  }
  if (started.has(m.team)) r.started = true
  return r
})
const out = {
  season: data.season, week: data.week, snapshot_at: backfill ? null : new Date(now).toISOString(),
  pool_generated_at: data.generated_at, backfilled: Boolean(backfill), odds_file: odds ? path.basename(oddsPath) : null,
  started_teams: [...started].sort(), players,
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out))
const indexPath = path.join(outDir, 'index.json')
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { snapshots: [] }
index.snapshots = [...index.snapshots.filter((s) => !(s.season === out.season && s.week === out.week)),
  { season: out.season, week: out.week, file: path.basename(outPath), backfilled: out.backfilled, snapshot_at: out.snapshot_at }]
  .sort((a, b) => a.season - b.season || a.week - b.week)
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1))
console.log(`Snapshot ${out.season} week ${out.week}: ${players.length} players${odds ? `, ${Object.keys(odds.players).length} priced` : ''}${backfill ? ' (backfilled)' : ''}`)
