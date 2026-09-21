import { useEffect, useState } from 'react'
import Field from './Field'
import { formatPkr } from '../lib/calculations'
import { emptyGeneralWasooliForm } from '../lib/generalUdhaar'

export default function UdhaarWasooliModal({ open, customer, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyGeneralWasooliForm())

  useEffect(() => {
    if (!open) return
    setForm(emptyGeneralWasooliForm())
  }, [open])

  if (!open || !customer) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({
      date: form.date,
      amount: form.amount,
      note: form.note,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="udhaar-wasooli-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <p className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
          Wasooli / payment received
        </p>
        <h2 id="udhaar-wasooli-form-title" className="mt-3 font-display text-2xl text-mill-900">
          Receive Payment
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {customer.name} · current udhaar balance{' '}
          <strong>{formatPkr(customer.netUdhaarBalance)}</strong>
        </p>

        <div className="mt-5 grid gap-4">
          <Field
            id="udhaar-wasooli-date"
            type="date"
            label="Date"
            value={form.date}
            onChange={(value) => updateField('date', value)}
          />
          <Field
            id="udhaar-wasooli-amount"
            type="number"
            label="Payment Amount (PKR)"
            hint="Cash amount collected against this customer's udhaar balance."
            value={form.amount}
            onChange={(value) => updateField('amount', value)}
            placeholder="e.g. 2500"
            required
          />
          <Field
            id="udhaar-wasooli-note"
            type="text"
            label="Note / remarks (optional)"
            hint="Any additional details about this payment."
            value={form.note}
            onChange={(value) => updateField('note', value)}
            placeholder="e.g. Partial payment for flour"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.amount}
            className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </form>
    </div>
  )
}
