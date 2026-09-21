import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import {
  Banknote,
  Download,
  History,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Wheat,
} from 'lucide-react'
import AdminHeader from '../components/AdminHeader'
import ConfirmModal from '../components/ConfirmModal'
import EmployeeFormModal from '../components/EmployeeFormModal'
import EmployeeLedgerModal from '../components/EmployeeLedgerModal'
import EmployeeTxModal from '../components/EmployeeTxModal'
import { useToast } from '../context/ToastContext'
import {
  addEmployee,
  addEmployeeTransaction,
  db,
  EMPLOYEE_TRANSACTIONS_COLLECTION,
  EMPLOYEES_COLLECTION,
  exportDataToCSV,
  fetchCollectionDocs,
  isFirebaseConfigured,
  restoreEmployeeTransaction,
  restoreEntry,
  serializeCsvValue,
  softDeleteEmployeeTransaction,
  softDeleteEntry,
  updateEmployee,
} from '../firebase'
import { formatNumber, formatPkr } from '../lib/calculations'
import {
  EMP_CASH_ADVANCE,
  EMP_FLOUR_TAKEN,
  EMP_SALARY_CREDIT,
  sortEmployeesByName,
} from '../lib/employees'

export default function EmployeesPage() {
  const { notify } = useToast()
  const [employees, setEmployees] = useState([])
  const [allTransactions, setAllTransactions] = useState([])
  const [ledgerTx, setLedgerTx] = useState([])
  const [showTrash, setShowTrash] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [txModal, setTxModal] = useState({ open: false, employee: null, type: EMP_CASH_ADVANCE })
  const [ledgerEmployee, setLedgerEmployee] = useState(null)
  const [ledgerTrash, setLedgerTrash] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!db) return undefined
    const employeesQuery = query(collection(db, EMPLOYEES_COLLECTION), where('isDeleted', '==', showTrash))
    const unsubscribe = onSnapshot(
      employeesQuery,
      (snapshot) => setEmployees(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => notify(error.message || 'Could not load employees.', 'error'),
    )
    return unsubscribe
  }, [notify, showTrash])

  useEffect(() => {
    if (!db) return undefined
    const txQuery = query(
      collection(db, EMPLOYEE_TRANSACTIONS_COLLECTION),
      where('isDeleted', '==', false),
    )
    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => setAllTransactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setAllTransactions([]),
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!db || !ledgerEmployee) {
      setLedgerTx([])
      return undefined
    }
    const txQuery = query(
      collection(db, EMPLOYEE_TRANSACTIONS_COLLECTION),
      where('employeeId', '==', ledgerEmployee.id),
    )
    const unsubscribe = onSnapshot(
      txQuery,
      (snapshot) => setLedgerTx(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => notify(error.message || 'Could not load employee khata.', 'error'),
    )
    return unsubscribe
  }, [ledgerEmployee, notify])

  const visibleEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = needle
      ? employees.filter(
          (employee) =>
            String(employee.name || '').toLowerCase().includes(needle) ||
            String(employee.phone || '').includes(needle),
        )
      : employees
    return sortEmployeesByName(filtered)
  }, [employees, search])

  const summary = useMemo(() => {
    const totalAdvance = visibleEmployees.reduce((sum, employee) => sum + Number(employee.netBalancePkr || 0), 0)
    const flourKg = allTransactions
      .filter((tx) => tx.type === EMP_FLOUR_TAKEN && visibleEmployees.some((employee) => employee.id === tx.employeeId))
      .reduce((sum, tx) => sum + Number(tx.weightKg || 0), 0)
    return {
      count: visibleEmployees.length,
      totalAdvance,
      flourKg,
      flourMaunds: flourKg / 40,
    }
  }, [allTransactions, visibleEmployees])

  const liveLedgerEmployee =
    employees.find((employee) => employee.id === ledgerEmployee?.id) || ledgerEmployee

  async function handleSaveEmployee(form) {
    setSaving(true)
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, form)
        notify('Employee updated.')
      } else {
        await addEmployee(form)
        notify('Employee added.')
      }
      setFormOpen(false)
      setEditingEmployee(null)
    } catch (error) {
      notify(error.message || 'Could not save employee.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveTransaction(form) {
    if (!txModal.employee) return
    setSaving(true)
    try {
      await addEmployeeTransaction({
        employeeId: txModal.employee.id,
        ...form,
      })
      notify('Employee transaction saved.')
      setTxModal({ open: false, employee: null, type: EMP_CASH_ADVANCE })
    } catch (error) {
      notify(error.message || 'Could not save transaction.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === 'employee') {
        await softDeleteEntry(EMPLOYEES_COLLECTION, pendingDelete.item.id)
        if (ledgerEmployee?.id === pendingDelete.item.id) setLedgerEmployee(null)
        notify('Employee moved to Recycle Bin.')
      } else {
        await softDeleteEmployeeTransaction(pendingDelete.item.id)
        notify('Transaction moved to Recycle Bin.')
      }
      setPendingDelete(null)
    } catch (error) {
      notify(error.message || 'Could not delete.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function exportEmployees() {
    try {
      exportDataToCSV(
        visibleEmployees.map((employee) => ({
          id: employee.id,
          name: employee.name,
          phone: employee.phone,
          baseSalary: employee.baseSalary,
          salaryType: employee.salaryType,
          initialBalancePkr: employee.initialBalancePkr,
          netBalancePkr: employee.netBalancePkr,
          isDeleted: employee.isDeleted,
          createdAt: serializeCsvValue(employee.createdAt),
        })),
        'employees.csv',
      )
      const txs = await fetchCollectionDocs(EMPLOYEE_TRANSACTIONS_COLLECTION)
      exportDataToCSV(
        txs.map((tx) => ({
          id: tx.id,
          employeeId: tx.employeeId,
          type: tx.type,
          date: tx.date,
          amountPkr: tx.amountPkr,
          weightKg: tx.weightKg,
          ratePerKg: tx.ratePerKg,
          note: tx.note,
          isDeleted: tx.isDeleted,
          createdAt: serializeCsvValue(tx.createdAt),
        })),
        'employee_transactions.csv',
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
              onClick={exportEmployees}
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
              {showTrash ? 'View active employees' : 'Recycle Bin'}
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {!isFirebaseConfigured ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Firebase is not configured. Employee khata needs your `.env` keys.
          </p>
        ) : null}

        {showTrash ? (
          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <span>Viewing deleted employees. Restore to record advance and flour again.</span>
            <button type="button" onClick={() => setShowTrash(false)} className="font-bold underline">
              Back to employees
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl text-mill-900">Employees</h1>
              <p className="mt-1 text-sm text-stone-500">
                Mulazim advance, aata khata, and tankhwah settlement.
              </p>
            </div>
            {!showTrash ? (
              <button
                type="button"
                onClick={() => {
                  setEditingEmployee(null)
                  setFormOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-full bg-mill-800 px-5 py-2.5 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
              >
                <UserPlus className="h-4 w-4" />
                Add employee
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-wheat-200 bg-wheat-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mill-800 text-wheat-100">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500">Active employees</p>
                <p className="font-display text-xl font-bold text-mill-900">{summary.count}</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-800 text-amber-100">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-800">Kul mulazim advance</p>
                <p className="font-display text-xl font-bold text-amber-950">{formatPkr(summary.totalAdvance)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-800 text-sky-100">
                <Wheat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-sky-800">Flour distributed</p>
                <p className="font-display text-xl font-bold text-sky-950">
                  {formatNumber(summary.flourMaunds, 1)} mnd
                  <span className="ml-1 text-xs font-normal text-sky-700">({formatNumber(summary.flourKg)} kg)</span>
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

        {visibleEmployees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-wheat-300 bg-white px-6 py-16 text-center text-stone-500">
            {showTrash ? 'Recycle Bin is empty.' : 'No employees yet. Add a mulazim to start their khata.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleEmployees.map((employee) => (
              <article key={employee.id} className="flex flex-col rounded-3xl border border-wheat-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl text-mill-900">{employee.name}</h2>
                    <p className="text-sm text-stone-500">{employee.phone || 'No phone on file'}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {employee.salaryType === 'DAILY' ? 'Daily' : 'Monthly'} salary {formatPkr(employee.baseSalary)}
                    </p>
                  </div>
                  <p className="rounded-2xl bg-amber-950 px-3 py-2 text-right text-amber-50">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      Net advance
                    </span>
                    <span className="font-display text-xl">{formatPkr(employee.netBalancePkr)}</span>
                  </p>
                </div>

                {showTrash ? (
                  <button
                    type="button"
                    onClick={() => restoreEntry(EMPLOYEES_COLLECTION, employee.id).then(() => notify('Employee restored.'))}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200"
                  >
                    <RotateCcw className="h-4 w-4" /> Restore employee
                  </button>
                ) : (
                  <div className="mt-4 grid gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTxModal({ open: true, employee, type: EMP_CASH_ADVANCE })}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Cash advance
                      </button>
                      <button
                        type="button"
                        onClick={() => setTxModal({ open: true, employee, type: EMP_FLOUR_TAKEN })}
                        className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"
                      >
                        <Wheat className="h-3.5 w-3.5" /> Aata taken
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTxModal({ open: true, employee, type: EMP_SALARY_CREDIT })}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      Salary / tankhwah
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerTrash(false)
                        setLedgerEmployee(employee)
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-wheat-300 bg-wheat-50 px-3 py-2 text-xs font-semibold text-mill-800 hover:bg-wheat-100"
                    >
                      <History className="h-3.5 w-3.5" /> View khata
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEmployee(employee)
                          setFormOpen(true)
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-wheat-100 px-3 py-1.5 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ kind: 'employee', item: employee })}
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

      <EmployeeFormModal
        open={formOpen}
        employee={editingEmployee}
        busy={saving}
        onClose={() => {
          setFormOpen(false)
          setEditingEmployee(null)
        }}
        onSubmit={handleSaveEmployee}
      />
      <EmployeeTxModal
        open={txModal.open}
        employee={txModal.employee}
        type={txModal.type}
        busy={saving}
        onClose={() => setTxModal({ open: false, employee: null, type: EMP_CASH_ADVANCE })}
        onSubmit={handleSaveTransaction}
      />
      <EmployeeLedgerModal
        open={Boolean(ledgerEmployee)}
        employee={liveLedgerEmployee}
        transactions={ledgerTx}
        showTrash={ledgerTrash}
        onToggleTrash={() => setLedgerTrash((value) => !value)}
        onClose={() => setLedgerEmployee(null)}
        onDelete={(tx) => setPendingDelete({ kind: 'transaction', item: tx })}
        onRestore={(tx) =>
          restoreEmployeeTransaction(tx.id)
            .then(() => notify('Transaction restored.'))
            .catch((error) => notify(error.message || 'Could not restore.', 'error'))
        }
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Move to Recycle Bin?"
        message={
          pendingDelete?.kind === 'employee'
            ? 'This employee will be hidden. Khata rows stay saved and can be restored later.'
            : 'This khata entry will be hidden and the advance balance will be recalculated.'
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
      />
    </div>
  )
}
