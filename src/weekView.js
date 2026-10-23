import { useSyncExternalStore } from 'react'

// 📅 Week picker (2026-10-23, user: one date pick at the top that shows what a past week looked like and how it played
// out, instead of ever-growing "past weeks" lists -- NFL weeks, with their dates). Six Points' pages each load the week's
// slate themselves (all_matchups_latest.json), so a picked past week is served through fetch itself: while a week is
// picked, these files come back as that week's version and every page draws that week, unchanged:
//   all_matchups_latest.json -> public/data/weeks/<season>-wk<N>.json (the full slate as frozen at that week's Sunday
//                               lock -- week 6 recovered from git, later weeks written by snapshot_slate.mjs), or for weeks
//                               saved before the grade model (1-5) a slate rebuilt from grade_record.csv (grade, TD /
//                               100-yard chances, breakout, soft matchup as graded that week), marked `replay`
//   prism_picks.json / fades.json -> `week` set to the picked week (their own weekly history shows that week)
// Every row gets that week's real line from grade_record.csv: m.actual = { tds, yds }.
let week = null // null = this week
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())
export const setViewWeek = (w) => { week = w ? Number(w) : null; notify() }
export const useViewWeek = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => week, () => week)
export const viewWeek = () => week

const realFetch = window.fetch.bind(window)
const memo = {}
const once = (k, f) => (memo[k] = memo[k] || f())
const getJson = (url) => realFetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)

export function gradeRecord() {
  return once('grade_record', async () => {
    const text = await realFetch('/data/grade_record.csv').then((r) => (r.ok ? r.text() : '')).catch(() => '')
    const lines = text.trim().split(/\r?\n/)
    const head = lines.shift()?.split(',') || []
    return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])))
  })
}
export const weekIndex = () => once('weeks_index', () => getJson('/data/weeks/index.json'))
export const latestSlate = () => once('latest', () => getJson('/data/all_matchups_latest.json'))

const num = (v) => (v === '' || v == null ? null : Number(v))
const bool = (v) => v === 'True' || v === 'true'

async function pastSlate(w) {
  return once(`wk${w}`, async () => {
    const [latest, idx, rec] = await Promise.all([latestSlate(), weekIndex(), gradeRecord()])
    const season = latest?.season
    const rows = rec.filter((r) => Number(r.season) === season && Number(r.week) === w)
    const actual = new Map(rows.map((r) => [r.player_id, { tds: num(r.tds), yds: num(r.scrim_yds) }]))
    const saved = idx?.weeks?.find((x) => x.season === season && x.week === w)
    if (saved) {
      const full = await getJson(`/data/weeks/${saved.file}`)
      if (full?.matchups) return { ...full, past: true, replay: false, matchups: full.matchups.map((m) => ({ ...m, actual: actual.get(m.player_id) || null })) }
    }
    return {
      season, week: w, generated_at: null, past: true, replay: true, not_playing: [],
      matchups: rows.map((r) => ({
        season, week: w, team: r.team, opponent: r.opponent, player_id: r.player_id, player_name: r.player_name, position: r.position,
        p_td: num(r.p_td), p_100: num(r.p_100), grade: r.grade || null, grade_pct: num(r.grade_pct), breakout: bool(r.breakout),
        soft_matchup: bool(r.soft_matchup), zone_score: num(r.zone_score), actual: actual.get(r.player_id) || null,
      })),
    }
  })
}

const respond = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  if (week != null && url.startsWith('/data/')) {
    const path = url.split('?')[0]
    if (path === '/data/all_matchups_latest.json') return respond(await pastSlate(week))
    if (path === '/data/prism_picks.json' || path === '/data/fades.json') {
      const d = await realFetch(url, init).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (d) return respond({ ...d, week, weeks: (d.weeks || []).filter((x) => x.week <= week) })
    }
  }
  return realFetch(input, init)
}
