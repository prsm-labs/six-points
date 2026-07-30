// CORS proxy for ESPN's game summary endpoint -- powers Live Themes' gap-based clustering
// (scoringPlays), Box Scores (boxscore + a full play-by-play). Verified live
// 2026-07-29/2026-07-30 against a real completed game (event=401772988, 2025 season finale):
// scoringPlays[] has period/clock/text/awayScore/homeScore per play; boxscore.teams[].statistics[]
// has real team stat lines (1st downs, total yards, turnovers, time of possession, etc);
// drives.previous[] has every real drive of the game (team/result/description) with every real
// play inside it (text/period/clock/scoringPlay).
//
// `full=1` also returns `boxscore` and `drives` -- kept behind a flag since Live Themes' polling
// doesn't need either and the full summary payload is much larger than just scoringPlays.
// `drives` is slimmed server-side (team abbreviation only, not ESPN's full team object with its
// dozen logo variants) since that alone would multiply the payload for no real UI benefit.
function slimDrives(drives) {
  return (drives?.previous || []).map((d) => ({
    team: d.team?.abbreviation || '',
    description: d.description || '',
    result: d.result || '',
    displayResult: d.displayResult || '',
    isScore: !!d.isScore,
    plays: (d.plays || []).map((p) => ({
      text: p.text || '',
      period: p.period?.number ?? null,
      clock: p.clock?.displayValue || '',
      scoringPlay: !!p.scoringPlay,
    })),
  }))
}

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
    if (full) {
      payload.boxscore = data.boxscore || null
      payload.drives = slimDrives(data.drives)
    }
    res.status(200).json(payload)
  } catch (err) {
    res.status(502).json({ error: 'espn_fetch_failed', message: err.message })
  }
}
