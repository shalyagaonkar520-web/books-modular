import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { ActivityLogSettings } from './ActivityLogSettings';
import { OrganizationSettings } from './OrganizationSettings';
import { UsersSettings } from './UsersSettings';
export function SettingsPage() {
    const [tab, setTab] = useState('organization');
    return (_jsxs("div", { className: "stack", children: [_jsx(PageHeader, { title: "Settings", subtitle: "Organization profile, team access and the audit trail" }), _jsx(Tabs, { tabs: [
                    { id: 'organization', label: 'Organization' },
                    { id: 'users', label: 'Users' },
                    { id: 'activity', label: 'Activity log' },
                ], active: tab, onChange: (id) => setTab(id) }), tab === 'organization' ? _jsx(OrganizationSettings, {}) : null, tab === 'users' ? _jsx(UsersSettings, {}) : null, tab === 'activity' ? _jsx(ActivityLogSettings, {}) : null] }));
}
