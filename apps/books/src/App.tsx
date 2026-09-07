import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, NavModule } from './components/layout/Sidebar';
import { LockedModal } from './components/ui/LockedModal';
import { HomePage } from './pages/Home/HomePage';
import { ItemsPage } from './pages/Items/ItemsPage';
import { itemRepository } from './services/itemRepository';
import { Item } from './types/item';

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<NavModule>('home');
  const [items, setItems] = useState<Item[]>(() => itemRepository.getItems());
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Locked modal state
  const [lockedModuleName, setLockedModuleName] = useState<string | null>(null);

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

  const handleLockedClick = (moduleName: string) => {
    setLockedModuleName(moduleName);
  };

  return (
    <div className="zb-app-container">
      {/* Header Bar */}
      <Header
        serverConnected={serverConnected}
        onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onQuickAddItem={() => {
          setActiveModule('items');
          setIsGlobalAddModalOpen(true);
        }}
      />

      <div className="zb-main-body">
        {/* Navigation Sidebar */}
        <Sidebar
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          onLockedClick={handleLockedClick}
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
        </main>
      </div>

      {/* Locked Module Notification Modal */}
      <LockedModal
        isOpen={!!lockedModuleName}
        moduleName={lockedModuleName}
        onClose={() => setLockedModuleName(null)}
        onNavigateItems={() => setActiveModule('items')}
      />
    </div>
  );
};
