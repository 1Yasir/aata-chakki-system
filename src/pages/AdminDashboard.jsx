import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { Download, Trash2 } from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import Field from '../components/Field'
import HistoryTable from '../components/HistoryTable'
import SettingsPanel from '../components/SettingsPanel'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { db, exportDataToCSV, isFirebaseConfigured, OWN_WHEAT_COLLECTION, GENERAL_UDHAAR_CUSTOMERS_COLLECTION } from '../firebase'
import {
  computeDashboardAggregates,
  computeEntryMetrics,
  emptyEntryForm,
  formatNumber,
  formatPkr,
} from '../lib/calculations'
import { computeOwnWheatTotals } from '../lib/ownWheat'
import { saveToLocalStorageBackup } from '../lib/autoBackup'

export default function AdminDashboard() {
  const { settings } = useSettings()
  const { notify } = useToast()
  const [entries, setEntries] = useState([])
  const [ownWheatEntries, setOwnWheatEntries] = useState([])
  const [udhaarCustomers, setUdhaarCustomers] = useState([])
  const [form, setForm] = useState(emptyEntryForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showTrash, setShowTrash] = useState(false)

  useEffect(() => {
    if (!db) return undefined

    const entriesQuery = query(
      collection(db, 'daily_entries'),
      where('isDeleted', '==', showTrash),
      orderBy('date', 'desc')
    )

    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        setEntries(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        )
      },
      (error) => {
        notify(error.message || 'Could not load daily entries.', 'error')
      },
    )

    return unsubscribe
  }, [notify, showTrash])

  useEffect(() => {
    if (!db) return undefined

    const ownWheatQuery = query(
      collection(db, OWN_WHEAT_COLLECTION),
      where('isDeleted', '==', false)
    )

    const unsubscribe = onSnapshot(
      ownWheatQuery,
      (snapshot) => {
        setOwnWheatEntries(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        )
      },
      (error) => {
        notify(error.message || 'Could not load own wheat entries.', 'error')
      },
    )

    return unsubscribe
  }, [notify])

  useEffect(() => {
    if (!db) return undefined

    const udhaarQuery = query(
      collection(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION),
      where('isDeleted', '==', false)
    )

    const unsubscribe = onSnapshot(
      udhaarQuery,
      (snapshot) => {
        setUdhaarCustomers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        )
      },
      (error) => {
        notify(error.message || 'Could not load udhaar customers.', 'error')
      },
    )

    return unsubscribe
  }, [notify])

  const metrics = useMemo(() => computeEntryMetrics(form, settings), [form, settings])
  
  const ownWheatTotals = useMemo(() => computeOwnWheatTotals(ownWheatEntries, ''), [ownWheatEntries])
  
  const totalUdhaarFromLedger = useMemo(() => {
    return udhaarCustomers.reduce((sum, customer) => sum + (Number(customer.netUdhaarBalance) || 0), 0)
  }, [udhaarCustomers])
  
  const aggregates = useMemo(
    () => computeDashboardAggregates(entries, settings, form, editingId, ownWheatTotals.remainingMaunds, totalUdhaarFromLedger),
    [entries, settings, form, editingId, ownWheatTotals.remainingMaunds, totalUdhaarFromLedger],
  )

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm(emptyEntryForm())
    setEditingId(null)
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setForm({
      date: entry.date || new Date().toISOString().slice(0, 10),
      custMaunds: entry.custMaunds ?? '',
      kardaRate: entry.kardaRate ?? '',
      peenMaunds: entry.peenMaunds ?? '',
      ownMaundsGround: entry.ownMaundsGround ?? '',
      ownProfitPerMaund: entry.ownProfitPerMaund ?? '',
      udhaarGiven: entry.udhaarGiven ?? '',
      udhaarRecovered: entry.udhaarRecovered ?? '',
      otherExpenses: entry.otherExpenses ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!db) {
      notify('Firebase is not configured. Add .env keys before saving.', 'error')
      return
    }

    setSaving(true)
    const payload = {
      date: form.date,
      ...metrics,
      isDeleted: false,
      createdAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        const { createdAt: _, ...updatePayload } = payload
        await updateDoc(doc(db, 'daily_entries', editingId), updatePayload)
        notify('Daily entry updated.')
      } else {
        await addDoc(collection(db, 'daily_entries'), payload)
        notify('Daily entry saved.')
      }
      
      saveToLocalStorageBackup()
      resetForm()
    } catch (error) {
      notify(error.message || 'Could not save entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || !db) return
    setDeleting(true)
    try {
      await updateDoc(doc(db, 'daily_entries', pendingDelete.id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      })
      if (editingId === pendingDelete.id) resetForm()
      
      saveToLocalStorageBackup()

      notify('Entry moved to Recycle Bin.')
      setPendingDelete(null)
    } catch (error) {
      notify(error.message || 'Could not delete entry.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete || !db) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'daily_entries', pendingPermanentDelete.id))
      if (editingId === pendingPermanentDelete.id) resetForm()
      
      saveToLocalStorageBackup()

      notify('Entry permanently deleted.')
      setPendingPermanentDelete(null)
    } catch (error) {
      notify(error.message || 'Could not permanently delete entry.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRestore(id) {
    if (!db) return
    try {
      await updateDoc(doc(db, 'daily_entries', id), {
        isDeleted: false,
        deletedAt: null,
      })
      
      saveToLocalStorageBackup()

      notify('Entry restored successfully.')
    } catch (error) {
      notify(error.message || 'Could not restore entry.', 'error')
    }
  }

  const todayStr = form.date || new Date().toISOString().slice(0, 10)
  const existingTodayEntry = entries.find((e) => e.date === todayStr && e.id !== editingId)
  
  const liveNetProfit = existingTodayEntry && !editingId && form.custMaunds === '' 
    ? Number(existingTodayEntry.netProfit) || 0 
    : metrics.netProfit

  const liveUnitsConsumed = existingTodayEntry && !editingId && form.custMaunds === '' 
    ? Number(existingTodayEntry.totalUnits) || 0 
    : metrics.totalUnits

  const kpis = [
    {
      label: 'Remaining stock',
      value: `${formatNumber(aggregates.remainingWheatStock)} mnd`,
      hint: 'Opening wheat minus own maunds ground + own wheat purchased',
      tone: 'bg-emerald-950 text-emerald-50',
    },
    {
      label: 'Total udhaar',
      value: formatPkr(aggregates.totalUdhaarBalance),
      hint: 'Live balance from Udhaar Khata module',
      tone: 'bg-amber-950 text-amber-50',
    },
    {
      label: 'Net profit (today)',
      value: formatPkr(liveNetProfit),
      hint: 'Gross income minus electricity and other expenses',
      tone: 'bg-mill-800 text-wheat-50',
    },
    {
      label: 'Units consumed (today)',
      value: formatNumber(liveUnitsConsumed),
      hint: 'Total maunds ground × units per maund',
      tone: 'bg-sky-950 text-sky-50',
    },
  ]

  return (
    <div className="min-h-screen bg-wheat-50">
      <AdminHeader
        actions={
          <>
            <button
              type="button"
              onClick={() => exportDataToCSV(entries)}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              <Download className="h-3.5 w-3.5 text-stone-500" />
              Backup CSV
            </button>
            <button
              type="button"
              onClick={() => setShowTrash(!showTrash)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                showTrash
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {showTrash ? 'View Active Logs' : 'Recycle Bin'}
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {!isFirebaseConfigured ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase is not configured. Calculations still run locally; CRUD needs your `.env` keys.
          </p>
        ) : null}

        {showTrash ? (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex justify-between items-center">
            <span>Viewing deleted records (Recycle Bin). Restoring a record will return it to active history, or you can delete permanently.</span>
            <button 
              onClick={() => setShowTrash(false)} 
              className="font-bold underline"
            >
              Back to Dashboard
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <article key={kpi.label} className={`rounded-3xl p-5 shadow-lg ${kpi.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{kpi.label}</p>
              <p className="mt-3 font-display text-3xl">{kpi.value}</p>
              <p className="mt-2 text-xs opacity-75">{kpi.hint}</p>
            </article>
          ))}
        </div>

        {!showTrash && (
          <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-mill-900">
                  {editingId ? 'Update daily batch' : 'Daily batch entry'}
                </h2>
                <p className="text-sm text-stone-500">
                  Totals, electricity, karda, and profit recalculate as you type.
                </p>
              </div>
              <div className="rounded-2xl bg-wheat-50 px-4 py-3 text-sm text-stone-600">
                Ground today: <strong>{formatNumber(metrics.totalMaundsGround)} mnd</strong>
                <span className="mx-2 text-wheat-300">·</span>
                Gross: <strong>{formatPkr(metrics.grossIncome)}</strong>
                <span className="mx-2 text-wheat-300">·</span>
                Karda saved: <strong>{formatNumber(metrics.kardaSaved)} kg</strong>
              </div>
            </div>

            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSave}>
              <Field
                id="date"
                type="date"
                label="Date"
                hint="Business day for this mill log."
                value={form.date}
                onChange={(value) => updateField('date', value)}
              />
              <Field
                id="custMaunds"
                label="Customer maunds"
                hint="Wheat brought by customers for pisai."
                value={form.custMaunds}
                onChange={(value) => updateField('custMaunds', value)}
              />
              <Field
                id="kardaRate"
                label="Karda rate (kg / maund)"
                hint="Gandum deduction kept per customer maund."
                value={form.kardaRate}
                onChange={(value) => updateField('kardaRate', value)}
              />
              <Field
                id="peenMaunds"
                label="Peen maunds"
                hint="Maunds processed through safai / peen."
                value={form.peenMaunds}
                onChange={(value) => updateField('peenMaunds', value)}
              />
              <Field
                id="ownMaundsGround"
                label="Own maunds ground"
                hint="Mill wheat ground for flour stock. Reduces remaining inventory."
                value={form.ownMaundsGround}
                onChange={(value) => updateField('ownMaundsGround', value)}
              />
              <Field
                id="ownProfitPerMaund"
                label="Own profit / maund (PKR)"
                hint="Margin earned on own flour sold, per maund ground."
                value={form.ownProfitPerMaund}
                onChange={(value) => updateField('ownProfitPerMaund', value)}
              />
              <Field
                id="udhaarGiven"
                label="Udhaar given today (PKR)"
                hint="New credit extended today."
                value={form.udhaarGiven}
                onChange={(value) => updateField('udhaarGiven', value)}
              />
              <Field
                id="udhaarRecovered"
                label="Udhaar recovered (PKR)"
                hint="Cash collected against previous debt today."
                value={form.udhaarRecovered}
                onChange={(value) => updateField('udhaarRecovered', value)}
              />
              <Field
                id="otherExpenses"
                label="Other expenses (PKR)"
                hint="Labour, maintenance, or operational costs today."
                value={form.otherExpenses}
                onChange={(value) => updateField('otherExpenses', value)}
              />
              <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-mill-800 px-6 py-3 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingId ? 'Update Entry' : 'Add Daily Entry'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full px-5 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        )}

        <SettingsPanel />
        <HistoryTable 
          entries={entries} 
          onEdit={startEdit} 
          onDelete={showTrash ? setPendingPermanentDelete : setPendingDelete} 
          onRestore={handleRestore}
          isTrashView={showTrash}
        />
      </main>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message="This record will be moved to the Recycle Bin. You can restore it anytime later."
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />

      <ConfirmModal
        open={Boolean(pendingPermanentDelete)}
        title="Delete Permanently?"
        message="This record will be permanently deleted from the database. This action cannot be undone."
        onCancel={() => setPendingPermanentDelete(null)}
        onConfirm={handlePermanentDelete}
        busy={deleting}
      />
    </div>
  )
}