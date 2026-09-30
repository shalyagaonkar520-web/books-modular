import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAppContent } from '@/app/AppContentContext';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { WorkspaceBanner } from './WorkspaceBanner';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { branding } = useAppContent();

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
      <div className="app-body">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <main className="app-main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
