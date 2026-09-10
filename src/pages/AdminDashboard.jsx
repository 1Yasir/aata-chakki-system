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
} from 'firebase/firestore'
import { LogOut, Wheat } from 'lucide-react'
import { Link } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import Field from '../components/Field'
import HistoryTable from '../components/HistoryTable'
import SettingsPanel from '../components/SettingsPanel'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { db, isFirebaseConfigured } from '../firebase'
import {
  computeDashboardAggregates,
  computeEntryMetrics,
  emptyEntryForm,
  formatNumber,
  formatPkr,
} from '../lib/calculations'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { settings } = useSettings()
  const { notify } = useToast()
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(emptyEntryForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!db) return undefined

    const entriesQuery = query(collection(db, 'daily_entries'), orderBy('date', 'desc'))
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
  }, [notify])

  const metrics = useMemo(() => computeEntryMetrics(form, settings), [form, settings])
  const aggregates = useMemo(
    () => computeDashboardAggregates(entries, settings, form, editingId),
    [entries, settings, form, editingId],
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
      createdAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        const { createdAt, ...updatePayload } = payload
        await updateDoc(doc(db, 'daily_entries', editingId), updatePayload)
        notify('Daily entry updated.')
      } else {
        await addDoc(collection(db, 'daily_entries'), payload)
        notify('Daily entry saved.')
      }
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
      await deleteDoc(doc(db, 'daily_entries', pendingDelete.id))
      if (editingId === pendingDelete.id) resetForm()
      notify('Entry deleted.')
      setPendingDelete(null)
    } catch (error) {
      notify(error.message || 'Could not delete entry.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
      notify('Signed out.')
    } catch (error) {
      notify(error.message || 'Could not sign out.', 'error')
    }
  }

  const kpis = [
    {
      label: 'Remaining stock',
      value: `${formatNumber(aggregates.remainingWheatStock)} mnd`,
      hint: 'Opening wheat minus all-time own maunds ground',
      tone: 'bg-emerald-950 text-emerald-50',
    },
    {
      label: 'Total udhaar',
      value: formatPkr(aggregates.totalUdhaarBalance),
      hint: 'Opening credit + given − recovered',
      tone: 'bg-amber-950 text-amber-50',
    },
    {
      label: 'Net profit (today)',
      value: formatPkr(metrics.netProfit),
      hint: 'Gross income minus electricity and other expenses',
      tone: 'bg-mill-800 text-wheat-50',
    },
    {
      label: 'Units consumed (today)',
      value: formatNumber(metrics.totalUnits),
      hint: 'Total maunds ground × units per maund',
      tone: 'bg-sky-950 text-sky-50',
    },
  ]

  return (
    <div className="min-h-screen bg-wheat-50">
      <header className="sticky top-0 z-40 border-b border-wheat-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-xl text-mill-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mill-800 text-wheat-200">
              <Wheat className="h-5 w-5" />
            </span>
            Admin dashboard
          </Link>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-stone-500 sm:block">{user?.email}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-mill-800 px-4 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {!isFirebaseConfigured ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase is not configured. Calculations still run locally; CRUD needs your `.env` keys.
          </p>
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

        <SettingsPanel />
        <HistoryTable entries={entries} onEdit={startEdit} onDelete={setPendingDelete} />
      </main>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this mill day?"
        message="This removes the Firestore document permanently. Stock and udhaar totals will recalculate without it."
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />
    </div>
  )
}
