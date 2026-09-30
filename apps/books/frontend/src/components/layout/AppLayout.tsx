import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAppContent } from '@/app/AppContentContext';
import { SubscriptionProvider, useSubscription } from '@/app/SubscriptionContext';
import { SubscriptionLockScreen } from '@/pages/subscription/SubscriptionLockScreen';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TrialBanner } from './TrialBanner';
import { WorkspaceBanner } from './WorkspaceBanner';

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
  const { locked } = useSubscription();

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
      <TrialBanner />
      <div className="app-body">
        {locked ? null : <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />}
        <main className="app-main" id="main-content">
          {locked ? <SubscriptionLockScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
