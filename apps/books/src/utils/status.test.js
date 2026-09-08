import { describe, expect, it } from 'vitest';
import { statusLabel, statusTone } from './status';
describe('status mapping', () => {
    it('maps document statuses to tones', () => {
        expect(statusTone('paid')).toBe('success');
        expect(statusTone('overdue')).toBe('danger');
        expect(statusTone('partially_paid')).toBe('warning');
        expect(statusTone('draft')).toBe('neutral');
        expect(statusTone('sent')).toBe('info');
    });
    it('falls back to neutral for unknown statuses', () => {
        expect(statusTone('something_new')).toBe('neutral');
    });
    it('produces readable labels', () => {
        expect(statusLabel('partially_paid')).toBe('Partially paid');
        expect(statusLabel('unknown_state')).toBe('unknown state');
    });
});
