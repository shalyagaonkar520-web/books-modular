import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
export function DataTable({ columns, rows, rowKey, onRowClick, sortBy, sortOrder, onSort, footer, caption }) {
    return (_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "data-table", children: [caption ? _jsx("caption", { className: "sr-only", children: caption }) : null, _jsx("thead", { children: _jsx("tr", { children: columns.map((column) => {
                            const isSorted = sortBy === column.key;
                            const canSort = column.sortable && onSort;
                            return (_jsx("th", { style: column.width ? { width: column.width } : undefined, className: `align-${column.align ?? 'left'} ${canSort ? 'sortable' : ''}`, "aria-sort": isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined, children: canSort ? (_jsxs("button", { type: "button", className: "th-sort", onClick: () => onSort(column.key), children: [_jsx("span", { children: column.header }), isSorted ? sortOrder === 'asc' ? _jsx(ArrowUp, { size: 13 }) : _jsx(ArrowDown, { size: 13 }) : null] })) : (column.header) }, column.key));
                        }) }) }), _jsx("tbody", { children: rows.map((row) => (_jsx("tr", { className: onRowClick ? 'clickable' : undefined, onClick: onRowClick ? () => onRowClick(row) : undefined, tabIndex: onRowClick ? 0 : undefined, onKeyDown: onRowClick
                            ? (event) => {
                                if (event.key === 'Enter')
                                    onRowClick(row);
                            }
                            : undefined, children: columns.map((column) => (_jsx("td", { className: `align-${column.align ?? 'left'}`, children: column.render(row) }, column.key))) }, rowKey(row)))) }), footer ? _jsx("tfoot", { children: footer }) : null] }) }));
}
export function Pagination({ page, pageSize, total, onPageChange }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total === 0)
        return null;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return (_jsxs("div", { className: "pagination", children: [_jsxs("span", { className: "pagination-info", children: ["Showing ", from, "\u2013", to, " of ", total] }), _jsxs("div", { className: "pagination-controls", children: [_jsxs("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: () => onPageChange(page - 1), disabled: page <= 1, children: [_jsx(ChevronLeft, { size: 14 }), _jsx("span", { children: "Previous" })] }), _jsxs("span", { className: "pagination-page", children: ["Page ", page, " of ", totalPages] }), _jsxs("button", { type: "button", className: "btn btn-secondary btn-sm", onClick: () => onPageChange(page + 1), disabled: page >= totalPages, children: [_jsx("span", { children: "Next" }), _jsx(ChevronRight, { size: 14 })] })] })] }));
}
