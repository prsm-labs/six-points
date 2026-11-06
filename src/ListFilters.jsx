import FilterPanel, { withCounts } from './FilterPanel.jsx'
import { buildGroups, clearListFilters, setListFilter, useListFilters } from './listFilters.js'
import { saveFilter } from './savedFilters.js'
import { usePosition } from './positionFilter.js'

// 2026-11-06 🔒 Locked in (user): grade A+ to C + a softest-third defense, one tap. Tested first (2023-25 held out, 861 player-weeks):
// about what our chance said (+0.8 / +4.3 / -0.6 by season) -- a shortcut, not an extra edge; H2H added nothing, so it's left out.
const LOCKED_IN = [{ key: 'locked', label: '🔒 Locked in', set: { grades: ['A+', 'A', 'A-', 'B', 'C'], oppd: ['soft'] },
  title: "Grade A+ to C facing one of this week's softest third of defenses — the strong players in good spots. In 2023-25 tests they hit about what their chance says, so trust the % shown." }]

// Collapsible filter panel for the long player lists (Slap Shot's components/ListFilters.jsx; listFilters.js holds the
// shared state and the groups). 2026-10-25: the shared FilterPanel -- tags, Top / PRISM Picks, grade / H2H / home-away
// letter scales; base = the list before these filters so each pill shows how many players it would leave.
export default function ListFilters({ shown, total, base, ctx }) {
  const f = useListFilters()
  const pos = usePosition()
  // 2026-10-28 🔔 Alert me: saves this filter (+ position) as an alert, checked by Alerts.jsx (AlertsRunner)
  return (
    <FilterPanel groups={withCounts(buildGroups(ctx), base)} value={f} shown={shown} total={total} presets={LOCKED_IN}
      onChange={setListFilter} onClear={clearListFilters}
      onSave={(name) => saveFilter(`${name}${pos && pos !== 'all' ? ` · ${pos}` : ''}`, { ...f, search: '' }, { pos })} />
  )
}
