export function roundMoney(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100) / 100
}

export function formatEuro(amount, { zeroLabel = null } = {}) {
  const rounded = roundMoney(amount)
  if (rounded == null || rounded <= 0) return zeroLabel

  const fixed = rounded.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  if (decPart === '00') return `€${withDots}`
  return `€${withDots},${decPart}`
}

export function formatEuroWhole(amount) {
  const rounded = roundMoney(amount) ?? 0
  const intValue = Math.round(rounded)
  const withDots = String(intValue).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots}`
}
