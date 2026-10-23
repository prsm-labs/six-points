import { useEffect, useMemo, useState } from 'react'
import { parseCsv } from './csv.js'
import { MODES, PROPS, toDecimal } from './pairs.js'

// Track Record > 🤝 Pairs (Slap Shot's TrackRecordPairs.jsx, 2026-10-18 revamp): every locked board (public/data/pairs,
// frozen at the Sunday lock) graded against the ledger. A leg hits on a TD (anytime) or 100+ scrimmage yards; a leg
// whose player didn't play is void and the pair settles on the other leg. Units only for TD + TD pairs with a book
// parlay price (1 unit at that price).
const BOARD_LABEL = Object.fromEntries([...MODES.map((m) => [m.key, m.label]), ['balanced:td', '⚖️ Balanced · 🏈 TD only'], ['balanced:yds', '⚖️ Balanced · 💨 Yards only'],
  // 2026-10-23 pair levels: <level>:<mode> boards
  ...['safe', 'mid', 'long'].flatMap((lv) => MODES.map((m) => [`${lv}:${m.key}`, `${{ safe: '🛡️ Safe', mid: '⚖️ Mid-range', long: '🌠 Long shot' }[lv]} · ${m.label}`]))])

export default function TrackRecordPairs() {
  const [ledger, setLedger] = useState(null)
  const [locks, setLocks] = useState([])
  const [board, setBoard] = useState('balanced')
  useEffect(() => {
    fetch('/data/grade_record.csv').then((r) => (r.ok ? r.text() : '')).then((t) => setLedger(t ? parseCsv(t) : [])).catch(() => setLedger([]))
    fetch('/data/pairs/index.json').then((r) => (r.ok ? r.json() : null)).then(async (idx) => {
      const files = await Promise.all((idx?.locks || []).map((l) => fetch(`/data/pairs/${l.file}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      setLocks(files.filter(Boolean))
    }).catch(() => {})
  }, [])

  const graded = useMemo(() => {
    if (!ledger) return null
    const out = new Map(ledger.map((r) => [`${r.season}-${r.week}-${r.player_id}`, r]))
    const rows = []
    for (const lk of locks) {
      for (const [b, list] of Object.entries(lk.boards || {})) {
        for (const pr of list) {
          const legs = pr.legs.map((l) => {
            const o = out.get(`${lk.season}-${lk.week}-${l.player_id}`)
            if (!o) return { ...l, status: 'pending' }
            const hit = l.prop === 'td' ? Number(o.tds) > 0 : Number(o.scrim_yds) >= 100
            return { ...l, status: hit ? 'hit' : 'miss', tds: Number(o.tds), yds: Number(o.scrim_yds) }
          })
          if (legs.some((l) => l.status === 'pending')) continue
          const hit = legs.every((l) => l.status === 'hit')
          const units = pr.parlay ? (hit ? toDecimal(pr.parlay.american) - 1 : -1) : null
          rows.push({ week: lk.week, season: lk.season, board: b, pr, legs, hit, units })
        }
      }
    }
    return rows
  }, [ledger, locks])

  if (!graded) return <p className="empty-state">Loading…</p>
  if (!locks.length) {
    return (
      <div className="note">
        🤝 No locked Pairs yet. The first board locks at the Sunday 11:50 AM ET lock (with Top Picks) and is graded here once
        the week's games are final.
      </div>
    )
  }
  const boards = [...new Set(graded.map((g) => g.board))]
  const rows = graded.filter((g) => g.board === board)
  const exp = rows.reduce((s, g) => s + g.pr.chancePct / 100, 0)
  const hits = rows.filter((g) => g.hit).length
  const priced = rows.filter((g) => g.units != null)
  const units = priced.reduce((s, g) => s + g.units, 0)
  const starRows = rows.filter((g) => g.pr.starRank)
  return (
    <div>
      <div className="pill-row">{boards.map((b) => <button key={b} className={`pill-btn ${board === b ? 'active' : ''}`} onClick={() => setBoard(b)}>{BOARD_LABEL[b] || b}</button>)}</div>
      <div className="grid-cards">
        <div className="card"><div className="cheat-list-title">Pairs hit</div><div className="tr-tile-num">{hits} <span className="meta-line small">of {rows.length}</span></div><div className="meta-line small">expected {exp.toFixed(1)} ({exp ? (hits / exp).toFixed(2) : '—'}x)</div></div>
        <div className="card"><div className="cheat-list-title">★ Best pairs</div><div className="tr-tile-num">{starRows.filter((g) => g.hit).length} <span className="meta-line small">of {starRows.length}</span></div><div className="meta-line small">expected {starRows.reduce((s, g) => s + g.pr.chancePct / 100, 0).toFixed(1)}</div></div>
        <div className="card"><div className="cheat-list-title">Units (priced TD + TD)</div><div className="tr-tile-num">{priced.length ? `${units >= 0 ? '+' : ''}${units.toFixed(1)}u` : '—'}</div><div className="meta-line small">{priced.length} priced pairs · ROI {priced.length ? `${((units / priced.length) * 100).toFixed(0)}%` : '—'}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="sticky-col">Week</th><th>Section</th><th>Legs</th><th>Both %</th><th>Result</th><th>Units</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((g, i) => (
              <tr key={`${g.week}-${g.pr.key}-${i}`}>
                <td className="sticky-col">wk {g.week}{g.pr.starRank ? ` ★${g.pr.starRank}` : ''}</td>
                <td>{g.pr.section}</td>
                <td>{g.legs.map((l) => `${l.status === 'hit' ? '✅' : '✗'} ${l.name} ${PROPS[l.prop].short} (${l.prop === 'td' ? `${l.tds} TD` : `${l.yds} yds`})`).join(' · ')}</td>
                <td className="num">{g.pr.chancePct}%</td>
                <td>{g.hit ? '✅ hit' : '✗'}</td>
                <td className="num">{g.units == null ? '—' : `${g.units >= 0 ? '+' : ''}${g.units.toFixed(2)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
