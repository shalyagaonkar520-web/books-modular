import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {breadcrumb?.length ? (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((crumb, index) => (
              <span key={crumb}>
                {crumb}
                {index < breadcrumb.length - 1 ? <span aria-hidden="true"> / </span> : null}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
