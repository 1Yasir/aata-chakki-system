import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import {
  Banknote,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  History,
  Pencil,
  Phone,
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
  hardDeleteEntry,
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

function calculateEmployeeMetrics(startDateString, baseSalary = 0, netAdvancePkr = 0) {
  if (!startDateString) {
    return {
      durationText: '0m 0d',
      totalEarnedSalary: 0,
      completeMonths: 0,
      extraDays: 0,
      netSettlement: 0,
      settlementType: 'BALANCED',
    }
  }

  const start = new Date(startDateString)
  const today = new Date()

  let years = today.getFullYear() - start.getFullYear()
  let months = today.getMonth() - start.getMonth()
  let days = today.getDate() - start.getDate()

  if (days < 0) {
    months -= 1
    const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
    days += prevMonthLastDay
  }

  if (months < 0) {
    years -= 1
    months += 12
  }

  const totalMonths = years * 12 + months
  const salary = Number(baseSalary) || 0

  const totalEarnedSalary = totalMonths * salary + (days / 30) * salary
  const advance = Number(netAdvancePkr) || 0
  const diff = totalEarnedSalary - advance

  let settlementType = 'BALANCED'
  if (diff > 0) {
    settlementType = 'EMPLOYEE_CREDIT'
  } else if (diff < 0) {
    settlementType = 'ADVANCE_EXCEEDED'
  }

  return {
    durationText: `${totalMonths} Months & ${days} Days`,
    totalEarnedSalary,
    completeMonths: totalMonths,
    extraDays: days,
    netSettlement: Math.abs(diff),
    settlementType,
  }
}

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
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState(null)
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

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete || !db) return
    setDeleting(true)
    try {
      if (pendingPermanentDelete.kind === 'employee') {
        await hardDeleteEntry(EMPLOYEES_COLLECTION, pendingPermanentDelete.item.id)
        if (ledgerEmployee?.id === pendingPermanentDelete.item.id) setLedgerEmployee(null)
        notify('Employee permanently deleted.')
      } else {
        await hardDeleteEntry(EMPLOYEE_TRANSACTIONS_COLLECTION, pendingPermanentDelete.item.id)
        notify('Transaction permanently deleted.')
      }
      setPendingPermanentDelete(null)
    } catch (error) {
      notify(error.message || 'Could not permanently delete.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-100/60 font-sans">
      <AdminHeader
        actions={
          <>
            <button
              type="button"
              onClick={exportEmployees}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
            >
              <Download className="h-3.5 w-3.5 text-stone-500" />
              Backup CSV
            </button>
            <button
              type="button"
              onClick={() => setShowTrash(!showTrash)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                showTrash
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {showTrash ? 'View Active Employees' : 'Recycle Bin'}
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

        {/* Top Header Card */}
        <section className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-stone-900">Employees Portal</h1>
              <p className="mt-1 text-sm text-stone-500">
                Manage worker advances, flour distribution, and automated salary settlements.
              </p>
            </div>
            {!showTrash ? (
              <button
                type="button"
                onClick={() => {
                  setEditingEmployee(null)
                  setFormOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 transition shadow-sm"
              >
                <UserPlus className="h-4 w-4" />
                Add Employee
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-500">Active Employees</p>
                <p className="font-display text-xl font-bold text-stone-900">{summary.count}</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-800 text-amber-100">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-800">Total Market Advance</p>
                <p className="font-display text-xl font-bold text-amber-950">{formatPkr(summary.totalAdvance)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-800 text-sky-100">
                <Wheat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-sky-800">Flour Distributed</p>
                <p className="font-display text-xl font-bold text-sky-950">
                  {formatNumber(summary.flourMaunds, 1)} mnd
                  <span className="ml-1 text-xs font-normal text-sky-700">({formatNumber(summary.flourKg)} kg)</span>
                </p>
              </div>
            </div>
          </div>

          <label className="relative mt-6 block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by employee name or phone number..."
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-200 transition"
            />
          </label>
        </section>

        {/* Employee Cards Grid */}
        {visibleEmployees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center text-stone-500">
            {showTrash ? 'Recycle Bin is empty.' : 'No employees found. Add a new employee to get started.'}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleEmployees.map((employee) => {
              const startDate = employee.startDate || '2026-04-17'
              const metrics = calculateEmployeeMetrics(startDate, employee.baseSalary, employee.netBalancePkr)
              const driveFolderUrl = employee.driveLink || 'https://drive.google.com/drive/folders/1MKRFTs0iLpzB5bZADS_37mgQcBdj7cB2'

              return (
                <article
                  key={employee.id}
                  className="group flex flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div>
                    {/* Header: Employee Profile Info */}
                    <div className="flex items-start justify-between border-b border-stone-100 pb-4">
                      <div>
                        <h2 className="font-display text-2xl font-bold text-stone-900 group-hover:text-amber-800 transition">
                          {employee.name}
                        </h2>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                          <Phone className="h-3 w-3 text-stone-400" />
                          <span>{employee.phone || 'No phone number'}</span>
                        </div>
                      </div>
                      <div className="rounded-xl bg-stone-100 px-3 py-1.5 text-right">
                        <span className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Salary</span>
                        <span className="font-display text-sm font-bold text-stone-800">{formatPkr(employee.baseSalary)}</span>
                      </div>
                    </div>

                    {/* Metadata Badges */}
                    <div className="mt-3.5 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1 text-stone-600 border border-stone-100">
                        <Calendar className="h-3 w-3 text-stone-400" />
                        Start: <strong className="text-stone-800">{startDate}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1 text-stone-600 border border-stone-100">
                        <Clock className="h-3 w-3 text-stone-400" />
                        <strong className="text-stone-800">{metrics.durationText}</strong>
                      </span>
                    </div>

                    {/* Financial Metrics 2x2 Clean Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      {/* Net Advance Box */}
                      <div className="rounded-2xl bg-amber-950 p-3 text-amber-50 flex flex-col justify-between shadow-sm">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Net Advance</span>
                        <span className="font-display text-base font-bold mt-1">{formatPkr(employee.netBalancePkr)}</span>
                      </div>

                      {/* Total Earned Box */}
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950 flex flex-col justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Total Earned</span>
                        <span className="font-display text-base font-bold text-emerald-900 mt-1">{formatPkr(metrics.totalEarnedSalary)}</span>
                      </div>

                      {/* Settlement Box (Spans full width for clarity) */}
                      <div className="col-span-2">
                        {metrics.settlementType === 'EMPLOYEE_CREDIT' ? (
                          <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-blue-950 shadow-sm">
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-700">
                                Mulazim Ki Jama Tankhwah
                              </span>
                              <span className="text-[10px] text-blue-600">Malik ke zimme baqi</span>
                            </div>
                            <span className="font-display text-lg font-extrabold text-blue-900">
                              {formatPkr(metrics.netSettlement)}
                            </span>
                          </div>
                        ) : metrics.settlementType === 'ADVANCE_EXCEEDED' ? (
                          <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-rose-950 shadow-sm">
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">
                                Advance Exceeded
                              </span>
                              <span className="text-[10px] text-rose-600">Malik ka ziada advance</span>
                            </div>
                            <span className="font-display text-lg font-extrabold text-rose-900">
                              {formatPkr(metrics.netSettlement)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-stone-700">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Hisab Barabar</span>
                            <span className="font-display text-sm font-bold text-stone-800">Rs 0</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Area */}
                  {showTrash ? (
                    <div className="mt-5 grid grid-cols-2 gap-2 border-t border-stone-100 pt-4">
                      <button
                        type="button"
                        onClick={() => restoreEntry(EMPLOYEES_COLLECTION, employee.id).then(() => notify('Employee restored.'))}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingPermanentDelete({ kind: 'employee', item: employee })}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-2 border-t border-stone-100 pt-4">
                      {/* Main Transaction Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTxModal({ open: true, employee, type: EMP_CASH_ADVANCE })}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-900 transition shadow-sm"
                        >
                          <Banknote className="h-3.5 w-3.5" /> + Advance
                        </button>
                        <button
                          type="button"
                          onClick={() => setTxModal({ open: true, employee, type: EMP_FLOUR_TAKEN })}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-900 transition shadow-sm"
                        >
                          <Wheat className="h-3.5 w-3.5" /> + Aata Taken
                        </button>
                      </div>

                      {/* <button
                        type="button"
                        onClick={() => setTxModal({ open: true, employee, type: EMP_SALARY_CREDIT })}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 transition shadow-sm"
                      >
                        + Record Salary / Tankhwah
                      </button> */}

                      {/* Secondary Quick Action Bar */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerTrash(false)
                            setLedgerEmployee(employee)
                          }}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition"
                          title="View Ledger Khata"
                        >
                          <History className="h-3.5 w-3.5" /> Khata
                        </button>

                        <a
                          href={driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50/70 px-2 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 transition"
                          title="View Google Drive Register Proofs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Drive
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingEmployee(employee)
                            setFormOpen(true)
                          }}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition"
                          title="Edit Employee Info"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => setPendingDelete({ kind: 'employee', item: employee })}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-100 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition"
                          title="Soft Delete Employee"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
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
        onPermanentDelete={(tx) => setPendingPermanentDelete({ kind: 'transaction', item: tx })}
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
      <ConfirmModal
        open={Boolean(pendingPermanentDelete)}
        title="Delete Permanently?"
        message={
          pendingPermanentDelete?.kind === 'employee'
            ? 'This employee and all their transactions will be permanently deleted. This action cannot be undone.'
            : 'This transaction will be permanently deleted. This action cannot be undone.'
        }
        onCancel={() => setPendingPermanentDelete(null)}
        onConfirm={handlePermanentDelete}
        busy={deleting}
      />
    </div>
  )
}