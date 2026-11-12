import { useEffect, useState } from 'react'

// 2026-11-12 Track Record summary (RecordSummary.jsx; same component as Slap Shot / CourtIQ): one row per tested list, each list's top 3
// a week shown, only its #1 graded (rank 1). Our chance is the measuring stick -- no book prices here. Weeks are placed on the chart at
// their Sunday (season_schedule.json) and labelled "Week N".
const TOP = 3
const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? (u.endsWith('.csv') ? r.text() : r.json()) : null)).catch(() => null)
const res = (r) => (r === 'hit' ? true : r === 'miss' ? false : null)

export const RANGES_WEEKS = [['28', '4 weeks'], ['56', '8 weeks'], ['season', 'Season'], ['custom', 'Custom']]
// tested model changes shipped this season (each passed a held-out test first; see nfl_project/claude/CLAUDE.md)
const MARKERS = [
  { date: '2026-10-26', label: 'injury-exit games out of usage' },
  { date: '2026-11-05', label: 'RB2 fix' },
  { date: '2026-11-09', label: 'starting-QB TD skill' },
]

function csv(t) {
  const [h, ...rows] = String(t || '').trim().split(/\r?\n/)
  const k = (h || '').split(',')
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [k[i], v])))
}

export function useRecordLists() {
  const [out, setOut] = useState(null)
  useEffect(() => {
    Promise.all(['prism_picks.json', 'radar.json', 'longshot.json', 'bounce.json', 'fades.json', 'season_schedule.json', 'grade_record.csv'].map((f) => get(`/data/${f}`)))
      .then(([pp, radar, ls, bounce, fades, sched, gr]) => {
        // each week -> its most common game day (the Sunday)
        const byWk = new Map()
        for (const g of sched?.games || []) { const m = byWk.get(g.week) || {}; m[g.gameday] = (m[g.gameday] || 0) + 1; byWk.set(g.week, m) }
        const sunday = new Map([...byWk.entries()].map(([w, m]) => [w, Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]]))
        const weekOf = new Map([...sunday.entries()].map(([w, d]) => [d, w]))
        const dateOf = (w) => sunday.get(w)
        const weekly = (weeks, pick, chanceOf, labelOf, replayOf) => (weeks || []).filter((w) => dateOf(w.week)).flatMap((w) => (pick(w) || []).slice(0, TOP)
          .map((c, i) => ({ date: dateOf(w.week), rank: i + 1, name: c.name, label: labelOf(c), chance: chanceOf(c), hit: res(c.result), replay: Boolean(replayOf?.(w)) })))
          .filter((p) => p.chance != null)
        const lists = []
        if (pp?.weeks) {
          lists.push({ key: 'prism', label: "💎 PRISM Picks · #1 = this week's pick", picks: weekly(pp.weeks, (w) => w.picks, (c) => c.chance, (c) => c.label) })
          lists.push({ key: 'mid', label: '⚖️ Mid-range', picks: weekly(pp.weeks, (w) => w.tiers?.mid, (c) => c.chance, (c) => c.label) })
          lists.push({ key: 'long', label: '🌠 Long shots', picks: weekly(pp.weeks, (w) => w.tiers?.long, (c) => c.chance, (c) => c.label) })
        }
        if (radar?.weeks) lists.push({ key: 'radar', label: '🔦 Under the radar', picks: weekly(radar.weeks, (w) => w.picks, (c) => c.chance, () => 'anytime TD', (w) => w.replay) })
        if (ls?.weeks) lists.push({ key: 'longshot', label: '🎯 Long-shot creators', picks: weekly(ls.weeks, (w) => w.picks, (c) => c.chance, () => 'anytime TD', (w) => w.replay) })
        // bounce-back / fade: the "said" is the list's track-record rate at that size (finishes over / under his line)
        if (bounce?.weeks) lists.push({ key: 'bounce', label: '📈 Bounce-back', picks: weekly(bounce.weeks, (w) => w.picks, (c) => c.track, (c) => `over ${c.line} scrimmage yds`) })
        if (fades?.weeks) lists.push({ key: 'fade', label: '🧊 Fades', picks: weekly(fades.weeks, (w) => w.fades, (c) => c.track, (c) => `under ${c.line} scrimmage yds`) })
        // model check: every graded player, by month -- anytime TD chance vs how often he scored
        const m = new Map()
        for (const r of csv(gr)) {
          const d = sunday.get(Number(r.week)), p = Number(r.p_td), td = Number(r.tds)
          if (!d || !Number.isFinite(p) || !Number.isFinite(td) || r.season !== String(sched?.season || r.season)) continue
          const k = d.slice(0, 7), x = m.get(k) || { n: 0, said: 0, hit: 0 }
          x.n += 1; x.said += p; x.hit += td > 0 ? 1 : 0
          m.set(k, x)
        }
        const modelCheck = [...m.entries()].filter(([, x]) => x.n >= 300).sort().reverse().map(([k, x]) => ({
          month: k, label: new Date(`${k}-15T12:00:00`).toLocaleDateString([], { month: 'short', year: 'numeric' }), n: x.n,
          stats: [{ label: 'Anytime TD', said: x.said / x.n, hit: x.hit / x.n }] }))
        setOut({
          lists: lists.filter((l) => l.picks.length), liveSince: null, modelCheck,
          markers: MARKERS,
          fmtDay: (d) => (weekOf.has(d) ? `Week ${weekOf.get(d)}` : new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })),
        })
      })
  }, [])
  return out
}
