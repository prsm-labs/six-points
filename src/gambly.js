// Gambly (gambly.com) builds a bet slip at the user's sportsbook from plain text -- Slap Shot's lib/gambly.js, football
// props (2026-10-18). Its web chat reads ?q= into the message box (nothing is sent until the user sends it), so every
// Gambly button copies the bet text to the clipboard and opens that link. No account / API key / credits on our side.
export const GAMBLY_PROPS = {
  td: 'Anytime Touchdown Scorer',
  td2: '2+ Touchdowns',
  first: 'First Touchdown Scorer',
  yds100: '100+ Rushing + Receiving Yards',
}

// "Derrick Henry (BAL) — Anytime Touchdown Scorer"
export const betLine = (p, prop = 'td') => {
  const name = p.player_name ?? p.name
  return `${name}${p.team ? ` (${p.team})` : ''} — ${GAMBLY_PROPS[prop] || prop}`
}

// Several lines -> one message; 2+ legs are labelled as a parlay ("same game" when every leg is in one game).
export function betText(lines, { sameGame = false } = {}) {
  if (lines.length < 2) return lines.join('')
  return [...lines, `(${lines.length}-leg ${sameGame ? 'same game ' : ''}parlay)`].join('\n')
}

export const gamblyUrl = (text) => `https://gambly.com/chat?q=${encodeURIComponent(text)}`

// My Picks category -> prop. Categories with no prop of their own (Favorite, Dark Horse, Longshot, Hot Hand) send an
// anytime TD (Slap Shot sends an anytime goal).
export const PICK_PROP = { anytime: 'td', td2: 'td2', yds100: 'yds100', first: 'first', fav: 'td', dark: 'td', long: 'td', hot: 'td' }
