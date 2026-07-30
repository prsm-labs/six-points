import { useEffect, useState } from 'react'

// Real weather via /api/weather.js (WeatherAPI.com, server-side key). Unlike the ESPN proxies
// (scoreboard.js/summary.js), there is NO client-side direct-fetch fallback here -- WeatherAPI
// requires a real secret key, and Going Yard's own api/weather.js hardcoding it in source is a
// pattern deliberately not repeated. That means local `vite dev` (no Vercel functions running)
// can't exercise this tab end-to-end -- only `vercel dev` or the real deployment can. The API
// logic itself was verified directly with curl/Node against the real WeatherAPI response shape
// before this component was written.
//
// Also note: WeatherAPI's free tier only forecasts ~3 days ahead, so for the 2025 backtest data
// (already in the past) this shows TODAY's real current conditions for each game's host city --
// not a real forecast for that historical game date, which no weather API can retroactively
// provide. This becomes a genuinely game-relevant forecast once the 2026 season is live and a
// game is within a few days.

function isDomeLike(roof) {
  // 'closed' = a retractable roof that was actually shut for this specific game -- same
  // practical effect as a fixed dome (weather didn't affect play), not the same as 'outdoors'.
  return roof === 'dome' || roof === 'closed'
}

function windFlag(mph) {
  if (mph >= 20) return 'High Wind'
  return null
}

function rainFlag(pct) {
  if (pct >= 50) return 'Rain Likely'
  return null
}

function GameWeatherCard({ game, weather, loading }) {
  const isDome = isDomeLike(game.roof)
  const isRetractableUnknown = game.roof == null

  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <strong>{game.away_team}</strong> @ <strong>{game.home_team}</strong>
          {isRetractableUnknown && (
            <span className="weather-flag" style={{ marginLeft: 8 }}>Retractable roof — TBD</span>
          )}
        </div>
        <div className="meta-line" style={{ margin: 0 }}>
          {game.gameday} {game.gametime ? `· ${game.gametime} ET` : ''}
        </div>
      </div>

      {isDome ? (
        <p className="empty-state" style={{ margin: '10px 0 0' }}>
          🏟️ {game.roof === 'closed' ? 'Roof closed for this game' : 'Dome'} — weather not a factor.
        </p>
      ) : loading ? (
        <p className="empty-state" style={{ margin: '10px 0 0' }}>Loading current conditions...</p>
      ) : !weather ? (
        <p className="empty-state" style={{ margin: '10px 0 0' }}>Weather unavailable.</p>
      ) : (
        <>
          <div className="weather-current">
            <div className="weather-temp">{weather.current.temp}°</div>
            <div>
              <div className="meta-line" style={{ margin: 0 }}>
                Feels {weather.current.feelsLike}° · {weather.current.condition}
              </div>
              <div className="meta-line" style={{ margin: '2px 0 0' }}>
                Wind {weather.current.windMph}mph {weather.current.windDir} ({weather.current.windLabel})
                {windFlag(weather.current.windMph) && (
                  <span className="weather-flag" style={{ marginLeft: 8 }}>{windFlag(weather.current.windMph)}</span>
                )}
              </div>
            </div>
          </div>
          {weather.forecastDays?.length > 0 && (
            <div className="weather-forecast-strip">
              {weather.forecastDays.map((d, i) => (
                <div className="weather-forecast-day" key={i}>
                  <div className="meta-line small" style={{ margin: 0 }}>{d.date.slice(5)}</div>
                  <div>{d.minTemp}°–{d.maxTemp}°</div>
                  <div className="meta-line small" style={{ margin: 0 }}>
                    {d.chanceOfRain}% rain
                    {rainFlag(d.chanceOfRain) && <span className="weather-flag" style={{ marginLeft: 4 }}>{rainFlag(d.chanceOfRain)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function WeatherTab() {
  const [schedule, setSchedule] = useState(null)
  const [weatherByTeam, setWeatherByTeam] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/season_schedule.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((full) => {
        const data = {
          season: full.season,
          week: full.latest_week,
          games: full.games.filter((g) => g.week === full.latest_week),
        }
        setSchedule(data)
        const outdoorTeams = data.games
          .filter((g) => !isDomeLike(g.roof))
          .map((g) => g.home_team)
        outdoorTeams.forEach((team) => {
          fetch(`/api/weather?team=${team}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((w) => setWeatherByTeam((prev) => ({ ...prev, [team]: w })))
            .catch(() => setWeatherByTeam((prev) => ({ ...prev, [team]: null })))
        })
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) {
    return (
      <p className="empty-state">
        No schedule data yet ({error}). Run <code>python matchup_engine.py --season 2025 --week N</code>{' '}
        from the project root first.
      </p>
    )
  }
  if (!schedule) return <p className="empty-state">Loading...</p>

  return (
    <div>
      <p className="meta-line">
        Season {schedule.season}, Week {schedule.week} · {schedule.games.length} games · real
        current conditions per host city (WeatherAPI.com) — see note in source about why this
        isn't a true forecast for past (2025 backtest) game dates
      </p>
      {schedule.games.map((g) => (
        <GameWeatherCard
          key={g.game_id}
          game={g}
          weather={weatherByTeam[g.home_team]}
          loading={!isDomeLike(g.roof) && weatherByTeam[g.home_team] === undefined}
        />
      ))}
    </div>
  )
}
