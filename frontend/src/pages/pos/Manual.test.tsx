import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import manual from '@/content/pointOfSaleManual.md?raw';

import { renderManual } from './Manual';

describe('the Point of Sale manual', () => {
  it('turns its Markdown into headings, lists, tables and bold text without raw HTML', () => {
    const md = [
      '# Title',
      '',
      'A **bold** word and `code`.',
      '',
      '## Steps',
      '',
      '1. First',
      '2. Second',
      '   - inner point',
      '',
      '- a bullet',
      '',
      '| What | Do |',
      '|---|---|',
      '| <script>x</script> | **fix** |',
      '',
      '---',
    ].join('\n');
    const { container } = render(<div>{renderManual(md)}</div>);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Steps' })).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(within(container.querySelector('ol') as HTMLElement).getByText('inner point')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    // HTML in the text stays text.
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>x</script>')).toBeInTheDocument();
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('renders the real manual with all its sections', () => {
    render(<div>{renderManual(manual)}</div>);
    expect(screen.getByRole('heading', { level: 1, name: /point of sale/i })).toBeInTheDocument();
    for (const section of [/making a sale/i, /phone as the scanner/i, /returns/i, /end of the day/i, /problems and fixes/i]) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
  });
});
