import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { 
  getFirestore, 
  doc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore'

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