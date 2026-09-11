import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { razorpaySyncApi } from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';

import { RazorpayCategories } from './RazorpayCategories';
import { RazorpayOverview } from './RazorpayOverview';
import { RazorpayReconciliation } from './RazorpayReconciliation';
import { RazorpaySyncHistory } from './RazorpaySyncHistory';
import { RazorpayTransactions } from './RazorpayTransactions';

type PaymentsTab = 'overview' | 'transactions' | 'reconciliation' | 'categories' | 'sync';

export function RazorpayPaymentsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<PaymentsTab>('overview');
  const [syncing, setSyncing] = useState(false);
  // Remounts the active tab after a sync so it picks up the new rows.
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error, reload } = useAsync(
    async () => {
      const [categories, status] = await Promise.all([
        razorpaySyncApi.listCategories(),
        razorpaySyncApi.getIntegrationStatus(),
      ]);
      return { categories, status };
    },
    [],
  );

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await razorpaySyncApi.sync(false);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      setRefreshKey((key) => key + 1);
      reload();
    } catch {
      toast.error('Could not reach the server to start the synchronisation.');
    } finally {
      setSyncing(false);
    }
  }, [reload, toast]);

  if (loading) return <LoadingBlock label="Loading the payments module…" />;
  if (error || !data) return <ErrorBlock message={error ?? 'Could not load the payments module.'} onRetry={reload} />;

  const { status } = data;
  const categories = data.categories.items;

  return (
    <div className="stack">
      <PageHeader
        title="Razorpay payments"
        subtitle="Imported Razorpay transactions, their categories and their accounting position."
        breadcrumb={['Banking', 'Payments']}
        actions={
          <div className="row">
            <Badge tone={status.connected ? 'success' : status.configured ? 'warning' : 'neutral'}>
              {status.connected ? 'Connected' : status.configured ? 'Not reachable' : 'Not connected'}
            </Badge>
            <Badge tone={status.mode === 'live' ? 'danger' : 'info'}>
              {status.mode === 'live' ? 'Live mode' : 'Test mode'}
            </Badge>
            <Button
              variant="primary"
              icon={<RefreshCw size={14} />}
              loading={syncing}
              disabled={!status.connected}
              onClick={syncNow}
            >
              Sync now
            </Button>
          </div>
        }
      />

      {!status.configured ? (
        <div className="notification notification-info" role="status">
          <span>
            Razorpay is not configured on this server. An administrator can set the credentials in the server
            environment — see Settings → Integrations → Razorpay.
          </span>
        </div>
      ) : null}

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'transactions', label: 'Transactions' },
          { id: 'reconciliation', label: 'Reconciliation' },
          { id: 'categories', label: 'Categories' },
          { id: 'sync', label: 'Sync history' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as PaymentsTab)}
      />

      {tab === 'overview' ? <RazorpayOverview key={`overview-${refreshKey}`} /> : null}
      {tab === 'transactions' ? (
        <RazorpayTransactions key={`transactions-${refreshKey}`} categories={categories} />
      ) : null}
      {tab === 'reconciliation' ? (
        <RazorpayReconciliation key={`reconciliation-${refreshKey}`} categories={categories} />
      ) : null}
      {tab === 'categories' ? (
        <RazorpayCategories categories={categories} matchTypes={data.categories.match_types} />
      ) : null}
      {tab === 'sync' ? <RazorpaySyncHistory key={`sync-${refreshKey}`} /> : null}
    </div>
  );
}
