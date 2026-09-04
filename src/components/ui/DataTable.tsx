import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EmptyState } from './EmptyState';

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  className?: string;
  density?: 'compact' | 'normal';
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  isLoading = false,
  emptyMessage = 'Không có dữ liệu hiển thị',
  emptyIcon,
  emptyAction,
  sortKey,
  sortDirection,
  onSort,
  className,
  density = 'compact',
}: DataTableProps<T>) {
  const paddingClass = density === 'compact' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-xs';

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-lg border border-terminal-border bg-terminal-surface',
        className
      )}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {/* Table Header */}
          <thead>
            <tr className="border-b border-terminal-border bg-terminal-surface-subtle text-[11px] font-mono uppercase text-terminal-text-muted">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={cn(
                      'font-medium select-none whitespace-nowrap',
                      paddingClass,
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.sortable && 'cursor-pointer hover:text-terminal-text-primary transition-colors',
                      col.className
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        col.align === 'right' && 'justify-end w-full',
                        col.align === 'center' && 'justify-center w-full'
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-terminal-text-muted shrink-0">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-blue-400" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-terminal-border-subtle">
            {isLoading ? (
              // Skeleton loading rows
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className={paddingClass}>
                      <div
                        className={cn(
                          'h-4 rounded bg-terminal-surface-hover',
                          cIdx === 0 ? 'w-24' : 'w-16',
                          col.align === 'right' && 'ml-auto',
                          col.align === 'center' && 'mx-auto'
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              // Empty state inside table
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <EmptyState
                    title={emptyMessage}
                    icon={emptyIcon}
                    actionLabel={emptyAction?.label}
                    onAction={emptyAction?.onClick}
                    compact
                  />
                </td>
              </tr>
            ) : (
              // Data Rows
              data.map((item, index) => (
                <tr
                  key={keyExtractor(item, index)}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'data-grid-row transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-terminal-surface-hover'
                  )}
                >
                  {columns.map((col) => {
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'whitespace-nowrap text-terminal-text-primary',
                          paddingClass,
                          col.align === 'right' && 'text-right font-mono',
                          col.align === 'center' && 'text-center',
                          col.className
                        )}
                      >
                        {col.render
                          ? col.render(item, index)
                          : ((item as Record<string, unknown>)[col.key] as React.ReactNode)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
