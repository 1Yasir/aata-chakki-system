import { useEffect, useState } from 'react'
import Field from './Field'
import { useSettings } from '../context/SettingsContext'

export default function SettingsPanel() {
  const { settings, saveSettings, loading } = useSettings()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(settings)
  }, [settings])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveSettings(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm">
      <h2 className="font-display text-2xl text-mill-900">Settings & rates</h2>
      <p className="mt-1 text-sm text-stone-500">
        Inventory, electricity, and service rates drive the live dashboard math.
      </p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
        <Field
          id="totalWheatStock"
          label="Total wheat stock (maunds)"
          hint="Opening inventory of mill wheat used for remaining-stock calculation."
          value={form.totalWheatStock}
          onChange={(value) => update('totalWheatStock', value)}
        />
        <Field
          id="initialUdhaar"
          label="Initial udhaar (PKR)"
          hint="Opening credit balance before any daily entries."
          value={form.initialUdhaar}
          onChange={(value) => update('initialUdhaar', value)}
        />
        <Field
          id="unitsPerMaund"
          label="Units per maund"
          hint="Electricity units consumed for each maund ground. Default is 2."
          value={form.unitsPerMaund}
          onChange={(value) => update('unitsPerMaund', value)}
        />
        <Field
          id="ratePerUnit"
          label="Rate per unit (PKR)"
          hint="Electricity cost charged per unit."
          value={form.ratePerUnit}
          onChange={(value) => update('ratePerUnit', value)}
        />
        <Field
          id="pisaiRate"
          label="Pisai rate / maund (PKR)"
          hint="Standard grinding charge billed to customers."
          value={form.pisaiRate}
          onChange={(value) => update('pisaiRate', value)}
        />
        <Field
          id="peenRate"
          label="Peen / safai rate / maund (PKR)"
          hint="Cleaning charge per maund processed through peen."
          value={form.peenRate}
          onChange={(value) => update('peenRate', value)}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-full bg-mill-800 px-5 py-2.5 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </section>
  )
}
