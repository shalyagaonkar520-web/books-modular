import { Item } from '../types/item';

const STORAGE_KEY = 'zoho_books_items_v1';

export interface ItemRepository {
  getItems(): Item[];
  getItemById(id: string): Item | null;
  createItem(item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Item;
  updateItem(id: string, updates: Partial<Item>): Item | null;
  deleteItem(id: string): boolean;
  resetToDefault(): Item[];
}

// Initial realistic accounting seed items
const DEFAULT_SEED_ITEMS: Item[] = [
  {
    id: 'item-101',
    name: 'Dell UltraSharp 27" 4K Monitor',
    type: 'goods',
    sku: 'MON-DELL-4K27',
    unit: 'pcs',
    description: '4K IPS Monitor with USB-C Hub for workstation setups',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&q=80',
    salesInfo: {
      sellingPrice: 38500,
      salesAccount: 'Sales - Hardware',
      description: 'Standard client price for Dell 4K display',
    },
    purchaseInfo: {
      costPrice: 29000,
      costAccount: 'Cost of Goods Sold',
      description: 'Vendor cost from Dell Authorized Distributor',
      preferredVendor: 'TechDistro India Pvt Ltd',
    },
    inventoryInfo: {
      trackInventory: true,
      openingStock: 25,
      openingStockRate: 29000,
      reorderLevel: 5,
      warehouseLocation: 'Main Warehouse - Shelf A3',
    },
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'item-102',
    name: 'Ergonomic Mesh Office Chair',
    type: 'goods',
    sku: 'FUR-CHR-ERG01',
    unit: 'pcs',
    description: 'High-back ergonomic mesh chair with adjustable lumbar support',
    imageUrl: 'https://images.unsplash.com/photo-1580481072645-022f9a6d1270?w=400&q=80',
    salesInfo: {
      sellingPrice: 14500,
      salesAccount: 'Sales - Office Supplies',
      description: 'Office furniture sales item',
    },
    purchaseInfo: {
      costPrice: 9200,
      costAccount: 'Cost of Goods Sold',
      description: 'Wholesale furniture procurement',
      preferredVendor: 'Urban Space Supplies',
    },
    inventoryInfo: {
      trackInventory: true,
      openingStock: 12,
      openingStockRate: 9200,
      reorderLevel: 3,
      warehouseLocation: 'Main Warehouse - Bay B',
    },
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'item-103',
    name: 'Custom Web Application Development',
    type: 'service',
    sku: 'SRV-WEB-DEV',
    unit: 'hrs',
    description: 'Professional full-stack software development per hour',
    salesInfo: {
      sellingPrice: 2500,
      salesAccount: 'Service Revenue',
      description: 'Hourly rate for custom enterprise web development',
    },
    purchaseInfo: {
      costPrice: 1200,
      costAccount: 'Subcontractor Costs',
      description: 'Internal developer billable cost rate',
    },
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'item-104',
    name: 'Logitech MX Master 3S Wireless Mouse',
    type: 'goods',
    sku: 'ACC-LOG-MX3S',
    unit: 'pcs',
    description: 'Performance wireless mouse with 8K DPI sensor',
    imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400&q=80',
    salesInfo: {
      sellingPrice: 8995,
      salesAccount: 'Sales - Accessories',
      description: 'Logitech peripheral retail',
    },
    purchaseInfo: {
      costPrice: 6400,
      costAccount: 'Cost of Goods Sold',
      description: 'Direct distributor supply',
      preferredVendor: 'LogiDirect Traders',
    },
    inventoryInfo: {
      trackInventory: true,
      openingStock: 4, // Low stock example!
      openingStockRate: 6400,
      reorderLevel: 10,
      warehouseLocation: 'Main Warehouse - Drawer C1',
    },
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'item-105',
    name: 'Annual Accounting & Tax Audit Service',
    type: 'service',
    sku: 'SRV-TAX-AUDIT',
    unit: 'project',
    description: 'Comprehensive financial statements audit and tax filing advisory',
    salesInfo: {
      sellingPrice: 75000,
      salesAccount: 'Consulting Revenue',
      description: 'Fixed audit retainer fee',
    },
    purchaseInfo: {
      costPrice: 40000,
      costAccount: 'Professional Fees',
      description: 'Chartered Accountant partner payout',
    },
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  }
];

import { ApiClient } from './apiClient';
import { db } from './firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export class LocalStorageItemRepository implements ItemRepository {
  private listeners: (() => void)[] = [];
  private isServerHealthy: boolean = false;

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    try {
      const existingData = localStorage.getItem(STORAGE_KEY);
      if (!existingData) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SEED_ITEMS));
      }
    } catch (e) {
      console.warn('LocalStorage access failed or unavailable, falling back to memory state', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  public getItems(): Item[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as Item[];
      }
    } catch (e) {
      console.error('Failed to parse items from local storage', e);
    }
    return DEFAULT_SEED_ITEMS;
  }

  public getItemById(id: string): Item | null {
    const items = this.getItems();
    return items.find(item => item.id === id) || null;
  }

  /**
   * Sync cache with items from Firebase Firestore & cloud server
   */
  public async syncWithServer(): Promise<Item[]> {
    // 1. Try Firebase Firestore
    try {
      const colRef = collection(db, 'items');
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        const firestoreItems: Item[] = [];
        snapshot.forEach(docSnap => {
          firestoreItems.push(docSnap.data() as Item);
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(firestoreItems));
        this.isServerHealthy = true;
        this.notify();
        return firestoreItems;
      }
    } catch (firebaseErr) {
      console.warn('Firebase Firestore read note:', firebaseErr);
    }

    // 2. Fallback to FastAPI server or seed
    try {
      const serverItems = await ApiClient.getItems();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serverItems));
      this.isServerHealthy = true;
      this.notify();

      // Seed initial items to Firebase Firestore in background
      try {
        for (const item of serverItems) {
          setDoc(doc(db, 'items', item.id), item).catch(() => {});
        }
      } catch (seedErr) {
        console.warn('Firebase initial seed note:', seedErr);
      }

      return serverItems;
    } catch (e) {
      this.isServerHealthy = false;
      console.warn('Unable to sync with cloud server, using local cache:', e);
      return this.getItems();
    }
  }

  public async createItemAsync(
    itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Item> {
    try {
      const created = await ApiClient.createItem(itemData);
      const items = [created, ...this.getItems().filter(i => i.id !== created.id)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      this.notify();

      // Save to Firebase Firestore
      try {
        await setDoc(doc(db, 'items', created.id), created);
      } catch (fErr) {
        console.warn('Firebase save note:', fErr);
      }

      return created;
    } catch (e) {
      console.warn('Backend item creation failed, saving locally:', e);
      const created = this.createItem(itemData);
      try {
        setDoc(doc(db, 'items', created.id), created).catch(() => {});
      } catch {}
      return created;
    }
  }

  public createItem(itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>): Item {
    const items = this.getItems();
    const now = new Date().toISOString();
    const newItem: Item = {
      ...itemData,
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [newItem, ...items];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save created item to localStorage', e);
    }
    this.notify();

    // Asynchronously try to create on backend
    ApiClient.createItem(itemData)
      .then(serverItem => {
        const current = this.getItems().map(i => (i.id === newItem.id ? serverItem : i));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        this.notify();
      })
      .catch(err => console.warn('Background backend sync failed:', err));

    return newItem;
  }

  public async updateItemAsync(id: string, updates: Partial<Item>): Promise<Item | null> {
    try {
      const updated = await ApiClient.updateItem(id, updates);
      const items = this.getItems().map(item => (item.id === id ? updated : item));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      this.notify();

      // Sync with Firebase Firestore
      try {
        await setDoc(doc(db, 'items', id), updated, { merge: true });
      } catch (fErr) {
        console.warn('Firebase update note:', fErr);
      }

      return updated;
    } catch (e) {
      console.warn('Backend item update failed, updating locally:', e);
      const updated = this.updateItem(id, updates);
      if (updated) {
        try {
          setDoc(doc(db, 'items', id), updated, { merge: true }).catch(() => {});
        } catch {}
      }
      return updated;
    }
  }

  public updateItem(id: string, updates: Partial<Item>): Item | null {
    const items = this.getItems();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    const updatedItem: Item = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    items[index] = updatedItem;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to update item in localStorage', e);
    }
    this.notify();

    // Asynchronously try to update on backend
    ApiClient.updateItem(id, updates).catch(err =>
      console.warn('Background backend update sync failed:', err)
    );

    return updatedItem;
  }

  public async deleteItemAsync(id: string): Promise<boolean> {
    try {
      await ApiClient.deleteItem(id);
      const items = this.getItems().filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      this.notify();

      // Delete from Firebase Firestore
      try {
        await deleteDoc(doc(db, 'items', id));
      } catch (fErr) {
        console.warn('Firebase delete note:', fErr);
      }

      return true;
    } catch (e) {
      console.warn('Backend delete failed, deleting locally:', e);
      try {
        deleteDoc(doc(db, 'items', id)).catch(() => {});
      } catch {}
      return this.deleteItem(id);
    }
  }

  public deleteItem(id: string): boolean {
    const items = this.getItems();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return false;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to delete item from localStorage', e);
    }
    this.notify();

    // Asynchronously try to delete on backend
    ApiClient.deleteItem(id).catch(err =>
      console.warn('Background backend delete sync failed:', err)
    );

    return true;
  }

  public async resetToDefaultAsync(): Promise<Item[]> {
    try {
      const resetItems = await ApiClient.resetItems();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resetItems));
      this.notify();
      return resetItems;
    } catch (e) {
      console.warn('Backend reset failed, resetting locally:', e);
      return this.resetToDefault();
    }
  }

  public resetToDefault(): Item[] {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SEED_ITEMS));
    } catch (e) {
      console.error('Failed to reset items in localStorage', e);
    }
    this.notify();

    ApiClient.resetItems().catch(err =>
      console.warn('Background backend reset sync failed:', err)
    );

    return DEFAULT_SEED_ITEMS;
  }
}

export const itemRepository = new LocalStorageItemRepository();

