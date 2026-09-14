// Real Eastern-time helpers for TD Tracker's chronological feed (PROMPT_SixPoints_
// GoingYardParity.md #5), mirroring Going Yard's own getETDateStr()/4am-ET-cutover convention
// (see mlb_project/Claude/CLAUDE.md "ET Date Cutover Rule") -- a late Sunday/Monday night NFL
// game can run past midnight ET on the East Coast the same way a late MLB West Coast game does,
// so a touchdown at 12:40am ET Monday should still count as "Sunday's slate," not roll into
// Monday, until 4:00am ET.
//
// Uses Intl.DateTimeFormat with America/New_York rather than a fixed UTC offset so this stays
// correct across the DST boundary (NFL season spans a fall-back in November) without needing a
// separate EST/EDT branch.

const ET_TZ = 'America/New_York'

function etParts(isoString) {
  const d = new Date(isoString)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = {}
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value
  return parts
}

/** "9/14/2026, 8:47 PM ET" style display string for a real play timestamp. */
export function formatETTime(isoString) {
  if (!isoString) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(isoString)) + ' ET'
}

/** The real calendar "slate day" a play belongs to in ET, with the 4am cutover -- a play at
 * 1:15am ET counts as the previous calendar day's slate, matching Going Yard's own rule. */
export function etSlateDateStr(isoString) {
  if (!isoString) return null
  const p = etParts(isoString)
  const hour = Number(p.hour)
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)))
  if (hour < 4) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
