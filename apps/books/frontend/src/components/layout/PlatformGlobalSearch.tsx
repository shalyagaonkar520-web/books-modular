import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, Search, Users } from 'lucide-react';

import { platformApi, type SearchResults } from '@/api/platform';
import { PlatformApiError } from '@/api/platformClient';
import { useDebounced } from '@/hooks/useDebounced';

const MIN_CHARS = 2;
const EMPTY: SearchResults = { organizations: [], users: [] };

export function PlatformGlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(query);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < MIN_CHARS) {
      setResults(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    platformApi
      .search(term, controller.signal)
      .then((data) => {
        if (active) {
          setResults(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!active || (err as Error).name === 'AbortError') return;
        setResults(EMPTY);
        setLoading(false);
        setError(err instanceof PlatformApiError ? err.message : 'Search failed.');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [debounced]);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const term = query.trim();
  const showDropdown = open && term.length >= MIN_CHARS;
  const hasResults = results.organizations.length > 0 || results.users.length > 0;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: 'min(320px, 42vw)' }}
    >
      <div
        className="search-input"
        style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
      >
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Search orgs & users…"
          aria-label="Global search"
          style={{ color: '#e2e8f0' }}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>

      {showDropdown ? (
        <div className="platform-search-dropdown" role="listbox" aria-label="Search results">
          {loading ? (
            <div className="platform-search-status">
              <Loader2 size={16} className="spin" aria-hidden="true" />
              <span>Searching…</span>
            </div>
          ) : error ? (
            <div className="platform-search-status">{error}</div>
          ) : !hasResults ? (
            <div className="platform-search-status">No matches for “{term}”.</div>
          ) : (
            <>
              {results.organizations.length > 0 ? (
                <div className="platform-search-group">
                  <p className="platform-search-heading">Organizations</p>
                  {results.organizations.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="platform-search-item"
                      onClick={() => go(`/platform/organizations?org=${org.id}`)}
                    >
                      <Building2 size={15} aria-hidden="true" />
                      <span className="platform-search-item-text">
                        <span className="strong">{org.name}</span>
                        <small>
                          {org.userCount} user(s)
                          {org.isSuspended ? ' · Suspended' : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {results.users.length > 0 ? (
                <div className="platform-search-group">
                  <p className="platform-search-heading">Users</p>
                  {results.users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="platform-search-item"
                      onClick={() => go(`/platform/users?search=${encodeURIComponent(user.email)}`)}
                    >
                      <Users size={15} aria-hidden="true" />
                      <span className="platform-search-item-text">
                        <span className="strong">{user.name}</span>
                        <small>
                          {user.email} · {user.organizationName}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
