import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder, label }: SearchInputProps) {
  const { t } = useAppContent();
  return (
    <div className="search-input">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder ?? t('common.searchPlaceholder')} aria-label={label ?? t('common.search')} onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label={t('common.clearSearch')}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="filter-select">
      <span>{label}</span>
      <select className="select select-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface TabsProps {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab ${active === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
