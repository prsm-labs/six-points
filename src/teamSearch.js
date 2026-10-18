// Search helper shared by every search bar (Slap Shot's lib/teamSearch.js, NFL teams, 2026-10-18): matches player
// names AND teams by abbreviation ("KC"), city ("Kansas City"), team name ("Chiefs") or common nickname ("Niners",
// "Bucs", "Pack"). Multi-word queries must match every word somewhere ("chiefs kelce"). A query that is exactly a
// team code matches that team (or a player whose first / last name starts with it).
const TEAMS = {
  ARI: ['Arizona', 'Cardinals', 'Cards', 'AZ'], ATL: ['Atlanta', 'Falcons'], BAL: ['Baltimore', 'Ravens'],
  BUF: ['Buffalo', 'Bills'], CAR: ['Carolina', 'Panthers'], CHI: ['Chicago', 'Bears'], CIN: ['Cincinnati', 'Bengals', 'Cincy'],
  CLE: ['Cleveland', 'Browns'], DAL: ['Dallas', 'Cowboys', 'Boys'], DEN: ['Denver', 'Broncos'], DET: ['Detroit', 'Lions'],
  GB: ['Green Bay', 'Packers', 'Pack', 'GNB'], HOU: ['Houston', 'Texans'], IND: ['Indianapolis', 'Colts', 'Indy'],
  JAX: ['Jacksonville', 'Jaguars', 'Jags', 'JAC'], KC: ['Kansas City', 'Chiefs', 'KAN'], LV: ['Las Vegas', 'Raiders', 'LVR'],
  LAC: ['Los Angeles', 'Chargers', 'Bolts'], LA: ['Los Angeles', 'Rams', 'LAR'], MIA: ['Miami', 'Dolphins', 'Fins'],
  MIN: ['Minnesota', 'Vikings', 'Vikes'], NE: ['New England', 'Patriots', 'Pats', 'NWE'], NO: ['New Orleans', 'Saints', 'NOR'],
  NYG: ['New York', 'Giants', 'G-Men'], NYJ: ['New York', 'Jets'], PHI: ['Philadelphia', 'Eagles', 'Philly', 'Birds'],
  PIT: ['Pittsburgh', 'Steelers'], SF: ['San Francisco', '49ers', 'Niners', 'SFO'], SEA: ['Seattle', 'Seahawks', 'Hawks'],
  TB: ['Tampa Bay', 'Tampa', 'Buccaneers', 'Bucs', 'TAM'], TEN: ['Tennessee', 'Titans'], WAS: ['Washington', 'Commanders', 'WSH'],
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '')
const TEAM_TEXT = Object.fromEntries(Object.entries(TEAMS).map(([abbr, names]) => [abbr, norm([abbr, ...names].join(' '))]))
const CODES = new Map()
for (const [abbr, names] of Object.entries(TEAMS)) {
  CODES.set(abbr.toLowerCase(), abbr)
  for (const n of names) if (/^[A-Z]{2,4}$/.test(n)) CODES.set(n.toLowerCase(), abbr)
}

export function teamText(abbr) {
  return TEAM_TEXT[abbr] || norm(abbr)
}

// query: what was typed; names: player name(s) on the row; teams: team abbreviation(s) on the row.
export function matchesSearch(query, names = [], teams = []) {
  const q = norm(query).trim()
  if (!q) return true
  const code = CODES.get(q)
  if (code) return teams.includes(code) || names.some((n) => norm(n).split(/[\s-]+/).some((w) => w.startsWith(q)))
  const hay = [...names.map(norm), ...teams.filter(Boolean).map(teamText)].join(' | ')
  return q.split(/\s+/).every((w) => hay.includes(w))
}
