import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrgStatusBadge, openInAppBlocker, type OrgTarget } from './orgActions';

const org = (overrides: Partial<OrgTarget> = {}): OrgTarget => ({ id: 'o1', name: 'Acme', isSuspended: false, ...overrides });

describe('org approval helpers', () => {
  it.each([
    [org({ approvalStatus: 'pending', isSuspended: true }), 'Pending approval'],
    [org({ approvalStatus: 'rejected', isArchived: true }), 'Rejected'],
    [org({ approvalStatus: 'approved', isArchived: true }), 'Archived'],
    [org({ isSuspended: true }), 'Suspended'],
    [org(), 'Active'],
  ])('badge puts approval state first (%#)', (target, label) => {
    render(<OrgStatusBadge org={target} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('blocks opening pending and rejected organizations with a reason', () => {
    expect(openInAppBlocker(org({ approvalStatus: 'pending' }), null)).toMatch(/awaiting approval/i);
    expect(openInAppBlocker(org({ approvalStatus: 'rejected' }), null)).toMatch(/rejected/i);
    expect(openInAppBlocker(org({ approvalStatus: 'approved' }), null)).toBeNull();
    expect(openInAppBlocker(org(), null)).toBeNull();
  });
});
