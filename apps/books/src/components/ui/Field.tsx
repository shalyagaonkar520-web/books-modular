import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface FieldWrapProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldWrap({ label, error, hint, required, children }: FieldWrapProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? <span className="field-required" aria-hidden="true"> *</span> : null}
      </label>
      {children(id, messageId)}
      {error ? (
        <span className="field-error" id={messageId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={messageId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
  prefix?: string;
}

export function TextField({ label, error, hint, prefix, required, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) =>
        prefix ? (
          <div className="input-group">
            <span className="input-prefix" aria-hidden="true">
              {prefix}
            </span>
            <input id={id} className={`input ${className}`} aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest} />
          </div>
        ) : (
          <input id={id} className={`input ${className}`} aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest} />
        )
      }
    </FieldWrap>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export function SelectField({ label, error, hint, options, placeholder, required, className = '', ...rest }: SelectFieldProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <select id={id} className={`select ${className}`} aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldWrap>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({ label, error, hint, required, className = '', rows = 3, ...rest }: TextAreaFieldProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required}>
      {(id, describedBy) => (
        <textarea id={id} rows={rows} className={`textarea ${className}`} aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest} />
      )}
    </FieldWrap>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  hint?: string;
}

export function CheckboxField({ label, hint, className = '', ...rest }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="checkbox-field">
      <input id={id} type="checkbox" className={`checkbox ${className}`} {...rest} />
      <label htmlFor={id}>
        {label}
        {hint ? <span className="field-hint">{hint}</span> : null}
      </label>
    </div>
  );
}
