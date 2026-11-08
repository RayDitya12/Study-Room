import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-mauve text-base font-medium hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface0 text-text border border-surface1 hover:bg-surface1 active:bg-surface0',
  ghost: 'text-subtext0 hover:bg-surface0 hover:text-text',
  danger: 'bg-red text-base font-medium hover:brightness-110 active:brightness-95',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-xl px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
