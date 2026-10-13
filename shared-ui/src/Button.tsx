import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

/**
 * type defaults to "button", not the HTML default of "submit". A primitive used
 * by several teams that submits a form it was only meant to sit inside is the
 * kind of surprise a shared package should not ship.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = ['sui-button', `sui-button--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} type={type} {...rest} />
}
