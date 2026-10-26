/** Warehouses, transfers, composite items, price lists and stock reports. */
import { api } from './client';
import type { Message, Page } from './types';

type Query = Record<string, string | number | boolean | undefined | null>;

export interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
  itemCount: number;
  stockValue: number;
}

export interface TransferOrder {
  id: string;
  transferNumber: string;
  date: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  status: 'draft' | 'transferred';
  notes?: string | null;
  lines: Array<{ itemId: string; itemName: string; quantity: number; batchNumber?: string | null }>;
}

export interface Component {
  itemId: string;
  itemName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  stockOnHand: number;
}

export interface AssemblyRecord {
  id: string;
  assemblyNumber: string;
  itemId: string;
  itemName: string;
  quantity: number;
  date: string;
  warehouseId: string;
  unitCost: number;
  notes?: string | null;
}

export interface PriceList {
  id: string;
  name: string;
  kind: 'sales' | 'purchase';
  method: 'markup' | 'per_item';
  percentage: number;
  rounding: 'none' | 'whole' | 'nearest_10' | 'x99';
  description?: string | null;
  isActive: boolean;
  items: Array<{ itemId: string; rate: number }>;
}

export interface StockMovement {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string | null;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  balance?: number | null;
}

export interface StockSummary {
  warehouses: Warehouse[];
  rows: Array<{
    itemId: string;
    itemName: string;
    sku: string;
    unit: string;
    byWarehouse: Record<string, number>;
    total: number;
    unitCost: number;
    value: number;
    reorderLevel: number;
    belowReorder: boolean;
  }>;
  totalValue: number;
}

export interface StockBatch {
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  batchNumber: string;
  expiryDate?: string | null;
  quantity: number;
  expired: boolean;
}

export const warehousesApi = {
  list: () => api.get<Warehouse[]>('/warehouses'),
  create: (body: unknown) => api.post<Warehouse>('/warehouses', body),
  update: (id: string, body: unknown) => api.put<Warehouse>(`/warehouses/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/warehouses/${id}`),
};

export const transfersApi = {
  list: (query?: Query) => api.get<Page<TransferOrder>>('/transfer-orders', query),
  create: (body: unknown) => api.post<TransferOrder>('/transfer-orders', body),
  transfer: (id: string) => api.post<TransferOrder>(`/transfer-orders/${id}/transfer`),
  remove: (id: string) => api.delete<Message>(`/transfer-orders/${id}`),
};

export const compositesApi = {
  components: (itemId: string) => api.get<Component[]>(`/composite-items/${itemId}/components`),
  setComponents: (itemId: string, body: Array<{ itemId: string; quantity: number }>) => api.put<Component[]>(`/composite-items/${itemId}/components`, body),
  assemble: (itemId: string, body: { quantity: number; date: string; warehouseId?: string | null; notes?: string | null }) =>
    api.post<AssemblyRecord>(`/composite-items/${itemId}/assemble`, body),
  assemblies: (itemId?: string) => api.get<AssemblyRecord[]>('/composite-items/assemblies', itemId ? { itemId } : undefined),
  undoAssembly: (id: string) => api.delete<Message>(`/composite-items/assemblies/${id}`),
};

export const priceListsApi = {
  list: () => api.get<PriceList[]>('/price-lists'),
  create: (body: unknown) => api.post<PriceList>('/price-lists', body),
  update: (id: string, body: unknown) => api.put<PriceList>(`/price-lists/${id}`, body),
  remove: (id: string) => api.delete<Message>(`/price-lists/${id}`),
  prices: (id: string) => api.get<Array<{ itemId: string; baseRate: number; rate: number }>>(`/price-lists/${id}/prices`),
};

export const stockApi = {
  movements: (query?: Query) => api.get<Page<StockMovement>>('/stock/movements', query),
  summary: () => api.get<StockSummary>('/stock/summary'),
  batches: (query?: Query) => api.get<StockBatch[]>('/stock/batches', query),
};
