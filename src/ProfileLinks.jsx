// 🪪 📰 📊 profile links for the slideout header.
// 2026-10-22 (user): 🪪 bio · 📰 news · 📊 stats badges next to the name in the slideout; each opens in a new tab.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const q = (s) => encodeURIComponent(fold(s))
const news = (name, league) => `https://news.google.com/search?q=${encodeURIComponent(`"${fold(name)}" ${league}`)}`
const badgeStyle = { textDecoration: 'none', fontSize: 15, lineHeight: 1, padding: '2px 3px', borderRadius: 6 }
function Badges({ links }) {
  return (
    <span className="profile-links" style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
      {links.filter((l) => l.href).map((l) => (
        <a key={l.icon} href={l.href} target="_blank" rel="noopener noreferrer" title={l.title} aria-label={l.title} style={badgeStyle}
          onClick={(e) => e.stopPropagation()}>{l.icon}</a>
      ))}
    </span>
  )
}

// Six Points: ESPN bio + ESPN player news (ESPN id from players.json stats_url), Pro-Football-Reference (standard + advanced)
export default function ProfileLinks({ name, espnId }) {
  return <Badges links={[
    { icon: '🪪', title: `${name} — bio (ESPN)`, href: espnId ? `https://www.espn.com/nfl/player/bio/_/id/${espnId}` : `https://www.espn.com/search/_/q/${q(name)}` },
    { icon: '📰', title: `${name} — latest news (ESPN)`, href: espnId ? `https://www.espn.com/nfl/player/news/_/id/${espnId}` : news(name, 'NFL') },
    { icon: '📊', title: `${name} — standard + advanced stats (Pro-Football-Reference)`, href: `https://www.pro-football-reference.com/search/search.fcgi?search=${q(name)}` },
  ]} />
}
