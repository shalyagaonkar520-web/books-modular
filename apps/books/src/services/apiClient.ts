import { Item, ItemFilterOptions, ItemSortOptions } from '../types/item';
import {
  ReceivablesSummary,
  PayablesSummary,
  CashFlowSummary,
  CashFlowPeriod,
  InventorySummary
} from '../types/dashboard';

export interface DashboardSummaryResponse {
  receivables: ReceivablesSummary;
  payables: PayablesSummary;
  cashFlow: CashFlowSummary;
  inventory: InventorySummary;
}

const API_BASE = '/api';

export class ApiClient {
  /**
   * Health check to test connectivity to the FastAPI server
   */
  public static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve items from the FastAPI backend with search, filters, and sort
   */
  public static async getItems(
    filterOptions?: ItemFilterOptions,
    sortOptions?: ItemSortOptions
  ): Promise<Item[]> {
    const params = new URLSearchParams();

    if (filterOptions?.searchQuery?.trim()) {
      params.set('search', filterOptions.searchQuery.trim());
    }
    if (filterOptions?.typeFilter && filterOptions.typeFilter !== 'all') {
      params.set('type_filter', filterOptions.typeFilter);
    }
    if (filterOptions?.inventoryFilter && filterOptions.inventoryFilter !== 'all') {
      params.set('inventory_filter', filterOptions.inventoryFilter);
    }
    if (sortOptions?.field) {
      params.set('sort_by', sortOptions.field);
    }
    if (sortOptions?.order) {
      params.set('sort_order', sortOptions.order);
    }

    const queryString = params.toString();
    const url = `${API_BASE}/items${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to fetch items from server');
    }
    return response.json();
  }

  /**
   * Fetch single item by ID
   */
  public static async getItemById(id: string): Promise<Item> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || `Failed to fetch item ${id}`);
    }
    return response.json();
  }

  /**
   * Create a new item
   */
  public static async createItem(
    itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Item> {
    const response = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to create item on server');
    }
    return response.json();
  }

  /**
   * Update an existing item
   */
  public static async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to update item on server');
    }
    return response.json();
  }

  /**
   * Delete an item by ID
   */
  public static async deleteItem(id: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to delete item on server');
    }
    return true;
  }

  /**
   * Reset database to default seed items
   */
  public static async resetItems(): Promise<Item[]> {
    const response = await fetch(`${API_BASE}/items/reset`, {
      method: 'POST',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to reset items on server');
    }
    return response.json();
  }

  /**
   * Fetch aggregated dashboard statistics
   */
  public static async getDashboardSummary(
    period: CashFlowPeriod = 'this_fiscal_year'
  ): Promise<DashboardSummaryResponse> {
    const response = await fetch(
      `${API_BASE}/dashboard/summary?period=${encodeURIComponent(period)}`
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to fetch dashboard summary');
    }
    return response.json();
  }
}
