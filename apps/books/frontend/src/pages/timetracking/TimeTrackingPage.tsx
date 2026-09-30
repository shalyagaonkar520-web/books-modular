import { useState } from 'react';

import { projectsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';

import { ProjectsTab } from './ProjectsTab';
import { TimesheetsTab } from './TimesheetsTab';

const TABS = [
  { id: 'projects', label: 'timeTracking.tab.projects' },
  { id: 'timesheets', label: 'timeTracking.tab.timesheets' },
];

export function TimeTrackingPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState('projects');

  // Shared by the timesheet filters and the log-time modal.
  const projects = useAsync(() => projectsApi.list(), []);

  return (
    <>
      <PageHeader title={t('timeTracking.title')} subtitle={t('timeTracking.subtitle')} />
      <Tabs tabs={TABS.map((entry) => ({ ...entry, label: t(entry.label) }))} active={tab} onChange={setTab} />

      {tab === 'projects' ? <ProjectsTab onProjectsChanged={projects.reload} /> : null}
      {tab === 'timesheets' ? <TimesheetsTab projects={projects.data ?? []} onEntriesChanged={projects.reload} /> : null}
    </>
  );
}
