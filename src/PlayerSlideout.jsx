import { useEffect, useMemo, useState } from 'react'
import { subscribePlayerSlide, closePlayerSlide, openTeamSlide } from './slideouts.js'
import { PlayerAvatar } from './PlayerDirectory.jsx'
import L7Chart, { defaultCategory } from './L7Chart.jsx'
import { H2HBadge, H2H_NOTE, VENUE_NOTE, h2hFor, useH2H, venueFor } from './h2h.jsx'
import { OnOffPicker, onOffGames, useOnOff } from './OnOff.jsx'
import ProfileLinks from './ProfileLinks.jsx'
import GameLogTable from './GameLogTable.jsx'
import PickButton from './PickButton.jsx'
import { BreakoutBadge, fmtPct, GradeBadge, LiveStatusTag } from './gradeUi.jsx'
import { DepthTag, MatchupCell, fmtYds, leakSummary, muTier, roleSummary } from './matchupUi.jsx'
import { loadSlate } from './slate.js'
import { DVP_NOTE, ROLE_NOTE, matchupText, whoScoresText, ydsRankText, ydsRankTitle } from './gradeUi.jsx'
import { AllBookLinks, StatePicker } from './BetLink.jsx'
import { edgeClass, edgeText, fmtEdge } from './bookOdds.js'
import GamblyButton from './GamblyButton.jsx'
import { betLine } from './gambly.js'
import { HotHandTag } from './revampUi.jsx'
import { useThisWeekLine } from './useThisWeekLine.js'
import MatchupChip from './MatchupChip.jsx'

// 2026-10-20 live slideout: this week's line while his game is on (25 s refresh) and after it ends, next to the
// model's pre-game numbers; the game also joins the Last 7 chart as an outlined bar.
function ThisWeekCard({ t, m, position }) {
  if (!t?.started) return null
  const l = t.line
  const g = t.game
  const score = t.score ? `${g.away_team} ${t.score.away ?? 0} – ${g.home_team} ${t.score.home ?? 0}` : `${g.away_team} @ ${g.home_team}`
  const tds = l ? l.rush_td + l.rec_td : 0
  const tiles = !l ? [] : position === 'QB'
    ? [['C/ATT', `${l.pass_cmp}/${l.pass_att}`], ['Pass Yds', l.pass_yards], ['Pass TD', l.pass_td], ['INT', l.interceptions], ['Rush Yds', l.rush_yards], ['Rush TD', l.rush_td, l.rush_td > 0]]
    : position === 'RB'
      ? [['Carries', l.rush_att], ['Rush Yds', l.rush_yards], ['Rec', `${l.receptions}/${l.targets}`], ['Rec Yds', l.rec_yards], ['TDs', tds, tds > 0], ['Scrim Yds', l.rush_yards + l.rec_yards, m?.est_yards != null && l.rush_yards + l.rec_yards >= m.est_yards]]
      : [['Targets', l.targets], ['Rec', l.receptions], ['Rec Yds', l.rec_yards, m?.est_yards != null && l.rec_yards >= m.est_yards], ['TDs', tds, tds > 0], ['Rush Yds', l.rush_yards]]
  return (
    <div className={`slideout-section week-live ${t.live ? 'is-live' : ''}`}>
      <div className="week-live-head">
        <span className={t.live ? 'live-tag' : 'final-tag'}>{t.live ? '● LIVE' : 'FINAL'}</span>
        <strong>{score}</strong>
        {t.live && t.detail && <span className="meta-line small" style={{ margin: 0 }}>{t.detail}</span>}
      </div>
      {!l && <p className="meta-line small">{t.out ? `${t.out.status} for this game.` : 'No stats in the box score yet.'}</p>}
      {l && (
        <div className="stat-grid">
          {tiles.map(([label, value, good]) => (
            <div className={`stat-tile ${good ? 'beat' : ''}`} key={label}>
              <div className="value">{value}</div>
              <div className="label">{label}</div>
            </div>
          ))}
        </div>
      )}
      {l && m && (
        <p className="meta-line small">
          Pre-game: TD {fmtPct(m.p_td, 1)}{m.est_yards != null ? ` · est. ${Math.round(m.est_yards)} yds` : ''}{m.p_100 != null && position !== 'QB' ? ` · 100+ ${fmtPct(m.p_100, 1)}` : ''}
          {tds > 0 ? ' · ✓ scored' : ''}
        </p>
      )}
      <p className="meta-line small">{t.live ? 'Live from ESPN — updates every 25 seconds.' : 'Final line.'} This game is the outlined last bar on the Last 7 chart.</p>
    </div>
  )
}

// Section order per spec §3: header, season stat line, matchup context, L7 chart, recent game
// log, vs-opponent history. The dot timeline is skipped per spec
// §3/§8 -- the dot timeline is optional. (Picks button added 2026-10-11 with My Picks, picks.js.)

function seasonTotals(games, position) {
  const sum = (key) => games.reduce((a, g) => a + (g[key] || 0), 0)
  if (position === 'QB') {
    const att = sum('pass_att')
    const cmp = sum('pass_cmp')
    return [
      { label: 'Comp/Att', value: `${cmp}/${att}` },
      { label: 'Pass Yds', value: sum('pass_yards') },
      { label: 'Pass TD', value: sum('pass_td') },
      { label: 'INT', value: sum('interceptions') },
      { label: 'Rush Yds', value: sum('rush_yards') },
      { label: 'Rush TD', value: sum('rush_td') },
    ]
  }
  if (position === 'RB') {
    return [
      { label: 'Carries', value: sum('rush_att') },
      { label: 'Rush Yds', value: sum('rush_yards') },
      { label: 'Rush TD', value: sum('rush_td') },
      { label: 'Receptions', value: sum('receptions') },
      { label: 'Rec Yds', value: sum('rec_yards') },
      { label: 'Rec TD', value: sum('rec_td') },
    ]
  }
  // WR/TE
  const targets = sum('targets')
  const receptions = sum('receptions')
  const recYards = sum('rec_yards')
  return [
    { label: 'Targets', value: targets },
    { label: 'Receptions', value: receptions },
    { label: 'Rec Yds', value: recYards },
    { label: 'Rec TD', value: sum('rec_td') },
    { label: 'Yds/Catch', value: receptions ? (recYards / receptions).toFixed(1) : '0.0' },
  ]
}

// Scheme Fit grade tiles -- real per-player man/zone/blitz performance splits, requested
// directly against Going Yard's own "Arsenal Fit." See matchup_engine.py's
// compute_player_scheme_splits() docstring for the real derivation and the disclosed A+/A/B/C/D
// tier convention (Going Yard itself doesn't use letter grades for this -- verified in its real
// source -- so this scale is this app's own, not a port).
const SPLIT_LABELS = { man: 'vs Man', zone: 'vs Zone', blitz: 'vs Blitz', no_blitz: 'vs No Blitz' }

function SchemeFitSection({ splits, sourceIsPrior, position }) {
  if (!splits) return null
  const order = ['man', 'zone', 'blitz', 'no_blitz']
  const present = order.filter((k) => splits[k])
  if (present.length === 0) return null
  return (
    <div className="slideout-section">
      <h3>Scheme Fit</h3>
      <p className="meta-line small" style={{ margin: '0 0 8px' }}>
        Real {sourceIsPrior ? '2025 season' : 'season-to-date'} performance split by coverage/pass-rush
        look, graded by percentile vs. other {position}s in that same split (A+ = top 10%, D = bottom
        25%) &middot; not a prediction -- a real historical tendency
      </p>
      <div className="stat-grid">
        {present.map((k) => (
          <div className="stat-tile" key={k}>
            <div className="value">{splits[k].grade}</div>
            <div className="label">
              {SPLIT_LABELS[k]}
              <div className="meta-line small" style={{ margin: '2px 0 0' }}>
                {(splits[k].td_rate * 100).toFixed(1)}% TD/play &middot; {splits[k].ypt} yd/play &middot; n={splits[k].plays}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Route Profile -- real official NFL Next Gen Stats (own separation/cushion, not a split vs.
// this game's specific opponent -- that per-opponent blend lives in ScoutingTab's Route Edge
// card, which also has the defense side). This is the player's own season-to-date real
// route-running signal, same spirit as Scheme Fit but WR/TE only (see matchup_engine.py's
// build_route_profiles docstring: NGS receiving doesn't track RBs at all, and RB rushing
// efficiency isn't a stable real per-player skill at available sample sizes -- so RBs
// deliberately get nothing here rather than an invented grade).
function RouteProfileSection({ profile, position }) {
  if ((position !== 'WR' && position !== 'TE') || !profile) return null
  return (
    <div className="slideout-section">
      <h3>Route Profile</h3>
      <p className="meta-line small" style={{ margin: '0 0 8px' }}>
        Real NFL Next Gen Stats, season-to-date &middot; graded by percentile vs. other {position}s
        on average separation &middot; real-validated to predict this player's own future catch
        rate, NOT touchdown probability
      </p>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="value">{profile.grade}</div>
          <div className="label">
            Separation
            <div className="meta-line small" style={{ margin: '2px 0 0' }}>
              {profile.avg_separation} yds avg &middot; n={profile.targets} targets
            </div>
          </div>
        </div>
        <div className="stat-tile">
          <div className="value">{(profile.catch_pct * 100).toFixed(0)}%</div>
          <div className="label">
            Catch Rate
            <div className="meta-line small" style={{ margin: '2px 0 0' }}>
              {profile.avg_cushion} yds avg cushion given
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlayerSlideout() {
  const [player, setPlayer] = useState(null)
  const [gameLog, setGameLog] = useState(null)
  const [directoryEntry, setDirectoryEntry] = useState(null)
  const [schemeSplits, setSchemeSplits] = useState(null)
  const [routeProfiles, setRouteProfiles] = useState(null)
  const [weekRow, setWeekRow] = useState(null)
  const [chartMode, setChartMode] = useState('l7')
  const h2hData = useH2H()
  // 2026-10-21 👥 with / without teammates (OnOff.jsx); resets when another player opens
  const [sel, setSel] = useState([])
  const [how, setHow] = useState('without')
  useEffect(() => { setSel([]) }, [player?.player_id])
  const onoffData = useOnOff(weekRow?.team || player?.team)

  useEffect(() => subscribePlayerSlide(setPlayer), [])
  const espnId = directoryEntry?.stats_url?.match(/\/id\/(\d+)\//)?.[1] || null
  const thisWeek = useThisWeekLine(player, weekRow, espnId)

  useEffect(() => {
    if (!player) return
    setGameLog(null)
    Promise.all([
      fetch('/data/player_game_logs.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/players.json').then((r) => (r.ok ? r.json() : {})),
      fetch('/data/scheme_splits.json').then((r) => (r.ok ? r.json() : null)),
      fetch('/data/route_profiles.json').then((r) => (r.ok ? r.json() : null)),
      loadSlate(), // 2026-10-18: the shared slate (book odds, edge, hot hand merged in)
    ]).then(([logs, directory, scheme, routes, latest]) => {
      // this week's grade-model row, so the header shows it (and picks save it) from any tab
      setWeekRow(latest?.matchups?.find((m) => m.player_id === player.player_id) || null)
      setGameLog(logs[player.player_id] || [])
      setDirectoryEntry(directory[player.player_id] || null)
      setSchemeSplits(scheme)
      setRouteProfiles(routes)
    })
  }, [player?.player_id])

  const vsOpponent = useMemo(() => {
    if (!gameLog || !player?.opponent) return []
    return gameLog.filter((g) => g.opponent === player.opponent)
  }, [gameLog, player])

  if (!player) return null
  const h2h = h2hFor(h2hData, weekRow)
  const venue = venueFor(h2hData, weekRow)
  const vLabel = venue?.side === 'home' ? '🏠 Home' : '✈️ Road'
  const onoffTeam = weekRow?.team || player.team
  const oo = onOffGames(onoffData?.team === onoffTeam ? onoffData : null, player.player_id, sel, how)
  const chartGames = oo.match ? oo.match : chartMode === 'h2h' && h2h ? h2h.games : chartMode === 'venue' && venue ? venue.games : null

  const name = player.player_name || directoryEntry?.name || ''
  const position = player.position || directoryEntry?.position || ''
  const recentTargets = gameLog && gameLog.length ? gameLog.slice(-3).reduce((a, g) => a + g.targets, 0) / Math.min(3, gameLog.length) : 0

  return (
    <>
      <div className="slideout-backdrop" onClick={closePlayerSlide} />
      <div className="slideout-panel">
        <div className="slideout-header">
          <PlayerAvatar playerId={player.player_id} name={name} />
          <div className="slideout-header-info">
            <h2>{name}<ProfileLinks name={name} espnId={espnId} /></h2>
            <div className="sub">
              {position}<DepthTag m={weekRow || player} /> &middot;{' '}
              <button className="team-link" onClick={() => player.team && openTeamSlide({ team: player.team })}>
                {player.team}
              </button>
            </div>
            <MatchupChip player={player} weekRow={weekRow} t={thisWeek} gameLog={gameLog} />
            {weekRow?.grade && (
              <div className="sub slideout-grade">
                Week {weekRow.week}: <GradeBadge grade={weekRow.grade} m={weekRow} /> TD {fmtPct(weekRow.p_td)}
                {weekRow.p_td2 != null && <> &middot; 2+ TDs {fmtPct(weekRow.p_td2)}</>} &middot; 100+ {fmtPct(weekRow.p_100)}
                {' '}<BreakoutBadge m={weekRow} /> <HotHandTag m={weekRow} /> <LiveStatusTag m={weekRow} />
              </div>
            )}
            {/* 2026-10-22 early-season role check (nfl_project/build_role_check.py) */}
            {weekRow?.roleFlag === 'backup' && <div className="sub slideout-grade" title="Kept out of Top Picks and PRISM Picks">🪑? ESPN's depth chart has him {weekRow.depth_label}, below the role his usage projects, with {weekRow.teamGp} game{weekRow.teamGp === 1 ? '' : 's'} for {weekRow.team} — treat this week's numbers as an upper bound.</div>}
            {weekRow && !weekRow.roleFlag && weekRow.teamGp === 0 && <div className="sub slideout-grade">📅 No games with {weekRow.team} yet{weekRow.lastTeam && weekRow.lastTeam !== weekRow.team ? ` (last season: ${weekRow.lastTeam})` : ''} — his usage leans on last season until he plays.</div>}
            {(h2h || venue) && (
              <div className="sub slideout-grade">
                {h2h && <span title={H2H_NOTE}>🆚 H2H vs {weekRow.opponent}: <H2HBadge h={h2h} /> <span className="meta-line small">{h2h.text}</span></span>}
                {h2h && venue && <> &middot; </>}
                {venue && <span title={VENUE_NOTE}>{vLabel}: <H2HBadge h={venue} /> <span className="meta-line small">{venue.text}</span></span>}
                <span className="meta-line small"> (context, not a prediction)</span>
              </div>
            )}
            {(weekRow || player.player_id) && (
              <div style={{ margin: '4px 0' }}><PickButton player={weekRow || player} /></div>
            )}
            {directoryEntry?.stats_url && (
              <a href={directoryEntry.stats_url} target="_blank" rel="noopener noreferrer" className="external-link">
                View on ESPN &rarr;
              </a>
            )}
          </div>
          <button className="slideout-close" onClick={closePlayerSlide} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="slideout-body">
          {!gameLog ? (
            <p className="empty-state">Loading...</p>
          ) : (
            <>
              <ThisWeekCard t={thisWeek} m={weekRow} position={position} />
              {weekRow && (
                // This week (2026-10-18 revamp, Slap Shot's slideout): the model's chances, the matchup line,
                // recent TDs, every sportsbook's anytime-TD price (tap to bet) and Gambly for each prop.
                <div className="slideout-section">
                  <h3>Week {weekRow.week} vs {weekRow.opponent}</h3>
                  <div className="slideout-lines">
                    <div>Model: TD {fmtPct(weekRow.p_td, 1)}{weekRow.p_td2 != null && <> · 2+ TDs {fmtPct(weekRow.p_td2, 1)}</>} · 100+ yds {fmtPct(weekRow.p_100, 1)}{weekRow.est_yards != null && <> · est. {Math.round(weekRow.est_yards)} yds</>}</div>
                    {matchupText(weekRow) && <div title={DVP_NOTE}>{matchupText(weekRow)} <span className="meta-line small">(the defense factor in the grade)</span></div>}
                    {ydsRankText(weekRow) && <div title={ydsRankTitle(weekRow)}>Yards: {weekRow.opponent} {ydsRankText(weekRow)} <span className="meta-line small">({weekRow.position === 'WR' ? 'context — not in Est. Yards for WRs' : 'part of Est. Yards and the 100+ chance'})</span></div>}
                    {whoScoresText(weekRow) && <div title={ROLE_NOTE}>{whoScoresText(weekRow)} <span className="meta-line small">(context — not in the grade)</span></div>}
                    {weekRow.td_l3 != null && <div>TDs in his last 3 games: {weekRow.td_l3} (last game {weekRow.td_last ?? 0}){weekRow.hotHand ? ' · 🔥 hot hand outside the top 25%' : ''}</div>}
                    <div>Anytime TD: <AllBookLinks book={weekRow.book} /> <StatePicker /></div>
                    {weekRow.edge != null && <div title={edgeText(weekRow)}>vs best price: <span className={edgeClass(weekRow.edge)}>{fmtEdge(weekRow.edge)} pts</span> · market check <b>{weekRow.market}%</b> <span className="meta-line small">(half ours, half the book — context, not in the grade)</span></div>}
                    <div className="slideout-gambly">Send to Gambly:
                      <GamblyButton compact={false} label="Anytime TD" text={betLine(weekRow, 'td')} />
                      <GamblyButton compact={false} label="2+ TDs" text={betLine(weekRow, 'td2')} />
                      <GamblyButton compact={false} label="First TD" text={betLine(weekRow, 'first')} />
                      {weekRow.position !== 'QB' && <GamblyButton compact={false} label="100+ yds" text={betLine(weekRow, 'yds100')} />}
                    </div>
                  </div>
                </div>
              )}
              <div className="slideout-section">
                <h3>{player.season ? `${player.season} Season` : 'Season to date'}</h3>
                <div className="stat-grid">
                  {seasonTotals(gameLog, position).map((s) => (
                    <div className="stat-tile" key={s.label}>
                      <div className="value">{s.value}</div>
                      <div className="label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {player.opponent && (
                <div className="slideout-section">
                  <h3>This Week's Matchup</h3>
                  <p className="meta-line">
                    {player.home_or_away === '@' ? '@' : 'vs'} {player.opponent}
                    {player.mu_pct != null ? (
                      <> &middot; <MatchupCell m={player} /> {muTier(player)?.toLowerCase()} matchup for his role
                        ({Math.round(player.mu_pct)}th percentile vs {player.position}s this week)
                        {player.est_yards != null && <> &middot; Est. Yards {Number(player.est_yards).toFixed(0)}
                          {' '}({fmtYds(player.mu_yds)} from the matchup)</>}</>
                    ) : player.opp_def_rank_pct != null && (
                      <> &middot; opponent defense ranks in the {Math.round(player.opp_def_rank_pct)}th
                        percentile of yards allowed vs {position === 'RB' ? 'RB' : 'WR'} (higher = weaker
                        defense, better matchup)</>
                    )}
                    {player.script_component != null && (
                      <> &middot; game-script component {Number(player.script_component).toFixed(1)}
                        (Vegas-implied, 50 = neutral)</>
                    )}
                  </p>
                  {player.mu_pct != null && <p className="meta-line small">{leakSummary(player)}.</p>}
                  {roleSummary(player) && <p className="meta-line small">{roleSummary(player)}.</p>}
                </div>
              )}

              <SchemeFitSection
                splits={schemeSplits?.splits?.[player.player_id]}
                sourceIsPrior={schemeSplits?.source_is_prior_season}
                position={position}
              />

              <RouteProfileSection
                profile={routeProfiles?.players?.[player.player_id]}
                position={position}
              />

              <div className="slideout-section">
                {onoffData?.team === onoffTeam && <OnOffPicker d={onoffData} playerId={player.player_id} position={position} sel={sel} setSel={setSel} how={how} setHow={setHow} />}
                <h3>{oo.match ? `${how === 'with' ? 'With' : 'Without'} teammates` : chartGames ? (chartMode === 'h2h' ? `H2H vs ${weekRow.opponent}` : `${vLabel} games`) : 'Last 7 Games'}</h3>
                {!oo.match && (h2h || venue) && (
                  <div className="pill-row" style={{ marginBottom: 6 }}>
                    <button className={`pill-btn ${!chartGames ? 'active' : ''}`} onClick={() => setChartMode('l7')}>Last 7</button>
                    {h2h && <button className={`pill-btn ${chartMode === 'h2h' && chartGames ? 'active' : ''}`} onClick={() => setChartMode('h2h')}>🆚 H2H vs {weekRow.opponent} ({h2h.n})</button>}
                    {venue && <button className={`pill-btn ${chartMode === 'venue' && chartGames ? 'active' : ''}`} onClick={() => setChartMode('venue')}>{vLabel} (this week)</button>}
                  </div>
                )}
                {oo.match && !oo.match.length && <p className="meta-line small">No games match that pick.</p>}
                {chartGames && !oo.match && <p className="meta-line small">{chartMode === 'h2h' ? `Last ${chartGames.length} of ${h2h.n} games vs ${weekRow.opponent} since 2022` : `Last ${chartGames.length} of his ${venue.n} ${venue.side === 'home' ? 'home' : 'road'} games, last season + this`} (oldest → newest). Context only.</p>}
                <L7Chart
                  key={oo.match ? `onoff-${how}-${sel.join('-')}` : chartGames ? chartMode : 'l7'}
                  gameLog={chartGames || (thisWeek?.started && thisWeek.line
                    ? [...gameLog.filter((g) => g.week !== thisWeek.game.week), { ...thisWeek.line, week: thisWeek.game.week, opponent: thisWeek.game.home_team === (weekRow?.team || player.team) ? thisWeek.game.away_team : thisWeek.game.home_team, home_or_away: thisWeek.game.home_team === (weekRow?.team || player.team) ? 'vs' : '@', today: true, live: thisWeek.live }]
                    : gameLog)}
                  position={position}
                  initialCategory={defaultCategory(position, recentTargets)}
                />
              </div>

              <div className="slideout-section">
                <h3>Recent Game Log</h3>
                <GameLogTable games={gameLog} />
              </div>

              {player.opponent && (
                <div className="slideout-section">
                  <h3>Vs. {player.opponent} (season)</h3>
                  {vsOpponent.length === 0 ? (
                    <p className="empty-state">No games played against {player.opponent} yet this season.</p>
                  ) : (
                    <>
                      {vsOpponent.length <= 2 && (
                        <p className="meta-line small">
                          Only {vsOpponent.length} game{vsOpponent.length > 1 ? 's' : ''} of history against this
                          specific opponent -- treat this as a curiosity, not a signal.
                        </p>
                      )}
                      <GameLogTable games={vsOpponent} />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
