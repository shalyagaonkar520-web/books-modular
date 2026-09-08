import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PageHeader({ title, subtitle, actions, breadcrumb }) {
    return (_jsxs("header", { className: "page-header", children: [_jsxs("div", { children: [breadcrumb?.length ? (_jsx("nav", { className: "breadcrumb", "aria-label": "Breadcrumb", children: breadcrumb.map((crumb, index) => (_jsxs("span", { children: [crumb, index < breadcrumb.length - 1 ? _jsx("span", { "aria-hidden": "true", children: " / " }) : null] }, crumb))) })) : null, _jsx("h1", { className: "page-title", children: title }), subtitle ? _jsx("p", { className: "page-subtitle", children: subtitle }) : null] }), actions ? _jsx("div", { className: "page-actions", children: actions }) : null] }));
}
