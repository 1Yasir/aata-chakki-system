import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Download, Pencil, RotateCcw, Trash2, Warehouse } from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import Field from '../components/Field'
import { useToast } from '../context/ToastContext'
import {
  addOwnWheatEntry,
  db,
  exportDataToCSV,
  isFirebaseConfigured,
  OWN_WHEAT_COLLECTION,
  restoreEntry,
  serializeCsvValue,
  softDeleteEntry,
  updateOwnWheatEntry,
} from '../firebase'
import { formatNumber, formatPkr } from '../lib/calculations'
import {
  availableOwnWheatYears,
  computeOwnWheatTotals,
  emptyOwnWheatForm,
  OWN_PURCHASE,
  OWN_SALE,
  OWN_USAGE,
} from '../lib/ownWheat'

const TYPE_LABELS = {
  [OWN_PURCHASE]: 'Purchase',
  [OWN_SALE]: 'Sale',
  [OWN_USAGE]: 'Processing usage',
}

export default function OwnStockPage() {
  const { notify } = useToast()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyOwnWheatForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!db) return undefined
    const stockQuery = query(collection(db, OWN_WHEAT_COLLECTION), where('isDeleted', '==', showTrash))
    const unsubscribe = onSnapshot(
      stockQuery,
      (snapshot) => {
        setRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      },
      (error) => notify(error.message || 'Could not load own wheat stock.', 'error'),
    )
    return unsubscribe
  }, [notify, showTrash])

  const years = useMemo(() => {
    const found = availableOwnWheatYears(rows)
    const current = String(new Date().getFullYear())
    return found.includes(current) ? found : [current, ...found]
  }, [rows])

  const totals = useMemo(() => computeOwnWheatTotals(rows, year), [rows, year])
  const visibleRows = useMemo(
    () =>
      [...rows]
        .filter((row) => !year || String(row.date || '').startsWith(year))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [rows, year],
  )

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm(emptyOwnWheatForm())
    setEditingId(null)
  }

  function startEdit(row) {
    setEditingId(row.id)
    setForm({
      type: row.type || OWN_PURCHASE,
      date: row.date || new Date().toISOString().slice(0, 10),
      weightMaunds: row.weightMaunds ?? '',
      ratePerMaund: row.ratePerMaund ?? '',
      totalAmount: row.totalAmount ?? '',
      supplier: row.supplier || '',
      note: row.note || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        await updateOwnWheatEntry(editingId, form)
        notify('Own wheat entry updated.')
      } else {
        await addOwnWheatEntry(form)
        notify(form.type === OWN_PURCHASE ? 'Wheat purchase saved.' : 'Stock movement saved.')
      }
      resetForm()
    } catch (error) {
      notify(error.message || 'Could not save own wheat entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await softDeleteEntry(OWN_WHEAT_COLLECTION, pendingDelete.id)
      if (editingId === pendingDelete.id) resetForm()
      notify('Entry moved to Recycle Bin.')
      setPendingDelete(null)
    } catch (error) {
      notify(error.message || 'Could not delete entry.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function exportStock() {
    exportDataToCSV(
      visibleRows.map((row) => ({
        id: row.id,
        type: row.type,
        date: row.date,
        weightMaunds: row.weightMaunds,
        weightKg: row.weightKg,
        ratePerMaund: row.ratePerMaund,
        totalAmount: row.totalAmount,
        supplier: row.supplier,
        note: row.note,
        isDeleted: row.isDeleted,
        createdAt: serializeCsvValue(row.createdAt),
      })),
      'own_wheat_stock.csv',
    )
  }

  const kpis = [
    {
      label: 'Own wheat purchased',
      value: `${formatNumber(totals.purchasedMaunds, 1)} mnd`,
      hint: `${formatNumber(totals.purchasedKg)} kg in ${year}`,
      tone: 'bg-emerald-950 text-emerald-50',
    },
    {
      label: 'Purchase investment',
      value: formatPkr(totals.investment),
      hint: 'Total PKR spent on zati gundam',
      tone: 'bg-amber-950 text-amber-50',
    },
    {
      label: 'Remaining own stock',
      value: `${formatNumber(totals.remainingMaunds, 1)} mnd`,
      hint: `${formatNumber(totals.remainingKg)} kg after sales and usage`,
      tone: 'bg-mill-800 text-wheat-50',
    },
    {
      label: 'Sold / used',
      value: `${formatNumber(totals.soldMaunds + totals.usedMaunds, 1)} mnd`,
      hint: `Sales ${formatPkr(totals.saleRevenue)}`,
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
              onClick={exportStock}
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
              {showTrash ? 'View active stock' : 'Recycle Bin'}
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {!isFirebaseConfigured ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase is not configured. Own wheat stock needs your `.env` keys.
          </p>
        ) : null}

        {showTrash ? (
          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>Viewing deleted own-wheat records. Restore to include them in yearly totals again.</span>
            <button type="button" onClick={() => setShowTrash(false)} className="font-bold underline">
              Back to stock
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl text-mill-900">Mill own wheat</h1>
              <p className="mt-1 text-sm text-stone-500">
                Zati gundam purchases, sales, and processing usage. 1 maund = 40 kg.
              </p>
            </div>
            <label className="text-sm font-medium text-stone-700">
              Year
              <select
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="ml-2 rounded-xl border border-wheat-200 bg-white px-3 py-2 text-sm outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
              >
                {years.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <article key={kpi.label} className={`rounded-3xl p-5 shadow-lg ${kpi.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{kpi.label}</p>
              <p className="mt-3 font-display text-3xl">{kpi.value}</p>
              <p className="mt-2 text-xs opacity-75">{kpi.hint}</p>
            </article>
          ))}
        </div>

        {!showTrash ? (
          <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl text-mill-900">
              {editingId ? 'Update stock entry' : 'Record own wheat'}
            </h2>
            <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSave}>
              <label className="block" htmlFor="own-type">
                <span className="mb-1.5 block text-sm font-medium text-stone-700">Entry type</span>
                <select
                  id="own-type"
                  value={form.type}
                  onChange={(event) => updateField('type', event.target.value)}
                  className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
                >
                  <option value={OWN_PURCHASE}>Bulk purchase</option>
                  <option value={OWN_SALE}>Mill wheat sale</option>
                  <option value={OWN_USAGE}>Processing usage</option>
                </select>
              </label>
              <Field id="own-date" type="date" label="Date" value={form.date} onChange={(value) => updateField('date', value)} />
              <Field
                id="own-weight"
                label="Weight (Maunds / Mann)"
                hint="Stored as kilograms in Firebase using 1 maund = 40 kg."
                value={form.weightMaunds}
                onChange={(value) => updateField('weightMaunds', value)}
                placeholder="e.g. 40"
                required
              />
              <Field
                id="own-rate"
                label="Rate per maund (PKR)"
                hint="Optional if total amount is entered."
                value={form.ratePerMaund}
                onChange={(value) => updateField('ratePerMaund', value)}
              />
              <Field
                id="own-total"
                label="Total amount (PKR)"
                hint="Optional if rate per maund is entered. For sales this is revenue."
                value={form.totalAmount}
                onChange={(value) => updateField('totalAmount', value)}
              />
              <Field
                id="own-supplier"
                type="text"
                label="Vendor / supplier"
                value={form.supplier}
                onChange={(value) => updateField('supplier', value)}
                placeholder="e.g. Mandi trader"
              />
              <Field
                id="own-note"
                type="textarea"
                label="Note"
                value={form.note}
                onChange={(value) => updateField('note', value)}
              />
              <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-mill-800 px-6 py-3 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingId ? 'Update entry' : 'Save entry'}
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
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-wheat-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-wheat-100 px-6 py-4">
            <Warehouse className="h-4 w-4 text-mill-800" />
            <h2 className="font-display text-xl text-mill-900">Stock movements · {year}</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-wheat-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Weight</th>
                  <th className="px-4 py-3 font-semibold">Rate / mnd</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-stone-500">
                      No own wheat records for this year.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr key={row.id} className="border-t border-wheat-100">
                      <td className="whitespace-nowrap px-4 py-3">{row.date}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-wheat-100 px-2.5 py-1 text-xs font-semibold text-mill-800">
                          {TYPE_LABELS[row.type] || 'Purchase'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-mill-900">
                        {formatNumber(row.weightMaunds, 1)} mnd
                        <span className="ml-1 text-xs font-normal text-stone-500">
                          ({formatNumber(row.weightKg)} kg)
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{formatPkr(row.ratePerMaund)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatPkr(row.totalAmount)}</td>
                      <td className="px-4 py-3">{row.supplier || '—'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-stone-500">{row.note || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {showTrash ? (
                          <button
                            type="button"
                            onClick={() => restoreEntry(OWN_WHEAT_COLLECTION, row.id).then(() => notify('Entry restored.'))}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 rounded-full bg-wheat-100 px-3 py-1 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(row)}
                              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message="This own-wheat entry will be hidden and excluded from yearly totals until restored."
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />
    </div>
  )
}
