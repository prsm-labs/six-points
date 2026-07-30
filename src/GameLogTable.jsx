// Shared per-game box-score table -- used by PlayerSlideout's recent-game-log and vs-opponent
// sections, and by ScoutingTab's standalone any-player/any-opponent lookup (reused, not duplicated).
export default function GameLogTable({ games }) {
  const recent = games.slice(-5).reverse()
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Wk</th>
            <th>Opp</th>
            <th>Pass</th>
            <th>Rush</th>
            <th>Rec</th>
            <th>TD</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((g, i) => (
            <tr key={i}>
              <td>{g.week}</td>
              <td>{g.home_or_away}{g.opponent}</td>
              <td>{g.pass_att ? `${g.pass_cmp}/${g.pass_att}, ${g.pass_yards}yd` : '-'}</td>
              <td>{g.rush_att ? `${g.rush_att} car, ${g.rush_yards}yd` : '-'}</td>
              <td>{g.targets ? `${g.receptions}/${g.targets}, ${g.rec_yards}yd` : '-'}</td>
              <td>{g.any_td || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
