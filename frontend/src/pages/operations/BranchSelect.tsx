/** Branch and project pickers for document forms. The branch picker only shows once the organization has branches. */
import { branchesApi } from '@/api/operations';
import { projectsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { SelectField } from '@/components/ui/Field';
import { useAsync } from '@/hooks/useAsync';

export function BranchSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useAppContent();
  const branches = useAsync(() => branchesApi.list(), []);
  const options = (branches.data ?? []).map((b) => ({ value: b.id, label: b.code ? `${b.name} (${b.code})` : b.name }));
  if (options.length === 0 && !value) return null;
  return <SelectField label={t('ops.branch')} value={value} placeholder={t('ops.branchNone')} options={options} onChange={(e) => onChange(e.target.value)} />;
}

export function ProjectSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useAppContent();
  const projects = useAsync(() => projectsApi.list(), []);
  const options = (projects.data ?? []).filter((p) => p.status !== 'completed' || p.id === value).map((p) => ({ value: p.id, label: p.name }));
  if (options.length === 0 && !value) return null;
  return <SelectField label={t('ops.project')} value={value} placeholder={t('ops.projectNone')} options={options} onChange={(e) => onChange(e.target.value)} />;
}
