import { Item, ItemFilterOptions, ItemSortOptions } from '../types/item';

export interface ValidationError {
  field: string;
  message: string;
}

export class ItemService {
  public static filterAndSortItems(
    items: Item[],
    filterOptions: ItemFilterOptions,
    sortOptions: ItemSortOptions
  ): Item[] {
    let result = [...items];

    // 1. Search Query (Name, SKU, Type)
    if (filterOptions.searchQuery.trim()) {
      const q = filterOptions.searchQuery.toLowerCase().trim();
      result = result.filter(
        item =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }

    // 2. Type Filter (goods vs service vs all)
    if (filterOptions.typeFilter !== 'all') {
      result = result.filter(item => item.type === filterOptions.typeFilter);
    }

    // 3. Inventory Filter (tracked vs non-tracked vs all)
    if (filterOptions.inventoryFilter === 'tracked') {
      result = result.filter(
        item => item.type === 'goods' && item.inventoryInfo?.trackInventory
      );
    } else if (filterOptions.inventoryFilter === 'non-tracked') {
      result = result.filter(
        item => item.type === 'service' || !item.inventoryInfo?.trackInventory
      );
    }

    // 4. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortOptions.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sku':
          comparison = a.sku.localeCompare(b.sku);
          break;
        case 'sellingPrice':
          comparison = a.salesInfo.sellingPrice - b.salesInfo.sellingPrice;
          break;
        case 'costPrice':
          comparison = a.purchaseInfo.costPrice - b.purchaseInfo.costPrice;
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOptions.order === 'asc' ? comparison : -comparison;
    });

    return result;
  }

  public static validateItem(
    itemData: Partial<Item>,
    existingItems: Item[],
    editingId?: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Item Name validation
    if (!itemData.name || !itemData.name.trim()) {
      errors.push({ field: 'name', message: 'Item name is required.' });
    }

    // Type validation
    if (!itemData.type) {
      errors.push({ field: 'type', message: 'Please select an item type (Goods or Service).' });
    }

    // SKU validation & uniqueness
    if (!itemData.sku || !itemData.sku.trim()) {
      errors.push({ field: 'sku', message: 'SKU is required.' });
    } else {
      const formattedSku = itemData.sku.trim().toUpperCase();
      const duplicate = existingItems.find(
        item => item.sku.toUpperCase() === formattedSku && item.id !== editingId
      );
      if (duplicate) {
        errors.push({
          field: 'sku',
          message: `SKU "${formattedSku}" is already assigned to "${duplicate.name}". SKUs must be unique.`,
        });
      }
    }

    // Sales Selling Price
    if (itemData.salesInfo) {
      if (itemData.salesInfo.sellingPrice === undefined || itemData.salesInfo.sellingPrice === null) {
        errors.push({ field: 'sellingPrice', message: 'Selling price is required.' });
      } else if (itemData.salesInfo.sellingPrice < 0) {
        errors.push({ field: 'sellingPrice', message: 'Selling price cannot be negative.' });
      }
    }

    // Purchase Cost Price
    if (itemData.purchaseInfo) {
      if (itemData.purchaseInfo.costPrice === undefined || itemData.purchaseInfo.costPrice === null) {
        errors.push({ field: 'costPrice', message: 'Cost price is required.' });
      } else if (itemData.purchaseInfo.costPrice < 0) {
        errors.push({ field: 'costPrice', message: 'Cost price cannot be negative.' });
      }
    }

    // Inventory Validation for Goods
    if (itemData.type === 'goods' && itemData.inventoryInfo?.trackInventory) {
      if (
        itemData.inventoryInfo.openingStock === undefined ||
        itemData.inventoryInfo.openingStock === null
      ) {
        errors.push({ field: 'openingStock', message: 'Opening stock is required.' });
      } else if (itemData.inventoryInfo.openingStock < 0) {
        errors.push({ field: 'openingStock', message: 'Opening stock cannot be negative.' });
      }

      if (
        itemData.inventoryInfo.openingStockRate !== undefined &&
        itemData.inventoryInfo.openingStockRate < 0
      ) {
        errors.push({ field: 'openingStockRate', message: 'Stock rate cannot be negative.' });
      }

      if (
        itemData.inventoryInfo.reorderLevel !== undefined &&
        itemData.inventoryInfo.reorderLevel < 0
      ) {
        errors.push({ field: 'reorderLevel', message: 'Reorder level cannot be negative.' });
      }
    }

    return errors;
  }
}
