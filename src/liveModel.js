// 2026-10-20 📈 Live projection (user: project the rest of the game from where it stands). Fitted and held out by season in the
// network session (claude/REPORT_LiveRegression_2026-10-20.md): projected final = what he has now + a normal rest of the game =
// pre-game projection x share of the game left x (1 + small nudges for volume / minutes so far and the score). Hot or cold
// shooting / finishing is NOT carried forward -- tested: almost none of it carries into the rest of a game in any of the three
// sports, and projecting from the current pace was worse than ignoring the game entirely. Weights are fitted at each
// quarter / period break and blended in between (at puck drop / tip / kickoff the projection is the pre-game one).
// Chances: the rest of the game is treated as a negative binomial count (yards: normal) with the fitted spread.
/* eslint-disable */
export const LIVE_MODEL = {"sport": "nfl", "checkpoints": [0.25, 0.5, 0.75], "stats": {"recy": {"b": [{"z_vol": 0.1319, "z_m": -0.077}, {"z_vol": 0.247, "z_m": -0.1004}, {"z_vol": 0.2966, "z_m": -0.1486}], "phi": [23.923, 21.817, 22.987]}, "rushy": {"b": [{"z_vol": 0.3947, "z_m": -0.0086}, {"z_vol": 0.6247, "z_m": 0.0309}, {"z_vol": 0.7519, "z_m": 0.0649}], "phi": [22.333, 20.426, 17.707]}, "passy": {"b": [{"z_vol": 0.3518, "z_m": -0.0904}, {"z_vol": 0.4917, "z_m": -0.1137}, {"z_vol": 0.5192, "z_m": -0.1542}], "phi": [31.266, 26.367, 30.336]}, "scrim": {"b": [{"z_vol": 0.2683, "z_m": -0.053}, {"z_vol": 0.4278, "z_m": -0.055}, {"z_vol": 0.5377, "z_m": -0.0739}], "phi": [23.733, 21.596, 21.864]}, "td": {"b": [{"z_vol": 0.2862, "z_m": -0.0584}, {"z_vol": 0.3291, "z_m": -0.0583}, {"z_vol": 0.568, "z_m": -0.0955}], "phi": [0.967, 0.873, 0.989]}, "tgt": {"b": [{"z_vol": 0.1773, "z_m": -0.0986}, {"z_vol": 0.2606, "z_m": -0.1156}, {"z_vol": 0.337, "z_m": -0.1733}], "phi": [1.476, 1.357, 1.549]}, "car": {"b": [{"z_vol": 0.454, "z_m": 0.0105}, {"z_vol": 0.6702, "z_m": 0.0341}, {"z_vol": 0.7908, "z_m": 0.0857}], "phi": [2.606, 2.261, 2.17]}, "team_pts": {"b": [{"z_m": -0.0027}, {"z_m": -0.0233}, {"z_m": -0.0604}], "phi": [4.341, 3.999, 5.068]}}};

function coefAt(stat, f) {
  const s = LIVE_MODEL.stats[stat];
  const cps = LIVE_MODEL.checkpoints;
  if (!s) return { b: {}, phi: 1 };
  const lerp = (a, b, w) => {
    const out = {};
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[k] = (a?.[k] || 0) * (1 - w) + (b?.[k] || 0) * w;
    return out;
  };
  if (f <= cps[0]) return { b: lerp({}, s.b[0], f / cps[0]), phi: s.phi[0] };
  for (let i = 1; i < cps.length; i++) {
    if (f <= cps[i]) {
      const w = (f - cps[i - 1]) / (cps[i] - cps[i - 1]);
      return { b: lerp(s.b[i - 1], s.b[i], w), phi: s.phi[i - 1] * (1 - w) + s.phi[i] * w };
    }
  }
  return { b: s.b[cps.length - 1], phi: s.phi[cps.length - 1] };
}

// pre: pre-game full-game projection; f: share of the game played (0..1); z: { z_vol, z_min, z_m, ... } already computed
export function restOfGame(stat, pre, f, z) {
  if (pre == null || !(pre > 0)) return { mean: 0, phi: 1 };
  const { b, phi } = coefAt(stat, Math.min(1, Math.max(0, f)));
  let adj = 1;
  for (const [k, v] of Object.entries(b)) adj += v * (z[k] || 0);
  return { mean: Math.max(0, (1 - f) * pre * Math.max(0.2, adj)), phi: Math.max(phi, 1.0001) };
}

// volume ratio feature, shrunk with k so one early shot / target can't swing it
export const ratio = (soFar, f, preVol, k) => (preVol == null ? 0 : (soFar + k) / (f * preVol + k) - 1);

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
// P(rest >= need) for a count with mean m and variance phi * m
export function chanceAtLeast(need, rest) {
  if (need <= 0) return 1;
  const m = rest.mean;
  if (!(m > 0)) return 0;
  const phi = rest.phi;
  let cdf = 0;
  if (phi <= 1.02) {
    let pk = Math.exp(-m);
    for (let k = 0; k < need; k++) { cdf += pk; pk *= m / (k + 1); }
  } else {
    const r = m / (phi - 1), p = 1 / phi;   // NB: mean r(1-p)/p = m, var m / p = phi * m
    for (let k = 0; k < need; k++) cdf += Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p));
  }
  return Math.min(1, Math.max(0, 1 - cdf));
}
// yards: normal with variance phi * mean, continuity-corrected
export function chanceAtLeastYards(need, rest) {
  if (need <= 0) return 1;
  const m = rest.mean, sd = Math.sqrt(Math.max(rest.phi * Math.max(m, 1), 1));
  const zc = (need - 0.5 - m) / sd;
  const t = 1 / (1 + 0.2316419 * Math.abs(zc));
  const d = 0.3989423 * Math.exp(-zc * zc / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return zc > 0 ? tail : 1 - tail;
}
