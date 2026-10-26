import { useEffect, useState } from 'react'
import { resolveEventIds } from './espnGameResolver.js'

// 2026-10-20 live slideout: the open player's line in this week's game (ESPN summary through /api/summary, the
// same feed as Box Scores), refreshed every 25 s while the game is on, every 2 min on game day before kickoff, and
// once more when it goes final. Nothing polls while the slideout is closed or on days without his game.
const POLL_LIVE = 25000
const POLL_PRE = 120000
let shared = null
function loadShared() {
  if (!shared) {
    shared = Promise.all([
      fetch('/data/season_schedule.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/data/team_stats.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
  }
  return shared
}
const etToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

function cat(teamEntry, name) {
  return teamEntry?.statistics?.find((c) => c.name === name) || null
}
function stat(c, id, label) {
  const i = c?.labels?.indexOf(label) ?? -1
  if (i < 0) return null
  const a = c.athletes?.find((x) => x.athlete?.id === id)
  return a ? a.stats?.[i] ?? null : null
}
const num = (v) => (v == null || v === '' ? 0 : Number(String(v).split('/')[0]) || 0)

// One player's line out of an ESPN boxscore (passing / rushing / receiving), or null if he isn't in it.
function lineFor(boxscore, espnId) {
  for (const t of boxscore?.players || []) {
    const pa = cat(t, 'passing'), ru = cat(t, 'rushing'), re = cat(t, 'receiving')
    const inAny = [pa, ru, re].some((c) => c?.athletes?.some((a) => a.athlete?.id === espnId))
    if (!inAny) continue
    const catt = stat(pa, espnId, 'C/ATT')
    const [cmp, att] = catt ? String(catt).split('/').map(Number) : [0, 0]
    const l = {
      pass_cmp: cmp || 0, pass_att: att || 0, pass_yards: num(stat(pa, espnId, 'YDS')), pass_td: num(stat(pa, espnId, 'TD')),
      interceptions: num(stat(pa, espnId, 'INT')),
      rush_att: num(stat(ru, espnId, 'CAR')), rush_yards: num(stat(ru, espnId, 'YDS')), rush_td: num(stat(ru, espnId, 'TD')),
      receptions: num(stat(re, espnId, 'REC')), rec_yards: num(stat(re, espnId, 'YDS')), rec_td: num(stat(re, espnId, 'TD')),
      targets: num(stat(re, espnId, 'TGTS')),
    }
    l.any_td = l.pass_td + l.rush_td + l.rec_td // same convention as player_game_logs.json's any_td (QB passing TDs count there)
    return l
  }
  return null
}

// 2026-10-26: a defender's line (defensive / interceptions categories), or null if he isn't in them.
function defLineFor(boxscore, espnId) {
  for (const t of boxscore?.players || []) {
    const de = cat(t, 'defensive'), it = cat(t, 'interceptions')
    if (![de, it].some((c) => c?.athletes?.some((a) => a.athlete?.id === espnId))) continue
    const tkl = num(stat(de, espnId, 'TOT')), solo = num(stat(de, espnId, 'SOLO'))
    return {
      tkl, solo, ast: Math.max(0, tkl - solo), sk: num(stat(de, espnId, 'SACKS')), tfl: num(stat(de, espnId, 'TFL')),
      pd: num(stat(de, espnId, 'PD')), qbh: num(stat(de, espnId, 'QB HTS')), td: num(stat(de, espnId, 'TD')),
      int: num(stat(it, espnId, 'INT')), ff: 0, fr: 0,
    }
  }
  return null
}

export function useThisWeekLine(player, weekRow, espnId) {
  const team = weekRow?.team || player?.team
  const week = weekRow?.week
  const [out, setOut] = useState(null)
  useEffect(() => {
    setOut(null)
    if (!team || !week || !espnId) return undefined
    let alive = true
    let timer = null
    ;(async () => {
      const [sched, teamStats] = await loadShared()
      const game = sched?.games?.find((g) => g.week === week && (g.home_team === team || g.away_team === team))
      if (!alive || !game || !game.gameday || game.gameday > etToday()) return
      const ids = await resolveEventIds([game], teamStats || {}).catch(() => ({}))
      const eventId = ids[game.game_id]
      if (!alive || !eventId) return
      const load = async () => {
        let state = null
        try {
          const r = await fetch(`/api/summary?event=${eventId}&full=1`)
          const d = r.ok ? await r.json() : null
          if (!alive) return
          if (d) {
            state = d.status?.state || null
            setOut({
              game, eventId, state, live: state === 'in', done: state === 'post', started: state === 'in' || state === 'post',
              detail: d.status?.detail || null, score: d.score || null,
              line: lineFor(d.boxscore, espnId),
              def: defLineFor(d.boxscore, espnId),
              out: (d.injuries || []).flatMap((t) => t.injuries).find((i) => i.name === (player.player_name || weekRow?.player_name) && /out|inactive/i.test(i.status)) || null,
            })
          }
        } catch { /* a failed poll keeps the last line on screen */ }
        if (!alive || state === 'post') return
        timer = setTimeout(load, state === 'in' ? POLL_LIVE : POLL_PRE)
      }
      load()
    })()
    return () => { alive = false; clearTimeout(timer) }
  }, [team, week, espnId])
  return out
}
