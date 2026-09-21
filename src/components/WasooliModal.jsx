import { useEffect, useState } from 'react'
import Field from './Field'
import { formatPkr } from '../lib/calculations'
import {
  emptyWasooliForm,
  PAY_CASH,
  PAY_ONLINE,
  TX_WASOOLI,
} from '../lib/customerLedger'

export default function WasooliModal({
  open,
  customer,
  type = TX_WASOOLI,
  busy,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(emptyWasooliForm(type))
  const isWasooli = type === TX_WASOOLI

  useEffect(() => {
    if (!open) return
    setForm(emptyWasooliForm(type))
  }, [open, type])

  if (!open || !customer) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({
      type,
      date: form.date,
      amount: form.amount,
      paymentMethod: form.paymentMethod || PAY_CASH,
      note: form.note,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="wasooli-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <p
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            isWasooli ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {isWasooli ? 'Wasooli / payment received' : 'Udhaar entry'}
        </p>
        <h2 id="wasooli-form-title" className="mt-3 font-display text-2xl text-mill-900">
          {isWasooli ? 'Receive payment' : 'Add udhaar'}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {customer.name} · current udhaar{' '}
          <strong>{formatPkr(customer.udhaarBalance)}</strong>
        </p>

        <div className="mt-5 grid gap-4">
          <Field
            id="wasooli-date"
            type="date"
            label="Date"
            value={form.date}
            onChange={(value) => updateField('date', value)}
          />
          <Field
            id="wasooli-amount"
            label="Amount (PKR)"
            hint={
              isWasooli
                ? 'Cash or online amount collected against this customer’s udhaar.'
                : 'Extra credit added to this customer’s udhaar balance.'
            }
            value={form.amount}
            onChange={(value) => updateField('amount', value)}
            placeholder="e.g. 2500"
            required
          />
          <label className="block" htmlFor="wasooli-method">
            <span className="mb-1.5 block text-sm font-medium text-stone-700">
              Payment method
            </span>
            <select
              id="wasooli-method"
              value={form.paymentMethod}
              onChange={(event) => updateField('paymentMethod', event.target.value)}
              className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm text-mill-900 outline-none ring-wheat-400 transition focus:border-wheat-400 focus:ring-2"
            >
              <option value={PAY_CASH}>Cash</option>
              <option value={PAY_ONLINE}>Online</option>
            </select>
          </label>
          <Field
            id="wasooli-note"
            type="textarea"
            label="Note / remarks"
            value={form.note}
            onChange={(value) => updateField('note', value)}
            placeholder="Optional details"
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
            disabled={busy}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              isWasooli ? 'bg-sky-700 hover:bg-sky-800' : 'bg-amber-700 hover:bg-amber-800'
            }`}
          >
            {busy ? 'Saving…' : isWasooli ? 'Save wasooli' : 'Save udhaar'}
          </button>
        </div>
      </form>
    </div>
  )
}
