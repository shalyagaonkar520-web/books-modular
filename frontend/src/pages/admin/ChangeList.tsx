/**
 * A list of saved changes: who changed which record, when, and every field's
 * old and new value. Used by the Admin console's change log, Reviews and the
 * "flags on my work" list in Support.
 */
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import type { ChangeEntry } from '@/api/adminConsole';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/utils/format';

const ACTION_TEXT: Record<ChangeEntry['action'], string> = { create: 'created', update: 'changed', delete: 'deleted' };
const ACTION_TONE: Record<ChangeEntry['action'], 'success' | 'info' | 'danger'> = { create: 'success', update: 'info', delete: 'danger' };

/** "invoice_lines" -> "Invoice line". */
export function recordKind(entityType: string): string {
  const words = entityType.replace(/_/g, ' ');
  const singular = words.endsWith('ies') ? `${words.slice(0, -3)}y` : words.endsWith('ses') ? words.slice(0, -2) : words.replace(/s$/, '');
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/** "selling_price" -> "Selling price". */
export function fieldName(field: string): string {
  const words = field.replace(/_id$/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function ChangeFields({ changes }: { changes: ChangeEntry['changes'] }) {
  const entries = Object.entries(changes);
  if (!entries.length) return null;
  return (
    <table className="change-fields">
      <tbody>
        {entries.map(([field, [before, after]]) => (
          <tr key={field}>
            <th scope="row">{fieldName(field)}</th>
            <td className="change-old">{shown(before)}</td>
            <td className="change-arrow" aria-label="changed to">
              <ArrowRight size={13} aria-hidden="true" />
            </td>
            <td className="change-new">{shown(after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ChangeListProps {
  rows: ChangeEntry[];
  /** Extra controls on each change (review buttons, ask support…). */
  actions?: (row: ChangeEntry) => ReactNode;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}

export function ChangeList({ rows, actions, selected, onToggle }: ChangeListProps) {
  return (
    <ul className="change-list">
      {rows.map((row) => (
        <li key={row.id} className={`change-item ${row.reviewStatus === 'flagged' ? 'is-flagged' : ''}`}>
          <div className="change-head">
            {onToggle ? (
              <input
                type="checkbox"
                className="checkbox"
                aria-label={`Select the change to ${row.entityLabel ?? recordKind(row.entityType)}`}
                checked={selected?.has(row.id) ?? false}
                onChange={() => onToggle(row.id)}
              />
            ) : null}
            <div className="change-title">
              <strong>{row.userName ?? 'System'}</strong>
              {row.userRole ? <span className="text-muted small"> ({row.userRole})</span> : null}{' '}
              <Badge tone={ACTION_TONE[row.action]}>{ACTION_TEXT[row.action]}</Badge> {recordKind(row.entityType)}
              {row.entityLabel ? <strong> “{row.entityLabel}”</strong> : null}
              <div className="small text-muted">{formatDateTime(row.createdAt)}</div>
            </div>
            {row.reviewStatus ? (
              <Badge tone={row.reviewStatus === 'flagged' ? 'danger' : 'success'}>
                {row.reviewStatus === 'flagged' ? 'Flagged' : 'Reviewed'}
                {row.reviewedByName ? ` by ${row.reviewedByName}` : ''}
              </Badge>
            ) : null}
          </div>
          <ChangeFields changes={row.changes} />
          {row.reviewNote ? <p className="change-note">“{row.reviewNote}”</p> : null}
          {actions ? <div className="row-actions change-actions">{actions(row)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
