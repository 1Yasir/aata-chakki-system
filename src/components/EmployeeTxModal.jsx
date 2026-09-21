import { useEffect, useMemo, useState } from 'react'
import Field from './Field'
import { formatNumber, formatPkr } from '../lib/calculations'
import {
  EMP_CASH_ADVANCE,
  EMP_FLOUR_TAKEN,
  EMP_SALARY_CREDIT,
  emptyEmployeeTxForm,
  MAUND_KG,
} from '../lib/employees'

const TITLES = {
  [EMP_CASH_ADVANCE]: { badge: 'Naqad advance', title: 'Cash advance given', className: 'bg-amber-100 text-amber-900' },
  [EMP_FLOUR_TAKEN]: { badge: 'Aata / rashan', title: 'Flour taken', className: 'bg-sky-100 text-sky-800' },
  [EMP_SALARY_CREDIT]: { badge: 'Tankhwah', title: 'Salary settlement', className: 'bg-emerald-100 text-emerald-800' },
}

export default function EmployeeTxModal({ open, employee, type = EMP_CASH_ADVANCE, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyEmployeeTxForm(type))
  const meta = TITLES[type] || TITLES[EMP_CASH_ADVANCE]

  useEffect(() => {
    if (!open) return
    const next = emptyEmployeeTxForm(type)
    if (type === EMP_SALARY_CREDIT && employee?.baseSalary) {
      next.amountPkr = employee.baseSalary
    }
    setForm(next)
  }, [open, type, employee])

  const flourPreview = useMemo(() => {
    const weight = Number(form.weightMaunds) || 0
    const rate = Number(form.ratePerMaund) || 0
    return {
      kg: weight * MAUND_KG,
      total: weight * rate,
    }
  }, [form.weightMaunds, form.ratePerMaund])

  if (!open || !employee) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({ ...form, type })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="emp-tx-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>{meta.badge}</p>
        <h2 id="emp-tx-title" className="mt-3 font-display text-2xl text-mill-900">
          {meta.title}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {employee.name} · current advance <strong>{formatPkr(employee.netBalancePkr)}</strong>
        </p>

        <div className="mt-5 grid gap-4">
          <Field id="emp-tx-date" type="date" label="Date" value={form.date} onChange={(value) => updateField('date', value)} />
          {type === EMP_FLOUR_TAKEN ? (
            <>
              <Field
                id="emp-flour-weight"
                label="Weight (Maunds / Mann)"
                hint="Converted to kg in Firebase (1 maund = 40 kg)."
                value={form.weightMaunds}
                onChange={(value) => updateField('weightMaunds', value)}
                required
              />
              <Field
                id="emp-flour-rate"
                label="Rate per maund (PKR)"
                hint="Total flour value = weight × rate, then added to advance."
                value={form.ratePerMaund}
                onChange={(value) => updateField('ratePerMaund', value)}
                required
              />
              <p className="rounded-2xl bg-wheat-50 px-3 py-2 text-sm text-stone-600">
                {formatNumber(flourPreview.kg)} kg · total value <strong>{formatPkr(flourPreview.total)}</strong>
              </p>
            </>
          ) : (
            <Field
              id="emp-tx-amount"
              label={type === EMP_SALARY_CREDIT ? 'Salary credited (PKR)' : 'Advance amount (PKR)'}
              value={form.amountPkr}
              onChange={(value) => updateField('amountPkr', value)}
              required
            />
          )}
          <Field
            id="emp-tx-note"
            type="textarea"
            label="Note"
            value={form.note}
            onChange={(value) => updateField('note', value)}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-mill-800 px-5 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </form>
    </div>
  )
}
