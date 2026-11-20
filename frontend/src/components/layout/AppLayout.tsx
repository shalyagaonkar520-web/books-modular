import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { PageErrorBoundary } from '@/components/ErrorBoundary';
import { useAppContent } from '@/app/AppContentContext';
import { SubscriptionProvider, useSubscription } from '@/app/SubscriptionContext';
import { SubscriptionLockScreen } from '@/pages/subscription/SubscriptionLockScreen';

import { CommandPalette } from './CommandPalette';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TrialBanner } from './TrialBanner';
import { WorkspaceBanner } from './WorkspaceBanner';
import { BuddyDock } from '@/pages/workspace/BuddyDock';
import { WorkspaceModeBar } from '@/pages/workspace/WorkspaceModeBar';

export function AppLayout() {
  return (
    <SubscriptionProvider>
      <AppShell />
    </SubscriptionProvider>
  );
}

/**
 * Header, sidebar and the routed page. Once the organization's trial is over
 * without an active plan, the pages (and sidebar) give way to the lock screen;
 * the header stays so users can still sign out.
 */
function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { branding } = useAppContent();
  const { locked: planLocked } = useSubscription();
  // Support and the Admin console stay open while the plan has run out.
  const locked = planLocked && !/^\/(support|admin)(\/|$)/.test(location.pathname);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = branding.appName;
  }, [branding.appName]);

  return (
    <div className="app-shell">
      <WorkspaceBanner />
      <Header onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <WorkspaceModeBar />
      <TrialBanner />
      <div className="app-body">
        {locked ? null : <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />}
        {locked ? null : <CommandPalette />}
        <main className="app-main" id="main-content">
          <PageErrorBoundary>{locked ? <SubscriptionLockScreen /> : <Outlet />}</PageErrorBoundary>
        </main>
      </div>
      <BuddyDock />
    </div>
  );
}
