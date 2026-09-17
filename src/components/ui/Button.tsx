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
      'inline-flex items-center justify-center font-medium transition-colors duration-150 rounded-md select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-terminal-bg';

    const sizeStyles = {
      xs: 'h-7 px-2.5 text-xs gap-1.5',
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-11 px-5 text-base gap-2.5',
      icon: 'h-9 w-9 p-0 aspect-square',
    };

    const variantStyles = {
      primary:
        'bg-terminal-accent text-white hover:bg-terminal-accent-hover border border-terminal-accent/40',
      'accent-glow':
        'bg-terminal-accent text-white hover:bg-terminal-accent-hover border border-terminal-accent/40',
      secondary:
        'bg-terminal-surface-elevated text-terminal-text-primary hover:bg-terminal-surface-hover border border-terminal-border',
      outline:
        'bg-transparent text-terminal-text-secondary hover:bg-terminal-surface hover:text-terminal-text-primary border border-terminal-border',
      ghost:
        'bg-transparent text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-surface',
      danger:
        'bg-terminal-down/10 text-terminal-down hover:bg-terminal-down/15 border border-terminal-down/30',
      success:
        'bg-terminal-up/10 text-terminal-up hover:bg-terminal-up/15 border border-terminal-up/30',
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
