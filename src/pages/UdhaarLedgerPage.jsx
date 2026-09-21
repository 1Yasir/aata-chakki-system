import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { Banknote, Download, History, Pencil, Plus, RotateCcw, Search, Trash2, UserPlus, Wallet } from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import UdhaarFormModal from '../components/UdhaarFormModal'
import UdhaarWasooliModal from '../components/UdhaarWasooliModal'
import UdhaarHistoryModal from '../components/UdhaarHistoryModal'
import { useToast } from '../context/ToastContext'
import {
  addGeneralUdhaarCustomer,
  addGeneralUdhaarTransaction,
  db,
  exportDataToCSV,
  fetchCollectionDocs,
  GENERAL_UDHAAR_CUSTOMERS_COLLECTION,
  GENERAL_UDHAAR_TRANSACTIONS_COLLECTION,
  hardDeleteEntry,
  isFirebaseConfigured,
  restoreEntry,
  serializeCsvValue,
  softDeleteEntry,
  softDeleteGeneralUdhaarTransaction,
  restoreGeneralUdhaarTransaction,
  updateGeneralUdhaarCustomer,
} from '../firebase'
import { formatPkr, formatWeightDisplay } from '../lib/calculations'
import {
  GU_UDHAAR,
  GU_WASOOLI,
  MAUND_KG,
  sortGeneralCustomersByName,
  todayIsoDate,
} from '../lib/generalUdhaar'

export default function UdhaarLedgerPage() {
  const { notify } = useToast()
  const [customers, setCustomers] = useState([])
  const [allTransactions, setAllTransactions] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showTrash, setShowTrash] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [creditFormOpen, setCreditFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [wasooliModal, setWasooliModal] = useState({ open: false, customer: null })
  const [historyCustomer, setHistoryCustomer] = useState(null)
  const [historyTrash, setHistoryTrash] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Load Active/Deleted Udhaar Customers
  useEffect(() => {
    if (!db) return undefined

    const customersQuery = query(
      collection(db, GENERAL_UDHAAR_CUSTOMERS_COLLECTION),
      where('isDeleted', '==', showTrash),
    )

    const unsubscribe = onSnapshot(
      customersQuery,
      (snapshot) => {
        setCustomers(
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
  }, [notify, showTrash])

  // Load All Active Transactions for Table Aggregation
  useEffect(() => {
    if (!db) return undefined

    const txQuery = query(
      collection(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION),
      where('isDeleted', '==', false),
    )

    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => {
        setAllTransactions(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        )
      },
      (error) => {
        notify(error.message || 'Could not load transactions.', 'error')
      },
    )

    return unsubscribe
  }, [notify])

  // Load Selected Customer's Specific Transactions for History Modal
  useEffect(() => {
    if (!db || !historyCustomer) {
      setTransactions([])
      return undefined
    }

    const txQuery = query(
      collection(db, GENERAL_UDHAAR_TRANSACTIONS_COLLECTION),
      where('customerId', '==', historyCustomer.id),
    )

    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => {
        setTransactions(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        )
      },
      (error) => {
        notify(error.message || 'Could not load ledger.', 'error')
      },
    )

    return unsubscribe
  }, [historyCustomer, notify])

  const visibleCustomers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = needle
      ? customers.filter(
          (customer) =>
            String(customer.name || '').toLowerCase().includes(needle) ||
            String(customer.phone || '').includes(needle),
        )
      : customers
    return sortGeneralCustomersByName(filtered)
  }, [customers, search])

  const totals = useMemo(() => {
    const today = todayIsoDate()
    const todayWasooliSum = allTransactions
      .filter((tx) => tx.type === GU_WASOOLI && tx.date === today)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)

    return {
      totalUdhaarBalance: visibleCustomers.reduce((sum, c) => sum + (Number(c.netUdhaarBalance) || 0), 0),
      totalCustomers: visibleCustomers.length,
      todayWasooli: todayWasooliSum,
    }
  }, [visibleCustomers, allTransactions])

  const liveHistoryCustomer = useMemo(
    () => customers.find((customer) => customer.id === historyCustomer?.id) || historyCustomer,
    [customers, historyCustomer],
  )

  // Calculate Cumulative Aggregated Table Data for Each Customer
  const customerTransactionData = useMemo(() => {
    const data = {}
    customers.forEach((customer) => {
      const customerTxs = allTransactions.filter((tx) => tx.customerId === customer.id)
      
      const totalWeightKg = customerTxs.reduce((sum, tx) => sum + (Number(tx.weightKg) || 0), 0)
      const totalCashPaid = customerTxs.reduce((sum, tx) => sum + (Number(tx.cashPaid) || 0), 0)
      const totalUdhaarAdded = customerTxs
        .filter((tx) => tx.type === GU_UDHAAR)
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
      const totalWasooli = customerTxs
        .filter((tx) => tx.type === GU_WASOOLI)
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)

      // Get latest active transaction date
      const sortedTxs = [...customerTxs].sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      )
      const latestDate = sortedTxs[0]?.date || todayIsoDate()

      data[customer.id] = {
        latestDate,
        totalWeightKg,
        totalCashPaid,
        totalUdhaarAdded,
        totalWasooli,
      }
    })
    return data
  }, [customers, allTransactions])

  async function handleSaveCustomer(form) {
    setSaving(true)
    try {
      if (editingCustomer) {
        await updateGeneralUdhaarCustomer(editingCustomer.id, form)
        notify('Customer updated successfully.')
      } else {
        const trimmedName = String(form.name || '').trim().toLowerCase()
        const existingCustomer = customers.find(
          (c) => String(c.name || '').trim().toLowerCase() === trimmedName,
        )

        if (existingCustomer) {
          notify(`Customer '${form.name}' pehle se add hai. Naya udhaar daalne ke liye list se select karein.`, 'error')
          setSaving(false)
          return
        }

        await addGeneralUdhaarCustomer(form)
        notify('Customer added.')
      }
      setFormOpen(false)
      setEditingCustomer(null)
    } catch (error) {
      notify(error.message || 'Could not save customer.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCredit(form) {
    setSaving(true)
    try {
      const targetCustomer = selectedCustomer || customers.find((c) => c.id === form.customerId)
      const customerId = targetCustomer ? targetCustomer.id : form.customerId
      const customerName = targetCustomer ? targetCustomer.name : form.name
      const customerPhone = targetCustomer ? targetCustomer.phone : form.phone

      await addGeneralUdhaarTransaction({
        customerId,
        name: customerName,
        phone: customerPhone,
        type: GU_UDHAAR,
        amount: form.amount,
        weightKg: (Number(form.weightMaunds) || 0) * MAUND_KG,
        cashPaid: form.cashPaid,
        date: form.date,
        note: form.note,
      })
      notify('Naya Udhaar jama ho gaya.')
      setCreditFormOpen(false)
      setSelectedCustomer(null)
    } catch (error) {
      notify(error.message || 'Could not save udhaar entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveWasooli(form) {
    if (!wasooliModal.customer) return
    setSaving(true)
    try {
      await addGeneralUdhaarTransaction({
        customerId: wasooliModal.customer.id,
        type: GU_WASOOLI,
        amount: form.amount,
        date: form.date,
        note: form.note,
      })
      notify('Wasooli recorded successfully.')
      setWasooliModal({ open: false, customer: null })
    } catch (error) {
      notify(error.message || 'Could not save payment.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || !db) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === 'customer') {
        await softDeleteEntry(GENERAL_UDHAAR_CUSTOMERS_COLLECTION, pendingDelete.item.id)
        if (historyCustomer?.id === pendingDelete.item.id) {
          setHistoryCustomer(null)
        }
        notify('Customer moved to Recycle Bin.')
      } else {
        await softDeleteGeneralUdhaarTransaction(pendingDelete.item.id)
        notify('Transaction moved to Recycle Bin.')
      }
      setPendingDelete(null)
    } catch (error) {
      notify(error.message || 'Could not delete.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRestoreCustomer(customer) {
    try {
      await restoreEntry(GENERAL_UDHAAR_CUSTOMERS_COLLECTION, customer.id)
      notify('Customer restored.')
    } catch (error) {
      notify(error.message || 'Could not restore customer.', 'error')
    }
  }

  async function handleRestoreTransaction(tx) {
    try {
      await restoreGeneralUdhaarTransaction(tx.id)
      notify('Transaction restored.')
    } catch (error) {
      notify(error.message || 'Could not restore transaction.', 'error')
    }
  }

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete || !db) return
    setDeleting(true)
    try {
      if (pendingPermanentDelete.kind === 'customer') {
        await hardDeleteEntry(GENERAL_UDHAAR_CUSTOMERS_COLLECTION, pendingPermanentDelete.item.id)
        if (historyCustomer?.id === pendingPermanentDelete.item.id) {
          setHistoryCustomer(null)
        }
        notify('Customer permanently deleted.')
      } else {
        await hardDeleteEntry(GENERAL_UDHAAR_TRANSACTIONS_COLLECTION, pendingPermanentDelete.item.id)
        notify('Transaction permanently deleted.')
      }
      setPendingPermanentDelete(null)
    } catch (error) {
      notify(error.message || 'Could not permanently delete.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function exportUdhaarData() {
    try {
      exportDataToCSV(
        visibleCustomers.map(({ id, name, phone, netUdhaarBalance, createdAt, isDeleted }) => ({
          id,
          name,
          phone,
          netUdhaarBalance,
          createdAt: serializeCsvValue(createdAt),
          isDeleted,
        })),
        'udhaar_customers.csv',
      )
      const transactionsBackup = await fetchCollectionDocs(GENERAL_UDHAAR_TRANSACTIONS_COLLECTION)
      exportDataToCSV(
        transactionsBackup.map((tx) => ({
          id: tx.id,
          customerId: tx.customerId,
          type: tx.type,
          date: tx.date,
          amount: tx.amount,
          weightKg: tx.weightKg,
          cashPaid: tx.cashPaid,
          note: tx.note,
          isDeleted: tx.isDeleted,
          createdAt: serializeCsvValue(tx.createdAt),
        })),
        'udhaar_transactions.csv',
      )
    } catch (error) {
      notify(error.message || 'Could not export backup.', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-wheat-50">
      <AdminHeader
        actions={
          <>
            <button
              type="button"
              onClick={exportUdhaarData}
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
              {showTrash ? 'View active customers' : 'Recycle Bin'}
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {!isFirebaseConfigured ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase is not configured. Udhaar ledger needs your `.env` keys.
          </p>
        ) : null}

        {showTrash ? (
          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>Viewing deleted customers. Restore to use their udhaar ledger again.</span>
            <button type="button" onClick={() => setShowTrash(false)} className="font-bold underline">
              Back to customers
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl text-mill-900">Udhaar Khata</h1>
              <p className="mt-1 text-sm text-stone-500">
                Track daily credit sales and payment collections for general customers.
              </p>
            </div>
            {!showTrash ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCustomer(null)
                    setFormOpen(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-mill-800 px-5 py-2.5 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Customer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setCreditFormOpen(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Udhaar Entry
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-800 text-amber-100">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-800">Total Market Udhaar</p>
                <p className="font-display text-xl font-bold text-amber-950">{formatPkr(totals.totalUdhaarBalance)}</p>
                <p className="text-[10px] text-amber-700">Kul Wasooli Baqi</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-wheat-200 bg-wheat-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mill-800 text-wheat-100">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500">Total Udhaar Customers</p>
                <p className="font-display text-xl font-bold text-mill-900">{totals.totalCustomers}</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-emerald-100">
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-800">Today's Wasooli</p>
                <p className="font-display text-xl font-bold text-emerald-950">{formatPkr(totals.todayWasooli)}</p>
                <p className="text-[10px] text-emerald-700">Collected Today</p>
              </div>
            </div>
          </div>

          <label className="relative mt-6 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or phone"
              className="w-full rounded-xl border border-wheat-200 bg-wheat-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
            />
          </label>
        </section>

        {visibleCustomers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-wheat-300 bg-white px-6 py-16 text-center text-stone-500">
            {showTrash
              ? 'Recycle Bin is empty. No deleted customers found.'
              : 'No udhaar customers yet. Add a customer to start tracking their credit balance.'}
          </div>
        ) : (
          <section className="rounded-3xl border border-wheat-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-wheat-50 border-b border-wheat-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-stone-700">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-700">Customer Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-700">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-stone-700">Weight / Items</th>
                    <th className="px-4 py-3 text-right font-semibold text-stone-700">Cash Paid</th>
                    <th className="px-4 py-3 text-right font-semibold text-stone-700">Udhaar Added</th>
                    <th className="px-4 py-3 text-right font-semibold text-stone-700">Wasooli</th>
                    <th className="px-4 py-3 text-right font-semibold text-stone-700">Net Balance</th>
                    <th className="px-4 py-3 text-center font-semibold text-stone-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((customer) => {
                    const txData = customerTransactionData[customer.id] || {
                      latestDate: todayIsoDate(),
                      totalWeightKg: 0,
                      totalCashPaid: 0,
                      totalUdhaarAdded: 0,
                      totalWasooli: 0,
                    }
                    return (
                      <tr key={customer.id} className="border-b border-wheat-100 hover:bg-wheat-50/50">
                        <td className="px-4 py-3 text-stone-600">{txData.latestDate}</td>
                        <td className="px-4 py-3 font-medium text-mill-900">{customer.name}</td>
                        <td className="px-4 py-3 text-stone-600">{customer.phone || '-'}</td>
                        <td className="px-4 py-3 text-stone-600 font-medium">
                          {formatWeightDisplay(txData.totalWeightKg)}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">
                          {txData.totalCashPaid > 0 ? formatPkr(txData.totalCashPaid) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">
                          {txData.totalUdhaarAdded > 0 ? formatPkr(txData.totalUdhaarAdded) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">
                          {txData.totalWasooli > 0 ? formatPkr(txData.totalWasooli) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${customer.netUdhaarBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {formatPkr(customer.netUdhaarBalance)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {showTrash ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRestoreCustomer(customer)}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                                  title="Restore Customer"
                                >
                                  <RotateCcw className="h-3 w-3" /> Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingPermanentDelete({ kind: 'customer', item: customer })}
                                  className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-200"
                                  title="Delete Permanently"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete Permanently
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCustomer(customer)
                                    setCreditFormOpen(true)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200"
                                  title="Add Udhaar"
                                >
                                  <Plus className="h-3 w-3" /> Add Udhaar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setWasooliModal({ open: true, customer })}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                                  title="Receive Payment"
                                >
                                  <Banknote className="h-3 w-3" /> Wasooli
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHistoryTrash(false)
                                    setHistoryCustomer(customer)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-wheat-100 px-2 py-1 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                                  title="View History"
                                >
                                  <History className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCustomer(customer)
                                    setFormOpen(true)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-wheat-100 px-2 py-1 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                                  title="Edit Customer"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete({ kind: 'customer', item: customer })}
                                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  title="Delete Customer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <UdhaarFormModal
        open={formOpen}
        customer={editingCustomer}
        busy={saving}
        onClose={() => {
          setFormOpen(false)
          setEditingCustomer(null)
        }}
        onSubmit={handleSaveCustomer}
      />

      <UdhaarFormModal
        open={creditFormOpen}
        customer={selectedCustomer}
        isCreditEntry
        busy={saving}
        onClose={() => {
          setCreditFormOpen(false)
          setSelectedCustomer(null)
        }}
        onSubmit={handleSaveCredit}
      />

      <UdhaarWasooliModal
        open={wasooliModal.open}
        customer={wasooliModal.customer}
        busy={saving}
        onClose={() => setWasooliModal({ open: false, customer: null })}
        onSubmit={handleSaveWasooli}
      />

      <UdhaarHistoryModal
        open={Boolean(historyCustomer)}
        customer={liveHistoryCustomer}
        transactions={transactions}
        showTrash={historyTrash}
        onToggleTrash={() => setHistoryTrash((value) => !value)}
        onClose={() => setHistoryCustomer(null)}
        onDelete={(tx) => setPendingDelete({ kind: 'transaction', item: tx })}
        onRestore={handleRestoreTransaction}
        onPermanentDelete={(tx) => setPendingPermanentDelete({ kind: 'transaction', item: tx })}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message={
          pendingDelete?.kind === 'customer'
            ? 'This customer will be hidden. All ledger transactions will be preserved and can be restored later.'
            : 'This transaction will be hidden and the customer balance will be recalculated.'
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />

      <ConfirmModal
        open={Boolean(pendingPermanentDelete)}
        title="Delete Permanently?"
        message={
          pendingPermanentDelete?.kind === 'customer'
            ? 'This customer and all their transactions will be permanently deleted. This action cannot be undone.'
            : 'This transaction will be permanently deleted. This action cannot be undone.'
        }
        onCancel={() => setPendingPermanentDelete(null)}
        onConfirm={handlePermanentDelete}
        busy={deleting}
      />
    </div>
  )
}