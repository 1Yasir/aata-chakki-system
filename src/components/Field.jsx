import { Info } from 'lucide-react'

export default function Field({
  id,
  label,
  hint,
  type = 'number',
  step = '0.01',
  min = '0',
  value,
  onChange,
  placeholder,
  required = false,
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-stone-700">
        {label}
        {hint ? (
          <span className="group relative inline-flex">
            <Info className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-52 -translate-x-1/2 rounded-xl bg-mill-800 px-3 py-2 text-xs font-normal text-wheat-50 shadow-lg group-hover:block group-focus-within:block">
              {hint}
            </span>
          </span>
        ) : null}
      </span>
      {type === 'textarea' ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm text-mill-900 outline-none ring-wheat-400 transition focus:border-wheat-400 focus:ring-2"
        />
      ) : (
        <input
          id={id}
          type={type}
          step={type === 'number' ? step : undefined}
          min={type === 'number' ? min : undefined}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-wheat-200 bg-white px-3 py-2.5 text-sm text-mill-900 outline-none ring-wheat-400 transition focus:border-wheat-400 focus:ring-2"
        />
      )}
    </label>
  )
}
