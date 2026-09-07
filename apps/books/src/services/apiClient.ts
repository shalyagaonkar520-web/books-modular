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

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  avatar?: string;
}

export interface DemoUser extends UserProfile {
  password: string;
  description: string;
}

const API_BASE = '/api';
const AUTH_USER_KEY = 'zoho_books_auth_user';
const AUTH_TOKEN_KEY = 'zoho_books_auth_token';

export class ApiClient {
  /**
   * Health check to test connectivity to the cloud server
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
   * Log in user with email and password
   */
  public static async login(
    email: string,
    password: string
  ): Promise<{ user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(err.detail || 'Login failed');
    }

    const data = await response.json();
    this.storeUser(data.user, data.token);
    return data;
  }

  /**
   * Register new user
   */
  public static async register(
    name: string,
    email: string,
    password: string,
    organization: string = 'Zylker Electronics India Pvt Ltd',
    role: string = 'Administrator'
  ): Promise<{ user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, organization, role }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }

    const data = await response.json();
    this.storeUser(data.user, data.token);
    return data;
  }

  /**
   * Get cached logged-in user
   */
  public static getStoredUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return null;
  }

  /**
   * Persist user & token to localStorage
   */
  public static storeUser(user: UserProfile, token: string): void {
    try {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }

  /**
   * Clear user session
   */
  public static logout(): void {
    try {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Fetch demo users for instant 1-click test login
   */
  public static async getDemoUsers(): Promise<DemoUser[]> {
    try {
      const res = await fetch(`${API_BASE}/auth/demo-users`);
      if (res.ok) return res.json();
    } catch {
      // fallback
    }
    return [
      {
        id: 'user-1',
        name: 'Shalya Gaonkar',
        email: 'admin@zylkerbooks.com',
        password: 'password123',
        role: 'Administrator',
        organization: 'Zylker Electronics India Pvt Ltd',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
        description: 'Full access to items, sales, inventory & banking',
      },
      {
        id: 'user-2',
        name: 'Priya Sharma',
        email: 'accountant@rooman.com',
        password: 'password123',
        role: 'Chief Accountant',
        organization: 'Zylker Electronics India Pvt Ltd',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
        description: 'Audit, tax filing, journals, balance sheet & payroll access',
      },
    ];
  }

  /**
   * Retrieve items from the cloud server with search, filters, and sort
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
