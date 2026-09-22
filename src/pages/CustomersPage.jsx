import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { Download, History, Minus, Pencil, Plus, RotateCcw, Search, Trash2, UserPlus, Scale, Users } from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import CustomerFormModal from '../components/CustomerFormModal'
import CustomerLedgerModal from '../components/CustomerLedgerModal'
import TransactionModal from '../components/TransactionModal'
import { useToast } from '../context/ToastContext'
import {
  addCustomer,
  addCustomerTransaction,
  CUSTOMERS_COLLECTION,
  CUSTOMER_TRANSACTIONS_COLLECTION,
  db,
  exportDataToCSV,
  fetchCollectionDocs,
  hardDeleteEntry,
  isFirebaseConfigured,
  restoreCustomerTransaction,
  restoreEntry,
  serializeCsvValue,
  softDeleteCustomerTransaction,
  softDeleteEntry,
  updateCustomer,
} from '../firebase'
import { formatNumber } from '../lib/calculations'
import { sortCustomersByName, TX_DEPOSIT, TX_WITHDRAWAL } from '../lib/customerLedger'

// Helper function to convert KG to Maunds (Mann)
function formatMaundsFromKg(kg = 0) {
  const maunds = kg / 40
  return `${formatNumber(maunds, 1)} mnd`
}

export default function CustomersPage() {
  const { notify } = useToast()
  const [customers, setCustomers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showTrash, setShowTrash] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [txModal, setTxModal] = useState({ open: false, customer: null, type: TX_DEPOSIT })
  const [ledgerCustomer, setLedgerCustomer] = useState(null)
  const [ledgerTrash, setLedgerTrash] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!db) return undefined

    const customersQuery = query(
      collection(db, CUSTOMERS_COLLECTION),
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
        notify(error.message || 'Could not load customers.', 'error')
      },
    )

    return unsubscribe
  }, [notify, showTrash])

  useEffect(() => {
    if (!db || !ledgerCustomer) {
      setTransactions([])
      return undefined
    }

    const txQuery = query(
      collection(db, CUSTOMER_TRANSACTIONS_COLLECTION),
      where('customerId', '==', ledgerCustomer.id),
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
  }, [ledgerCustomer, notify])

  const visibleCustomers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = needle
      ? customers.filter(
          (customer) =>
            String(customer.name || '').toLowerCase().includes(needle) ||
            String(customer.phone || '').includes(needle),
        )
      : customers
    return sortCustomersByName(filtered)
  }, [customers, search])

  // Total Calculations across all active customers
  const totals = useMemo(() => {
    return visibleCustomers.reduce(
      (acc, curr) => {
        acc.totalStockKg += Number(curr.currentStockKg || 0)
        acc.totalOpeningKg += Number(curr.initialStockKg || 0)
        return acc
      },
      { totalStockKg: 0, totalOpeningKg: 0 },
    )
  }, [visibleCustomers])

  const liveLedgerCustomer = useMemo(
    () => customers.find((customer) => customer.id === ledgerCustomer?.id) || ledgerCustomer,
    [customers, ledgerCustomer],
  )

  async function handleSaveCustomer(form) {
    setSaving(true)
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, form)
        notify('Customer updated.')
      } else {
        await addCustomer(form)
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

  async function handleSaveTransaction(form) {
    if (!txModal.customer) return
    setSaving(true)
    try {
      await addCustomerTransaction({
        customerId: txModal.customer.id,
        type: form.type,
        weightKg: form.weightKg,
        millingFee: form.millingFee,
        feePayment: form.feePayment,
        date: form.date,
      })
      notify(form.type === TX_DEPOSIT ? 'Wheat deposit saved.' : 'Flour withdrawal saved.')
      setTxModal({ open: false, customer: null, type: TX_DEPOSIT })
    } catch (error) {
      notify(error.message || 'Could not save transaction.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || !db) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === 'customer') {
        await softDeleteEntry(CUSTOMERS_COLLECTION, pendingDelete.item.id)
        if (ledgerCustomer?.id === pendingDelete.item.id) {
          setLedgerCustomer(null)
        }
        notify('Customer moved to Recycle Bin.')
      } else {
        await softDeleteCustomerTransaction(pendingDelete.item.id)
        notify('Transaction moved to Recycle Bin. Stock recalculated.')
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
      await restoreEntry(CUSTOMERS_COLLECTION, customer.id)
      notify('Customer restored.')
    } catch (error) {
      notify(error.message || 'Could not restore customer.', 'error')
    }
  }

  async function handleRestoreTransaction(tx) {
    try {
      await restoreCustomerTransaction(tx.id)
      notify('Transaction restored. Stock recalculated.')
    } catch (error) {
      notify(error.message || 'Could not restore transaction.', 'error')
    }
  }

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete || !db) return
    setDeleting(true)
    try {
      if (pendingPermanentDelete.kind === 'customer') {
        await hardDeleteEntry(CUSTOMERS_COLLECTION, pendingPermanentDelete.item.id)
        if (ledgerCustomer?.id === pendingPermanentDelete.item.id) {
          setLedgerCustomer(null)
        }
        notify('Customer permanently deleted.')
      } else {
        await hardDeleteEntry(CUSTOMER_TRANSACTIONS_COLLECTION, pendingPermanentDelete.item.id)
        notify('Transaction permanently deleted.')
      }
      setPendingPermanentDelete(null)
    } catch (error) {
      notify(error.message || 'Could not permanently delete.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function exportCustomers() {
    try {
      exportDataToCSV(
        visibleCustomers.map(({ id, name, phone, initialStockKg, currentStockKg, udhaarBalance, createdAt, isDeleted }) => ({
          id,
          name,
          phone,
          initialStockMaunds: (initialStockKg || 0) / 40,
          initialStockKg,
          currentStockMaunds: (currentStockKg || 0) / 40,
          currentStockKg,
          udhaarBalance,
          createdAt: serializeCsvValue(createdAt),
          isDeleted,
        })),
        'customer_wheat_ledger.csv',
      )
      const transactionsBackup = await fetchCollectionDocs(CUSTOMER_TRANSACTIONS_COLLECTION)
      exportDataToCSV(
        transactionsBackup.map((tx) => ({
          id: tx.id,
          customerId: tx.customerId,
          type: tx.type,
          date: tx.date,
          weightKg: tx.weightKg,
          millingFee: tx.millingFee,
          amount: tx.amount,
          feePayment: tx.feePayment,
          paymentMethod: tx.paymentMethod,
          note: tx.note,
          isDeleted: tx.isDeleted,
          createdAt: serializeCsvValue(tx.createdAt),
        })),
        'customer_transactions.csv',
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
              onClick={exportCustomers}
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
            Firebase is not configured. Customer ledger CRUD needs your `.env` keys.
          </p>
        ) : null}

        {showTrash ? (
          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>Viewing deleted customers. Restore to use their wheat ledger again.</span>
            <button type="button" onClick={() => setShowTrash(false)} className="font-bold underline">
              Back to customers
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl text-mill-900">Customer wheat stock</h1>
              <p className="mt-1 text-sm text-stone-500">
                Track Gundam deposits, Aata withdrawals, and pisai fees for each household.
              </p>
            </div>
            {!showTrash ? (
              <button
                type="button"
                onClick={() => {
                  setEditingCustomer(null)
                  setFormOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-full bg-mill-800 px-5 py-2.5 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
              >
                <UserPlus className="h-4 w-4" />
                Add customer
              </button>
            ) : null}
          </div>

          {/* TOTAL SUMMARY BAR */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-wheat-200 bg-wheat-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mill-800 text-wheat-100">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500">Total Households</p>
                <p className="font-display text-xl font-bold text-mill-900">{visibleCustomers.length}</p>
              </div>
            </div>

            {/* Total Initial / Opening Stock Card */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-800 text-blue-100">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-800">Total Opening Stock</p>
                <p className="font-display text-xl font-bold text-blue-950">
                  {formatMaundsFromKg(totals.totalOpeningKg)}
                  <span className="ml-1 text-xs font-normal text-blue-700">
                    ({formatNumber(totals.totalOpeningKg)} kg)
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-emerald-100">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-800">Total Stock Remaining</p>
                <p className="font-display text-xl font-bold text-emerald-950">
                  {formatMaundsFromKg(totals.totalStockKg)}
                  <span className="ml-1 text-xs font-normal text-emerald-700">
                    ({formatNumber(totals.totalStockKg)} kg)
                  </span>
                </p>
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
              : 'No customers yet. Add a household to start their wheat ledger.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCustomers.map((customer) => (
              <article
                key={customer.id}
                className="flex flex-col rounded-3xl border border-wheat-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl text-mill-900">{customer.name}</h2>
                    <p className="text-sm text-stone-500">{customer.phone || 'No phone on file'}</p>
                  </div>
                  <p className="rounded-2xl bg-emerald-950 px-3 py-2 text-right text-emerald-50">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      Current stock
                    </span>
                    <span className="font-display text-xl">
                      {formatMaundsFromKg(customer.currentStockKg)}
                    </span>
                    <span className="block text-[10px] opacity-75">
                      ({formatNumber(customer.currentStockKg)} kg)
                    </span>
                  </p>
                </div>

                <dl className="mt-4 rounded-2xl bg-wheat-50 px-3 py-2 text-sm">
                  <dt className="text-xs text-stone-500">Opening stock</dt>
                  <dd className="font-semibold text-mill-900">
                    {formatMaundsFromKg(customer.initialStockKg)}
                  </dd>
                </dl>

                {showTrash ? (
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestoreCustomer(customer)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200"
                    >
                      <RotateCcw className="h-4 w-4" /> Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPermanentDelete({ kind: 'customer', item: customer })}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-100 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-200"
                    >
                      <Trash2 className="h-4 w-4" /> Delete Permanently
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTxModal({ open: true, customer, type: TX_DEPOSIT })}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Plus className="h-3.5 w-3.5" /> Deposit wheat
                      </button>
                      <button
                        type="button"
                        onClick={() => setTxModal({ open: true, customer, type: TX_WITHDRAWAL })}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
                      >
                        <Minus className="h-3.5 w-3.5" /> Withdraw flour
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerTrash(false)
                        setLedgerCustomer(customer)
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-wheat-300 bg-wheat-50 px-3 py-2 text-xs font-semibold text-mill-800 hover:bg-wheat-100"
                    >
                      <History className="h-3.5 w-3.5" /> View history ledger
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(customer)
                          setFormOpen(true)
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-wheat-100 px-3 py-1.5 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ kind: 'customer', item: customer })}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      <CustomerFormModal
        open={formOpen}
        customer={editingCustomer}
        busy={saving}
        onClose={() => {
          setFormOpen(false)
          setEditingCustomer(null)
        }}
        onSubmit={handleSaveCustomer}
      />

      <TransactionModal
        open={txModal.open}
        customer={txModal.customer}
        type={txModal.type}
        busy={saving}
        onClose={() => setTxModal({ open: false, customer: null, type: TX_DEPOSIT })}
        onSubmit={handleSaveTransaction}
      />

      <CustomerLedgerModal
        open={Boolean(ledgerCustomer)}
        customer={liveLedgerCustomer}
        transactions={transactions}
        showTrash={ledgerTrash}
        onToggleTrash={() => setLedgerTrash((value) => !value)}
        onClose={() => setLedgerCustomer(null)}
        onDelete={(tx) => setPendingDelete({ kind: 'transaction', item: tx })}
        onRestore={handleRestoreTransaction}
        onPermanentDelete={(tx) => setPendingPermanentDelete({ kind: 'transaction', item: tx })}
      />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message={
          pendingDelete?.kind === 'customer'
            ? 'This customer will be hidden. Ledger transactions stay saved and stock will still recalculate from active rows if you restore them later.'
            : 'This transaction will be hidden and the customer wheat balance will be recalculated from remaining active entries.'
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