import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';

import { ErrorBoundary, UnhandledErrorNotifier } from './ErrorBoundary';

function Broken(): JSX.Element {
  throw new Error('render bug');
}

describe('ErrorBoundary', () => {
  it('shows a way out instead of a blank page when a screen crashes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('keeps a page crash inside the page and recovers on retry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    function Flaky() {
      if (broken) throw new Error('page bug');
      return <p>Page works</p>;
    }
    render(
      <ErrorBoundary variant="page" resetKey="/a">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This page hit an unexpected problem');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Page works')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows a message for an action that failed without handling its error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ToastProvider>
        <UnhandledErrorNotifier />
      </ToastProvider>,
    );
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new Error('Could not download the PDF.') });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByText('Could not download the PDF.')).toBeInTheDocument();
    spy.mockRestore();
  });
});
