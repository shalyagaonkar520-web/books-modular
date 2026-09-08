import { jsx as _jsx } from "react/jsx-runtime";
export function Badge({ tone = 'neutral', children }) {
    return _jsx("span", { className: `badge badge-${tone}`, children: children });
}
