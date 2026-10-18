// api/kote.js — is DraftKings' NFL "King of the End Zone" promo on for a date, which game, and what did past ones pay?
// (2026-10-18 revamp; Slap Shot's api/promo.js for its Ice Breaker, football version.)
//
// DK Network (dknetwork.draftkings.com — public WordPress JSON, no key) posts "DraftKings King of the End Zone Picks for
// Bills vs. Rams Monday Night Football Game" and "Tracking the leader for DraftKings King of the End Zone: Monday
// 10/12/26" on each promo day. A post dated that day or naming it = confirmed. 2026 so far: the opener (9/9), TNF 9/17,
// then every Monday Night Football game -> a Monday with no post yet = "likely". The tracking posts name the winner and
// his TD length, and sometimes the payout ("The 26,158 DraftKings Sportsbook bettors who picked him have received $77").
//
//   GET /api/kote?date=YYYY-MM-DD
//   -> { date, status, live, likely, pool, teams: [abbr, abbr] | null, source, history: [...] }
// Cached 30 min at the edge.

const WP = 'https://dknetwork.draftkings.com/wp-json/wp/v2/posts'
const NICK = {
  cardinals: 'ARI', falcons: 'ATL', ravens: 'BAL', bills: 'BUF', panthers: 'CAR', bears: 'CHI', bengals: 'CIN',
  browns: 'CLE', cowboys: 'DAL', broncos: 'DEN', lions: 'DET', packers: 'GB', texans: 'HOU', colts: 'IND',
  jaguars: 'JAX', chiefs: 'KC', raiders: 'LV', chargers: 'LAC', rams: 'LA', dolphins: 'MIA', vikings: 'MIN',
  patriots: 'NE', saints: 'NO', giants: 'NYG', jets: 'NYJ', eagles: 'PHI', steelers: 'PIT', '49ers': 'SF',
  seahawks: 'SEA', buccaneers: 'TB', titans: 'TEN', commanders: 'WAS',
}

const plain = (html) => String(html || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '-')
  .replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim()
const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')))

// "Monday 10/12/26" / "Thursday 9/17/26" in a title -> that date?
function titleNamesDate(title, date) {
  const m = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/)
  if (!m) return false
  const [y, mo, d] = date.split('-').map(Number)
  return Number(m[1]) === mo && Number(m[2]) === d && 2000 + Number(m[3]) === y
}

function teamsIn(title) {
  const m = title.match(/(?:for|picks for|Picks for)\s+(?:the\s+)?([A-Za-z0-9 .]+?)\s+(?:vs\.?|at|@)\s+([A-Za-z0-9 .]+?)(?:\s+(?:Monday|Thursday|Sunday|Saturday|Kickoff|Game|Super|Wild|on)|[:,]|$)/i)
  if (!m) return null
  const code = (s) => NICK[s.trim().split(/\s+/).pop().toLowerCase()] || null
  const a = code(m[1])
  const b = code(m[2])
  return a && b ? [a, b] : null
}

function winnerFrom(text) {
  const w = text.match(/([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,2}) (?:is the King of the End Zone|was crowned King of the End Zone|is your King of the End Zone|was crowned)/)
  if (!w) return null
  const after = text.slice(w.index, w.index + 600)
  const yd = after.match(/(\d{1,3})-yard/) || text.match(/(\d{1,3})-yard [^.]*?(?:was the longest|longest touchdown)/)
  const pay = text.match(/([\d,]{3,}) (?:DraftKings Sportsbook )?bettors[^$]{0,80}\$([\d,]+)/)
  const STOP = new Set(['Live', 'Updates', 'Update', 'Winnings', 'TD', 'Touchdown', 'The', 'Congrats', 'Congratulations'])
  const words = w[1].split(' ')
  while (words.length > 2 && STOP.has(words[0])) words.shift()
  return { name: words.join(' '), yards: yd ? Number(yd[1]) : null,
    bettors: pay ? num(pay[1]) : null, payout: pay ? num(pay[2]) : null }
}

export async function koteStatus(date) {
  const url = `${WP}?search=${encodeURIComponent('"King of the End Zone"')}&per_page=60&orderby=date&_fields=date,title,link,content`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`DK Network -> ${res.status}`)
  const posts = (await res.json())
    .map((p) => ({ date: p.date, title: plain(p.title?.rendered), link: p.link, text: plain(p.content?.rendered) }))
    .filter((p) => /king of the end ?zone/i.test(p.title))
  const todays = posts.filter((p) => p.date?.slice(0, 10) === date || titleNamesDate(p.title, date))
  const today = todays.find((p) => teamsIn(p.title)) || todays[0] || null
  let pool = null
  let teams = null
  if (today) {
    const pm = today.text.match(/\$(\d+(?:\.\d+)?) million/i)
    pool = pm ? Math.round(Number(pm[1]) * 1e6) : 2000000
    teams = todays.map((p) => teamsIn(p.title)).find(Boolean) || null
  }
  const history = []
  const seen = new Set()
  for (const p of posts) {
    if (!/tracking the leader/i.test(p.title)) continue
    const w = winnerFrom(p.text)
    if (!w) continue
    const k = `${p.date?.slice(0, 10)}|${w.name}`
    if (seen.has(k)) continue
    seen.add(k)
    const pm = p.text.match(/\$(\d+(?:\.\d+)?) million/i)
    history.push({ date: p.date?.slice(0, 10), ...w, pool: pm ? Math.round(Number(pm[1]) * 1e6) : null, title: p.title, link: p.link })
  }
  history.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const monday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1
  const status = today ? 'confirmed' : monday ? 'likely' : 'off'
  return {
    date, status, live: Boolean(today), likely: !today && monday, pool: pool || 2000000, teams,
    source: today ? { title: today.title, link: today.link, date: today.date } : null,
    checkedAt: new Date().toISOString(), history,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  const date = String(req.query?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date=YYYY-MM-DD required' })
  try {
    const data = await koteStatus(date)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=1800')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
}
