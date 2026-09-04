import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'elevated' | 'outline';
  density?: 'compact' | 'normal' | 'spacious';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', density = 'normal', ...props }, ref) => {
    const variantStyles = {
      default: 'bg-terminal-surface border-terminal-border text-terminal-text-primary shadow-xs',
      subtle: 'bg-terminal-surface-subtle border-terminal-border-subtle text-terminal-text-primary',
      elevated: 'bg-terminal-surface-elevated border-terminal-border text-terminal-text-primary shadow-md',
      outline: 'bg-transparent border-terminal-border text-terminal-text-primary',
    };

    const densityStyles = {
      compact: 'p-3',
      normal: 'p-4 sm:p-5',
      spacious: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border transition-colors',
          variantStyles[variant],
          densityStyles[density],
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 pb-3 border-b border-terminal-border', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-sm font-semibold tracking-tight text-terminal-text-primary flex items-center gap-2',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-terminal-text-muted leading-relaxed', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('pt-3', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-between pt-3 border-t border-terminal-border text-xs text-terminal-text-muted',
      className
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';
