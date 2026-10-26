import { useSyncExternalStore } from 'react'
import { marketPct, MARKET_NOTE } from './market.js'

export { MARKET_DEVIG, MARKET_NOTE, marketPct } from './market.js'

// Sportsbook ANYTIME TD prices on a player (slate.js, from public/data/odds/<season>-wk<week>.json; build_odds.py):
// m.book = { best, bestBook, bestImplied, medianImplied, books, links }, m.edge = our TD % minus bestImplied,
// m.market = the market check (market.js). 2026-10-26: the edge is shown neutrally ("vs book"), not as value -- where we
// and the book disagreed, the book was closer.
// Context only -- never a grade input (user, 2026-10-18). Port of Slap Shot's lib/bookOdds.js.
export const VALUE_EDGE = 3 // "rated 3+ pts above the book" cut (filter tag / Cheat Sheets list) -- not a value signal

export const fmtAmerican = (v) => (v == null ? '—' : v > 0 ? `+${v}` : `${v}`)
export const fmtEdge = (e) => (e == null ? '—' : `${e > 0 ? '+' : ''}${Number(e).toFixed(1)}`)
export const edgeClass = () => '' // neutral since 2026-10-26 (was edge-value at >= VALUE_EDGE, edge-neg below 0)

export function booksText(book) {
  if (!book) return 'No sportsbook price yet (priced once a week: Thu / Sat)'
  return Object.entries(book.books).map(([b, v]) => `${b} ${fmtAmerican(v)}`).join(' · ')
}

export function edgeText(m) {
  if (!m.book) return 'No sportsbook price yet'
  const mkt = m.market ?? marketPct(m.p_td * 100, m.book)
  return `Ours ${(m.p_td * 100).toFixed(1)}% vs book ${m.book.bestImplied}% (${fmtAmerican(m.book.best)} ${m.book.bestBook}) — ${fmtEdge(m.edge)} pts vs the book · market check ${mkt}%
${MARKET_NOTE}`
}

// Fair American price for a probability (no vig).
export function fairAmerican(p) {
  if (p == null || p <= 0 || p >= 1) return null
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p)
}

// ── Tap-to-bet links (build_odds.py stores m.book.links {DK, FD, MGM, BR}; clicks cost no credits) ──
export const BOOK_NAMES = { DK: 'DraftKings', FD: 'FanDuel', MGM: 'BetMGM', BR: 'BetRivers', BOV: 'Bovada', BOL: 'BetOnline' }
export const BET_STATES = ['AZ', 'CO', 'CT', 'DC', 'IA', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'NC', 'NH', 'NJ', 'NV', 'NY', 'OH', 'PA', 'TN', 'VA', 'VT', 'WV', 'WY']
const STATE_KEY = 'sixpoints.betstate.v1'
let betState = (() => { try { return localStorage.getItem(STATE_KEY) || '' } catch { return '' } })()
const stateListeners = new Set()
export function setBetState(s) {
  betState = s || ''
  try { localStorage.setItem(STATE_KEY, betState) } catch { /* storage off: this visit only */ }
  stateListeners.forEach((fn) => fn())
}
export function useBetState() {
  return useSyncExternalStore((fn) => { stateListeners.add(fn); return () => stateListeners.delete(fn) }, () => betState, () => betState)
}

// One leg's link at one book: { url } | { needsState: true } | null (no link at that book).
export function betUrl(book, bk, state = betState) {
  const raw = book?.links?.[bk]
  if (!raw) return null
  if (raw.includes('{state}') && !state) return { needsState: true }
  return { url: raw.replace('{state}', state.toLowerCase()).replace('{pickType}', 'single').replace('|{wagerAmount}', '|') }
}

// Several legs on one slip where the book's add-to-slip link takes several selections (not verified on a real slip;
// each leg keeps its own link as the fallback).
export function multiBetUrl(legBooks, bk, state = betState) {
  const raws = legBooks.map((b) => b?.links?.[bk])
  if (raws.some((r) => !r)) return null
  try {
    if (bk === 'FD') {
      const qs = raws.map((r, i) => {
        const u = new URL(r)
        return `marketId[${i}]=${u.searchParams.get('marketId')}&selectionId[${i}]=${u.searchParams.get('selectionId')}`
      }).join('&')
      return { url: `https://sportsbook.fanduel.com/addToBetslip?${qs}` }
    }
    if (bk === 'DK') {
      const outs = raws.map((r) => new URL(r).searchParams.get('outcomes'))
      return { url: `https://sportsbook.draftkings.com/?outcomes=${outs.map(encodeURIComponent).join('+')}` }
    }
    if (bk === 'MGM') {
      if (!state) return { needsState: true }
      const opts = raws.map((r) => new URL(r.replace('{state}', 'x')).searchParams.get('options'))
      return { url: `https://sports.${state.toLowerCase()}.betmgm.com/en/sports?options=${opts.join(',')}&type=Combo` }
    }
  } catch {
    return null
  }
  return null
}
