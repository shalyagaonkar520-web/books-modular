import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@/api/workspace';

import { MessageView } from './MessageView';

const base: ChatMessage = { id: 'm1', role: 'assistant', content: 'Here is what I will create.', createdAt: '2026-11-19T10:00:00Z', meta: {} };

describe('MessageView', () => {
  it('asks for confirmation only on the newest waiting request', () => {
    const msg: ChatMessage = {
      ...base,
      meta: { pending_action_id: 'act1', pending_status: 'ready', used_ai: false, cards: [{ type: 'preview', title: 'New product', fields: [{ label: 'Name', value: 'Serum' }], warnings: [] }] },
    };
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<MessageView message={msg} actionable busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('New product')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('act1');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledWith('act1');

    rerender(<MessageView message={msg} actionable={false} busy={false} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByRole('button', { name: /confirm/i })) .toBeNull();
  });

  it('a draft can be cancelled but not confirmed', () => {
    const msg: ChatMessage = { ...base, meta: { pending_action_id: 'act2', pending_status: 'draft' } };
    render(<MessageView message={msg} actionable busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows whether a reply used the AI, and renders text as text, never HTML', () => {
    const msg: ChatMessage = { ...base, content: '<img src=x onerror=alert(1)> **bold**', meta: { used_ai: true } };
    const { container } = render(<MessageView message={msg} actionable={false} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('renders tables and stats from the backend', () => {
    const msg: ChatMessage = {
      ...base,
      meta: {
        used_ai: false,
        cards: [
          { type: 'table', title: 'Low stock', columns: ['Product', 'In stock'], rows: [['Rose Face Cream', '3']] },
          { type: 'stats', title: 'Sales · today', items: [{ label: 'Invoices', value: '4' }] },
        ],
      },
    };
    render(<MessageView message={msg} actionable={false} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Rose Face Cream')).toBeInTheDocument();
    expect(screen.getByText('Sales · today')).toBeInTheDocument();
    expect(screen.getByText('Instant')).toBeInTheDocument();
  });
});
