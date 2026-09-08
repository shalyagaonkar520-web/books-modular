import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  footer?: ReactNode;
  caption?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, sortBy, sortOrder, onSort, footer, caption }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sortBy === column.key;
              const canSort = column.sortable && onSort;
              return (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={`align-${column.align ?? 'left'} ${canSort ? 'sortable' : ''}`}
                  aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {canSort ? (
                    <button type="button" className="th-sort" onClick={() => onSort(column.key)}>
                      <span>{column.header}</span>
                      {isSorted ? sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter') onRowClick(row);
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <td key={column.key} className={`align-${column.align ?? 'left'}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing {from}–{to} of {total}
      </span>
      <div className="pagination-controls">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>
        <span className="pagination-page">
          Page {page} of {totalPages}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
