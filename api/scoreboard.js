// CORS proxy for ESPN's public hidden scoreboard API -- mirrors going-yard/api/boxscore.js's
// role for MLB Stats API. Verified live 2026-07-29: espn returns real events/scores/status for
// both live games (once the season starts) and past dates via ?dates=YYYYMMDD.
export default async function handler(req, res) {
  const { dates } = req.query
  const url = new URL('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')
  if (dates) url.searchParams.set('dates', dates)

  try {
    const espnRes = await fetch(url.toString())
    const data = await espnRes.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: 'espn_fetch_failed', message: err.message })
  }
}
