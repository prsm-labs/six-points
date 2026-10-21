import { useEffect, useState } from 'react'

// 2026-10-21 (user): 👥 with / without teammates on the slideout chart (CourtIQ / Slap Shot twins).
// public/data/onoff/<TEAM>.json (nfl_project/build_onoff.py): his games for this team over last season + this, and the games each
// teammate played (QB / RB / WR / TE). Injured / not-playing teammates are listed first. History only, not a projection.
const cache = {}
export function useOnOff(team) {
  const [d, setD] = useState(null)
  useEffect(() => {
    if (!team) return undefined
    let alive = true
    if (!cache[team]) cache[team] = fetch(`/data/onoff/${team}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    cache[team].then((x) => alive && setD(x))
    return () => { alive = false }
  }, [team])
  return d
}

export function onOffGames(d, playerId, sel, how) {
  const all = d?.players?.[playerId] || []
  if (!sel.length) return { match: null, rest: null, all }
  const sets = sel.map((id) => new Set(d.played[id] || []))
  const ok = (g) => (how === 'with' ? sets.every((s) => s.has(g.key)) : sets.every((s) => !s.has(g.key)))
  return { match: all.filter(ok), rest: all.filter((g) => !ok(g)), all }
}

const per = (gs, f) => (gs.length ? gs.reduce((a, g) => a + f(g), 0) / gs.length : null)
const r0 = (v) => (v == null ? '—' : v.toFixed(0))

export function OnOffPicker({ d, playerId, position, sel, setSel, how, setHow }) {
  const [open, setOpen] = useState(false)
  if (!d?.mates?.length) return null
  const mates = d.mates.filter((m) => m.id !== playerId)
  const name = (id) => mates.find((m) => m.id === id)?.name || id
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const { match, rest } = onOffGames(d, playerId, sel, how)
  const line = (gs) => position === 'QB'
    ? `${r0(per(gs, (g) => g.pass_yards))} pass yds · ${per(gs, (g) => g.pass_td)?.toFixed(1)} pass TD · ${r0(per(gs, (g) => g.rush_yards))} rush yds a game`
    : `${r0(per(gs, (g) => g.rush_yards + g.rec_yards))} scrimmage yds (${r0(per(gs, (g) => g.rush_yards))} rush / ${r0(per(gs, (g) => g.rec_yards))} rec) · ${per(gs, (g) => g.targets)?.toFixed(1)} tgt · TD in ${gs.filter((g) => g.any_td).length}`
  const btn = (on, label, onClick) => <button className={`pill-btn ${on ? 'active' : ''}`} onClick={onClick}>{label}</button>
  return (
    <div style={{ margin: '4px 0 6px' }}>
      <div className="pill-row">
        {btn(sel.length > 0, `👥 With / without${sel.length ? ` (${sel.length})` : ''} ${open ? '▲' : '▼'}`, () => setOpen((v) => !v))}
        {sel.length > 0 && <>
          {btn(how === 'without', 'Without', () => setHow('without'))}
          {btn(how === 'with', 'With', () => setHow('with'))}
          {btn(false, '✕ Clear', () => setSel([]))}
        </>}
      </div>
      {open && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', margin: '4px 0', maxHeight: 220, overflowY: 'auto' }}>
          {[[true, '🩹 Injured / not playing this week'], [false, 'Teammates (QB / RB / WR / TE)']].map(([inj, label]) => {
            const group = mates.filter((m) => m.injured === inj)
            return group.length > 0 && (
              <div key={label}>
                <div className="meta-line small" style={{ margin: 0 }}>{label}</div>
                {group.map((m) => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} />
                    {m.name}{m.status ? <span className="meta-line small" style={{ margin: 0 }}> · {m.status}</span> : null}
                    <span className="meta-line small" style={{ margin: 0 }}> ({m.games} GP)</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {sel.length > 0 && (
        <p className="meta-line small">
          <b>{how === 'with' ? 'With' : 'Without'} {sel.map(name).join(' + ')}</b>: {match.length} game{match.length === 1 ? '' : 's'}{match.length ? ` — ${line(match)}` : ''}.
          {' '}The other {rest.length}: {rest.length ? line(rest) : '—'}. His {d.team} games, {d.seasons.join(' + ')}; the chart shows the last 7 that match.
          {' '}A teammate who joined mid-way counts as "without" before he arrived. History only.
        </p>
      )}
    </div>
  )
}
