import { useState } from 'react';

import { projectsApi } from '@/api/endpoints';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';

import { ProjectsTab } from './ProjectsTab';
import { TimesheetsTab } from './TimesheetsTab';

const TABS = [
  { id: 'projects', label: 'Projects' },
  { id: 'timesheets', label: 'Timesheets' },
];

export function TimeTrackingPage() {
  const [tab, setTab] = useState('projects');

  // Shared by the timesheet filters and the log-time modal.
  const projects = useAsync(() => projectsApi.list(), []);

  return (
    <>
      <PageHeader title="Time tracking" subtitle="Projects, budgets, timesheets and billing unbilled time." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'projects' ? <ProjectsTab onProjectsChanged={projects.reload} /> : null}
      {tab === 'timesheets' ? <TimesheetsTab projects={projects.data ?? []} onEntriesChanged={projects.reload} /> : null}
    </>
  );
}
