// Shared parsing for ESPN's /api/summary scoringPlays feed. Used by both LiveThemes.jsx and
// TDTracker.jsx -- one place to get this right instead of two.
//
// Verified live 2026-07-30 against a real game (2025 season finale, event 401772988): each
// scoring play has a real, structured `scoringType.name` ('touchdown'/'field-goal'/'safety'/etc)
// and `type.text` (a clean human-readable label like "Passing Touchdown", "Rushing Touchdown",
// "Interception Return Touchdown"). This replaces an earlier regex-based touchdown detector in
// LiveThemes.jsx that matched on the free-text `text` field and initially missed defensive/
// return scores -- scoringType.name is a real field ESPN provides, not something to keep
// parsing around.
//
// `text` itself still has no separate structured scorer-name/yardage fields, so those are
// parsed from it (format is consistently "{Name} {N} Yd {detail}").

export function isTouchdown(play) {
  return play.scoringType?.name === 'touchdown'
}

export function parseScoringPlay(play) {
  const text = play.text || ''
  const yardsMatch = text.match(/^(.+?)\s+(\d+)\s+Yd/)
  const scorerName = yardsMatch ? yardsMatch[1].trim() : text
  const yards = yardsMatch ? Number(yardsMatch[2]) : null
  const passFromMatch = text.match(/pass from ([^(]+?)(?:\s*\(|$)/)
  const passerName = passFromMatch ? passFromMatch[1].trim() : null

  return {
    id: play.id,
    text,
    isTouchdown: isTouchdown(play),
    tdTypeLabel: play.type?.text || '',
    scorerName,
    passerName,
    yards,
    teamAbbr: play.team?.abbreviation || '',
    teamLogo: play.team?.logo || null,
    period: play.period?.number || null,
    clock: play.clock?.displayValue || '',
    awayScore: play.awayScore,
    homeScore: play.homeScore,
  }
}
