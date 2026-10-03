import { ActivityLogSettings } from '@/pages/settings/ActivityLogSettings';

/** The organization's full activity (audit) log, filterable by record type. Its card carries the title. */
export function OrgAdminActivityPage() {
  return (
    <div className="stack">
      <ActivityLogSettings />
    </div>
  );
}
