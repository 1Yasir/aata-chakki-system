const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const TX_DEPOSIT = 'DEPOSIT'
export const TX_WITHDRAWAL = 'WITHDRAWAL'
export const FEE_CASH = 'CASH'
export const FEE_UDHAAR = 'UDHAAR'

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

export function computeCustomerLedger(initialStockKg, transactions = []) {
  const active = transactions.filter((tx) => !tx.isDeleted)
  let currentStockKg = toNumber(initialStockKg)
  let udhaarBalance = 0
  let totalDepositedKg = 0
  let totalWithdrawnKg = 0
  let millingFeesCash = 0
  let millingFeesUdhaar = 0

  for (const tx of active) {
    const weight = toNumber(tx.weightKg)
    const fee = toNumber(tx.millingFee)

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
  }
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