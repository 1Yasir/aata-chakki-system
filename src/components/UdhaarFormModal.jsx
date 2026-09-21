import { useEffect, useState } from 'react'
import Field from './Field'
import { emptyGeneralCustomerForm, emptyGeneralCreditForm } from '../lib/generalUdhaar'

export default function UdhaarFormModal({ open, customer, isCreditEntry, onClose, onSubmit, busy }) {
  const [form, setForm] = useState(emptyGeneralCustomerForm())

  useEffect(() => {
    if (!open) return
    if (isCreditEntry) {
      setForm(emptyGeneralCreditForm())
      if (customer) {
        setForm((prev) => ({
          ...prev,
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
        }))
      }
    } else {
      setForm(
        customer
          ? {
              name: customer.name || '',
              phone: customer.phone || '',
              netUdhaarBalance: customer.netUdhaarBalance || 0,
            }
          : emptyGeneralCustomerForm(),
      )
    }
  }, [open, customer, isCreditEntry])

  if (!open) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (isCreditEntry) {
      onSubmit({
        ...form,
        customerId: customer ? customer.id : form.customerId,
        weightMaunds: form.weightMaunds,
        amount: form.amount,
        cashPaid: form.cashPaid,
      })
    } else {
      onSubmit({
        name: form.name,
        phone: form.phone,
        netUdhaarBalance: customer ? form.netUdhaarBalance : undefined,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="udhaar-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <h2 id="udhaar-form-title" className="font-display text-2xl text-mill-900">
          {isCreditEntry ? 'Add Udhaar Entry' : (customer ? 'Edit Customer' : 'Add Customer')}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {isCreditEntry
            ? 'Record new credit (udhaar) for a customer who bought flour/items on credit.'
            : 'Add or edit a general udhaar customer for daily book tracking.'}
        </p>

        <div className="mt-5 grid gap-4">
          <Field
            id="udhaar-name"
            type="text"
            label="Customer name"
            hint={isCreditEntry && customer ? 'Adding udhaar to existing customer.' : isCreditEntry ? 'Select or enter customer name.' : 'Name of the credit customer.'}
            value={form.name}
            onChange={(value) => updateField('name', value)}
            placeholder="e.g. Ahmed Khan"
            required
            disabled={isCreditEntry && customer}
          />
          <Field
            id="udhaar-phone"
            type="tel"
            label="Phone number"
            hint="Contact number for the customer."
            value={form.phone}
            onChange={(value) => updateField('phone', value)}
            placeholder="03xx-xxxxxxx"
            disabled={isCreditEntry && customer}
          />
          {customer && !isCreditEntry && (
            <Field
              id="udhaar-balance"
              type="number"
              label="Net Balance (PKR)"
              hint="Current udhaar balance for this customer."
              value={form.netUdhaarBalance}
              onChange={(value) => updateField('netUdhaarBalance', value)}
              placeholder="e.g. 5000"
            />
          )}
          {isCreditEntry && (
            <>
              <Field
                id="udhaar-weight"
                label="Weight (Maunds / Mann)"
                hint="Weight of items taken (optional). 1 Maund = 40 KG."
                value={form.weightMaunds}
                onChange={(value) => updateField('weightMaunds', value)}
                placeholder="e.g. 2.5"
              />
              <Field
                id="udhaar-amount"
                type="number"
                label="Udhaar Amount (PKR)"
                hint="Total credit amount added to customer balance."
                value={form.amount}
                onChange={(value) => updateField('amount', value)}
                placeholder="e.g. 5000"
                required
              />
              <Field
                id="udhaar-cash-paid"
                type="number"
                label="Cash Paid (Naqad)"
                hint="Any cash paid at the time of purchase."
                value={form.cashPaid}
                onChange={(value) => updateField('cashPaid', value)}
                placeholder="e.g. 1000"
              />
              <Field
                id="udhaar-date"
                type="date"
                label="Date"
                hint="Transaction date."
                value={form.date}
                onChange={(value) => updateField('date', value)}
                required
              />
              <Field
                id="udhaar-note"
                type="text"
                label="Note (optional)"
                hint="Any additional details about this transaction."
                value={form.note}
                onChange={(value) => updateField('note', value)}
                placeholder="e.g. 10kg aata, 5kg dal"
              />
            </>
          )}
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
            disabled={busy || !form.name.trim() || (isCreditEntry && !form.amount)}
            className="rounded-full bg-mill-800 px-5 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : isCreditEntry ? 'Save Entry' : (customer ? 'Update Customer' : 'Save Customer')}
          </button>
        </div>
      </form>
    </div>
  )
}
