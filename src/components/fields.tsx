import { useEffect, useState } from 'react'

interface TextFieldProps {
  label: string
  value: string
  onCommit: (value: string) => void
  placeholder?: string
}

/** Commits on blur or Enter, so a whole edit is one undo step. */
export function TextField({ label, value, onCommit, placeholder }: TextFieldProps) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(value)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  onCommit: (value: number) => void
}

export function NumberField({ label, value, min, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.max(min, Math.round(Number(draft)))
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setDraft(String(value))
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

interface SelectFieldProps<T extends string> {
  label: string
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  mixed?: boolean
}

export function SelectField<T extends string>({ label, value, options, onChange, mixed }: SelectFieldProps<T>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={mixed ? '__mixed' : value} onChange={(e) => onChange(e.target.value as T)}>
        {mixed && (
          <option value="__mixed" disabled>
            (mixed)
          </option>
        )}
        {options.map((o) => (
          <option key={o.value || '__none'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
