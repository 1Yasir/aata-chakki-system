const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const GU_UDHAAR = 'UDHAAR'
export const GU_WASOOLI = 'WASOOLI'
export const MAUND_KG = 40

export const emptyGeneralCustomerForm = () => ({
  name: '',
  phone: '',
})

export const emptyGeneralCreditForm = () => ({
  customerId: '',
  name: '',
  phone: '',
  date: new Date().toISOString().slice(0, 10),
  weightMaunds: '',
  cashPaid: '',
  amount: '',
  note: '',
})

export const emptyGeneralWasooliForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  note: '',
})

export function computeGeneralUdhaarLedger(transactions = []) {
  const active = transactions.filter((tx) => !tx.isDeleted)
  let netUdhaarBalance = 0
  let totalUdhaar = 0
  let totalWasooli = 0
  let totalCashPaid = 0
  let totalWeightKg = 0

  for (const tx of active) {
    const amount = toNumber(tx.amount)
    totalCashPaid += toNumber(tx.cashPaid)
    totalWeightKg += toNumber(tx.weightKg)
    if (tx.type === GU_WASOOLI) {
      netUdhaarBalance -= amount
      totalWasooli += amount
    } else {
      netUdhaarBalance += amount
      totalUdhaar += amount
    }
  }

  return {
    netUdhaarBalance,
    totalUdhaar,
    totalWasooli,
    totalCashPaid,
    totalWeightKg,
    totalWeightMaunds: totalWeightKg / MAUND_KG,
  }
}

export function buildGeneralRunningLedger(transactions = [], includeDeleted = false) {
  const rows = transactions.filter((tx) => includeDeleted || !tx.isDeleted)
  const chrono = [...rows].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''))
    if (dateCompare !== 0) return dateCompare
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  let balance = 0
  return chrono
    .map((tx) => {
      const amount = toNumber(tx.amount)
      const delta = tx.type === GU_WASOOLI ? -amount : amount
      if (!tx.isDeleted) balance += delta
      return { ...tx, delta, runningBalance: balance }
    })
    .reverse()
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function sortGeneralCustomersByName(customers = []) {
  return [...customers].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
  )
}
