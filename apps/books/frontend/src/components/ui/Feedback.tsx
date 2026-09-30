import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';

export function Spinner({ label }: { label?: string }) {
  const { t } = useAppContent();
  return (
    <span className="spinner" role="status" aria-label={label ?? t('common.spinner')}>
      <Loader2 size={18} className="spin" aria-hidden="true" />
    </span>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useAppContent();
  return (
    <div className="state-block" role="status">
      <Loader2 size={24} className="spin" aria-hidden="true" />
      <p>{label ?? t('common.loading')}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-row" key={rowIndex}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <span className="skeleton-cell" key={colIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useAppContent();
  return (
    <div className="state-block state-error" role="alert">
      <AlertCircle size={24} aria-hidden="true" />
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} />
          <span>{t('common.tryAgain')}</span>
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state-block state-empty">
      {icon ?? <Inbox size={28} aria-hidden="true" />}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      <div>
        {message.split('\n').map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}
