import { useEffect, useState } from 'react'
import Field from './Field'
import {
  emptyTransactionForm,
  FEE_CASH,
  FEE_UDHAAR,
  TX_DEPOSIT,
  TX_WITHDRAWAL,
} from '../lib/customerLedger'
import { formatNumber } from '../lib/calculations'

// Helper function to format KG to Maunds (Mann)
function formatMaundsFromKg(kg = 0) {
  const maunds = (Number(kg) || 0) / 40
  return `${formatNumber(maunds, 1)} mnd`
}

export default function TransactionModal({
  open,
  customer,
  type,
  onClose,
  onSubmit,
  busy,
  defaultMillingFee = '',
}) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    weightMaunds: '',
    millingFee: '',
    feePayment: FEE_CASH,
  })

  useEffect(() => {
    if (!open) return
    const defaults = emptyTransactionForm(type)
    setForm({
      date: defaults.date,
      weightMaunds: defaults.weightKg ? Number(defaults.weightKg) / 40 : '',
      millingFee: type === TX_WITHDRAWAL ? defaultMillingFee : '',
      feePayment: defaults.feePayment || FEE_CASH,
    })
  }, [open, type, defaultMillingFee])

  if (!open || !customer) return null

  const isDeposit = type === TX_DEPOSIT

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    // Convert input Maunds back to KG for database calculations (1 Maund = 40 KG)
    const weightMaunds = Number(form.weightMaunds) || 0
    const weightKg = weightMaunds * 40

    onSubmit({
      date: form.date,
      weightKg,
      millingFee: form.millingFee,
      feePayment: form.feePayment,
      type,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <p
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            isDeposit ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {isDeposit ? 'Deposit wheat' : 'Withdraw flour'}
        </p>
        <h2 id="tx-form-title" className="mt-3 font-display text-2xl text-mill-900">
          {isDeposit ? 'Gundam jama karwana' : 'Aata le jaana'}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {customer.name} · available stock{' '}
          <strong>
            {formatMaundsFromKg(customer.currentStockKg)} ({formatNumber(customer.currentStockKg)} kg)
          </strong>
        </p>

        <div className="mt-5 grid gap-4">
          <Field
            id="tx-date"
            type="date"
            label="Date"
            value={form.date}
            onChange={(value) => updateField('date', value)}
          />
          <Field
            id="tx-weight"
            label={isDeposit ? 'Wheat deposited (Maunds / Mann)' : 'Flour withdrawn (Maunds / Mann)'}
            hint={
              isDeposit
                ? 'Adds to this customer’s wheat stock balance (e.g. 2 for 2 Mann / 80 kg).'
                : 'Deducts from stored wheat when flour is taken (e.g. 1.5 for 1.5 Mann).'
            }
            value={form.weightMaunds}
            onChange={(value) => updateField('weightMaunds', value)}
            placeholder="e.g. 2"
            required
          />
          {!isDeposit ? (
            <>
              <Field
                id="tx-fee"
                label="Pisai / milling fee (PKR)"
                hint="Processing charge collected for this withdrawal."
                value={form.millingFee}
                onChange={(value) => updateField('millingFee', value)}
              />
              <label className="block" htmlFor="tx-fee-payment">
                <span className="mb-1.5 block text-sm font-medium text-stone-700">
                  Fee collection
                </span>
                <select
                  id="tx-fee-payment"
                  value={form.feePayment}
                  onChange={(event) => updateField('feePayment', event.target.value)}
                  className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm text-mill-900 outline-none ring-wheat-400 transition focus:border-wheat-400 focus:ring-2"
                >
                  <option value={FEE_CASH}>Cash collected</option>
                  <option value={FEE_UDHAAR}>Add to udhaar</option>
                </select>
              </label>
            </>
          ) : null}
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
              isDeposit ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-amber-700 hover:bg-amber-800'
            }`}
          >
            {busy ? 'Saving…' : isDeposit ? 'Save deposit' : 'Save withdrawal'}
          </button>
        </div>
      </form>
    </div>
  )
}