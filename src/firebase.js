import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  computeCustomerLedger,
  isPaymentTransaction,
  isStockTransaction,
  TX_WASOOLI,
  TX_WITHDRAWAL,
} from './lib/customerLedger'
import { computeEmployeeLedger, EMP_FLOUR_TAKEN, resolveFlourAmount } from './lib/employees'
import { computeGeneralUdhaarLedger, GU_WASOOLI } from './lib/generalUdhaar'
import { OWN_PURCHASE, resolveOwnWheatAmounts } from './lib/ownWheat'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
)

let app
let auth
let db

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export { auth, db }

export const CUSTOMERS_COLLECTION = 'customers'
export const CUSTOMER_TRANSACTIONS_COLLECTION = 'customer_transactions'
export const OWN_WHEAT_COLLECTION = 'own_wheat_purchases'
export const EMPLOYEES_COLLECTION = 'employees'
export const EMPLOYEE_TRANSACTIONS_COLLECTION = 'employee_transactions'
export const GENERAL_UDHAAR_CUSTOMERS_COLLECTION = 'general_udhaar_customers'
export const GENERAL_UDHAAR_TRANSACTIONS_COLLECTION = 'general_udhaar_transactions'

function assertDb() {
  if (!db) {
    throw new Error('Firebase is not configured. Add .env keys before saving.')
  }
}

async function loadCustomerTransactions(customerId) {
  const snapshot = await getDocs(
    query(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION), where('customerId', '==', customerId)),
  )
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function recalculateCustomerStock(customerId) {
  assertDb()
  const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId)
  const customerSnap = await getDoc(customerRef)
  if (!customerSnap.exists()) {
    throw new Error('Customer not found.')
  }

  const transactions = await loadCustomerTransactions(customerId)
  const totals = computeCustomerLedger(customerSnap.data().initialStockKg, transactions)
  await updateDoc(customerRef, {
    currentStockKg: totals.currentStockKg,
    udhaarBalance: totals.udhaarBalance,
  })
  return totals
}

export async function addCustomer({ name, phone, initialStockKg }) {
  assertDb()
  const initial = Number(initialStockKg) || 0
  const ref = await addDoc(collection(db, CUSTOMERS_COLLECTION), {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    initialStockKg: initial,
    currentStockKg: initial,
    udhaarBalance: 0,
    createdAt: serverTimestamp(),
    isDeleted: false,
    deletedAt: null,
  })
  return ref.id
}

export async function updateCustomer(customerId, { name, phone, initialStockKg }) {
  assertDb()
  const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId)
  const customerSnap = await getDoc(customerRef)
  if (!customerSnap.exists()) {
    throw new Error('Customer not found.')
  }

  const nextInitial = Number(initialStockKg) || 0
  const transactions = await loadCustomerTransactions(customerId)
  const projected = computeCustomerLedger(nextInitial, transactions)
  if (projected.currentStockKg < -0.0001) {
    throw new Error('Initial stock is too low for this customer’s active withdrawals.')
  }

  await updateDoc(customerRef, {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    initialStockKg: nextInitial,
    currentStockKg: projected.currentStockKg,
    udhaarBalance: projected.udhaarBalance,
  })
  return projected
}

export async function addCustomerTransaction({
  customerId,
  type,
  weightKg,
  millingFee,
  feePayment,
  date,
  amount,
  note,
  paymentMethod,
}) {
  assertDb()
  const weight = Number(weightKg) || 0
  const cashAmount = Number(amount) || 0

  if (isStockTransaction(type) && weight <= 0) {
    throw new Error('Weight must be greater than zero.')
  }
  if (isPaymentTransaction(type) && cashAmount <= 0) {
    throw new Error('Amount must be greater than zero.')
  }

  const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId)
  const customerSnap = await getDoc(customerRef)
  if (!customerSnap.exists()) {
    throw new Error('Customer not found.')
  }
  if (customerSnap.data().isDeleted) {
    throw new Error('Restore this customer before recording a transaction.')
  }

  const fee = type === TX_WITHDRAWAL ? Number(millingFee) || 0 : 0
  const nextTx = {
    customerId,
    type,
    weightKg: isStockTransaction(type) ? weight : 0,
    millingFee: fee,
    amount: isPaymentTransaction(type) ? cashAmount : fee,
    feePayment: type === TX_WITHDRAWAL ? feePayment : paymentMethod || 'CASH',
    paymentMethod: type === TX_WASOOLI || type === TX_UDHAAR ? paymentMethod || 'CASH' : null,
    date,
    note: String(note || '').trim(),
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  }

  const transactions = await loadCustomerTransactions(customerId)
  const projected = computeCustomerLedger(customerSnap.data().initialStockKg, [
    ...transactions,
    nextTx,
  ])
  if (type === TX_WITHDRAWAL && projected.currentStockKg < -0.0001) {
    const available = Number(customerSnap.data().currentStockKg) || 0
    throw new Error(`Insufficient wheat stock. Available: ${available} kg.`)
  }

  await addDoc(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION), nextTx)
  await updateDoc(customerRef, {
    currentStockKg: projected.currentStockKg,
    udhaarBalance: projected.udhaarBalance,
  })
  return projected
}

export async function softDeleteCustomerTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { customerId } = txSnap.data()
  const customerSnap = await getDoc(doc(db, CUSTOMERS_COLLECTION, customerId))
  const transactions = await loadCustomerTransactions(customerId)
  const projected = computeCustomerLedger(
    customerSnap.data()?.initialStockKg,
    transactions.map((tx) => (tx.id === transactionId ? { ...tx, isDeleted: true } : tx)),
  )
  if (projected.currentStockKg < -0.0001) {
    throw new Error('Cannot delete this deposit. Active withdrawals would exceed remaining stock.')
  }

  await updateDoc(txRef, {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
  })
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, customerId), {
    currentStockKg: projected.currentStockKg,
    udhaarBalance: projected.udhaarBalance,
  })
  return projected
}

export async function restoreCustomerTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { customerId } = txSnap.data()
  const customerSnap = await getDoc(doc(db, CUSTOMERS_COLLECTION, customerId))
  const transactions = await loadCustomerTransactions(customerId)
  const projected = computeCustomerLedger(
    customerSnap.data()?.initialStockKg,
    transactions.map((tx) => (tx.id === transactionId ? { ...tx, isDeleted: false } : tx)),
  )
  if (projected.currentStockKg < -0.0001) {
    throw new Error('Cannot restore this withdrawal. Customer wheat stock is too low.')
  }

  await updateDoc(txRef, {
    isDeleted: false,
    deletedAt: null,
  })
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, customerId), {
    currentStockKg: projected.currentStockKg,
    udhaarBalance: projected.udhaarBalance,
  })
  return projected
}

// ==========================================
// DATA BACKUP & SAFETY HELPER FUNCTIONS
// ==========================================

// 1. Soft Delete: Data permanent delete nahi hoga, sirf hide ho jayega
export const softDeleteEntry = async (collectionName, documentId) => {
  if (!db) return
  const docRef = doc(db, collectionName, documentId)
  await updateDoc(docRef, {
    isDeleted: true,
    deletedAt: new Date().toISOString()
  })
}

// 2. Restore Entry: Soft deleted record ko dobara active karne ke liye
export const restoreEntry = async (collectionName, documentId) => {
  if (!db) return
  const docRef = doc(db, collectionName, documentId)
  await updateDoc(docRef, {
    isDeleted: false,
    deletedAt: null
  })
}

// 3. Permanent Delete: Agar Recycle bin se bhi hamesh ke liye delete karna ho
export const hardDeleteEntry = async (collectionName, documentId) => {
  if (!db) return
  const docRef = doc(db, collectionName, documentId)
  await deleteDoc(docRef)
}

// 4. CSV Backup Generator: Single click par local Excel backup download karega
export const exportDataToCSV = (dataList, filename = 'aata_chakki_backup.csv') => {
  if (!dataList || !dataList.length) {
    alert("Export karne ke liye koi data nahi hai!")
    return
  }

  const headers = Object.keys(dataList[0]).join(',')
  const rows = dataList.map(item => 
    Object.values(item).map(val => `"${val !== undefined && val !== null ? val : ''}"`).join(',')
  )

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
  const encodedUri = encodeURI(csvContent)
  
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function serializeCsvValue(value) {
  if (value == null) return ''
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

export async function fetchCollectionDocs(collectionName) {
  assertDb()
  const snapshot = await getDocs(collection(db, collectionName))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

// ==========================================
// OWN WHEAT (ZATI GUNDAM) HELPERS
// ==========================================

export async function addOwnWheatEntry({
  type = OWN_PURCHASE,
  date,
  weightMaunds,
  ratePerMaund,
  totalAmount,
  supplier,
  note,
}) {
  assertDb()
  const amounts = resolveOwnWheatAmounts({ weightMaunds, ratePerMaund, totalAmount })
  if (type === OWN_PURCHASE && amounts.totalAmount <= 0) {
    throw new Error('Enter rate per maund or total amount paid.')
  }

  const ref = await addDoc(collection(db, OWN_WHEAT_COLLECTION), {
    type,
    date,
    weightMaunds: amounts.weightMaunds,
    weightKg: amounts.weightKg,
    ratePerMaund: amounts.ratePerMaund,
    totalAmount: amounts.totalAmount,
    supplier: String(supplier || '').trim(),
    note: String(note || '').trim(),
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateOwnWheatEntry(entryId, payload) {
  assertDb()
  const amounts = resolveOwnWheatAmounts({
    weightMaunds: payload.weightMaunds,
    ratePerMaund: payload.ratePerMaund,
    totalAmount: payload.totalAmount,
  })
  await updateDoc(doc(db, OWN_WHEAT_COLLECTION, entryId), {
    type: payload.type || OWN_PURCHASE,
    date: payload.date,
    weightMaunds: amounts.weightMaunds,
    weightKg: amounts.weightKg,
    ratePerMaund: amounts.ratePerMaund,
    totalAmount: amounts.totalAmount,
    supplier: String(payload.supplier || '').trim(),
    note: String(payload.note || '').trim(),
  })
}

// ==========================================
// EMPLOYEE HELPERS
// ==========================================

async function loadEmployeeTransactions(employeeId) {
  const snapshot = await getDocs(
    query(collection(db, EMPLOYEE_TRANSACTIONS_COLLECTION), where('employeeId', '==', employeeId)),
  )
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function recalculateEmployeeBalance(employeeId) {
  assertDb()
  const employeeRef = doc(db, EMPLOYEES_COLLECTION, employeeId)
  const employeeSnap = await getDoc(employeeRef)
  if (!employeeSnap.exists()) {
    throw new Error('Employee not found.')
  }

  const transactions = await loadEmployeeTransactions(employeeId)
  const totals = computeEmployeeLedger(employeeSnap.data().initialBalancePkr, transactions)
  await updateDoc(employeeRef, {
    netBalancePkr: totals.netBalancePkr,
  })
  return totals
}

export async function addEmployee({ name, phone, baseSalary, salaryType, initialBalancePkr }) {
  assertDb()
  const initial = Number(initialBalancePkr) || 0
  const ref = await addDoc(collection(db, EMPLOYEES_COLLECTION), {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    baseSalary: Number(baseSalary) || 0,
    salaryType: salaryType || 'MONTHLY',
    initialBalancePkr: initial,
    netBalancePkr: initial,
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateEmployee(employeeId, { name, phone, baseSalary, salaryType, initialBalancePkr }) {
  assertDb()
  const employeeRef = doc(db, EMPLOYEES_COLLECTION, employeeId)
  const employeeSnap = await getDoc(employeeRef)
  if (!employeeSnap.exists()) {
    throw new Error('Employee not found.')
  }

  const nextInitial = Number(initialBalancePkr) || 0
  const transactions = await loadEmployeeTransactions(employeeId)
  const projected = computeEmployeeLedger(nextInitial, transactions)

  await updateDoc(employeeRef, {
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    baseSalary: Number(baseSalary) || 0,
    salaryType: salaryType || 'MONTHLY',
    initialBalancePkr: nextInitial,
    netBalancePkr: projected.netBalancePkr,
  })
  return projected
}

export async function addEmployeeTransaction({
  employeeId,
  type,
  amountPkr,
  weightMaunds,
  ratePerMaund,
  date,
  note,
}) {
  assertDb()
  const employeeRef = doc(db, EMPLOYEES_COLLECTION, employeeId)
  const employeeSnap = await getDoc(employeeRef)
  if (!employeeSnap.exists()) {
    throw new Error('Employee not found.')
  }
  if (employeeSnap.data().isDeleted) {
    throw new Error('Restore this employee before recording a transaction.')
  }

  let nextTx = {
    employeeId,
    type,
    amountPkr: Number(amountPkr) || 0,
    weightKg: 0,
    ratePerKg: 0,
    date,
    note: String(note || '').trim(),
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  }

  if (type === EMP_FLOUR_TAKEN) {
    const flour = resolveFlourAmount({ weightMaunds, ratePerMaund })
    nextTx = {
      ...nextTx,
      amountPkr: flour.amountPkr,
      weightKg: flour.weightKg,
      ratePerKg: flour.ratePerKg,
    }
  } else if (nextTx.amountPkr <= 0) {
    throw new Error('Amount must be greater than zero.')
  }

  const transactions = await loadEmployeeTransactions(employeeId)
  const projected = computeEmployeeLedger(employeeSnap.data().initialBalancePkr, [
    ...transactions,
    nextTx,
  ])

  await addDoc(collection(db, EMPLOYEE_TRANSACTIONS_COLLECTION), nextTx)
  await updateDoc(employeeRef, {
    netBalancePkr: projected.netBalancePkr,
  })
  return projected
}

export async function softDeleteEmployeeTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, EMPLOYEE_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { employeeId } = txSnap.data()
  await updateDoc(txRef, {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
  })
  return recalculateEmployeeBalance(employeeId)
}

export async function restoreEmployeeTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, EMPLOYEE_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { employeeId } = txSnap.data()
  await updateDoc(txRef, {
    isDeleted: false,
    deletedAt: null,
  })
  return recalculateEmployeeBalance(employeeId)
}

async function loadGeneralUdhaarTransactions(customerId) {
  const snapshot = await getDocs(
    query(collection(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION), where('customerId', '==', customerId)),
  )
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function recalculateGeneralUdhaarBalance(customerId) {
  assertDb()
  const customerRef = doc(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION, customerId)
  const customerSnap = await getDoc(customerRef)
  if (!customerSnap.exists()) {
    throw new Error('Udhaar customer not found.')
  }

  const transactions = await loadGeneralUdhaarTransactions(customerId)
  const totals = computeGeneralUdhaarLedger(transactions)
  await updateDoc(customerRef, {
    netUdhaarBalance: totals.netUdhaarBalance,
  })
  return totals
}

export async function addGeneralUdhaarCustomer({ name, phone }) {
  assertDb()
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    throw new Error('Customer name is required.')
  }

  const ref = await addDoc(collection(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION), {
    name: trimmedName,
    phone: String(phone || '').trim(),
    netUdhaarBalance: 0,
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateGeneralUdhaarCustomer(customerId, { name, phone }) {
  assertDb()
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    throw new Error('Customer name is required.')
  }
  await updateDoc(doc(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION, customerId), {
    name: trimmedName,
    phone: String(phone || '').trim(),
  })
}

export async function findOrCreateGeneralUdhaarCustomer({ name, phone, customerId }) {
  if (customerId) return customerId
  const trimmedName = String(name || '').trim().toLowerCase()
  if (!trimmedName) {
    throw new Error('Customer name is required.')
  }

  const snapshot = await getDocs(collection(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION))
  const match = snapshot.docs.find((item) => {
    const data = item.data()
    if (data.isDeleted) return false
    return String(data.name || '').trim().toLowerCase() === trimmedName
  })
  if (match) {
    const nextPhone = String(phone || '').trim()
    if (nextPhone && nextPhone !== String(match.data().phone || '').trim()) {
      await updateDoc(match.ref, { phone: nextPhone })
    }
    return match.id
  }

  return addGeneralUdhaarCustomer({ name, phone })
}

export async function addGeneralUdhaarTransaction({
  customerId,
  name,
  phone,
  type,
  amount,
  weightKg,
  cashPaid,
  date,
  note,
}) {
  assertDb()
  const resolvedCustomerId = await findOrCreateGeneralUdhaarCustomer({ customerId, name, phone })
  const cashAmount = Number(amount) || 0
  if (cashAmount <= 0) {
    throw new Error('Amount must be greater than zero.')
  }

  const customerRef = doc(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION, resolvedCustomerId)
  const customerSnap = await getDoc(customerRef)
  if (!customerSnap.exists()) {
    throw new Error('Udhaar customer not found.')
  }
  if (customerSnap.data().isDeleted) {
    throw new Error('Restore this customer before recording a khata entry.')
  }

  const nextTx = {
    customerId: resolvedCustomerId,
    type,
    amount: cashAmount,
    weightKg: Number(weightKg) || 0,
    cashPaid: type === GU_WASOOLI ? cashAmount : Number(cashPaid) || 0,
    date,
    note: String(note || '').trim(),
    isDeleted: false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  }

  const transactions = await loadGeneralUdhaarTransactions(resolvedCustomerId)
  const projected = computeGeneralUdhaarLedger([...transactions, nextTx])
  await addDoc(collection(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION), nextTx)
  await updateDoc(customerRef, {
    netUdhaarBalance: projected.netUdhaarBalance,
  })
  return { ...projected, customerId: resolvedCustomerId }
}

export async function softDeleteGeneralUdhaarTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { customerId } = txSnap.data()
  await updateDoc(txRef, {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
  })
  return recalculateGeneralUdhaarBalance(customerId)
}

export async function restoreGeneralUdhaarTransaction(transactionId) {
  assertDb()
  const txRef = doc(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION, transactionId)
  const txSnap = await getDoc(txRef)
  if (!txSnap.exists()) {
    throw new Error('Transaction not found.')
  }

  const { customerId } = txSnap.data()
  await updateDoc(txRef, {
    isDeleted: false,
    deletedAt: null,
  })
  return recalculateGeneralUdhaarBalance(customerId)
}