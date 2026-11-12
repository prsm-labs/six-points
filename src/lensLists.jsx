// 🔭 This week's lenses for Six Points (Lenses.jsx, same file as Slap Shot / CourtIQ; user 2026-11-12: the tested data in the user's face,
// one tap, like 🔒 Locked in). Only tested lists, each with its record:
//   🔒 Locked in        grade A+ to C vs this week's softest third of TD defenses -- hits what the % says (2026-11-06): a shortcut
//   🔦 Under the radar  radar.json (TD in <= 2 of his last 8, 20%+ chance this week; backtest 33% vs their own 11%)
//   🎯 Long-shot creators longshot.json (12-30% TD, red-zone touches lately; scored above our chance in 2 of 3 seasons -- a lean)
//   📈 Bounce-back      bounce.json (Est. Yards well above his last 3; backtest 70% finished above that average)
// Not here on purpose: H2H, defense vs position, hot streaks, the market team total (context only per the not-Vegas rule).
import { useEffect, useMemo, useState } from 'react'
import PickButton from './PickButton.jsx'
import { openPlayerSlide } from './slideouts.js'
import { matchesPosition, usePosition } from './positionFilter.js'
import { isInSelectedMatchup, useMatchup } from './MatchupContext.jsx'
import { useMasterSearch } from './masterFilter.js'
import { matchesSearch } from './teamSearch.js'
import { useLiveOutFilter } from './gradeUi.jsx'

const pc = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const vs = (m) => `${m.position} · ${m.team} vs ${m.opponent}`
const rec = (r, extra = '') => (r?.n ? `Record: ${r.hits}/${r.n} (${Math.round((r.hits / r.n) * 100)}%${r.said != null ? `; said ${Math.round(r.said * 100)}%` : ''}${r.own != null ? `, their usual ${Math.round(r.own * 100)}%` : ''})${extra}.` : '')
const row = (m, line, big, bigSub, why, prop = 'td') => ({ key: `${m.player_id}-${line}`, name: m.player_name, team: vs(m), line, big, bigSub, why,
  onOpen: () => openPlayerSlide(m), action: <PickButton player={m} compact prop={prop} /> })
const perTeam = (rows, k = 2) => { const c = {}; return rows.filter((r) => { const t = r.team.split(' · ')[1]?.split(' ')[0]; return (c[t] = (c[t] || 0) + 1) <= k }) }
function useJson(url, dep) {
  const [d, setD] = useState(undefined)
  useEffect(() => { fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null)) }, [url, dep])
  return d
}

// this week's players with the page's position / game / search, OUT (live) hidden -- like Cheat Sheets
export function useLensPool(slate) {
  const position = usePosition()
  const { selectedMatchup } = useMatchup()
  const search = useMasterSearch()
  const notOut = useLiveOutFilter()
  return useMemo(() => (slate?.matchups || [])
    .filter((m) => matchesPosition(m.position, position))
    .filter((m) => !selectedMatchup || isInSelectedMatchup(selectedMatchup, m.team))
    .filter((m) => matchesSearch(search, [m.player_name], [m.team, m.opponent]))
    .filter((m) => notOut(m)), [slate, position, selectedMatchup, search, notOut])
}

export function useLenses(slate, pool) {
  const radar = useJson('/data/radar.json', slate?.week)
  const bounce = useJson('/data/bounce.json', slate?.week)
  const longshot = useJson('/data/longshot.json', slate?.week)
  return useMemo(() => {
    if (!slate) return []
    const byId = new Map(pool.map((m) => [m.player_id, m]))
    const wk = (d) => (d?.weeks?.find((w) => w.week === slate.week)?.picks || []).filter((f) => byId.has(f.player_id))
    const locked = pool.filter((m) => ['A+', 'A', 'A-', 'B', 'C'].includes(m.grade) && m.def_rank && m.def_tier === 'soft')
      .sort((a, b) => (b.p_td ?? 0) - (a.p_td ?? 0))
      .map((m) => row(m, `Grade ${m.grade} · ${m.opponent} #${m.def_rank} of ${m.def_n} softest vs TDs`, pc(m.p_td), 'anytime TD',
        m.p_100 != null ? `100+ yds ${pc(m.p_100)}` : ''))
    const radarRows = wk(radar).map((f) => { const m = byId.get(f.player_id)
      return row(m, `Anytime TD: his ${pc(f.own)} → this week ${pc(f.chance)}`, pc(f.chance), `his ${pc(f.own)}`, `scored in ${f.hits} of his last ${f.n}${f.why?.length ? ` · ${f.why[0]}` : ''}`) })
    const longRows = wk(longshot).map((f) => { const m = byId.get(f.player_id)
      return row(m, `${f.rz3.toFixed(1)} red-zone touches a game lately (#${f.rank} of ${f.of} at his position)`, pc(f.chance), 'anytime TD', `season ${f.rzSeason?.toFixed?.(1) ?? '—'} a game`) })
    const bounceRows = wk(bounce).map((f) => { const m = byId.get(f.player_id)
      return row(m, `Over ${f.line} yds (Est. ${f.est})`, pc(f.track), 'track record', (f.why || [])[0] || 'projected well above his last 3', 'yds100') })
    const bt = longshot?.backtest
    return [
      { key: 'locked', label: '🔒 Locked in', rows: perTeam(locked),
        title: "Grade A+ to C facing one of this week's softest third of TD defenses, best TD chance first. A shortcut: they hit what the % says." },
      { key: 'radar', label: '🔦 Under the radar', rows: radarRows, record: rec(radar?.record?.all, radar?.record?.live?.n ? ` — this season live ${radar.record.live.hits}/${radar.record.live.n}` : ''),
        title: "Scored in 2 or fewer of his last 8, a 20%+ TD chance this week — ranked by how far this week beats his usual." },
      { key: 'long', label: '🎯 Long-shot creators', rows: longRows, record: bt ? `Backtest: ${bt.hits}/${bt.n} scored (${Math.round((bt.hits / bt.n) * 100)}%; said ${Math.round(bt.said * 100)}%) — above our chance in 2 of 3 seasons, a lean.` : '',
        title: '12-30% TD chance, ranked by red-zone touches a game over the last 3 weeks vs his position. Mostly WRs and TEs.' },
      { key: 'bounce', label: '📈 Bounce-back', rows: bounceRows, record: rec(bounce?.live, bounce?.backtest ? ` — backtest ${Math.round((bounce.backtest.hits / bounce.backtest.n) * 100)}% of ${bounce.backtest.n}` : ''),
        title: 'Est. Yards well above his last 3 games: the over on that recent average (back to his level, not past it).' },
    ]
  }, [slate, pool, radar, bounce, longshot])
}
