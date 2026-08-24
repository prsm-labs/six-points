// CORS proxy for ESPN's game summary endpoint -- powers Live Themes' gap-based clustering
// (scoringPlays), Box Scores (boxscore + a full play-by-play), and the live inactives-
// confirmation poller (injuries). Verified live 2026-07-29/2026-07-30/2026-08-24 against a real
// completed game (event=401772988, 2025 season finale): scoringPlays[] has
// period/clock/text/awayScore/homeScore per play; boxscore.teams[].statistics[] has real team
// stat lines (1st downs, total yards, turnovers, time of possession, etc); drives.previous[] has
// every real drive of the game (team/result/description) with every real play inside it
// (text/period/clock/scoringPlay); injuries[] has a real, currently-live per-team injury status
// list (confirmed it reflects TODAY's real status, not historically pinned to whichever game id
// is queried -- checked a Feb-2026 game's injuries and saw today's real Aug-2026 date on them).
//
// `full=1` also returns `boxscore` and `drives` -- kept behind a flag since Live Themes' polling
// doesn't need either and the full summary payload is much larger than just scoringPlays.
// `injuries` is small (a couple teams x a handful of players) so it's always included, slimmed
// the same way `drives` is -- team abbreviation only, not ESPN's full team object with its
// dozen logo variants.
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

function slimInjuries(injuries) {
  return (injuries || []).map((teamEntry) => ({
    team: teamEntry.team?.abbreviation || '',
    injuries: (teamEntry.injuries || []).map((inj) => ({
      name: inj.athlete?.displayName || '',
      position: inj.athlete?.position?.abbreviation || '',
      status: inj.status || '',
      detail: inj.details?.type && inj.details.type !== 'Undisclosed' ? inj.details.type : null,
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
    const payload = { scoringPlays: data.scoringPlays || [], injuries: slimInjuries(data.injuries) }
    if (full) {
      payload.boxscore = data.boxscore || null
      payload.drives = slimDrives(data.drives)
    }
    res.status(200).json(payload)
  } catch (err) {
    res.status(502).json({ error: 'espn_fetch_failed', message: err.message })
  }
}
