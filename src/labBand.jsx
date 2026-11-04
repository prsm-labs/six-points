import { useMemo, useState } from 'react'
import PropBand, { chanceAt, hitsOf, ownLine, stepFrom } from './PropBand.jsx'
import GamblyButton from './GamblyButton.jsx'
import { useLineWeek } from './lineBoard.js'

// 📱 Prop band for a lab (2026-11-03, user: blend the mockup's prop card into the phone cards). Paydirt Lab = touchdowns (anytime TD /
// 2+ TDs), Yardage Lab = scrimmage yards 10-150: the week's ladders from nfl_project/build_line_board.py (lines/<season>-wk<N>.json,
// the Risk Slider's own numbers), the line stepped with − / + for the whole lab (remembered), else his own line; hit rates from his
// last 7 games (last season fills in early). Phone cards only.
const IDX = { YDS: 2, TD: 3 }

export function useLabBand(stat, slate) {
  const { week } = useLineWeek(slate)
  const ladders = useMemo(() => {
    const out = new Map()
    for (const p of week?.players || []) {
      const lines = stat === 'TD' ? [...(p.lines?.TD || []), ...(p.lines?.TD2 || [])] : p.lines?.YDS
      out.set(p.id, { lines: lines?.length ? lines : null, vals: (p.recent || []).map((r) => r[IDX[stat]]) })
    }
    return out
  }, [week, stat])
  const lineOpts = useMemo(() => [...new Set([...ladders.values()].flatMap((b) => (b.lines || []).map(([T]) => T)))].sort((a, b) => a - b), [ladders])
  const store = `sixpoints.band.${stat}`
  const [labLine, setRaw] = useState(() => { try { const v = localStorage.getItem(store); return v ? Number(v) : null } catch { return null } })
  const setLabLine = (v) => { setRaw(v); try { if (v == null) localStorage.removeItem(store); else localStorage.setItem(store, String(v)) } catch { /* this visit only */ } }

  const of = (id) => {
    const b = ladders.get(id)
    const line = labLine ?? ownLine(b?.lines)
    return { b, line, chance: chanceAt(b?.lines, line) }
  }
  const label = (T) => (stat === 'YDS' ? `${T}+ yds` : T === 1 ? 'Anytime TD' : `${T}+ TDs`)
  const render = (p) => {
    const { b, line, chance } = of(p.player_id)
    if (line == null || !b) return <span className="meta-line small">{week === undefined ? 'Loading lines…' : 'No line board for him this week'}</span>
    const bet = stat === 'YDS' ? `${line}+ Scrimmage Yards` : line === 1 ? 'Anytime Touchdown Scorer' : `${line}+ Touchdowns`
    return (
      <PropBand lineLabel={label(line)} line={line} chance={chance} auto={labLine == null}
        onStep={(d) => setLabLine(stepFrom(lineOpts, line, d))} onAuto={() => setLabLine(null)}
        canDown={line > lineOpts[0]} canUp={line < lineOpts[lineOpts.length - 1]}
        rates={[['L3', ...hitsOf(b.vals, line, 3)], ['L5', ...hitsOf(b.vals, line, 5)], ['L7', ...hitsOf(b.vals, line, 7)]]}
        last={b.vals.slice(-5)}
        action={<GamblyButton text={`${p.player_name}${p.team ? ` (${p.team})` : ''} — ${bet}`} />} />
    )
  }
  return { render, chance: (p) => of(p.player_id).chance, labLine, ready: week !== undefined }
}
