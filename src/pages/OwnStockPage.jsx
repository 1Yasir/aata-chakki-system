import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { CreditCard, Download, History, Pencil, RotateCcw, Trash2, Warehouse } from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import Field from '../components/Field'
import { useToast } from '../context/ToastContext'
import {
  addOwnWheatEntry,
  db,
  exportDataToCSV,
  hardDeleteEntry,
  isFirebaseConfigured,
  OWN_WHEAT_COLLECTION,
  restoreEntry,
  serializeCsvValue,
  softDeleteEntry,
  updateOwnWheatEntry,
} from '../firebase'
import { formatNumber, formatPkr } from '../lib/calculations'
import { availableOwnWheatYears, OWN_PURCHASE } from '../lib/ownWheat'

export default function OwnStockPage() {
  const { notify } = useToast()
  const [rows, setRows] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Additional Payment Modal State
  const [paymentModalRow, setPaymentModalRow] = useState(null)
  const [additionalPayment, setAdditionalPayment] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentNote, setPaymentNote] = useState('')
  const [paying, setPaying] = useState(false)

  // History Modal State to view past payments
  const [historyModalRow, setHistoryModalRow] = useState(null)

  // Form State
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weightMaunds: '',
    ratePerMaund: '',
    totalAmount: '',
    paidAmount: '0',
    supplier: '',
    note: '',
  })

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

  const visibleRows = useMemo(
    () =>
      [...rows]
        .filter((row) => !year || String(row.date || '').startsWith(year))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [rows, year],
  )

  const getPaidValue = (row) => {
    if (row.transactions && Array.isArray(row.transactions)) {
      return row.transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
    }
    if (row.paidAmount !== undefined && row.paidAmount !== null && row.paidAmount !== '') {
      return Number(row.paidAmount)
    }
    return 0
  }

  const totals = useMemo(() => {
    return visibleRows.reduce(
      (acc, row) => {
        const maunds = Number(row.weightMaunds) || 0
        const kg = Number(row.weightKg) || maunds * 40
        const rate = Number(row.ratePerMaund) || 0
        let total = Number(row.totalAmount) || 0
        if (!total && maunds && rate) total = maunds * rate

        const paid = getPaidValue(row)
        const remaining = total - paid

        acc.totalMaunds += maunds
        acc.totalKg += kg
        acc.totalCost += total
        acc.totalPaid += paid
        acc.totalRemaining += remaining
        return acc
      },
      { totalMaunds: 0, totalKg: 0, totalCost: 0, totalPaid: 0, totalRemaining: 0 },
    )
  }, [visibleRows])

  function updateField(key, value) {
    setForm((current) => {
      const updated = { ...current, [key]: value }
      if (key === 'weightMaunds' || key === 'ratePerMaund') {
        const m = Number(key === 'weightMaunds' ? value : current.weightMaunds) || 0
        const r = Number(key === 'ratePerMaund' ? value : current.ratePerMaund) || 0
        if (m && r) {
          updated.totalAmount = String(m * r)
        }
      }
      return updated
    })
  }

  function handleQuickPayment(type) {
    if (type === 'UDHAAR') {
      setForm((prev) => ({ ...prev, paidAmount: '0' }))
    } else if (type === 'FULL') {
      setForm((prev) => ({ ...prev, paidAmount: prev.totalAmount || '0' }))
    }
  }

  function resetForm() {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      weightMaunds: '',
      ratePerMaund: '',
      totalAmount: '',
      paidAmount: '0',
      supplier: '',
      note: '',
    })
    setEditingId(null)
  }

  function startEdit(row) {
    setEditingId(row.id)
    const paid = getPaidValue(row)
    setForm({
      date: row.date || new Date().toISOString().slice(0, 10),
      weightMaunds: row.weightMaunds ?? '',
      ratePerMaund: row.ratePerMaund ?? '',
      totalAmount: row.totalAmount ?? '',
      paidAmount: String(paid),
      supplier: row.supplier || '',
      note: row.note || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const maunds = Number(form.weightMaunds) || 0
      const rate = Number(form.ratePerMaund) || 0
      let total = Number(form.totalAmount) || 0
      if (!total && maunds && rate) total = maunds * rate

      const paid = form.paidAmount !== '' ? Number(form.paidAmount) : 0

      // Agar nayi entry hai aur kuch naqad diya gaya hai, toh usay transactions history mein dalen
      let transactions = []
      if (editingId) {
        const existingRow = rows.find(r => r.id === editingId)
        transactions = existingRow?.transactions || []
        if (transactions.length === 0 && existingRow?.paidAmount > 0) {
          transactions = [{
            date: existingRow.date || form.date,
            amount: Number(existingRow.paidAmount),
            note: 'Initial payment'
          }]
        }
      } else if (paid > 0) {
        transactions = [{
          date: form.date,
          amount: paid,
          note: 'Initial payment'
        }]
      }

      const payload = {
        type: OWN_PURCHASE,
        date: form.date,
        weightMaunds: maunds,
        weightKg: maunds * 40,
        ratePerMaund: rate,
        totalAmount: total,
        paidAmount: paid,
        supplier: form.supplier || '',
        note: form.note || '',
        transactions,
      }

      if (editingId) {
        await updateOwnWheatEntry(editingId, payload)
        notify('Khareed entry update ho gayi.')
      } else {
        await addOwnWheatEntry(payload)
        notify('Nayi gundam khareed save ho gayi.')
      }
      resetForm()
    } catch (error) {
      notify(error.message || 'Could not save entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Handle submitting additional payment with history tracking
  async function handleAddPaymentSubmit(e) {
    e.preventDefault()
    if (!paymentModalRow) return
    const addAmt = Number(additionalPayment)
    if (!addAmt || addAmt <= 0) {
      notify('Baraye meharbani theek rakam darj karein.', 'error')
      return
    }

    setPaying(true)
    try {
      const currentPaid = getPaidValue(paymentModalRow)
      const newPaid = currentPaid + addAmt
      const total = Number(paymentModalRow.totalAmount) || 0

      if (newPaid > total) {
        notify('Ada ki gayi rakam kul rakam se zyada nahi ho sakti!', 'error')
        setPaying(false)
        return
      }

      let existingTransactions = paymentModalRow.transactions || []
      // Backward compatibility if transactions array didn't exist before
      if (existingTransactions.length === 0 && paymentModalRow.paidAmount > 0) {
        existingTransactions = [{
          date: paymentModalRow.date,
          amount: Number(paymentModalRow.paidAmount),
          note: 'Initial payment'
        }]
      }

      const updatedTransactions = [
        ...existingTransactions,
        {
          date: paymentDate,
          amount: addAmt,
          note: paymentNote || 'Additional payment'
        }
      ]

      await updateOwnWheatEntry(paymentModalRow.id, {
        paidAmount: newPaid,
        transactions: updatedTransactions
      })

      notify('Rakam kamyaabi se adaa kar di gayi hai.')
      setPaymentModalRow(null)
      setAdditionalPayment('')
      setPaymentNote('')
      setPaymentDate(new Date().toISOString().slice(0, 10))
    } catch (error) {
      notify(error.message || 'Payment update nahi ho saki.', 'error')
    } finally {
      setPaying(false)
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
      visibleRows.map((row) => {
        const total = Number(row.totalAmount) || 0
        const paid = getPaidValue(row)
        return {
          id: row.id,
          date: row.date,
          weightMaunds: row.weightMaunds,
          weightKg: row.weightKg,
          ratePerMaund: row.ratePerMaund,
          totalAmount: total,
          paidAmount: paid,
          remainingAmount: total - paid,
          supplier: row.supplier,
          note: row.note,
          isDeleted: row.isDeleted,
          createdAt: serializeCsvValue(row.createdAt),
        }
      }),
      'gundam_khareed_stock.csv',
    )
  }

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete || !db) return
    setDeleting(true)
    try {
      await hardDeleteEntry(OWN_WHEAT_COLLECTION, pendingPermanentDelete.id)
      if (editingId === pendingPermanentDelete.id) resetForm()
      notify('Entry permanently deleted.')
      setPendingPermanentDelete(null)
    } catch (error) {
      notify(error.message || 'Could not permanently delete entry.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const kpis = [
    {
      label: 'Kul Khareedi Gayi Gundam',
      value: `${formatNumber(totals.totalMaunds, 1)} Mann`,
      hint: `${formatNumber(totals.totalKg)} kg (${year})`,
      tone: 'bg-emerald-950 text-emerald-50',
    },
    {
      label: 'Kul Rakam (Total Cost)',
      value: formatPkr(totals.totalCost),
      hint: 'Gundam khareed ki kul keemat',
      tone: 'bg-amber-950 text-amber-50',
    },
    {
      label: 'Naqad Di Rakam (Paid)',
      value: formatPkr(totals.totalPaid),
      hint: 'Jo paise naqad de diye gaye',
      tone: 'bg-sky-950 text-sky-50',
    },
    {
      label: 'Baqi Dene Wale (Udhaar)',
      value: formatPkr(totals.totalRemaining),
      hint: 'Jo paise abhi dene baqi hain',
      tone: totals.totalRemaining > 0 ? 'bg-rose-950 text-rose-50' : 'bg-stone-800 text-stone-100',
    },
  ]

  return (
    <div className="min-h-screen bg-wheat-50 font-sans">
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
              {showTrash ? 'View Active Stock' : 'Recycle Bin'}
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
            <span>Viewing deleted records. Restore to include them in totals again.</span>
            <button type="button" onClick={() => setShowTrash(false)} className="font-bold underline">
              Back to stock
            </button>
          </div>
        ) : null}

        {/* Page Title & Year Selector */}
        <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-mill-900">Zati Gundam Khareed Khata</h1>
              <p className="mt-1 text-sm text-stone-500">
                Mill ke liye khareedi gayi gundam, naqad adaigi aur udhaar ka hisab. (1 Mann = 40 kg)
              </p>
            </div>
            <label className="text-sm font-medium text-stone-700">
              Select Year
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

        {/* Top Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <article key={kpi.label} className={`rounded-3xl p-5 shadow-sm ${kpi.tone}`}>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{kpi.label}</p>
              <p className="mt-3 font-display text-3xl font-bold">{kpi.value}</p>
              <p className="mt-2 text-xs opacity-75">{kpi.hint}</p>
            </article>
          ))}
        </div>

        {/* Entry Form */}
        {!showTrash ? (
          <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold text-mill-900">
                {editingId ? 'Khareed Entry Update Karein' : 'Nayi Gundam Khareed Record Karein'}
              </h2>
              {/* Quick Preset Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickPayment('UDHAAR')}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition"
                >
                  Set Poori Udhaar (0 Paid)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPayment('FULL')}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                >
                  Set Full Naqad Paid
                </button>
              </div>
            </div>

            <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSave}>
              <Field id="own-date" type="date" label="Tareekh (Date)" value={form.date} onChange={(value) => updateField('date', value)} />
              
              <Field
                id="own-supplier"
                type="text"
                label="Kisse Gundam Khareedi? (Party / Seller Name)"
                value={form.supplier}
                onChange={(value) => updateField('supplier', value)}
                placeholder="maslan: Allah Dithha Hamam / Khalid"
                required
              />

              <Field
                id="own-weight"
                label="Wazan (Mann / Maunds)"
                hint="1 Mann = 40 kg"
                value={form.weightMaunds}
                onChange={(value) => updateField('weightMaunds', value)}
                placeholder="maslan: 5"
                required
              />

              <Field
                id="own-rate"
                label="Rate Per Mann (PKR)"
                hint="Aik mann ki keemat"
                value={form.ratePerMaund}
                onChange={(value) => updateField('ratePerMaund', value)}
                placeholder="maslan: 4700"
              />

              <Field
                id="own-total"
                label="Kul Rakam (Total Amount PKR)"
                hint="Auto-calculate ho jayegi"
                value={form.totalAmount}
                onChange={(value) => updateField('totalAmount', value)}
                placeholder="maslan: 23500"
              />

              <Field
                id="own-paid"
                label="Naqad Di Rakam (Paid Amount PKR)"
                hint="Udhaar hone par 0 rehne dein"
                value={form.paidAmount}
                onChange={(value) => updateField('paidAmount', value)}
                placeholder="0"
              />

              <div className="xl:col-span-3">
                <Field
                  id="own-note"
                  type="textarea"
                  label="Tafseel / Note (Optional)"
                  value={form.note}
                  onChange={(value) => updateField('note', value)}
                  placeholder="Koyi khass baat ya gari ka number wagaira..."
                />
              </div>

              <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-mill-800 px-6 py-3 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60 transition"
                >
                  {saving ? 'Saving…' : editingId ? 'Update Entry' : 'Save Khareed Entry'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full px-5 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition"
                  >
                    Cancel Edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        {/* Data Table */}
        <section className="overflow-hidden rounded-3xl border border-wheat-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-wheat-100 px-6 py-4">
            <Warehouse className="h-5 w-5 text-mill-800" />
            <h2 className="font-display text-xl font-bold text-mill-900">Gundam Khareed Register · {year}</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-wheat-50 text-xs uppercase tracking-wide text-stone-600 border-b border-wheat-200">
                <tr>
                  <th className="px-4 py-3.5 font-bold">Tareekh</th>
                  <th className="px-4 py-3.5 font-bold">Kisse Khareedi</th>
                  <th className="px-4 py-3.5 font-bold">Wazan (Mann)</th>
                  <th className="px-4 py-3.5 font-bold">Rate/Mann</th>
                  <th className="px-4 py-3.5 font-bold">Kul Rakam</th>
                  <th className="px-4 py-3.5 font-bold text-emerald-800">Naqad Di (Paid)</th>
                  <th className="px-4 py-3.5 font-bold text-rose-800">Baqi (Udhaar)</th>
                  <th className="px-4 py-3.5 font-bold">Note</th>
                  <th className="px-4 py-3.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wheat-100">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-stone-500">
                      No gundam purchase records found for this year.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const maunds = Number(row.weightMaunds) || 0
                    const rate = Number(row.ratePerMaund) || 0
                    let total = Number(row.totalAmount) || 0
                    if (!total && maunds && rate) total = maunds * rate

                    const paid = getPaidValue(row)
                    const remaining = total - paid

                    return (
                      <tr key={row.id} className="hover:bg-wheat-50/50 transition">
                        <td className="whitespace-nowrap px-4 py-3.5 font-medium text-stone-800">{row.date}</td>
                        <td className="px-4 py-3.5 font-semibold text-stone-900">{row.supplier || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold text-mill-900">
                          {formatNumber(maunds, 1)} Mann
                          <span className="ml-1 text-xs font-normal text-stone-500">
                            ({formatNumber(row.weightKg || maunds * 40)} kg)
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-stone-700">{formatPkr(rate)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold text-stone-900">{formatPkr(total)}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold text-emerald-700">
                          {formatPkr(paid)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold">
                          {remaining > 0 ? (
                            <span className="inline-flex rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                              {formatPkr(remaining)}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">Clear (0)</span>
                          )}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3.5 text-stone-500">{row.note || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          {showTrash ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => restoreEntry(OWN_WHEAT_COLLECTION, row.id).then(() => notify('Entry restored.'))}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Restore
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingPermanentDelete(row)}
                                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-200"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {/* History Button */}
                              <button
                                type="button"
                                onClick={() => setHistoryModalRow(row)}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                                title="Adaigi ki History Dekhein"
                              >
                                <History className="h-3.5 w-3.5" /> History
                              </button>

                              {remaining > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setPaymentModalRow(row)}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                  title="Mazeed Rakam Ada Karein"
                                >
                                  <CreditCard className="h-3.5 w-3.5" /> Pay
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="inline-flex items-center gap-1 rounded-full bg-wheat-100 px-2.5 py-1 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(row)}
                                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Del
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>

              {/* Table Bottom Total Summary Row */}
              {visibleRows.length > 0 ? (
                <tfoot className="bg-stone-900 text-white font-bold text-sm">
                  <tr>
                    <td colSpan={2} className="px-4 py-4 text-amber-400 uppercase tracking-wider text-xs">
                      Grand Total ({year})
                    </td>
                    <td className="px-4 py-4 text-emerald-300">
                      {formatNumber(totals.totalMaunds, 1)} Mann
                    </td>
                    <td className="px-4 py-4 text-stone-400">—</td>
                    <td className="px-4 py-4 text-white">{formatPkr(totals.totalCost)}</td>
                    <td className="px-4 py-4 text-emerald-400">{formatPkr(totals.totalPaid)}</td>
                    <td className="px-4 py-4 text-rose-400">{formatPkr(totals.totalRemaining)}</td>
                    <td colSpan={2} className="px-4 py-4 text-stone-400 text-xs font-normal">
                      Kul Khareed & Udhaar Summary
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      </main>

      {/* Additional Payment Modal */}
      {paymentModalRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl font-bold text-mill-900">Rakam Adaigi Darj Karein</h3>
            <p className="mt-1 text-xs text-stone-500">
              Supplier: <span className="font-semibold text-stone-800">{paymentModalRow.supplier}</span> | Baqi Udhaar:{' '}
              <span className="font-bold text-rose-600">
                {formatPkr(Number(paymentModalRow.totalAmount || 0) - getPaidValue(paymentModalRow))}
              </span>
            </p>

            <form onSubmit={handleAddPaymentSubmit} className="mt-4 space-y-4">
              <Field
                id="payment-date"
                type="date"
                label="Adaigi ki Tareekh (Date)"
                value={paymentDate}
                onChange={setPaymentDate}
                required
              />

              <Field
                id="additional-payment-amount"
                type="number"
                label="Kitni rakam abhi ada ki gayi hai? (PKR)"
                value={additionalPayment}
                onChange={setAdditionalPayment}
                placeholder="maslan: 20000"
                required
              />

              <Field
                id="payment-note"
                type="text"
                label="Note / Tafseel (Optional)"
                value={paymentNote}
                onChange={setPaymentNote}
                placeholder="maslan: Naqad diye ya account se..."
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentModalRow(null)
                    setAdditionalPayment('')
                    setPaymentNote('')
                  }}
                  className="rounded-full px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="rounded-full bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {paying ? 'Saving...' : 'Rakam Save Karein'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* History Modal */}
      {historyModalRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-mill-900">Adaigi ki History (Transactions)</h3>
                <p className="text-xs text-stone-500">Supplier: <span className="font-semibold text-stone-800">{historyModalRow.supplier}</span></p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalRow(null)}
                className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-200"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
              {(!historyModalRow.transactions || historyModalRow.transactions.length === 0) ? (
                <p className="text-center text-xs text-stone-500 py-6">
                  {historyModalRow.paidAmount > 0 
                    ? `Initial Paid Amount: ${formatPkr(historyModalRow.paidAmount)} (Tareekh: ${historyModalRow.date})`
                    : 'Koi adaigi record nahi mili.'}
                </p>
              ) : (
                historyModalRow.transactions.map((tx, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-2xl bg-wheat-50 p-3 text-xs border border-wheat-200">
                    <div>
                      <p className="font-bold text-stone-800">{tx.date}</p>
                      <p className="text-stone-500">{tx.note || 'Adaigi'}</p>
                    </div>
                    <p className="font-bold text-emerald-700 text-sm">{formatPkr(tx.amount)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 border-t pt-3 flex justify-between text-xs font-semibold text-stone-700">
              <span>Kul Rakam: {formatPkr(historyModalRow.totalAmount)}</span>
              <span className="text-emerald-700">Kul Ada Shuda: {formatPkr(getPaidValue(historyModalRow))}</span>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message="This entry will be hidden and excluded from yearly totals until restored."
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />
      <ConfirmModal
        open={Boolean(pendingPermanentDelete)}
        title="Delete Permanently?"
        message="This entry will be permanently deleted. This action cannot be undone."
        onCancel={() => setPendingPermanentDelete(null)}
        onConfirm={handlePermanentDelete}
        busy={deleting}
      />
    </div>
  )
}