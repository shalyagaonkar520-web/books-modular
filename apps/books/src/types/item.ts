export type ItemType = 'goods' | 'service';

export interface SalesInfo {
  sellingPrice: number;
  salesAccount: string;
  description?: string;
}

export interface PurchaseInfo {
  costPrice: number;
  costAccount: string;
  description?: string;
  preferredVendor?: string;
}

export interface InventoryInfo {
  trackInventory: boolean;
  openingStock: number;
  openingStockRate: number;
  reorderLevel: number;
  warehouseLocation?: string;
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  sku: string;
  unit: string; // e.g. "pcs", "kg", "box", "hrs"
  description?: string;
  imageUrl?: string;
  salesInfo: SalesInfo;
  purchaseInfo: PurchaseInfo;
  inventoryInfo?: InventoryInfo;
  createdAt: string;
  updatedAt: string;
}

export interface ItemFilterOptions {
  searchQuery: string;
  typeFilter: 'all' | 'goods' | 'service';
  inventoryFilter: 'all' | 'tracked' | 'non-tracked';
}

export type SortField = 'name' | 'sellingPrice' | 'costPrice' | 'createdAt' | 'sku';
export type SortOrder = 'asc' | 'desc';

export interface ItemSortOptions {
  field: SortField;
  order: SortOrder;
}
