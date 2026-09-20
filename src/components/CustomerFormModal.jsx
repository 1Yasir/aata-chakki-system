import { useEffect, useState } from 'react'
import Field from './Field'
import { emptyCustomerForm } from '../lib/customerLedger'

export default function CustomerFormModal({ open, customer, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ name: '', phone: '', initialStockMaunds: '' })

  useEffect(() => {
    if (!open) return
    setForm(
      customer
        ? {
            name: customer.name || '',
            phone: customer.phone || '',
            // Convert existing KG to Maunds for form editing
            initialStockMaunds: customer.initialStockKg ? Number(customer.initialStockKg) / 40 : '',
          }
        : { name: '', phone: '', initialStockMaunds: '' },
    )
  }, [open, customer])

  if (!open) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    // Convert Maunds back to KG for backend storage (1 Maund = 40 KG)
    const maunds = Number(form.initialStockMaunds) || 0
    const initialStockKg = maunds * 40

    onSubmit({
      name: form.name,
      phone: form.phone,
      initialStockKg,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <h2 id="customer-form-title" className="font-display text-2xl text-mill-900">
          {customer ? 'Edit customer' : 'Add customer'}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Opening wheat is the starting Gundam balance (entered in Maunds/Mann). Current stock is recalculated from active deposits and withdrawals.
        </p>

        <div className="mt-5 grid gap-4">
          <Field
            id="customer-name"
            type="text"
            label="Customer name"
            hint="Person who stores wheat at the mill."
            value={form.name}
            onChange={(value) => updateField('name', value)}
            placeholder="e.g. Ahmed Khan"
            required
          />
          <Field
            id="customer-phone"
            type="tel"
            label="Phone number"
            hint="Used to reach the customer about stock or pisai."
            value={form.phone}
            onChange={(value) => updateField('phone', value)}
            placeholder="03xx-xxxxxxx"
          />
          <Field
            id="customer-initial-stock"
            label="Initial wheat stock (Maunds / Mann)"
            hint="Opening Gundam deposited when this ledger starts (e.g., 60 for 60 Mann)."
            value={form.initialStockMaunds}
            onChange={(value) => updateField('initialStockMaunds', value)}
            placeholder="e.g. 60"
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
            disabled={busy || !form.name.trim()}
            className="rounded-full bg-mill-800 px-5 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : customer ? 'Update customer' : 'Save customer'}
          </button>
        </div>
      </form>
    </div>
  )
}