import { useEffect, useMemo, useState } from 'react'
import { parseCsv } from './csv.js'
import { fmtPct } from './gradeUi.jsx'

// Track Record > 📋 Cheat Sheets (Slap Shot's TrackRecordCheatSheets.jsx, 2026-10-18 revamp): every week's Cheat Sheet
// lists rebuilt with the Cheat Sheets ranking and graded against what happened -- hits vs what the model expected.
// Source per week: the frozen pre-kickoff snapshot (public/data/snapshots, taken at the Sunday lock) when there is one;
// earlier weeks are rebuilt from the graded ledger (grade_record.csv, the CURRENT model replayed -- labelled as such).
// Only players whose game was graded count.
const LISTS = [
  { key: 'td', title: '🏈 TD Candidates', p: 'p_td', hit: (o) => o.tds > 0 },
  { key: 'td2', title: '🏈🏈 2+ TD Candidates', p: 'p_td2', hit: (o) => o.tds >= 2 },
  { key: 'yds', title: '💨 100+ Yard Candidates', p: 'p_100', hit: (o) => o.yds >= 100 },
  { key: 'hot', title: '🔥 Hot Hands', p: 'p_td', hit: (o) => o.tds > 0, filter: (m) => m.hotHand },
  { key: 'value', title: '💰 Best Value vs Book', p: 'p_td', hit: (o) => o.tds > 0, filter: (m) => m.edge != null && m.edge >= 3, sort: 'edge' },
  { key: 'over', title: '📉 Overvalued by Books', p: 'p_td', hit: (o) => o.tds > 0, filter: (m) => m.edge != null && m.edge < 0, sort: 'edgeAsc', bookSaid: true },
]

export default function TrackRecordCheatSheets() {
  const [ledger, setLedger] = useState(null)
  const [snaps, setSnaps] = useState({})
  useEffect(() => {
    fetch('/data/grade_record.csv').then((r) => (r.ok ? r.text() : '')).then((t) => setLedger(t ? parseCsv(t) : [])).catch(() => setLedger([]))
    fetch('/data/snapshots/index.json').then((r) => (r.ok ? r.json() : null)).then((idx) => {
      for (const s of idx?.snapshots || []) {
        fetch(`/data/snapshots/${s.file}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSnaps((p) => ({ ...p, [`${d.season}-${d.week}`]: d }))).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const weeks = useMemo(() => {
    if (!ledger) return null
    const out = {}
    const byWeek = {}
    for (const r of ledger) {
      const row = { ...r, p_td: Number(r.p_td), p_100: Number(r.p_100), grade_pct: Number(r.grade_pct), tds: Number(r.tds), scrim_yds: Number(r.scrim_yds) }
      out[`${r.season}-${r.week}-${r.player_id}`] = row
      ;(byWeek[`${r.season}-${r.week}`] = byWeek[`${r.season}-${r.week}`] || []).push(row)
    }
    // ledger replay: hot hand = a TD in the player's previous 3 ledger weeks + outside the week's top 25% TD %
    const hist = {}
    for (const r of [...ledger].sort((a, b) => a.week - b.week)) (hist[r.player_id] = hist[r.player_id] || []).push({ week: Number(r.week), tds: Number(r.tds) })
    const res = []
    const keys = [...new Set([...Object.keys(byWeek), ...Object.keys(snaps)])].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
    for (const k of keys) {
      const [season, week] = k.split('-').map(Number)
      if (week < 2) continue
      const snap = snaps[k]
      let pool
      if (snap) {
        pool = snap.players.filter((m) => out[`${season}-${week}-${m.player_id}`])
      } else {
        const rows = byWeek[k] || []
        const sorted = rows.map((m) => m.p_td).sort((a, b) => a - b)
        pool = rows.map((m) => {
          const prev = (hist[m.player_id] || []).filter((h) => h.week < week).slice(-3)
          const pct = sorted.findIndex((v) => v >= m.p_td) / sorted.length
          return { ...m, hotHand: prev.some((h) => h.tds > 0) && pct < 0.75 }
        })
      }
      if (!pool.length) continue
      const lists = {}
      for (const L of LISTS) {
        let items = pool.filter((m) => m[L.p] != null && !Number.isNaN(Number(m[L.p])) && (!L.filter || L.filter(m)))
        if (L.key === 'td2' && !items.length) continue
        items = [...items].sort((a, b) => (L.sort === 'edge' ? b.edge - a.edge : L.sort === 'edgeAsc' ? a.edge - b.edge : Number(b[L.p]) - Number(a[L.p]))).slice(0, 5)
        if (!items.length) continue
        const graded = items.map((m) => {
          const o = out[`${season}-${week}-${m.player_id}`]
          const outcome = { tds: o.tds, yds: o.scrim_yds }
          return { name: m.player_name, said: L.bookSaid ? m.book.bestImplied / 100 : Number(m[L.p]), ours: Number(m[L.p]), hit: L.hit(outcome), outcome }
        })
        lists[L.key] = graded
      }
      res.push({ season, week, source: snap ? (snap.backfilled ? 'snapshot (backfilled from git)' : 'pre-kickoff snapshot') : 'ledger replay (current model)', lists })
    }
    return res
  }, [ledger, snaps])

  if (!weeks) return <p className="empty-state">Loading…</p>
  const totals = LISTS.map((L) => {
    const rows = weeks.flatMap((w) => w.lists[L.key] || [])
    const nWeeks = weeks.filter((w) => w.lists[L.key]).length
    const all5 = weeks.filter((w) => w.lists[L.key]?.length === 5 && w.lists[L.key].every((g) => g.hit)).length
    const all5exp = weeks.reduce((s, w) => s + (w.lists[L.key]?.length === 5 ? w.lists[L.key].reduce((p, g) => p * g.said, 1) : 0), 0)
    return { ...L, n: rows.length, hits: rows.filter((g) => g.hit).length, exp: rows.reduce((s, g) => s + g.said, 0), ours: rows.reduce((s, g) => s + g.ours, 0), nWeeks, all5, all5exp }
  }).filter((t) => t.n)

  return (
    <div>
      <div className="note">
        📋 Each week's Cheat Sheet lists, rebuilt with the Cheat Sheets ranking and graded. <b>Expected</b> = the sum of the
        model's chances for the players listed (for 📉 Overvalued: the book's implied chances — those are the names the
        books price shortest relative to us). Weeks with a frozen pre-kickoff snapshot use it; earlier weeks are the graded
        ledger replayed with today's model (marked). Book lists start once anytime-TD odds are in the snapshot.
      </div>
      <div className="grid-cards">
        {totals.map((t) => (
          <div key={t.key} className="card">
            <div className="cheat-list-title">{t.title}</div>
            <div className="tr-tile-num">{t.hits} <span className="meta-line small">of {t.n} hit</span></div>
            <div className="meta-line small" style={{ margin: 0 }}>
              expected {t.exp.toFixed(1)} ({t.exp ? (t.hits / t.exp).toFixed(2) : '—'}x){t.key === 'over' ? ` · our chances said ${t.ours.toFixed(1)}` : ''}
              {' '}· {t.nWeeks} week{t.nWeeks === 1 ? '' : 's'} · all 5 hit {t.all5}x (expected {t.all5exp.toFixed(2)})
            </div>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="sticky-col">Week</th>{LISTS.map((L) => <th key={L.key}>{L.title}</th>)}<th>Source</th></tr></thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={`${w.season}-${w.week}`}>
                <td className="sticky-col">{w.season} wk {w.week}</td>
                {LISTS.map((L) => {
                  const g = w.lists[L.key]
                  if (!g) return <td key={L.key} className="meta-line small">—</td>
                  const hits = g.filter((x) => x.hit).length
                  return (
                    <td key={L.key} title={g.map((x) => `${x.hit ? '✓' : '✗'} ${x.name} (${fmtPct(x.said)}) — ${x.outcome.tds} TD, ${x.outcome.yds} yds`).join('\n')}>
                      <b>{hits}/{g.length}</b> <span className="meta-line small">exp {g.reduce((s, x) => s + x.said, 0).toFixed(1)}</span>
                    </td>
                  )
                })}
                <td className="meta-line small">{w.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
