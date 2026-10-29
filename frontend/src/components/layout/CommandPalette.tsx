/** Ctrl+K (Cmd+K on a Mac): jump to any page, or find an invoice, bill, contact or item by number, name, GSTIN or SKU. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Package, Receipt, Search, SquareArrowOutUpRight, Users } from 'lucide-react';

import { dashboardApi, type SearchResult } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { Modal } from '@/components/ui/Modal';

import { useVisiblePages } from './Sidebar';

type Hit = { key: string; title: string; subtitle: string; to: string; icon: typeof Search };

const KIND_ICON: Record<SearchResult['kind'], typeof Search> = { invoice: FileText, bill: Receipt, customer: Users, vendor: Users, item: Package };

export function CommandPalette() {
  const { t } = useAppContent();
  const navigate = useNavigate();
  const pages = useVisiblePages();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRecords([]);
    setActive(0);
    // After the dialog has focused itself.
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRecords([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      dashboardApi
        .search(q, controller.signal)
        .then((res) => setRecords(res.results))
        .catch(() => undefined);
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pageHits = pages
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .slice(0, q ? 6 : 8)
      .map((p) => ({ key: `page:${p.to}`, title: p.label, subtitle: t('palette.page'), to: p.to, icon: SquareArrowOutUpRight }));
    const recordHits = records.map((r) => ({
      key: `${r.kind}:${r.id}`,
      title: r.title,
      subtitle: [t(`palette.kind.${r.kind}`), r.subtitle].filter(Boolean).join(' · '),
      to: r.to,
      icon: KIND_ICON[r.kind] ?? Search,
    }));
    return [...recordHits, ...pageHits];
  }, [pages, records, query, t]);

  useEffect(() => setActive(0), [hits.length]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    navigate(hit.to);
  };

  return (
    <Modal open={open} title={t('palette.title')} size="md" onClose={() => setOpen(false)}>
      <div className="palette">
        <div className="palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(hits[active]);
              }
            }}
          />
        </div>
        {hits.length === 0 ? (
          <p className="muted palette-empty">{t('palette.empty')}</p>
        ) : (
          <ul className="palette-list" role="listbox">
            {hits.map((hit, i) => (
              <li key={hit.key} role="option" aria-selected={i === active}>
                <button type="button" className={`palette-item ${i === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(hit)}>
                  <hit.icon size={15} aria-hidden="true" />
                  <span className="palette-title">{hit.title}</span>
                  <span className="palette-subtitle">{hit.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted palette-hint">{t('palette.hint')}</p>
      </div>
    </Modal>
  );
}
