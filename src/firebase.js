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
import { computeCustomerLedger, TX_WITHDRAWAL } from './lib/customerLedger'

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
}) {
  assertDb()
  const weight = Number(weightKg) || 0
  if (weight <= 0) {
    throw new Error('Weight must be greater than zero.')
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
    weightKg: weight,
    millingFee: fee,
    feePayment: type === TX_WITHDRAWAL ? feePayment : 'CASH',
    date,
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