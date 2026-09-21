import { RotateCcw, Trash2, X } from 'lucide-react'
import { formatNumber, formatPkr } from '../lib/calculations'
import {
  buildEmployeeRunningLedger,
  computeEmployeeLedger,
  EMP_CASH_ADVANCE,
  EMP_FLOUR_TAKEN,
  EMP_SALARY_CREDIT,
} from '../lib/employees'

const LABELS = {
  [EMP_CASH_ADVANCE]: 'Cash advance',
  [EMP_FLOUR_TAKEN]: 'Flour taken',
  [EMP_SALARY_CREDIT]: 'Salary credit',
}

export default function EmployeeLedgerModal({
  open,
  employee,
  transactions,
  showTrash,
  onToggleTrash,
  onClose,
  onDelete,
  onRestore,
  onPermanentDelete,
}) {
  if (!open || !employee) return null

  const totals = computeEmployeeLedger(employee.initialBalancePkr, transactions)
  const rows = buildEmployeeRunningLedger(employee.initialBalancePkr, transactions, showTrash).filter(
    (tx) => Boolean(tx.isDeleted) === showTrash,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emp-ledger-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-wheat-100 px-6 py-4">
          <div>
            <h2 id="emp-ledger-title" className="font-display text-2xl text-mill-900">
              {employee.name} · khata
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Advance {formatPkr(totals.netBalancePkr)}
              <span className="mx-2 text-wheat-300">·</span>
              Flour {formatNumber(totals.totalFlourMaunds, 1)} mnd ({formatNumber(totals.totalFlourKg)} kg)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTrash}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                showTrash
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {showTrash ? 'View active khata' : 'Recycle Bin'}
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-stone-400 hover:bg-stone-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-wheat-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Flour</th>
                <th className="px-4 py-3 font-semibold">Note</th>
                <th className="px-4 py-3 font-semibold">Running balance</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                    {showTrash ? 'No deleted khata entries.' : 'No employee transactions yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((tx) => (
                  <tr key={tx.id} className="border-t border-wheat-100">
                    <td className="whitespace-nowrap px-4 py-3">{tx.date}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-wheat-100 px-2.5 py-1 text-xs font-semibold text-mill-800">
                        {LABELS[tx.type] || tx.type}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 font-semibold ${tx.delta >= 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                      {tx.delta >= 0 ? '+' : '−'}
                      {formatPkr(Math.abs(tx.delta))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {tx.type === EMP_FLOUR_TAKEN
                        ? `${formatNumber((tx.weightKg || 0) / 40, 1)} mnd (${formatNumber(tx.weightKg)} kg)`
                        : '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-stone-500">{tx.note || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatPkr(tx.runningBalance)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {showTrash ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => onRestore(tx)}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          {onPermanentDelete && (
                            <button
                              type="button"
                              onClick={() => onPermanentDelete(tx)}
                              className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-200"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDelete(tx)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
