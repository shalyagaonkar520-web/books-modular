import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, titleCase } from '@/utils/format';
/** One selectable card per bank/cash/credit-card account. */
export function BankAccountCards({ accounts, selectedAccountId, onSelect }) {
    return (_jsx("div", { className: "grid-3", children: accounts.map((account) => {
            const isSelected = account.id === selectedAccountId;
            return (_jsx("div", { className: "card", role: "button", tabIndex: 0, "aria-pressed": isSelected, onClick: () => onSelect(account.id), onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(account.id);
                    }
                }, children: _jsxs("div", { className: "card-body stack", children: [_jsxs("div", { className: "row-between", children: [_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: account.name }), _jsxs("small", { children: [titleCase(account.type), account.bankName ? ` · ${account.bankName}` : ''] })] }), _jsxs("div", { className: "row", children: [account.isPrimary ? _jsx(Badge, { tone: "info", children: "Primary" }) : null, isSelected ? _jsx(Badge, { tone: "success", children: "Viewing" }) : null] })] }), _jsx("div", { className: "stat-value num", children: formatCurrency(account.currentBalance, account.currency) }), _jsx("div", { className: "small text-subtle mono", children: account.accountNumberMasked ?? 'No account number on file' }), _jsxs("div", { className: "small text-muted", children: [account.unreconciledCount, " unreconciled transaction(s)"] })] }) }, account.id));
        }) }));
}
