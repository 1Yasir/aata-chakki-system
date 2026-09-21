const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const TX_DEPOSIT = 'DEPOSIT'
export const TX_WITHDRAWAL = 'WITHDRAWAL'
export const TX_UDHAAR = 'UDHAAR'
export const TX_WASOOLI = 'WASOOLI'
export const FEE_CASH = 'CASH'
export const FEE_UDHAAR = 'UDHAAR'
export const PAY_CASH = 'CASH'
export const PAY_ONLINE = 'ONLINE'

export const isStockTransaction = (type) => type === TX_DEPOSIT || type === TX_WITHDRAWAL
export const isPaymentTransaction = (type) => type === TX_UDHAAR || type === TX_WASOOLI

// Helper utilities for Maund (Mann) conversions (1 Maund = 40 KG)
export const kgToMaunds = (kg) => toNumber(kg) / 40
export const maundsToKg = (maunds) => toNumber(maunds) * 40

export const emptyCustomerForm = () => ({
  name: '',
  phone: '',
  initialStockKg: '',
})

export const emptyTransactionForm = (type = TX_DEPOSIT) => ({
  type,
  date: new Date().toISOString().slice(0, 10),
  weightKg: '',
  millingFee: '',
  feePayment: FEE_CASH,
})

export const emptyWasooliForm = (type = TX_WASOOLI) => ({
  type,
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  paymentMethod: PAY_CASH,
  note: '',
})

export function transactionAmount(tx) {
  if (isPaymentTransaction(tx.type)) return toNumber(tx.amount)
  return toNumber(tx.millingFee)
}

export function udhaarDelta(tx) {
  if (tx.type === TX_WASOOLI) return -toNumber(tx.amount)
  if (tx.type === TX_UDHAAR) return toNumber(tx.amount)
  if (tx.type === TX_WITHDRAWAL && tx.feePayment === FEE_UDHAAR) return toNumber(tx.millingFee)
  return 0
}

export function isUdhaarRelated(tx) {
  return udhaarDelta(tx) !== 0 || tx.type === TX_WASOOLI || tx.type === TX_UDHAAR
}

export function computeCustomerLedger(initialStockKg, transactions = []) {
  const active = transactions.filter((tx) => !tx.isDeleted)
  let currentStockKg = toNumber(initialStockKg)
  let udhaarBalance = 0
  let totalDepositedKg = 0
  let totalWithdrawnKg = 0
  let millingFeesCash = 0
  let millingFeesUdhaar = 0
  let totalWasooli = 0
  let totalExtraUdhaar = 0

  for (const tx of active) {
    const weight = toNumber(tx.weightKg)
    const fee = toNumber(tx.millingFee)
    const amount = toNumber(tx.amount)

    if (tx.type === TX_DEPOSIT) {
      currentStockKg += weight
      totalDepositedKg += weight
    } else if (tx.type === TX_WITHDRAWAL) {
      currentStockKg -= weight
      totalWithdrawnKg += weight
      if (tx.feePayment === FEE_UDHAAR) {
        udhaarBalance += fee
        millingFeesUdhaar += fee
      } else {
        millingFeesCash += fee
      }
    } else if (tx.type === TX_UDHAAR) {
      udhaarBalance += amount
      totalExtraUdhaar += amount
    } else if (tx.type === TX_WASOOLI) {
      udhaarBalance -= amount
      totalWasooli += amount
    }
  }

  return {
    currentStockKg,
    currentStockMaunds: kgToMaunds(currentStockKg),
    udhaarBalance,
    totalDepositedKg,
    totalDepositedMaunds: kgToMaunds(totalDepositedKg),
    totalWithdrawnKg,
    totalWithdrawnMaunds: kgToMaunds(totalWithdrawnKg),
    millingFeesCash,
    millingFeesUdhaar,
    totalWasooli,
    totalExtraUdhaar,
  }
}

export function buildUdhaarRunningLedger(transactions = [], includeDeleted = false) {
  const rows = transactions.filter((tx) => (includeDeleted || !tx.isDeleted) && isUdhaarRelated(tx))
  const chrono = [...rows].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''))
    if (dateCompare !== 0) return dateCompare
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  let balance = 0
  return chrono
    .map((tx) => {
      const delta = udhaarDelta(tx)
      if (!tx.isDeleted) balance += delta
      return { ...tx, delta, runningBalance: balance }
    })
    .reverse()
}

export function sortTransactionsByDate(transactions = []) {
  return [...transactions].sort((a, b) => {
    const dateCompare = String(b.date || '').localeCompare(String(a.date || ''))
    if (dateCompare !== 0) return dateCompare
    return String(b.id || '').localeCompare(String(a.id || ''))
  })
}

export function sortCustomersByName(customers = []) {
  return [...customers].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
  )
}