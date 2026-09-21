const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const MAUND_KG = 40

export const emptyEntryForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  custMaunds: '',
  kardaRate: '2.5',
  peenMaunds: '',
  ownMaundsGround: '',
  ownProfitPerMaund: '400',
  udhaarGiven: '0',
  udhaarRecovered: '0',
  otherExpenses: '500',
})

// Total Expenses = Electricity + Other Expenses
export function getTotalExpenses(entry) {
  return toNumber(entry.electricityCost) + toNumber(entry.otherExpenses)
}

export function computeEntryMetrics(input, settings) {
  const custMaunds = toNumber(input.custMaunds)
  const ownMaundsGround = toNumber(input.ownMaundsGround)
  const peenMaunds = toNumber(input.peenMaunds)
  const kardaRate = toNumber(input.kardaRate)
  const ownProfitPerMaund = toNumber(input.ownProfitPerMaund)
  const otherExpenses = toNumber(input.otherExpenses)

  const unitsPerMaund = toNumber(settings.unitsPerMaund)
  const ratePerUnit = toNumber(settings.ratePerUnit)
  const pisaiRate = toNumber(settings.pisaiRate)
  const peenRate = toNumber(settings.peenRate)

  const totalMaundsGround = custMaunds + ownMaundsGround
  const totalUnits = totalMaundsGround * unitsPerMaund
  const electricityCost = totalUnits * ratePerUnit
  const kardaSaved = custMaunds * kardaRate
  const grossIncome =
    custMaunds * pisaiRate +
    peenMaunds * peenRate +
    ownMaundsGround * ownProfitPerMaund
  const netProfit = grossIncome - (electricityCost + otherExpenses)

  return {
    custMaunds,
    kardaRate,
    peenMaunds,
    ownMaundsGround,
    ownProfitPerMaund,
    udhaarGiven: toNumber(input.udhaarGiven),
    udhaarRecovered: toNumber(input.udhaarRecovered),
    otherExpenses,
    totalMaundsGround,
    totalUnits,
    electricityCost,
    kardaSaved,
    grossIncome,
    netProfit,
  }
}

export function computeDashboardAggregates(entries, settings, previewEntry, editingId, ownWheatRemainingMaunds = 0, udhaarKhataTotal = 0) {
  const others = entries.filter((entry) => entry.id !== editingId)
  const previewOwn = toNumber(previewEntry.ownMaundsGround)
  const previewGiven = toNumber(previewEntry.udhaarGiven)
  const previewRecovered = toNumber(previewEntry.udhaarRecovered)

  const cumulativeOwnMaunds =
    others.reduce((sum, entry) => sum + toNumber(entry.ownMaundsGround), 0) +
    previewOwn
  const cumulativeUdhaarGiven =
    others.reduce((sum, entry) => sum + toNumber(entry.udhaarGiven), 0) +
    previewGiven
  const cumulativeUdhaarRecovered =
    others.reduce((sum, entry) => sum + toNumber(entry.udhaarRecovered), 0) +
    previewRecovered

  // Cross-module sync: Add own wheat purchased to remaining stock
  const remainingWheatStock = toNumber(settings.totalWheatStock) - cumulativeOwnMaunds + toNumber(ownWheatRemainingMaunds)
  
  // Cross-module sync: Use live total from Udhaar Khata module
  const totalUdhaarBalance = udhaarKhataTotal > 0 
    ? udhaarKhataTotal 
    : toNumber(settings.initialUdhaar) + cumulativeUdhaarGiven - cumulativeUdhaarRecovered

  return {
    remainingWheatStock,
    totalUdhaarBalance,
    cumulativeOwnMaunds,
  }
}

export function sumEntries(entries) {
  return entries.reduce(
    (acc, entry) => {
      acc.custMaunds += toNumber(entry.custMaunds)
      acc.peenMaunds += toNumber(entry.peenMaunds)
      acc.ownMaundsGround += toNumber(entry.ownMaundsGround)
      acc.udhaarGiven += toNumber(entry.udhaarGiven)
      acc.udhaarRecovered += toNumber(entry.udhaarRecovered)
      acc.otherExpenses += toNumber(entry.otherExpenses)
      acc.totalExpenses += getTotalExpenses(entry)
      acc.totalUnits += toNumber(entry.totalUnits)
      acc.kardaSaved += toNumber(entry.kardaSaved)
      acc.electricityCost += toNumber(entry.electricityCost)
      acc.grossIncome += toNumber(entry.grossIncome)
      acc.netProfit += toNumber(entry.netProfit)
      return acc
    },
    {
      custMaunds: 0,
      peenMaunds: 0,
      ownMaundsGround: 0,
      udhaarGiven: 0,
      udhaarRecovered: 0,
      otherExpenses: 0,
      totalExpenses: 0,
      totalUnits: 0,
      kardaSaved: 0,
      electricityCost: 0,
      grossIncome: 0,
      netProfit: 0,
    },
  )
}

export function formatPkr(value) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

export function formatNumber(value, digits = 2) {
  return toNumber(value).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatWeightDisplay(weightKg) {
  const kg = toNumber(weightKg)
  if (kg <= 0) return '-'
  if (kg < MAUND_KG) return `${formatNumber(kg)} kg`
  return `${formatNumber(kg / MAUND_KG)} mnd (${formatNumber(kg)} kg)`
}