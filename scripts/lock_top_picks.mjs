// Freezes the week's Top Picks (src/topPicks.js) into public/data/top_picks/<season>-wk<week>.json
// -- the record the Breakout Watch tab shows and grades once it exists, so a week's picks are
// provably the ones published before the Sunday 1 PM window (user decision 2026-10-11: lock just
// before Sunday noon). Mirrors Slap Shot's scripts/lock_top3.mjs.
//
//   node scripts/lock_top_picks.mjs           # locks only from Sunday 11:50 AM ET onward, never re-locks
//   node scripts/lock_top_picks.mjs --force   # lock now / re-lock (manual use only)
//
// Run right after refresh_injuries.py (run_sunday_lock.bat) so the injury gate is current. Teams
// whose game already kicked off (Thursday night, Sunday-morning international games) are left out.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCK, lockMs, startedTeams, topPicks } from '../src/topPicks.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'))
const data = read('all_matchups_latest.json')
const schedule = read('season_schedule.json')
const outDir = path.join(root, 'public/data/top_picks')
const outPath = path.join(outDir, `${data.season}-wk${data.week}.json`)

if (fs.existsSync(outPath) && !force) {
  console.log(`Top Picks for ${data.season} week ${data.week} already locked -- left unchanged.`)
  process.exit(0)
}
const lockAt = lockMs(schedule, data.week)
const now = Date.now()
if (!force && (lockAt == null || now < lockAt)) {
  console.log(`Top Picks for week ${data.week} stay live until ${LOCK.label} (${lockAt ? new Date(lockAt).toISOString() : 'no Sunday games'}).`)
  process.exit(0)
}
// The lock only means "published before the 1 PM window" if it happens before 1 PM -- a run that
// misses the window must not quietly lock a slate that's already being played.
const WINDOW_MS = 69 * 60 * 1000 // 11:50 AM -> 12:59 PM ET
if (!force && now > lockAt + WINDOW_MS) {
  console.log(`Lock window for week ${data.week} (${LOCK.label} to 12:59 PM ET) has passed -- not locking. Use --force to lock anyway.`)
  process.exit(0)
}
if (!data.matchups.some((m) => m.p_td != null)) {
  console.log('Pool has no grade-model fields -- nothing to lock.')
  process.exit(1)
}
const started = startedTeams(schedule, data.week, now)
const picks = topPicks(data.matchups, { excludeTeams: started })
const keep = ['player_id', 'player_name', 'team', 'opponent', 'position', 'grade', 'p_td', 'p_100', 'breakout', 'soft_matchup', 'form_ratio', 'injury_gate']
const out = {
  season: data.season,
  week: data.week,
  locked_at: new Date(now).toISOString(),
  pool_generated_at: data.generated_at,
  excluded_started_teams: [...started].sort(),
  forced: force,
  picks: picks.map((t) => ({ tier: t.tier, stat: t.stat, why: t.why, player: t.m ? Object.fromEntries(keep.map((k) => [k, t.m[k]])) : null })),
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
const indexPath = path.join(outDir, 'index.json')
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { locks: [] }
index.locks = [...index.locks.filter((l) => !(l.season === out.season && l.week === out.week)),
  { season: out.season, week: out.week, file: path.basename(outPath), locked_at: out.locked_at }]
  .sort((a, b) => a.season - b.season || a.week - b.week)
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1))
console.log(`Locked Top Picks ${out.season} week ${out.week}: ${out.picks.map((p) => `${p.tier}=${p.player?.player_name ?? 'none'}`).join(', ')}` +
  (started.size ? ` (left out started games: ${[...started].join(' ')})` : ''))
