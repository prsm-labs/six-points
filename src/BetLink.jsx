import { BET_STATES, BOOK_NAMES, betUrl, edgeClass, edgeText, fmtAmerican, fmtEdge, booksText, setBetState, useBetState } from './bookOdds.js'

// Tap-to-bet pieces (Slap Shot's components/BetLink.jsx). Every link opens the sportsbook in a new tab / its app;
// clicks never reach The Odds API, so they cost nothing.
const stop = (e) => e.stopPropagation()

export function BetAnchor({ link, children, title, className }) {
  if (!link?.url) return <span className={className} title={link?.needsState ? 'Pick your state (📍) to open this book' : title}>{children}</span>
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={stop} title={title} className={`bet-link ${className || ''}`}>
      {children}<span className="bet-link-arrow">↗</span>
    </a>
  )
}

// Best price, tappable: "+140 MGM ↗".
export function BestPriceLink({ book }) {
  useBetState()
  if (!book) return <span className="meta-line small" title="Priced once a week: Thursday for TNF, Saturday for Sunday / Monday">—</span>
  return (
    <BetAnchor link={betUrl(book, book.bestBook)} title={`${booksText(book)} — tap to add to your ${BOOK_NAMES[book.bestBook] || book.bestBook} bet slip`}>
      {fmtAmerican(book.best)} <span className="book-tag">{book.bestBook}</span>
    </BetAnchor>
  )
}

// Every book's price, each tappable.
export function AllBookLinks({ book }) {
  useBetState()
  if (!book) return <span>No sportsbook price yet</span>
  const entries = Object.entries(book.books).sort((a, b) => b[1] - a[1])
  return (
    <span className="all-books">
      {entries.map(([bk, am]) => (
        <BetAnchor key={bk} link={betUrl(book, bk)} title={`Add to your ${BOOK_NAMES[bk] || bk} bet slip`} className={bk === book.bestBook ? 'best' : ''}>
          {bk} {fmtAmerican(am)}
        </BetAnchor>
      ))}
    </span>
  )
}

export function EdgeCell({ m }) {
  if (m.edge == null) return <span className="meta-line small">—</span>
  return <span className={edgeClass(m.edge)} title={edgeText(m)}>{fmtEdge(m.edge)}</span>
}

// 📍 state for BetMGM / BetRivers links (saved on this device).
export function StatePicker() {
  const state = useBetState()
  return (
    <label className="state-picker" onClick={stop} title="Your state — BetMGM and BetRivers links open that state's site. Saved on this device.">
      📍
      <select value={state} onChange={(e) => setBetState(e.target.value)}>
        <option value="">State</option>
        {BET_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  )
}
