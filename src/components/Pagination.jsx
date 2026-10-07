import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalEntries,
  onPageChange,
  onPageSizeChange,
}) {
  const safePage = Math.min(currentPage, totalPages || 1)
  const startIndex = totalEntries === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, totalEntries)

  const pageNumbers = useMemo(() => {
    const pages = []
    const maxVisible = 5

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      if (safePage > 3) {
        pages.push('...')
      }

      let start = Math.max(2, safePage - 1)
      let end = Math.min(totalPages - 1, safePage + 1)

      if (safePage <= 3) {
        end = Math.min(totalPages - 1, maxVisible)
      } else if (safePage >= totalPages - 2) {
        start = Math.max(2, totalPages - maxVisible + 1)
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (safePage < totalPages - 2) {
        pages.push('...')
      }
      pages.push(totalPages)
    }

    return pages
  }, [totalPages, safePage])

  if (totalPages <= 1 && totalEntries <= pageSize) return null

  return (
    <div className="border-t border-wheat-100 px-5 py-3.5 flex flex-wrap justify-between items-center gap-3 bg-wheat-50/50 text-xs text-stone-600">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium text-stone-700">
          {totalEntries > 0 ? `${startIndex}-${endIndex} from ${totalEntries} entries` : '0 entries'}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => onPageChange(Math.max(safePage - 1, 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {pageNumbers.map((page, index) =>
              page === '...' ? (
                <span key={`dots-${index}`} className="px-2 text-stone-400 font-bold">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${page}`}
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={`h-7 min-w-[28px] px-2 rounded-lg font-semibold transition ${
                    safePage === page
                      ? 'bg-mill-800 text-wheat-50 shadow-sm'
                      : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => onPageChange(Math.min(safePage + 1, totalPages))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-30 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium text-stone-600">Show:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 outline-none focus:border-mill-800"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
          <option value={5}>5</option>
          <option value={6}>6</option>
          <option value={7}>7</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </div>
  )
}