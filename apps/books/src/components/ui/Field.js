import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from 'react';
function FieldWrap({ label, error, hint, required, children }) {
    const id = useId();
    const messageId = error || hint ? `${id}-message` : undefined;
    return (_jsxs("div", { className: `field ${error ? 'has-error' : ''}`, children: [_jsxs("label", { className: "field-label", htmlFor: id, children: [label, required ? _jsx("span", { className: "field-required", "aria-hidden": "true", children: " *" }) : null] }), children(id, messageId), error ? (_jsx("span", { className: "field-error", id: messageId, role: "alert", children: error })) : hint ? (_jsx("span", { className: "field-hint", id: messageId, children: hint })) : null] }));
}
export function TextField({ label, error, hint, prefix, required, className = '', ...rest }) {
    return (_jsx(FieldWrap, { label: label, error: error, hint: hint, required: required, children: (id, describedBy) => prefix ? (_jsxs("div", { className: "input-group", children: [_jsx("span", { className: "input-prefix", "aria-hidden": "true", children: prefix }), _jsx("input", { id: id, className: `input ${className}`, "aria-describedby": describedBy, "aria-invalid": !!error, required: required, ...rest })] })) : (_jsx("input", { id: id, className: `input ${className}`, "aria-describedby": describedBy, "aria-invalid": !!error, required: required, ...rest })) }));
}
export function SelectField({ label, error, hint, options, placeholder, required, className = '', ...rest }) {
    return (_jsx(FieldWrap, { label: label, error: error, hint: hint, required: required, children: (id, describedBy) => (_jsxs("select", { id: id, className: `select ${className}`, "aria-describedby": describedBy, "aria-invalid": !!error, required: required, ...rest, children: [placeholder ? _jsx("option", { value: "", children: placeholder }) : null, options.map((option) => (_jsx("option", { value: option.value, disabled: option.disabled, children: option.label }, option.value)))] })) }));
}
export function TextAreaField({ label, error, hint, required, className = '', rows = 3, ...rest }) {
    return (_jsx(FieldWrap, { label: label, error: error, hint: hint, required: required, children: (id, describedBy) => (_jsx("textarea", { id: id, rows: rows, className: `textarea ${className}`, "aria-describedby": describedBy, "aria-invalid": !!error, required: required, ...rest })) }));
}
export function CheckboxField({ label, hint, className = '', ...rest }) {
    const id = useId();
    return (_jsxs("div", { className: "checkbox-field", children: [_jsx("input", { id: id, type: "checkbox", className: `checkbox ${className}`, ...rest }), _jsxs("label", { htmlFor: id, children: [label, hint ? _jsx("span", { className: "field-hint", children: hint }) : null] })] }));
}
