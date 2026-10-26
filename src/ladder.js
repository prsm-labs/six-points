// Game ladder (Scouting -> 🪜 Game Ladder; Slap Shot's lib/ladder.js, 2026-10-18 revamp): for each team this week,
// the best anytime-TD pick in each price band -- favorite down to super-deep longshot -- the way a handicapper lays
// out a game sheet. Band = the player's best sportsbook anytime-TD price; with no price yet, the fair price from our
// TD %. Within a band the pick has the highest market check (market.js: half our TD %, half the book's, vig out); until
// 2026-10-26 it was the biggest edge, but where we disagreed the book was closer. Unpriced players rank after priced ones,
// by our TD %. Honorable mention = the highest market check on the team not already shown.
// NFL bands are shorter than hockey's (anytime TD favorites run -275 to +150).
import { fairAmerican } from './bookOdds.js'

export const LADDER_BANDS = [
  { key: 'fav', label: 'Favorite', short: 'FAV', max: 149, title: 'Best price +149 or shorter' },
  { key: 'second', label: 'Secondary', short: '2ND', max: 299, title: '+150 to +299' },
  { key: 'long', label: 'Longshot', short: 'LS', max: 599, title: '+300 to +599' },
  { key: 'deep', label: 'Deep longshot', short: 'DEEP', max: 1199, title: '+600 to +1199' },
  { key: 'super', label: 'Super deep', short: 'SUPER', max: Infinity, title: '+1200 or longer' },
]

export function ladderPrice(m) {
  if (m.book?.best != null) return { am: m.book.best, priced: true }
  const fair = fairAmerican(m.p_td ?? 0)
  return fair == null ? null : { am: fair, priced: false }
}

const bandOf = (am) => LADDER_BANDS.find((b) => am <= b.max) || LADDER_BANDS[LADDER_BANDS.length - 1]
const valueSort = (a, b) =>
  (b.market != null) - (a.market != null) || (b.market ?? 0) - (a.market ?? 0) || (b.p_td ?? 0) - (a.p_td ?? 0)

export function teamLadder(players, { alts = 2 } = {}) {
  const rows = players.filter((m) => m.p_td != null).map((m) => ({ m, price: ladderPrice(m) })).filter((r) => r.price)
  const used = new Set()
  const bands = LADDER_BANDS.map((band) => {
    const inBand = rows.filter((r) => bandOf(r.price.am) === band).map((r) => r.m).sort(valueSort)
    for (const m of inBand.slice(0, 1 + alts)) used.add(m.player_id)
    return { ...band, pick: inBand[0] || null, alts: inBand.slice(1, 1 + alts), size: inBand.length }
  })
  const honorable = rows.map((r) => r.m).filter((m) => !used.has(m.player_id) && m.market != null).sort(valueSort)[0] || null
  return { bands, honorable, count: rows.length }
}
