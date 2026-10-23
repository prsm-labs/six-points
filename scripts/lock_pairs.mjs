// Freezes the week's Pairs (src/pairs.js, every mode + each prop on Balanced) into
// public/data/pairs/<season>-wk<week>.json -- what Track Record > Pairs grades (Slap Shot's scripts/lock_pairs.mjs,
// 2026-10-18 revamp). Same rule as the Top Picks lock: Sunday 11:50 AM - 12:59 PM ET, teams already kicked off
// (Thursday night, Sunday-morning international) left out, never re-locks.
//   node scripts/lock_pairs.mjs            # Sunday-window rule
//   node scripts/lock_pairs.mjs --force    # lock now / re-lock (manual use)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockMs, startedTeams } from '../src/topPicks.js'
import { buildPairs, LEVEL_KEYS, MODE_KEYS, pairRecord } from '../src/pairs.js'
import { enrichSlate } from '../src/slateCore.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'))
const raw = read('all_matchups_latest.json')
const schedule = read('season_schedule.json')
const oddsPath = path.join(root, 'public/data/odds', `${raw.season}-wk${raw.week}.json`)
const odds = fs.existsSync(oddsPath) ? JSON.parse(fs.readFileSync(oddsPath, 'utf8')) : null
const data = enrichSlate(raw, odds)
const outDir = path.join(root, 'public/data/pairs')
const outPath = path.join(outDir, `${data.season}-wk${data.week}.json`)

if (fs.existsSync(outPath) && !force) {
  console.log(`Pairs for ${data.season} week ${data.week} already locked -- left unchanged.`)
  process.exit(0)
}
const now = Date.now()
const lockAt = lockMs(schedule, data.week)
if (!force && (lockAt == null || now < lockAt || now > lockAt + 69 * 60 * 1000)) {
  console.log(`Not in the Sunday lock window for week ${data.week} -- Pairs not locked.`)
  process.exit(0)
}
const started = startedTeams(schedule, data.week, now)
const boards = {}
for (const mode of MODE_KEYS) boards[mode] = buildPairs(data.matchups, { mode, excludeTeams: started }).map(pairRecord)
for (const prop of ['td', 'yds']) boards[`balanced:${prop}`] = buildPairs(data.matchups, { mode: 'balanced', prop, excludeTeams: started }).map(pairRecord)
// 2026-10-23 levels: safe / mid-range / long-shot boards for every mode (plain mode keys stay the original "all" board)
for (const level of LEVEL_KEYS.filter((l) => l !== 'all')) for (const mode of MODE_KEYS) boards[`${level}:${mode}`] = buildPairs(data.matchups, { mode, level, excludeTeams: started }).map(pairRecord)
const out = {
  season: data.season, week: data.week, locked_at: new Date(now).toISOString(), pool_generated_at: data.generated_at,
  odds_file: odds ? path.basename(oddsPath) : null, excluded_started_teams: [...started].sort(), forced: force, boards,
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out))
const indexPath = path.join(outDir, 'index.json')
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { locks: [] }
index.locks = [...index.locks.filter((l) => !(l.season === out.season && l.week === out.week)),
  { season: out.season, week: out.week, file: path.basename(outPath), locked_at: out.locked_at }]
  .sort((a, b) => a.season - b.season || a.week - b.week)
fs.writeFileSync(indexPath, JSON.stringify(index, null, 1))
console.log(`Locked Pairs ${out.season} week ${out.week}: ${Object.entries(boards).map(([k, v]) => `${k} ${v.length}`).join(', ')}`)
