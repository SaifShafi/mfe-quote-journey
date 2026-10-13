import { useId, type InputHTMLAttributes } from 'react'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby'> {
  label: string
  hint?: string
}

/**
 * Label plus input plus optional hint.
 *
 * The hint is wired with aria-describedby and deliberately rendered OUTSIDE the
 * label element. A visible hint inside a <label> joins the input's accessible
 * name, so "Annual mileage" with a hint becomes "Annual mileage approximate is
 * fine". That bug was found in remote-quote and fixed there once. Putting the
 * primitive here is the point of the package: the next remote cannot
 * reintroduce it without rewriting this file.
 *
 * useId rather than a caller-supplied id because this component renders inside
 * several independently built applications on one page, and two remotes that
 * both hard-code id="year" produce a duplicate-ID violation that neither
 * remote's own axe run can see.
 */
export function Input({ label, hint, ...rest }: InputProps) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="sui-field">
      <label className="sui-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="sui-input"
        id={id}
        aria-describedby={hint ? hintId : undefined}
        {...rest}
      />
      {hint && (
        <span className="sui-field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}
