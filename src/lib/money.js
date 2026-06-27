export function roundMoney(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100) / 100
}

export function formatEuro(amount, { zeroLabel = null } = {}) {
  if (amount == null || amount === '') return zeroLabel
  const num = Number(amount)
  if (!Number.isFinite(num) || num <= 0) return zeroLabel

  if (num % 1 === 0) {
    const withDots = String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `€${withDots}`
  }

  const fixed = num.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots},${decPart}`
}

export function formatEuroWhole(amount, options) {
  return formatEuro(amount, options)
}
