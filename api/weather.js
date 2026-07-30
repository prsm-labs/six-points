// Real weather via WeatherAPI.com. WEATHER_API_KEY must be set as a Vercel project env
// var (Settings -> Environment Variables), never committed or hardcoded in source.
//
// Free-tier limitation (verified live 2026-07-30): WeatherAPI's forecast endpoint only covers
// ~3 days ahead. It cannot retroactively forecast a past date, so for the 2025 backtest season
// (already in the past) this returns TODAY's real current conditions for each game's host city,
// not a forecast for that historical game date -- there is no way to get either from this API.
// Once the 2026 season is live and a game is within ~3 days, the forecast block becomes real and
// game-relevant.
const NFL_CITIES = {
  ARI: 'Glendale,AZ', ATL: 'Atlanta,GA', BAL: 'Baltimore,MD', BUF: 'Orchard Park,NY',
  CAR: 'Charlotte,NC', CHI: 'Chicago,IL', CIN: 'Cincinnati,OH', CLE: 'Cleveland,OH',
  DAL: 'Arlington,TX', DEN: 'Denver,CO', DET: 'Detroit,MI', GB: 'Green Bay,WI',
  HOU: 'Houston,TX', IND: 'Indianapolis,IN', JAX: 'Jacksonville,FL', KC: 'Kansas City,MO',
  LA: 'Inglewood,CA', LAC: 'Inglewood,CA', LV: 'Las Vegas,NV', MIA: 'Miami Gardens,FL',
  MIN: 'Minneapolis,MN', NE: 'Foxborough,MA', NO: 'New Orleans,LA', NYG: 'East Rutherford,NJ',
  NYJ: 'East Rutherford,NJ', PHI: 'Philadelphia,PA', PIT: 'Pittsburgh,PA', SEA: 'Seattle,WA',
  SF: 'Santa Clara,CA', TB: 'Tampa,FL', TEN: 'Nashville,TN', WAS: 'Landover,MD',
}

function windLabel(mph) {
  if (mph < 5) return 'Calm'
  if (mph < 12) return 'Breezy'
  if (mph < 20) return 'Windy'
  return 'High Wind'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate')

  const { team } = req.query
  const city = NFL_CITIES[team]
  if (!city) {
    res.status(404).json({ error: `unknown_team: ${team}` })
    return
  }

  const key = process.env.WEATHER_API_KEY
  if (!key) {
    res.status(500).json({ error: 'WEATHER_API_KEY not set in Vercel project env vars' })
    return
  }

  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${encodeURIComponent(city)}&days=3&aqi=no&alerts=no`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`WeatherAPI ${r.status}`)
    const d = await r.json()
    const cur = d.current || {}

    res.status(200).json({
      team,
      city,
      current: {
        temp: Math.round(cur.temp_f ?? 72),
        feelsLike: Math.round(cur.feelslike_f ?? 72),
        condition: cur.condition?.text || '',
        windMph: Math.round(cur.wind_mph ?? 0),
        windDir: cur.wind_dir || '',
        windDeg: Math.round(cur.wind_degree ?? 0),
        windLabel: windLabel(Math.round(cur.wind_mph ?? 0)),
        humidity: Math.round(cur.humidity ?? 0),
      },
      forecastDays: (d.forecast?.forecastday || []).map((day) => ({
        date: day.date,
        maxTemp: Math.round(day.day?.maxtemp_f ?? 0),
        minTemp: Math.round(day.day?.mintemp_f ?? 0),
        chanceOfRain: day.day?.daily_chance_of_rain ?? 0,
        maxWindMph: Math.round(day.day?.maxwind_mph ?? 0),
        condition: day.day?.condition?.text || '',
      })),
    })
  } catch (err) {
    res.status(502).json({ error: 'weatherapi_fetch_failed', message: err.message })
  }
}
