import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ActionMenuProps {
  /** Accessible name for the trigger (also its visible text unless `iconOnly`). */
  label: string;
  items: ActionMenuItem[];
  /** Optional heading shown above the items. */
  heading?: string;
  /** Shown instead of / above the items, e.g. why they are disabled or a loading line. */
  notice?: ReactNode;
  icon?: ReactNode;
  /** Render a compact "…" trigger with the label as its accessible name only. */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'ghost';
  disabled?: boolean;
  /** Called when the menu opens (e.g. to lazy-load what it needs). */
  onOpen?: () => void;
}

interface Position {
  top: number;
  left: number;
}

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * A menu button whose popup is portalled to <body> with fixed positioning, so it
 * is never clipped by a scrolling table wrapper or a modal body. Keyboard: arrow
 * keys / Home / End move between items, Escape closes and returns focus, Tab
 * closes. Clicks and key presses inside never bubble to a clickable table row.
 */
export function ActionMenu({
  label,
  items,
  heading,
  notice,
  icon,
  iconOnly = false,
  size = 'sm',
  variant = 'ghost',
  disabled = false,
  onOpen,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = rect.right - width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));
    let top = rect.bottom + MENU_GAP;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN && rect.top - MENU_GAP - height > VIEWPORT_MARGIN) {
      top = rect.top - MENU_GAP - height;
    }
    setPosition((current) => (current && current.top === top && current.left === left ? current : { top, left }));
  }, []);

  // Measure after every render while open (content such as a loading notice can
  // change its size) so it can be flipped/clamped; the equality check above
  // keeps this from re-rendering in a loop.
  useLayoutEffect(() => {
    if (open) place();
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    // Capture on window so Escape closes only the menu, not an enclosing modal
    // (the Modal listens on document in the bubble phase).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const onViewportChange = () => close(false);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, close]);

  // Move focus into the menu once it is positioned.
  useEffect(() => {
    if (!open || !position) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    first?.focus();
  }, [open, position]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    onOpen?.();
    setOpen(true);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (!buttons.length) {
      if (event.key === 'Tab') close(false);
      return;
    }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1].focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const select = (item: ActionMenuItem) => {
    if (item.disabled) return;
    close(false);
    item.onSelect();
  };

  return (
    // Stop clicks/keys (including those from the portalled popup, which bubble
    // through the React tree) from reaching a clickable parent row.
    <span
      className="action-menu-anchor"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Only Enter/Space: letting Escape through keeps an enclosing modal closable.
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`btn btn-${variant} btn-${size}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              toggle();
              return;
            }
            const enabled = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
            if (enabled?.length) enabled[event.key === 'ArrowDown' ? 0 : enabled.length - 1].focus();
          } else if (event.key === 'Tab' && open) {
            close(false);
          }
        }}
      >
        {iconOnly ? (icon ?? <MoreHorizontal size={15} aria-hidden="true" />) : icon}
        {iconOnly ? null : <span>{label}</span>}
        {iconOnly ? null : <ChevronDown size={13} aria-hidden="true" />}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="action-menu"
              role="menu"
              aria-label={label}
              style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
              onKeyDown={onMenuKeyDown}
            >
              {heading ? (
                <div className="action-menu-heading" aria-hidden="true">
                  {heading}
                </div>
              ) : null}
              {notice ? <div className="action-menu-notice">{notice}</div> : null}
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={item.danger ? 'is-danger' : undefined}
                  disabled={item.disabled}
                  onClick={() => select(item)}
                >
                  {item.icon ? <span className="action-menu-icon" aria-hidden="true">{item.icon}</span> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
