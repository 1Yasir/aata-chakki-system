const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const OWN_PURCHASE = 'PURCHASE'
export const OWN_SALE = 'SALE'
export const OWN_USAGE = 'USAGE'

export const MAUND_KG = 40

export const emptyOwnWheatForm = (type = OWN_PURCHASE) => ({
  type,
  date: new Date().toISOString().slice(0, 10),
  weightMaunds: '',
  ratePerMaund: '',
  totalAmount: '',
  supplier: '',
  note: '',
})

export function resolveOwnWheatAmounts({ weightMaunds, ratePerMaund, totalAmount }) {
  const weight = toNumber(weightMaunds)
  const rate = toNumber(ratePerMaund)
  const total = toNumber(totalAmount)

  if (weight <= 0) {
    throw new Error('Weight in maunds must be greater than zero.')
  }

  if (total > 0) {
    return {
      weightMaunds: weight,
      weightKg: weight * MAUND_KG,
      ratePerMaund: rate > 0 ? rate : total / weight,
      totalAmount: total,
    }
  }

  if (rate > 0) {
    return {
      weightMaunds: weight,
      weightKg: weight * MAUND_KG,
      ratePerMaund: rate,
      totalAmount: rate * weight,
    }
  }

  return {
    weightMaunds: weight,
    weightKg: weight * MAUND_KG,
    ratePerMaund: 0,
    totalAmount: 0,
  }
}

export function yearFromDate(date) {
  const year = String(date || '').slice(0, 4)
  return /^\d{4}$/.test(year) ? year : ''
}

export function computeOwnWheatTotals(rows = [], year = '') {
  const active = rows.filter((row) => !row.isDeleted)
  const scoped = year ? active.filter((row) => yearFromDate(row.date) === String(year)) : active

  return scoped.reduce(
    (acc, row) => {
      const weightMaunds = toNumber(row.weightMaunds) || toNumber(row.weightKg) / MAUND_KG
      const weightKg = toNumber(row.weightKg) || weightMaunds * MAUND_KG
      const amount = toNumber(row.totalAmount)

      if (row.type === OWN_SALE) {
        acc.soldMaunds += weightMaunds
        acc.soldKg += weightKg
        acc.saleRevenue += amount
      } else if (row.type === OWN_USAGE) {
        acc.usedMaunds += weightMaunds
        acc.usedKg += weightKg
      } else {
        acc.purchasedMaunds += weightMaunds
        acc.purchasedKg += weightKg
        acc.investment += amount
      }

      acc.remainingMaunds = acc.purchasedMaunds - acc.soldMaunds - acc.usedMaunds
      acc.remainingKg = acc.purchasedKg - acc.soldKg - acc.usedKg
      return acc
    },
    {
      purchasedMaunds: 0,
      purchasedKg: 0,
      investment: 0,
      soldMaunds: 0,
      soldKg: 0,
      saleRevenue: 0,
      usedMaunds: 0,
      usedKg: 0,
      remainingMaunds: 0,
      remainingKg: 0,
    },
  )
}

export function availableOwnWheatYears(rows = []) {
  const years = new Set()
  rows.forEach((row) => {
    const year = yearFromDate(row.date)
    if (year) years.add(year)
  })
  return [...years].sort((a, b) => b.localeCompare(a))
}
