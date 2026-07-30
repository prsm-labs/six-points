// CORS proxy for ESPN's game summary endpoint -- powers Live Themes' gap-based clustering
// (scoringPlays) and Box Scores (boxscore). Verified live 2026-07-29/2026-07-30 against a real
// completed game (event=401772988, 2025 season finale): scoringPlays[] has
// period/clock/text/awayScore/homeScore per play; boxscore.teams[].statistics[] has real team
// stat lines (1st downs, total yards, turnovers, time of possession, etc).
//
// `full=1` also returns `boxscore` -- kept behind a flag since Live Themes' polling doesn't need
// it and the full summary payload is much larger than just scoringPlays.
export default async function handler(req, res) {
  const { event, full } = req.query
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
    const payload = { scoringPlays: data.scoringPlays || [] }
    if (full) payload.boxscore = data.boxscore || null
    res.status(200).json(payload)
  } catch (err) {
    res.status(502).json({ error: 'espn_fetch_failed', message: err.message })
  }
}
