import React, { useState, useMemo } from 'react';
import { Item, ItemFilterOptions, ItemSortOptions, SortField, SortOrder } from '../../types/item';
import { ItemService } from '../../services/itemService';
import { ItemsTable } from '../../components/items/ItemsTable';
import { ItemFormModal } from '../../components/items/ItemFormModal';
import { ItemDetailModal } from '../../components/items/ItemDetailModal';
import { DeleteConfirmModal } from '../../components/items/DeleteConfirmModal';
import {
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

interface ItemsPageProps {
  items: Item[];
  onSaveItem: (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateItem: (id: string, updates: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
  onResetSeedData: () => void;
  isAddModalOpen: boolean;
  onCloseAddModal: () => void;
  onOpenAddModal: () => void;
}

const ITEMS_PER_PAGE = 8;

export const ItemsPage: React.FC<ItemsPageProps> = ({
  items,
  onSaveItem,
  onUpdateItem,
  onDeleteItem,
  onResetSeedData,
  isAddModalOpen,
  onCloseAddModal,
  onOpenAddModal,
}) => {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'goods' | 'service'>('all');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'tracked' | 'non-tracked'>('all');

  // Sort state
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Modals state
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    const filterOptions: ItemFilterOptions = {
      searchQuery,
      typeFilter,
      inventoryFilter,
    };
    const sortOptions: ItemSortOptions = {
      field: sortField,
      order: sortOrder,
    };
    return ItemService.filterAndSortItems(items, filterOptions, sortOptions);
  }, [items, searchQuery, typeFilter, inventoryFilter, sortField, sortOrder]);

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  return (
    <div className="zb-page zb-items-page">
      {/* Page Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <div className="zb-breadcrumb">
            <span>Inventory</span> / <span className="active">Catalog</span>
          </div>
          <h1 className="zb-page-title">Inventory & Catalog Management</h1>
        </div>

        <div className="zb-flex-align gap-3">
          <button
            className="zb-btn zb-btn-secondary zb-btn-sm"
            onClick={onResetSeedData}
            title="Reset repository to initial sample items"
          >
            <RefreshCw size={14} /> Reset Data
          </button>
          <button className="zb-btn zb-btn-primary" onClick={onOpenAddModal}>
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Filters, Sort */}
      <div className="zb-card zb-toolbar-card">
        <div className="zb-toolbar-row">
          {/* Search Box */}
          <div className="zb-toolbar-search">
            <Search size={16} className="icon" />
            <input
              type="text"
              placeholder="Search by Item Name, SKU, or Type..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Type Filter */}
          <div className="zb-toolbar-group">
            <label className="label">
              <Filter size={14} /> Type:
            </label>
            <select
              className="zb-select sm"
              value={typeFilter}
              onChange={e => {
                setTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Types</option>
              <option value="goods">Goods Only</option>
              <option value="service">Service Only</option>
            </select>
          </div>

          {/* Inventory Filter */}
          <div className="zb-toolbar-group">
            <label className="label">
              <Layers size={14} /> Stock Tracked:
            </label>
            <select
              className="zb-select sm"
              value={inventoryFilter}
              onChange={e => {
                setInventoryFilter(e.target.value as any);
                setCurrentPage(1);
              }}
            >
              <option value="all">All Inventory</option>
              <option value="tracked">Tracked Items</option>
              <option value="non-tracked">Non-Tracked / Services</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="zb-toolbar-group">
            <label className="label">
              <ArrowUpDown size={14} /> Sort By:
            </label>
            <select
              className="zb-select sm"
              value={`${sortField}-${sortOrder}`}
              onChange={e => {
                const [f, o] = e.target.value.split('-');
                setSortField(f as SortField);
                setSortOrder(o as SortOrder);
              }}
            >
              <option value="createdAt-desc">Created Date (Newest First)</option>
              <option value="createdAt-asc">Created Date (Oldest First)</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="sellingPrice-desc">Selling Price (High to Low)</option>
              <option value="sellingPrice-asc">Selling Price (Low to High)</option>
              <option value="costPrice-desc">Cost Price (High to Low)</option>
              <option value="costPrice-asc">Cost Price (Low to High)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items Table Container */}
      <div className="zb-card zb-table-card">
        <ItemsTable
          items={paginatedItems}
          onViewItem={setViewingItem}
          onEditItem={setEditingItem}
          onDeleteItem={setDeletingItem}
          onQuickAddItem={onOpenAddModal}
        />

        {/* Pagination Footer */}
        {filteredItems.length > 0 && (
          <div className="zb-pagination-bar zb-flex-between">
            <span className="zb-pagination-info">
              Showing <strong>{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredItems.length)}</strong> to{' '}
              <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}</strong> of{' '}
              <strong>{filteredItems.length}</strong> items
            </span>

            <div className="zb-pagination-controls">
              <button
                className="zb-btn zb-btn-secondary zb-btn-sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="zb-page-number">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="zb-btn zb-btn-secondary zb-btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <ItemFormModal
        isOpen={isAddModalOpen}
        existingItems={items}
        onClose={onCloseAddModal}
        onSave={onSaveItem}
        onUpdate={onUpdateItem}
      />

      {/* Edit Item Modal */}
      <ItemFormModal
        isOpen={!!editingItem}
        initialData={editingItem}
        existingItems={items}
        onClose={() => setEditingItem(null)}
        onSave={onSaveItem}
        onUpdate={onUpdateItem}
      />

      {/* View Detail Modal */}
      <ItemDetailModal
        item={viewingItem}
        onClose={() => setViewingItem(null)}
        onEdit={setEditingItem}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingItem}
        item={deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={onDeleteItem}
      />
    </div>
  );
};
