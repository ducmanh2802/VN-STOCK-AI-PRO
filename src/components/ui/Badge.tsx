import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 font-mono uppercase tracking-wider font-semibold rounded transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default:
          'bg-terminal-surface-hover text-terminal-text-primary border border-terminal-border',
        brand:
          'bg-terminal-accent/15 text-blue-400 border border-terminal-accent/30',
        up:
          'bg-terminal-up/12 text-terminal-up border border-terminal-up/30',
        down:
          'bg-terminal-down/12 text-terminal-down border border-terminal-down/30',
        ref:
          'bg-terminal-ref/12 text-terminal-ref border border-terminal-ref/30',
        ceiling:
          'bg-terminal-ceiling/12 text-terminal-ceiling border border-terminal-ceiling/30',
        floor:
          'bg-terminal-floor/12 text-terminal-floor border border-terminal-floor/30',
        outline:
          'bg-transparent text-terminal-text-secondary border border-terminal-border',
        secondary:
          'bg-terminal-surface-subtle text-terminal-text-muted border border-terminal-border-subtle',
        subtle:
          'bg-terminal-surface-subtle text-terminal-text-muted border border-terminal-border-subtle',
        accent:
          'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30',
      },
      size: {
        xs: 'px-1.5 py-0.5 text-[9px] leading-none',
        sm: 'px-2 py-0.5 text-[10px] leading-tight',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  withDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  size,
  dot,
  withDot,
  children,
  ...props
}) => {
  const showDot = dot || withDot;
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            variant === 'up' && 'bg-terminal-up animate-pulse',
            variant === 'down' && 'bg-terminal-down',
            variant === 'ref' && 'bg-terminal-ref',
            variant === 'ceiling' && 'bg-terminal-ceiling',
            variant === 'floor' && 'bg-terminal-floor',
            variant === 'brand' && 'bg-blue-400 animate-pulse',
            variant === 'accent' && 'bg-terminal-accent animate-pulse',
            (!variant || variant === 'default' || variant === 'outline' || variant === 'secondary' || variant === 'subtle') &&
              'bg-terminal-text-muted'
          )}
        />
      )}
      {children}
    </span>
  );
};

