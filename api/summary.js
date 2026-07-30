// CORS proxy for ESPN's game summary endpoint (scoringPlays feed) -- powers Live Themes'
// gap-based clustering. Verified live 2026-07-29 against a real completed game (event=401772988,
// 2025 season finale): scoringPlays[] has period/clock/text/awayScore/homeScore per play.
export default async function handler(req, res) {
  const { event } = req.query
  if (!event) {
    res.status(400).json({ error: 'missing_event_param' })
    return
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(event)}`

  try {
    const espnRes = await fetch(url)
    const data = await espnRes.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate')
    res.status(200).json({ scoringPlays: data.scoringPlays || [] })
  } catch (err) {
    res.status(502).json({ error: 'espn_fetch_failed', message: err.message })
  }
}
