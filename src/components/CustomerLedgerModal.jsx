import { RotateCcw, Trash2, X } from 'lucide-react'
import { formatNumber, formatPkr } from '../lib/calculations'
import { computeCustomerLedger, sortTransactionsByDate, TX_DEPOSIT } from '../lib/customerLedger'

function formatMaundsFromKg(kg = 0) {
  const maunds = (Number(kg) || 0) / 40
  return `${formatNumber(maunds, 1)} mnd`
}

export default function CustomerLedgerModal({
  open,
  customer,
  transactions,
  showTrash,
  onToggleTrash,
  onClose,
  onDelete,
  onRestore,
}) {
  if (!open || !customer) return null

  const visible = sortTransactionsByDate(
    transactions.filter(
      (tx) =>
        Boolean(tx.isDeleted) === showTrash &&
        (tx.type === TX_DEPOSIT || tx.type === 'WITHDRAWAL'),
    ),
  )
  const totals = computeCustomerLedger(customer.initialStockKg, transactions)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-wheat-100 px-6 py-4">
          <div>
            <h2 id="ledger-title" className="font-display text-2xl text-mill-900">
              {customer.name} · wheat ledger
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Opening {formatMaundsFromKg(customer.initialStockKg)} ({formatNumber(customer.initialStockKg)} kg) · current{' '}
              <strong className="text-mill-900">
                {formatMaundsFromKg(totals.currentStockKg)} ({formatNumber(totals.currentStockKg)} kg)
              </strong>
              <span className="mx-2 text-wheat-300">·</span>
              Pisai udhaar {formatPkr(totals.udhaarBalance)}
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
              {showTrash ? 'View active ledger' : 'Recycle Bin'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Close ledger"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {showTrash ? (
          <div className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-800">
            Showing deleted wheat transactions. Restore one to include it in stock again.
          </div>
        ) : null}

        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-wheat-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Weight (Mann)</th>
                <th className="px-4 py-3 font-semibold">Pisai fee</th>
                <th className="px-4 py-3 font-semibold">Collection</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                    {showTrash
                      ? 'No deleted transactions for this customer.'
                      : 'No deposits or withdrawals yet.'}
                  </td>
                </tr>
              ) : (
                visible.map((tx) => {
                  const isDeposit = tx.type === TX_DEPOSIT
                  return (
                    <tr key={tx.id} className="border-t border-wheat-100">
                      <td className="whitespace-nowrap px-4 py-3 text-mill-900">{tx.date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isDeposit ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {isDeposit ? 'Deposit' : 'Withdrawal'}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 font-semibold ${
                          isDeposit ? 'text-emerald-700' : 'text-amber-800'
                        }`}
                      >
                        {isDeposit ? '+' : '−'}
                        {formatMaundsFromKg(tx.weightKg)}
                        <span className="ml-1 text-xs font-normal text-stone-500">
                          ({formatNumber(tx.weightKg)} kg)
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {isDeposit ? '—' : formatPkr(tx.millingFee)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                        {isDeposit ? '—' : tx.feePayment === 'UDHAAR' ? 'Pisai udhaar' : 'Cash'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {showTrash ? (
                          <button
                            type="button"
                            onClick={() => onRestore(tx)}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
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
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
