import { fetchCollectionDocs } from '../firebase'

const AUTO_BACKUP_DATE_KEY = 'aata_chakki_last_auto_backup_date'
const LOCAL_STORAGE_DATA_KEY = 'aata_chakki_offline_backup_data'

// 1. Fetch complete data across ALL system collections
export async function createFullBackupData() {
  try {
    const [
      customers,
      customerTx,
      ownWheat,
      employees,
      empTx,
      guCustomers,
      guTx,
      dailyEntries,
    ] = await Promise.all([
      fetchCollectionDocs('customers').catch(() => []),
      fetchCollectionDocs('customer_transactions').catch(() => []),
      fetchCollectionDocs('own_wheat_purchases').catch(() => []),
      fetchCollectionDocs('employees').catch(() => []),
      fetchCollectionDocs('employee_transactions').catch(() => []),
      fetchCollectionDocs('general_udhaar_customers').catch(() => []),
      fetchCollectionDocs('general_udhaar_transactions').catch(() => []),
      fetchCollectionDocs('daily_entries').catch(() => []),
    ])

    return {
      timestamp: new Date().toISOString(),
      appName: 'Aata Chakki Management System',
      data: {
        customers,
        customerTx,
        ownWheat,
        employees,
        empTx,
        guCustomers,
        guTx,
        dailyEntries,
      },
    }
  } catch (err) {
    console.error('Auto backup fetch error:', err)
    return null
  }
}

// 2. Silent background save to Browser LocalStorage
export async function saveToLocalStorageBackup() {
  const backup = await createFullBackupData()
  if (backup) {
    localStorage.setItem(LOCAL_STORAGE_DATA_KEY, JSON.stringify(backup))
  }
}

// 3. Daily Automatic Download Trigger
export async function runDailyAutoDownloadBackup() {
  const today = new Date().toISOString().slice(0, 10)
  const lastBackupDate = localStorage.getItem(AUTO_BACKUP_DATE_KEY)

  // Fresh silent LocalStorage sync
  await saveToLocalStorageBackup()

  // Aaj agar pehle auto-download ho chuka hai toh wapas download na karein
  if (lastBackupDate === today) return

  const backupStr = localStorage.getItem(LOCAL_STORAGE_DATA_KEY)
  if (!backupStr) return

  try {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(backupStr)
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `aata_chakki_master_backup_${today}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()

    localStorage.setItem(AUTO_BACKUP_DATE_KEY, today)
  } catch (error) {
    console.error('Auto download trigger failed:', error)
  }
}