import { useEffect, useRef, useState } from 'react'
import { clearAlerts, dismissToast, markSeen, pushAlert, useAlerts } from './alerts.js'
import { normName, subscribeLiveStatus } from './liveStatus.js'
import { parseScoringPlay } from './scoringPlays.js'
import { usePicks } from './picks.js'
import { openPlayerSlide } from './slideouts.js'

// Alert sources (§10): (1) a real TD in any game in progress today -- ESPN scoreboard + the
// existing /api/summary scoringPlays feed, polled every 45s only while a game is live, first poll
// seeds silently so a page load never replays the day's TDs; (2) a pool player whose live ESPN
// status flips to Out (from liveStatus.js, same seeding rule). Picks get flagged so the bell can
// filter to "My picks only".
const TD_POLL_MS = 45000

function ymd(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function getJson(proxyUrl, directUrl) {
  const p = await fetch(proxyUrl).catch(() => null)
  if (p && p.ok) return p.json()
  const d = await fetch(directUrl)
  return d.json()
}

export function AlertsRunner() {
  const picks = usePicks()
  const picksRef = useRef(picks)
  picksRef.current = picks
  const poolRef = useRef({ byName: {} })

  useEffect(() => {
    fetch('/data/all_matchups_latest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        const byName = {}
        for (const m of d.matchups) byName[`${m.team}|${normName(m.player_name)}`] = m
        poolRef.current = { byName, list: d.matchups }
      })
      .catch(() => {})
  }, [])

  // (1) touchdowns
  useEffect(() => {
    let cancelled = false
    let seeded = false
    const seen = new Set()
    const finished = new Set()
    let timer = null

    async function poll() {
      try {
        const date = ymd()
        const sb = await getJson(`/api/scoreboard?dates=${date}`,
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${date}`)
        const events = (sb.events || []).filter((e) => ['in', 'post'].includes(e.status?.type?.state))
        const live = events.some((e) => e.status?.type?.state === 'in')
        for (const e of events) {
          // a final game is read one last time (catches a TD right before the final whistle), then skipped
          if (finished.has(e.id)) continue
          if (e.status?.type?.state === 'post') finished.add(e.id)
          const s = await getJson(`/api/summary?event=${e.id}`,
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`)
          for (const play of s.scoringPlays || []) {
            const td = parseScoringPlay(play)
            if (!td.isTouchdown || seen.has(td.id)) continue
            seen.add(td.id)
            if (!seeded) continue
            const pool = poolRef.current.list || []
            const scorer = pool.find((m) => normName(m.player_name) === normName(td.scorerName))
            const picked = !!(scorer && picksRef.current[scorer.player_id])
            pushAlert({
              id: `td-${td.id}`, type: 'td', picked,
              title: `${picked ? 'My pick scored: ' : 'TD: '}${td.scorerName}${td.yards != null ? ` ${td.yards} yd` : ''}`,
              body: `${td.tdTypeLabel || 'Touchdown'} · ${e.shortName || ''} · Q${td.period} ${td.clock}${scorer?.grade ? ` · our grade ${scorer.grade}` : ''}`,
              player: scorer || null,
            })
          }
        }
        seeded = true
        if (!cancelled) timer = setTimeout(poll, live ? TD_POLL_MS : TD_POLL_MS * 4)
      } catch {
        seeded = true
        if (!cancelled) timer = setTimeout(poll, TD_POLL_MS * 2)
      }
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // (2) live status flips to Out for players in our pool
  useEffect(() => {
    let prev = null
    return subscribeLiveStatus((s) => {
      if (!s.lastChecked) return
      const outNow = new Set(Object.entries(s.byKey).filter(([, v]) => v.out).map(([k]) => k))
      if (prev) {
        for (const k of outNow) {
          if (prev.has(k)) continue
          const m = poolRef.current.byName[k]
          if (!m) continue
          const picked = !!picksRef.current[m.player_id]
          pushAlert({
            id: `out-${k}-${s.lastChecked.getTime()}`, type: 'status', picked,
            title: `${picked ? 'My pick ruled out: ' : 'Ruled out: '}${m.player_name} (${m.team})`,
            body: `ESPN now lists ${s.byKey[k].status}${s.byKey[k].detail ? ` (${s.byKey[k].detail})` : ''} · removed from ranked lists`,
            player: m,
          })
        }
      }
      prev = outNow
    })
  }, [])

  return null
}

export function AlertToast() {
  const { toast } = useAlerts()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismissToast, 8000)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return (
    <div className={`alert-toast alert-${toast.type}${toast.picked ? ' alert-picked' : ''}`} role="status">
      <div className="alert-toast-body" onClick={() => toast.player && openPlayerSlide(toast.player)}>
        <strong>{toast.title}</strong>
        <span>{toast.body}</span>
      </div>
      <button className="alert-close" onClick={dismissToast} aria-label="Dismiss">&times;</button>
    </div>
  )
}

export function AlertBell() {
  const { list, unseen } = useAlerts()
  const [open, setOpen] = useState(false)
  const [picksOnly, setPicksOnly] = useState(false)
  const shown = picksOnly ? list.filter((a) => a.picked) : list
  return (
    <>
      <button
        className="odds-calc-toggle alert-bell"
        onClick={() => { setOpen(true); markSeen() }}
        title="Alerts"
        aria-label={`Alerts${unseen ? ` (${unseen} new)` : ''}`}
      >
        🔔{unseen > 0 && <span className="alert-count">{unseen}</span>}
      </button>
      {open && (
        <>
          <div className="slideout-backdrop" onClick={() => setOpen(false)} />
          <div className="slideout-panel">
            <div className="slideout-header">
              <div className="slideout-header-info">
                <h2>Alerts</h2>
                <div className="sub">TDs and game-day Out calls while this page is open</div>
              </div>
              <button className="slideout-close" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
            </div>
            <div className="slideout-body">
              <div className="sub-tabs">
                <button className={!picksOnly ? 'active' : ''} onClick={() => setPicksOnly(false)}>All</button>
                <button className={picksOnly ? 'active' : ''} onClick={() => setPicksOnly(true)}>My picks only</button>
                {list.length > 0 && <button onClick={clearAlerts}>Clear</button>}
              </div>
              {shown.length === 0 && (
                <p className="empty-state">
                  Nothing yet. Alerts appear here when a touchdown is scored in a live game or ESPN
                  rules a player in this week's pool Out. They only arrive while the site is open.
                </p>
              )}
              {shown.map((a) => (
                <div key={a.id} className={`alert-item alert-${a.type}${a.picked ? ' alert-picked' : ''}`}
                  onClick={() => a.player && openPlayerSlide(a.player)}>
                  <div><strong>{a.title}</strong></div>
                  <div className="meta-line small" style={{ margin: 0 }}>{a.body} · {a.time.toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
