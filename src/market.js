// Market check (2026-10-26 review; Slap Shot's lib/market.js). Where our TD % and the sportsbook disagree, the book has
// been closer. Week 7 (296 priced players): rated 3+ pts above the best price (the old "value" lists) -- we said 24.5%,
// the book 17.2%, 17.0% scored; rated below it -- we said 14.8%, the book 20.3%, 18.7% scored. Slap Shot showed the same
// over 3,277 skater-games. Half ours + half the book (best price x 0.92 to take out the vig) beat both: log loss .3780 vs
// ours .3837 / book .3803. Shown as context beside our number -- never a grade input (not Vegas-driven).
// No React here: slateCore.js (shared with the lock scripts) imports it.
export const MARKET_DEVIG = 0.92
export const MARKET_NOTE =
  "Market check = half our TD %, half the book's best price (vig taken out) — context only, not in our grades. Where we and the book disagree, the book has been closer: week 7, rated 3+ pts above the book, we said 24.5%, the book 17.2%, 17.0% scored (Slap Shot: the same over a month)."

const impliedPct = (am) => (am == null ? null : am > 0 ? 10000 / (am + 100) : (100 * -am) / (-am + 100))

// ours: our chance in %; book: { best } (American). Returns the market check in % (1 decimal), or null without a price.
export function marketPct(ours, book) {
  if (ours == null || book?.best == null) return null
  return Math.round(((ours + MARKET_DEVIG * impliedPct(book.best)) / 2) * 10) / 10
}
