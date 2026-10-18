// Small shared pieces for the 2026-10-18 Slap Shot-style revamp.

// 🔥 Hot hand (Slap Shot's DueTag slot): scored a TD in the last 3 games played and NOT in this week's top 25% by
// TD chance. Backtest 2023-25 (held out): "scored last game, outside the top 25%" scored 1.33x what the model said in
// every season; the same "scored in last 3" term now feeds the grade too. TD droughts ("due") tested as nothing.
export function HotHandTag({ m }) {
  if (!m?.hotHand) return null
  return (
    <span className="hot-tag" title={`🔥 Hot hand: ${m.td_l3} TD${m.td_l3 === 1 ? '' : 's'} in his last 3 games and not a top-25% TD chance this week. Over 2023-25 this group scored ~1.3x what the model expected (every season).`}>
      🔥
    </span>
  )
}

// Defense vs position, within this slate: opponents ranked by TD rate allowed to the position (1 = allows the most).
// Context only -- the position split added nothing for TDs on top of the grade (it's not in the model).
export function dvpRanks(rows) {
  const byPos = {}
  for (const m of rows) {
    if (m.opp_td_rate_allowed == null) continue
    const pos = (byPos[m.position] = byPos[m.position] || new Map())
    if (!pos.has(m.opponent)) pos.set(m.opponent, Number(m.opp_td_rate_allowed))
  }
  const out = new Map()
  for (const [pos, map] of Object.entries(byPos)) {
    const ranked = [...map.entries()].sort((a, b) => b[1] - a[1])
    ranked.forEach(([opp, rate], i) => out.set(`${opp}|${pos}`, { rank: i + 1, of: ranked.length, rate }))
  }
  return out
}

export function Section({ title, sub, children }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {sub && <p className="meta-line">{sub}</p>}
      {children}
    </div>
  )
}
