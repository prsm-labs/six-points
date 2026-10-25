import FilterPanel, { withCounts } from './FilterPanel.jsx'
import { buildGroups, clearListFilters, setListFilter, useListFilters } from './listFilters.js'

// Collapsible filter panel for the long player lists (Slap Shot's components/ListFilters.jsx; listFilters.js holds the
// shared state and the groups). 2026-10-25: the shared FilterPanel -- tags, Top / PRISM Picks, grade / H2H / home-away
// letter scales; base = the list before these filters so each pill shows how many players it would leave.
export default function ListFilters({ shown, total, base, ctx }) {
  const f = useListFilters()
  return (
    <FilterPanel groups={withCounts(buildGroups(ctx), base)} value={f} shown={shown} total={total}
      onChange={setListFilter} onClear={clearListFilters} />
  )
}
