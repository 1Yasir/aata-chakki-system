import { useEffect, useState } from 'react'
import Field from './Field'
import { emptyEmployeeForm } from '../lib/employees'

export default function EmployeeFormModal({ open, employee, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyEmployeeForm())

  useEffect(() => {
    if (!open) return
    setForm(
      employee
        ? {
            name: employee.name || '',
            phone: employee.phone || '',
            baseSalary: employee.baseSalary ?? '',
            salaryType: employee.salaryType || 'MONTHLY',
            initialBalancePkr: employee.initialBalancePkr ?? '',
          }
        : emptyEmployeeForm(),
    )
  }, [open, employee])

  if (!open) return null

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mill-900/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <h2 id="employee-form-title" className="font-display text-2xl text-mill-900">
          {employee ? 'Edit employee' : 'Add employee'}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Opening balance becomes the starting advance owed. Net balance recalculates from active khata entries.
        </p>
        <div className="mt-5 grid gap-4">
          <Field
            id="emp-name"
            type="text"
            label="Employee name"
            value={form.name}
            onChange={(value) => updateField('name', value)}
            placeholder="e.g. Imran"
            required
          />
          <Field
            id="emp-phone"
            type="tel"
            label="Phone"
            value={form.phone}
            onChange={(value) => updateField('phone', value)}
            placeholder="03xx-xxxxxxx"
          />
          <label className="block" htmlFor="emp-salary-type">
            <span className="mb-1.5 block text-sm font-medium text-stone-700">Salary type</span>
            <select
              id="emp-salary-type"
              value={form.salaryType}
              onChange={(event) => updateField('salaryType', event.target.value)}
              className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="DAILY">Daily</option>
            </select>
          </label>
          <Field
            id="emp-salary"
            label="Base salary (PKR)"
            value={form.baseSalary}
            onChange={(value) => updateField('baseSalary', value)}
            placeholder="e.g. 25000"
          />
          <Field
            id="emp-opening"
            label="Initial advance / balance (PKR)"
            hint="Positive means the mill has already given this much advance."
            value={form.initialBalancePkr}
            onChange={(value) => updateField('initialBalancePkr', value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.name.trim()}
            className="rounded-full bg-mill-800 px-5 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
          >
            {busy ? 'Saving…' : employee ? 'Update employee' : 'Save employee'}
          </button>
        </div>
      </form>
    </div>
  )
}
