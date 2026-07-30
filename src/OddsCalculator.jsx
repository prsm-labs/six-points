import { useMemo, useState } from 'react'
import { americanToDecimal, impliedProbability, parlayDecimal, combinations } from './odds'

function ManualCalculator() {
  const [odds, setOdds] = useState('-110')
  const [stake, setStake] = useState('100')

  const decimal = americanToDecimal(odds)
  const prob = impliedProbability(odds)
  const payout = Number(stake || 0) * decimal
  const profit = payout - Number(stake || 0)

  return (
    <div className="calc-block">
      <label>
        American odds
        <input value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="-110 or +150" />
      </label>
      <label>
        Stake
        <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" />
      </label>
      <div className="calc-results">
        <div>Implied probability: <strong>{(prob * 100).toFixed(1)}%</strong></div>
        <div>Decimal odds: <strong>{decimal.toFixed(2)}</strong></div>
        <div>Total payout: <strong>${payout.toFixed(2)}</strong></div>
        <div>Profit: <strong>${profit.toFixed(2)}</strong></div>
      </div>
    </div>
  )
}

function ParlayCalculator() {
  const [legs, setLegs] = useState(['-110', '-110'])
  const [stake, setStake] = useState('100')

  const decimal = parlayDecimal(legs)
  const payout = Number(stake || 0) * decimal
  const profit = payout - Number(stake || 0)
  const combinedProb = legs.reduce((acc, o) => acc * impliedProbability(o), 1)

  return (
    <div className="calc-block">
      {legs.map((leg, i) => (
        <label key={i}>
          Leg {i + 1} odds
          <input
            value={leg}
            onChange={(e) => {
              const next = [...legs]
              next[i] = e.target.value
              setLegs(next)
            }}
          />
        </label>
      ))}
      <div className="calc-actions">
        <button onClick={() => setLegs([...legs, '-110'])}>+ Add Leg</button>
        {legs.length > 2 && (
          <button onClick={() => setLegs(legs.slice(0, -1))}>- Remove Leg</button>
        )}
      </div>
      <label>
        Stake
        <input value={stake} onChange={(e) => setStake(e.target.value)} type="number" />
      </label>
      <div className="calc-results">
        <div>Combined probability: <strong>{(combinedProb * 100).toFixed(2)}%</strong></div>
        <div>Parlay decimal odds: <strong>{decimal.toFixed(2)}</strong></div>
        <div>Total payout: <strong>${payout.toFixed(2)}</strong></div>
        <div>Profit: <strong>${profit.toFixed(2)}</strong></div>
      </div>
    </div>
  )
}

function RoundRobinCalculator() {
  const [legs, setLegs] = useState(['-110', '-110', '-110', '-110'])
  const [comboSize, setComboSize] = useState(2)
  const [stakePerCombo, setStakePerCombo] = useState('10')

  const combos = useMemo(() => combinations(legs, comboSize), [legs, comboSize])
  const rows = combos.map((combo, i) => {
    const decimal = parlayDecimal(combo)
    const payout = Number(stakePerCombo || 0) * decimal
    return { i, combo, decimal, payout }
  })
  const totalStake = rows.length * Number(stakePerCombo || 0)
  const totalPayout = rows.reduce((a, r) => a + r.payout, 0)

  return (
    <div className="calc-block">
      {legs.map((leg, i) => (
        <label key={i}>
          Leg {i + 1} odds
          <input
            value={leg}
            onChange={(e) => {
              const next = [...legs]
              next[i] = e.target.value
              setLegs(next)
            }}
          />
        </label>
      ))}
      <div className="calc-actions">
        <button onClick={() => setLegs([...legs, '-110'])}>+ Add Leg</button>
        {legs.length > 2 && (
          <button onClick={() => setLegs(legs.slice(0, -1))}>- Remove Leg</button>
        )}
      </div>
      <label>
        Combo size
        <select value={comboSize} onChange={(e) => setComboSize(Number(e.target.value))}>
          {legs.map((_, i) => i + 2 <= legs.length && <option key={i} value={i + 2}>{i + 2}-leg parlays</option>)}
        </select>
      </label>
      <label>
        Stake per combo
        <input value={stakePerCombo} onChange={(e) => setStakePerCombo(e.target.value)} type="number" />
      </label>
      <div className="calc-results">
        <div>{rows.length} combos &middot; total stake <strong>${totalStake.toFixed(2)}</strong></div>
        <div>Total possible payout: <strong>${totalPayout.toFixed(2)}</strong></div>
      </div>
    </div>
  )
}

export default function OddsCalculator() {
  const [mode, setMode] = useState('manual')

  return (
    <div>
      <div className="sub-tabs">
        <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
          Manual
        </button>
        <button className={mode === 'parlay' ? 'active' : ''} onClick={() => setMode('parlay')}>
          Parlay
        </button>
        <button className={mode === 'roundrobin' ? 'active' : ''} onClick={() => setMode('roundrobin')}>
          Round Robin
        </button>
      </div>
      {mode === 'manual' && <ManualCalculator />}
      {mode === 'parlay' && <ParlayCalculator />}
      {mode === 'roundrobin' && <RoundRobinCalculator />}
    </div>
  )
}
