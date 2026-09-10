import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

export const DEFAULT_SETTINGS = {
  totalWheatStock: 500,
  initialUdhaar: 0,
  unitsPerMaund: 2,
  ratePerUnit: 42,
  pisaiRate: 80,
  peenRate: 40,
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !user) {
      setLoading(false)
      return undefined
    }

    setLoading(true)

    const ref = doc(db, 'settings', 'main')
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snapshot.data() })
        }
        setLoading(false)
      },
      (error) => {
        notify(error.message || 'Could not load settings.', 'error')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [notify, user])

  const saveSettings = useCallback(
    async (nextSettings) => {
      const payload = {
        totalWheatStock: Number(nextSettings.totalWheatStock) || 0,
        initialUdhaar: Number(nextSettings.initialUdhaar) || 0,
        unitsPerMaund: Number(nextSettings.unitsPerMaund) || 0,
        ratePerUnit: Number(nextSettings.ratePerUnit) || 0,
        pisaiRate: Number(nextSettings.pisaiRate) || 0,
        peenRate: Number(nextSettings.peenRate) || 0,
      }

      if (!db) {
        setSettings(payload)
        notify('Settings saved locally. Add Firebase env keys to persist them.')
        return
      }

      try {
        await setDoc(doc(db, 'settings', 'main'), payload, { merge: true })
        notify('Rates and inventory settings updated.')
      } catch (error) {
        notify(error.message || 'Could not save settings.', 'error')
        throw error
      }
    },
    [notify],
  )

  const value = useMemo(
    () => ({ settings, loading, saveSettings }),
    [settings, loading, saveSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
