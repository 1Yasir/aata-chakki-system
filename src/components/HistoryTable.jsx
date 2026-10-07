import { useState, useMemo } from 'react'
import { formatNumber, formatPkr, getTotalExpenses, sumEntries } from '../lib/calculations'
import { Pencil, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import Pagination from './Pagination'

const columns = [
  { key: 'date', label: 'Date', format: (row) => row.date },
  { key: 'custMaunds', label: 'Cust. mnd' },
  { key: 'peenMaunds', label: 'Peen mnd' },
  { key: 'ownMaundsGround', label: 'Own mnd' },
  { key: 'totalUnits', label: 'Units' },
  { key: 'kardaSaved', label: 'Karda kg', format: (row) => formatNumber(row.kardaSaved) },
  { key: 'electricityCost', label: 'Electricity', money: true },
  { key: 'grossIncome', label: 'Gross', money: true },
  { key: 'otherExpenses', label: 'Other exp.', money: true },
  { key: 'totalExpenses', label: 'Total exp.', format: (row) => formatPkr(getTotalExpenses(row)) },
  { key: 'netProfit', label: 'Net', money: true },
  { key: 'udhaarGiven', label: 'Udhaar +', money: true },
  { key: 'udhaarRecovered', label: 'Recovered', money: true },
]

function cellValue(column, row) {
  if (column.format) return column.format(row)
  if (column.money) return formatPkr(row[column.key])
  return formatNumber(row[column.key])
}

export default function HistoryTable({ entries, onEdit, onDelete, onRestore, isTrashView }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(7)

  const totalPages = Math.ceil(entries.length / pageSize) || 1

  const safePage = Math.min(currentPage, totalPages)
  if (safePage !== currentPage && totalPages > 0) {
    setCurrentPage(safePage)
  }

  const paginatedEntries = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return entries.slice(start, start + pageSize)
  }, [entries, safePage, pageSize])

  const totals = sumEntries(entries)

  return (
    <section className="overflow-hidden rounded-3xl border border-wheat-200 bg-white shadow-sm">
      <div className="border-b border-wheat-100 px-5 py-4 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl text-mill-900">
            {isTrashView ? 'Recycle Bin (Deleted Logs)' : 'Daily history'}
          </h2>
          <p className="text-sm text-stone-500">
            {isTrashView
              ? 'Records here are soft-deleted. Click restore to add them back to active calculations.'
              : 'Newest first. Footer is a protected grand total across all saved days.'}
          </p>
        </div>

        {/* Top Header Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40 shadow-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40 shadow-sm"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-wheat-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntries.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-stone-500">
                  {isTrashView
                    ? 'Recycle Bin is empty. No deleted entries found.'
                    : 'No mill days saved yet. Add today’s batch to start the ledger.'}
                </td>
              </tr>
            ) : (
              paginatedEntries.map((entry) => (
                <tr key={entry.id} className="border-t border-wheat-100 hover:bg-wheat-50/60">
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-4 py-3 text-mill-900">
                      {cellValue(column, entry)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex gap-2">
                      {isTrashView ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onRestore(entry.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry)}
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(entry)}
                            className="inline-flex items-center gap-1 rounded-full bg-wheat-100 px-3 py-1 text-xs font-semibold text-mill-800 hover:bg-wheat-200"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry)}
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t-2 border-mill-800 bg-mill-800 text-wheat-50">
            <tr>
              <td className="px-4 py-3 font-semibold">
                {isTrashView ? 'Trash total' : 'Grand total'}
              </td>
              <td className="px-4 py-3">{formatNumber(totals.custMaunds)}</td>
              <td className="px-4 py-3">{formatNumber(totals.peenMaunds)}</td>
              <td className="px-4 py-3">{formatNumber(totals.ownMaundsGround)}</td>
              <td className="px-4 py-3">{formatNumber(totals.totalUnits)}</td>
              <td className="px-4 py-3">{formatNumber(totals.kardaSaved)}</td>
              <td className="px-4 py-3">{formatPkr(totals.electricityCost)}</td>
              <td className="px-4 py-3">{formatPkr(totals.grossIncome)}</td>
              <td className="px-4 py-3">{formatPkr(totals.otherExpenses)}</td>
              <td className="px-4 py-3 font-semibold">{formatPkr(totals.totalExpenses)}</td>
              <td className="px-4 py-3">{formatPkr(totals.netProfit)}</td>
              <td className="px-4 py-3">{formatPkr(totals.udhaarGiven)}</td>
              <td className="px-4 py-3">{formatPkr(totals.udhaarRecovered)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Reusable Pagination Component */}
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalEntries={entries.length}
        onPageChange={(page) => setCurrentPage(page)}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setCurrentPage(1)
        }}
      />
    </section>
  )
}