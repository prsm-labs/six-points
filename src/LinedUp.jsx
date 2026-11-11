import { EDGES } from './edges.js'
import { useSlate } from './slate.js'
import { setListFilter, useFilterContext } from './listFilters.js'
import { tabRequest } from './nav.js'
import { closePlayerSlide } from './slideouts.js'
import Fold from './Fold.jsx'

// 2026-11-03 (user: write the narrative -- "look out for this player" -- and one tap for every player who looks like this;
// CourtIQ's twin). Only the tested edges (edges.js) speak, each with its held-out number; nothing changes a grade or chance.
// The backup convergence test (CourtIQ's bench idea: vacated role / touches up / red-zone up / hot / high total stacked)
// found nothing over our chance every season, so no new edge here; backups with none of it ran ~2 pts under (watch).
const AVOID = new Set(['lowtotal', 'qbchange', 'wind', 'missedlast'])
export default function LinedUp({ id }) {
  const slate = useSlate({ all: true }) // 2026-11-05: finished games included (🏁 doneGames.js)
  const ctx = useFilterContext(slate)
  const keys = ctx.edges?.get(id) || []
  if (!keys.length) return null
  const likeThis = (k) => {
    setListFilter('edge', Array.isArray(k) ? k : [k])
    setListFilter('edgeNot', [])
    setListFilter('edgeMode', 'all')
    tabRequest.set({ tab: 'scouting', at: Date.now() })
    closePlayerSlide()
  }
  return (
    <div className="slideout-section lined-up">
      <h3 style={{ marginTop: 0 }}>🔗 Lined up this week</h3>
      {/* 2026-11-11: the Quick read above carries these in one line each; the full notes + buttons fold here */}
      <Fold summary={<span className="sub">{keys.map((k) => EDGES.find((x) => x.v === k)?.label).filter(Boolean).join(' · ')}</span>}>
      {keys.map((k) => {
        const e = EDGES.find((x) => x.v === k)
        if (!e) return null
        const avoid = AVOID.has(k)
        return (
          <div key={k} className="lu-row">
            <div className="lu-head"><b>{e.label}</b><span className={`lu-kind ${avoid ? 'avoid' : 'boost'}`}>{avoid ? 'runs under our chance' : 'runs over our chance'}</span></div>
            <div className="sub">{e.title.replace(/ — tap twice to hide them$/, "")}</div>
            <button className="pill-btn lu-btn" onClick={() => likeThis(k)}>🔎 Show players like this</button>
          </div>
        )
      })}
      {keys.length > 1 && <button className="pill-btn lu-btn" onClick={() => likeThis(keys)}>🔎 Players with all {keys.length} of these</button>}
      </Fold>
      <div className="sub">Context only — his chances already count this week's matchup; these spots beat (or missed) those chances in every season tested.</div>
    </div>
  )
}
