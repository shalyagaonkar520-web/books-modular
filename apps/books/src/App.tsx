import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, NavModule } from './components/layout/Sidebar';
import { HomePage } from './pages/Home/HomePage';
import { ItemsPage } from './pages/Items/ItemsPage';
import { ModuleView } from './pages/Modules/ModuleViews';
import { LandingPage } from './pages/Landing/LandingPage';
import { AuthModal } from './components/auth/AuthModal';
import { itemRepository } from './services/itemRepository';
import { ApiClient, UserProfile } from './services/apiClient';
import { Item } from './types/item';

export const App: React.FC = () => {
  // Navigation & View Mode
  const [currentView, setCurrentView] = useState<'landing' | 'app'>('landing');
  const [activeModule, setActiveModule] = useState<NavModule>('home');

  // Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => ApiClient.getStoredUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Data & Repository state
  const [items, setItems] = useState<Item[]>(() => itemRepository.getItems());
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global Quick Add Modal trigger
  const [isGlobalAddModalOpen, setIsGlobalAddModalOpen] = useState(false);

  // Sync with FastAPI server on mount & listen to repository changes
  useEffect(() => {
    let isMounted = true;

    const checkServerAndSync = async () => {
      try {
        setIsLoading(true);
        const serverItems = await itemRepository.syncWithServer();
        if (isMounted) {
          setItems(serverItems);
          setServerConnected(true);
        }
      } catch (err) {
        console.warn('FastAPI backend connection note:', err);
        if (isMounted) setServerConnected(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkServerAndSync();

    const unsubscribe = itemRepository.subscribe(() => {
      if (isMounted) setItems(itemRepository.getItems());
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // CRUD Operations linked to FastAPI repository
  const handleSaveItem = async (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => {
    await itemRepository.createItemAsync(itemData);
  };

  const handleUpdateItem = async (id: string, updates: Partial<Item>) => {
    await itemRepository.updateItemAsync(id, updates);
  };

  const handleDeleteItem = async (id: string) => {
    await itemRepository.deleteItemAsync(id);
  };

  const handleResetSeedData = async () => {
    const reset = await itemRepository.resetToDefaultAsync();
    setItems(reset);
  };

  // Authentication Handlers
  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setCurrentView('app');
  };

  const handleSignOut = () => {
    ApiClient.logout();
    setCurrentUser(null);
    setCurrentView('landing');
  };

  const handleEnterDemo = () => {
    if (!currentUser) {
      // Auto-assign primary demo admin user for immediate demo experience if not logged in
      const defaultUser: UserProfile = {
        id: 'user-1',
        name: 'Shalya Gaonkar',
        email: 'admin@zylkerbooks.com',
        role: 'Administrator',
        organization: 'Zylker Electronics India Pvt Ltd',
      };
      ApiClient.storeUser(defaultUser, 'demo_token');
      setCurrentUser(defaultUser);
    }
    setCurrentView('app');
  };

  // If in Landing Page view:
  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          onOpenAuth={handleOpenAuth}
          onEnterDemo={handleEnterDemo}
          isLoggedIn={!!currentUser}
          userName={currentUser?.name}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          initialMode={authMode}
        />
      </>
    );
  }

  // App Dashboard View (All Modules Unlocked!)
  return (
    <div className="zb-app-container">
      {/* Header Bar */}
      <Header
        serverConnected={serverConnected}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onNavigateLanding={() => setCurrentView('landing')}
        onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onQuickAddItem={() => {
          setActiveModule('items');
          setIsGlobalAddModalOpen(true);
        }}
      />

      <div className="zb-main-body">
        {/* Navigation Sidebar with ALL MODULES UNLOCKED */}
        <Sidebar
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Active Module View */}
        <main className="zb-content-area">
          {activeModule === 'home' && (
            <HomePage
              items={items}
              onNavigateItems={() => setActiveModule('items')}
              onQuickAddItem={() => {
                setActiveModule('items');
                setIsGlobalAddModalOpen(true);
              }}
              onResetSeedData={handleResetSeedData}
            />
          )}

          {activeModule === 'items' && (
            <ItemsPage
              items={items}
              onSaveItem={handleSaveItem}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onResetSeedData={handleResetSeedData}
              isAddModalOpen={isGlobalAddModalOpen}
              onCloseAddModal={() => setIsGlobalAddModalOpen(false)}
              onOpenAddModal={() => setIsGlobalAddModalOpen(true)}
            />
          )}

          {/* Unlocked views for all other modules */}
          {activeModule !== 'home' && activeModule !== 'items' && (
            <ModuleView
              module={activeModule}
              onNavigate={setActiveModule}
            />
          )}
        </main>
      </div>

      {/* Auth Modal for switching accounts */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialMode={authMode}
      />
    </div>
  );
};
