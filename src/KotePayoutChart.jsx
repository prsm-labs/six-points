// 📈 King of the End Zone payout graph (Slap Shot's IcebreakerPayoutChart.jsx, football): x = our TD %, y = projected
// bonus-bet payout if he's the king (log scale) -- the crowd piles onto the likeliest scorers, so they pay least.
// Dot size = our King %; gold = the top 3 by promo value (King % x payout). Tap a dot to add / remove him from the
// picked list (the table can show picked players only).
export default function KotePayoutChart({ rows, picked, onToggle }) {
  const pts = rows.filter((r) => r.payout != null && r.p_td != null)
  if (!pts.length) return <p className="meta-line small">Nothing to chart yet.</p>
  const W = 680
  const H = 300
  const pad = { l: 56, r: 16, t: 14, b: 36 }
  const xMax = Math.max(0.05, ...pts.map((r) => r.p_td)) * 1.05
  const ys = pts.map((r) => Math.log10(r.payout))
  const yMin = Math.floor(Math.min(...ys) * 4) / 4
  const yMax = Math.ceil(Math.max(...ys) * 4) / 4 || yMin + 1
  const x = (v) => pad.l + (v / xMax) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (Math.log10(v) - yMin) / Math.max(0.01, yMax - yMin)) * (H - pad.t - pad.b)
  const topEv = new Set([...pts].sort((a, b) => (b.promoEv ?? 0) - (a.promoEv ?? 0)).slice(0, 3).map((r) => r.id))
  const labeled = new Set([...pts].sort((a, b) => b.king - a.king).slice(0, 6).map((r) => r.id).concat([...topEv], [...picked]))
  const yTicks = []
  for (let e = Math.ceil(yMin); e <= Math.floor(yMax); e += 1) yTicks.push(10 ** e)
  for (const m of [2, 5]) for (let e = Math.floor(yMin); e <= yMax; e += 1) { const v = m * 10 ** e; if (Math.log10(v) > yMin && Math.log10(v) < yMax) yTicks.push(v) }
  const xTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].filter((v) => v <= xMax)
  const placed = []
  return (
    <div className="kote-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Projected King of the End Zone payout by TD chance">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="tick">${v >= 1000 ? `${v / 1000}k` : v}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line x1={x(v)} x2={x(v)} y1={pad.t} y2={H - pad.b} className="grid" />
            <text x={x(v)} y={H - pad.b + 16} textAnchor="middle" className="tick">{Math.round(v * 100)}%</text>
          </g>
        ))}
        <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" className="axis">Our TD % (anytime)</text>
        <text x={14} y={H / 2} textAnchor="middle" className="axis" transform={`rotate(-90 14 ${H / 2})`}>Payout if king</text>
        {pts.map((r) => {
          const cx = x(r.p_td)
          const cy = y(r.payout)
          const rad = 3 + Math.sqrt(r.king) * 22
          const gold = topEv.has(r.id)
          const isPicked = picked.has(r.id)
          let label = null
          if (labeled.has(r.id)) {
            let ly = cy - rad - 4
            while (placed.some((p) => Math.abs(p.x - cx) < 70 && Math.abs(p.y - ly) < 12)) ly -= 12
            placed.push({ x: cx, y: ly })
            label = <text x={cx} y={ly} textAnchor="middle" className={gold ? 'lbl gold' : 'lbl'}>{r.short}</text>
          }
          return (
            <g key={r.id} className="pt" onClick={() => onToggle(r.id)}>
              <circle cx={cx} cy={cy} r={rad} className={`${gold ? 'gold' : ''} ${isPicked ? 'picked' : ''}`}>
                <title>{`${r.name}: TD ${(r.p_td * 100).toFixed(1)}% · King ${(r.king * 100).toFixed(1)}% · ~$${Math.round(r.payout)} if king`}</title>
              </circle>
              {label}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
