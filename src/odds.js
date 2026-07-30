// Sport-agnostic odds math -- concept doc §8: "fully sport-agnostic, port as-is." No NFL
// dependency here at all, same functions would work for any sport's moneyline/prop odds.

export function americanToDecimal(american) {
  const o = Number(american)
  if (!o) return 1
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o)
}

export function decimalToAmerican(decimal) {
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}

export function impliedProbability(american) {
  const o = Number(american)
  if (!o) return 0
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100)
}

export function parlayDecimal(americanOddsList) {
  return americanOddsList.reduce((acc, o) => acc * americanToDecimal(o), 1)
}

export function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c])
  const withoutFirst = combinations(rest, k)
  return [...withFirst, ...withoutFirst]
}
