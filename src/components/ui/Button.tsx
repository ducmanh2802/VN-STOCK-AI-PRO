import React, { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'accent-glow';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: LucideIcon | React.ComponentType<{ className?: string }>;
  rightIcon?: LucideIcon | React.ComponentType<{ className?: string }>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      disabled,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';

    const sizeStyles = {
      xs: 'h-7 px-2.5 text-xs gap-1.5',
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-11 px-5 text-base gap-2.5',
      icon: 'h-9 w-9 p-0 aspect-square',
    };

    const variantStyles = {
      primary:
        'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-950/50 border border-indigo-500/30',
      'accent-glow':
        'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-600/20 border border-indigo-400/30',
      secondary:
        'bg-[#182231] text-slate-200 hover:bg-[#1E293B] hover:text-white border border-[#263244] shadow-sm',
      outline:
        'bg-transparent text-slate-300 hover:bg-[#182231] hover:text-white border border-[#263244]',
      ghost:
        'bg-transparent text-slate-400 hover:text-slate-100 hover:bg-[#182231]',
      danger:
        'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30',
      success:
        'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            {LeftIcon && <LeftIcon className="w-4 h-4 shrink-0" />}
            {children}
            {RightIcon && <RightIcon className="w-4 h-4 shrink-0" />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
