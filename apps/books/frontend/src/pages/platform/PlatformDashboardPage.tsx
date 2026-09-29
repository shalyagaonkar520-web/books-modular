import { useNavigate } from 'react-router-dom';
import { Archive, Building2, ExternalLink, FileText, Globe, IndianRupee, LogIn, ShieldAlert, Users, Wallet } from 'lucide-react';

import { platformApi, type OrgSummary, type PlatformAudit } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DonutChart, HorizontalBarChart, InteractiveSeriesChart } from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';

import { OpenInAppButton, OrgStatusBadge } from './orgActions';
import { formatCurrency, formatCurrencyCompact, formatDateTime, formatNumber, titleCase } from '@/utils/format';

export function PlatformDashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync((signal) => platformApi.dashboard(signal), []);

  if (loading && !data) return <LoadingBlock label="Building the platform dashboard…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const orgColumns: Array<Column<OrgSummary>> = [
    {
      key: 'name',
      header: 'Organization',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>{row.userCount} user(s) · {row.invoiceCount} invoice(s)</small>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <OrgStatusBadge org={row} />,
    },
    { key: 'invoiced', header: 'Invoiced', align: 'right', render: (row) => <span className="num">{formatCurrency(row.invoicedAmount)}</span> },
    { key: 'collected', header: 'Collected', align: 'right', render: (row) => <span className="num">{formatCurrency(row.collectedAmount)}</span> },
  ];

  const archivedOrganizations = data.archivedOrganizations ?? 0;

  const activityColumns: Array<Column<PlatformAudit>> = [
    {
      key: 'action',
      header: 'Activity',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.summary ?? titleCase(row.action)}</span>
          <small>{titleCase(row.entityType)}{row.userName ? ` · ${row.userName}` : ''}</small>
        </div>
      ),
    },
    { key: 'org', header: 'Organization', render: (row) => row.organizationName },
    { key: 'when', header: 'When', align: 'right', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Platform overview"
        subtitle="Live position across every organization on Rooman Books."
      />

      <div className="stat-grid">
        <StatTile
          label="Organizations"
          value={formatNumber(data.totalOrganizations, 0)}
          sublabel={`${data.activeOrganizations} active · ${data.suspendedOrganizations} suspended · ${archivedOrganizations} archived`}
          icon={<Building2 size={16} />}
        />
        <StatTile
          label="Archived"
          value={formatNumber(archivedOrganizations, 0)}
          sublabel="Soft-deleted, restorable"
          icon={<Archive size={16} />}
        />
        <StatTile
          label="Users"
          value={formatNumber(data.totalUsers, 0)}
          sublabel={`${data.activeUsers} active`}
          icon={<Users size={16} />}
        />
        <StatTile
          label="Invoiced"
          value={formatCurrencyCompact(data.totalInvoicedAmount)}
          sublabel={`${formatNumber(data.totalInvoices, 0)} invoice(s)`}
          icon={<FileText size={16} />}
        />
        <StatTile
          label="Collected"
          value={formatCurrencyCompact(data.totalCollectedAmount)}
          tone="positive"
          icon={<IndianRupee size={16} />}
        />
        <StatTile
          label="Paid to vendors"
          value={formatCurrencyCompact(data.totalPaidToVendors)}
          sublabel={`${formatNumber(data.totalBills, 0)} bill(s)`}
          icon={<Wallet size={16} />}
        />
        <StatTile
          label="New this month"
          value={formatNumber(data.newOrganizationsThisMonth, 0)}
          sublabel="Organizations added"
          tone={data.suspendedOrganizations > 0 ? 'warning' : 'neutral'}
          icon={<ShieldAlert size={16} />}
        />
      </div>

      <div className="grid-2">
        <Card title="Organization growth" subtitle="New organizations by month">
          {data.organizationGrowth.length === 0 ? (
            <p className="chart-empty">No data yet.</p>
          ) : (
            <InteractiveSeriesChart
              data={data.organizationGrowth.map((point) => ({ label: point.label, incoming: point.value, outgoing: 0 }))}
              incomingLabel="New organizations"
              outgoingLabel=""
              netLabel="New organizations"
              currency=""
              allowedTypes={['bar', 'line', 'area']}
              defaultType="bar"
            />
          )}
        </Card>

        <Card title="Revenue by month" subtitle="Collected across all organizations">
          {data.revenueByMonth.length === 0 ? (
            <p className="chart-empty">No data yet.</p>
          ) : (
            <InteractiveSeriesChart
              data={data.revenueByMonth.map((point) => ({ label: point.label, incoming: point.value, outgoing: 0 }))}
              incomingLabel="Revenue"
              outgoingLabel=""
              netLabel="Revenue"
              currency="INR"
              allowedTypes={['bar', 'line', 'area']}
              defaultType="area"
            />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Top organizations"
          subtitle="By invoiced value"
          actions={
            <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/platform/organizations')}>
              <span>View all</span>
            </button>
          }
        >
          {data.topOrganizations.length === 0 ? (
            <p className="chart-empty">No organizations yet.</p>
          ) : (
            <>
              <HorizontalBarChart
                items={data.topOrganizations.map((org) => ({ label: org.name, value: org.invoicedAmount }))}
                currency="INR"
              />
              <div style={{ marginTop: 12 }}>
                <DataTable
                  columns={orgColumns}
                  rows={data.topOrganizations}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/platform/organizations?org=${row.id}`)}
                  caption="Top organizations"
                />
              </div>
            </>
          )}
        </Card>

        <Card title="Organization health" subtitle="Active, suspended and archived">
          <DonutChart
            slices={[
              { label: 'Active', value: data.activeOrganizations },
              { label: 'Suspended', value: data.suspendedOrganizations },
              ...(archivedOrganizations > 0 ? [{ label: 'Archived', value: archivedOrganizations }] : []),
            ]}
            currency=""
          />
        </Card>
      </div>

      <Card title="Quick links" subtitle="Jump to the tenant app or straight into an organization">
        <div className="stack">
          <div className="quick-links">
            <Button variant="secondary" icon={<Globe size={15} />} onClick={() => navigate('/')}>
              Open public site
            </Button>
            <Button variant="secondary" icon={<LogIn size={15} />} onClick={() => navigate('/login')}>
              Tenant sign-in page
            </Button>
            <Button variant="secondary" icon={<ExternalLink size={15} />} onClick={() => navigate('/platform/organizations')}>
              All organizations
            </Button>
          </div>
          <div>
            <h3 className="card-subtitle" style={{ margin: '4px 0 6px' }}>
              Open in app
            </h3>
            {data.topOrganizations.length === 0 ? (
              <p className="text-muted small">No organizations yet — shortcuts appear here once tenants sign up.</p>
            ) : (
              <ul className="quick-links-list" aria-label="Open an organization's dashboard">
                {data.topOrganizations.map((org) => (
                  <li key={org.id}>
                    <span className="row">
                      <span className="strong">{org.name}</span>
                      <OrgStatusBadge org={org} />
                    </span>
                    <OpenInAppButton org={org} label="Open dashboard" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent activity</h2>
            <p className="card-subtitle">Latest actions across all organizations</p>
          </div>
          <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/platform/audit-logs')}>
            <span>Open audit log</span>
          </button>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">Nothing recorded yet.</p>
          </div>
        ) : (
          <DataTable columns={activityColumns} rows={data.recentActivity} rowKey={(row) => row.id} caption="Recent activity" />
        )}
      </div>
    </>
  );
}
