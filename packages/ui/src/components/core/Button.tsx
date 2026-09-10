import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style'> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon name shown before the label */
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Honey glow shadow — running timer only */
  glow?: boolean;
  /** One-shot spring scale .96 -> 1 on mount (timer start button only) */
  spring?: boolean;
  /** Heartbeat while idle (the start button when no task is running): the button breathes while a honey halo spreads and fades; rests on hover and focus */
  pulse?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
}

const H: Record<ButtonSize, string> = { sm: 'var(--control-h-sm)', md: 'var(--control-h-md)', lg: 'var(--control-h-lg)' };
const PX: Record<ButtonSize, string> = { sm: '10px', md: '14px', lg: '18px' };
const FS: Record<ButtonSize, string> = { sm: 'var(--text-sm)', md: 'var(--text-md)', lg: 'var(--text-lg)' };
const V: Record<ButtonVariant, { bg: string; hover: string; press: string; fg: string; border: string }> = {
  primary: { bg: 'var(--honey-500)', hover: 'var(--honey-400)', press: 'var(--honey-600)', fg: 'var(--text-on-accent)', border: 'transparent' },
  secondary: { bg: 'var(--hive-0)', hover: 'var(--hive-100)', press: 'var(--hive-200)', fg: 'var(--text-primary)', border: 'var(--border-default)' },
  ghost: { bg: 'transparent', hover: 'var(--hive-100)', press: 'var(--hive-200)', fg: 'var(--text-primary)', border: 'transparent' },
  inverse: { bg: 'var(--hive-900)', hover: 'var(--hive-800)', press: 'var(--hive-950)', fg: 'var(--text-inverse)', border: 'transparent' },
  danger: { bg: 'var(--red-500)', hover: '#E04B4B', press: 'var(--red-700)', fg: '#fff', border: 'transparent' },
};

export function Button({ children, variant = 'primary', size = 'md', icon, iconRight, disabled, fullWidth, glow, spring, pulse, style, onClick, type = 'button', ...rest }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const [focus, setFocus] = useState(false);
  const v = V[variant] || V.primary;
  const isz = size === 'sm' ? 14 : size === 'lg' ? 20 : 18;
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: H[size], padding: '0 ' + PX[size], width: fullWidth ? '100%' : undefined,
        borderRadius: 'var(--radius-md)', border: '1px solid ' + v.border,
        background: disabled ? v.bg : press ? v.press : hover ? v.hover : v.bg, color: v.fg,
        font: 'var(--type-label)', fontSize: FS[size], letterSpacing: 0, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 'var(--opacity-disabled)' : 1, transform: press && !disabled ? 'scale(.98)' : 'none',
        boxShadow: (glow || pulse) && !disabled ? 'var(--shadow-accent)' : 'none', whiteSpace: 'nowrap',
        // The pulse owns transform and box-shadow while it runs; hovering (or focusing) lets the button rest so it reads as ready to press.
        animation: pulse && !disabled ? (hover || focus ? 'none' : 'db-pulse-btn 1.8s cubic-bezier(.4, 0, .2, 1) infinite') : spring ? 'db-spring 280ms var(--ease-spring)' : undefined,
        willChange: pulse && !disabled ? 'transform, box-shadow' : undefined,
        transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
        ...style,
      }} {...rest}>
      {icon && <Icon name={icon} size={isz} />}
      {children}
      {iconRight && <Icon name={iconRight} size={isz} />}
    </button>
  );
}
