const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const EMP_CASH_ADVANCE = 'CASH_ADVANCE'
export const EMP_FLOUR_TAKEN = 'FLOUR_TAKEN'
export const EMP_SALARY_CREDIT = 'SALARY_CREDIT'
export const MAUND_KG = 40

export const emptyEmployeeForm = () => ({
  name: '',
  phone: '',
  baseSalary: '',
  salaryType: 'MONTHLY',
  initialBalancePkr: '',
})

export const emptyEmployeeTxForm = (type = EMP_CASH_ADVANCE) => ({
  type,
  date: new Date().toISOString().slice(0, 10),
  amountPkr: '',
  weightMaunds: '',
  ratePerMaund: '',
  note: '',
})

export function resolveFlourAmount({ weightMaunds, ratePerMaund }) {
  const weight = toNumber(weightMaunds)
  const rate = toNumber(ratePerMaund)
  if (weight <= 0) {
    throw new Error('Flour weight must be greater than zero.')
  }
  if (rate <= 0) {
    throw new Error('Enter a flour rate per maund.')
  }
  const weightKg = weight * MAUND_KG
  const amountPkr = weight * rate
  return {
    weightMaunds: weight,
    weightKg,
    ratePerMaund: rate,
    ratePerKg: rate / MAUND_KG,
    amountPkr,
  }
}

export function employeeTxDelta(tx) {
  const amount = toNumber(tx.amountPkr)
  if (tx.type === EMP_SALARY_CREDIT) return -amount
  if (tx.type === EMP_CASH_ADVANCE || tx.type === EMP_FLOUR_TAKEN) return amount
  return 0
}

export function computeEmployeeLedger(initialBalancePkr, transactions = []) {
  const active = transactions.filter((tx) => !tx.isDeleted)
  let netBalancePkr = toNumber(initialBalancePkr)
  let totalCashAdvance = 0
  let totalFlourPkr = 0
  let totalFlourKg = 0
  let totalSalaryCredit = 0

  for (const tx of active) {
    const amount = toNumber(tx.amountPkr)
    if (tx.type === EMP_CASH_ADVANCE) {
      netBalancePkr += amount
      totalCashAdvance += amount
    } else if (tx.type === EMP_FLOUR_TAKEN) {
      netBalancePkr += amount
      totalFlourPkr += amount
      totalFlourKg += toNumber(tx.weightKg)
    } else if (tx.type === EMP_SALARY_CREDIT) {
      netBalancePkr -= amount
      totalSalaryCredit += amount
    }
  }

  return {
    netBalancePkr,
    totalCashAdvance,
    totalFlourPkr,
    totalFlourKg,
    totalFlourMaunds: totalFlourKg / MAUND_KG,
    totalSalaryCredit,
  }
}

export function buildEmployeeRunningLedger(initialBalancePkr, transactions = [], includeDeleted = false) {
  const rows = transactions.filter((tx) => includeDeleted || !tx.isDeleted)
  const chrono = [...rows].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''))
    if (dateCompare !== 0) return dateCompare
    return String(a.id || '').localeCompare(String(b.id || ''))
  })

  let balance = toNumber(initialBalancePkr)
  return chrono
    .map((tx) => {
      const delta = employeeTxDelta(tx)
      if (!tx.isDeleted) balance += delta
      return { ...tx, delta, runningBalance: balance }
    })
    .reverse()
}

export function sortEmployeesByName(employees = []) {
  return [...employees].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
  )
}
