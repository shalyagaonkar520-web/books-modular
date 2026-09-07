import React, { useState, useEffect } from 'react';
import { Item, ItemType } from '../../types/item';
import { ItemService, ValidationError } from '../../services/itemService';
import { X, Package, Wrench, AlertCircle, Info, Upload, Image as ImageIcon } from 'lucide-react';

interface ItemFormModalProps {
  isOpen: boolean;
  initialData?: Item | null;
  existingItems: Item[];
  onClose: () => void;
  onSave: (itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<Item>) => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  initialData,
  existingItems,
  onClose,
  onSave,
  onUpdate,
}) => {
  const isEditing = !!initialData;

  const [type, setType] = useState<ItemType>('goods');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Sales Info
  const [sellingPrice, setSellingPrice] = useState<string>('0');
  const [salesAccount, setSalesAccount] = useState('Sales');
  const [salesDescription, setSalesDescription] = useState('');

  // Purchase Info
  const [costPrice, setCostPrice] = useState<string>('0');
  const [costAccount, setCostAccount] = useState('Cost of Goods Sold');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [preferredVendor, setPreferredVendor] = useState('');

  // Inventory Info (Goods only)
  const [trackInventory, setTrackInventory] = useState(true);
  const [openingStock, setOpeningStock] = useState<string>('10');
  const [openingStockRate, setOpeningStockRate] = useState<string>('0');
  const [reorderLevel, setReorderLevel] = useState<string>('5');
  const [warehouseLocation, setWarehouseLocation] = useState('Main Warehouse');

  const [errors, setErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setName(initialData.name);
      setSku(initialData.sku);
      setUnit(initialData.unit);
      setDescription(initialData.description || '');
      setImageUrl(initialData.imageUrl || '');

      setSellingPrice(initialData.salesInfo.sellingPrice.toString());
      setSalesAccount(initialData.salesInfo.salesAccount || 'Sales');
      setSalesDescription(initialData.salesInfo.description || '');

      setCostPrice(initialData.purchaseInfo.costPrice.toString());
      setCostAccount(initialData.purchaseInfo.costAccount || 'Cost of Goods Sold');
      setPurchaseDescription(initialData.purchaseInfo.description || '');
      setPreferredVendor(initialData.purchaseInfo.preferredVendor || '');

      if (initialData.type === 'goods' && initialData.inventoryInfo) {
        setTrackInventory(initialData.inventoryInfo.trackInventory);
        setOpeningStock(initialData.inventoryInfo.openingStock.toString());
        setOpeningStockRate(initialData.inventoryInfo.openingStockRate.toString());
        setReorderLevel(initialData.inventoryInfo.reorderLevel.toString());
        setWarehouseLocation(initialData.inventoryInfo.warehouseLocation || 'Main Warehouse');
      } else {
        setTrackInventory(false);
      }
    } else {
      // Reset form
      setType('goods');
      setName('');
      setSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
      setUnit('pcs');
      setDescription('');
      setImageUrl('');
      setSellingPrice('0');
      setSalesAccount('Sales');
      setSalesDescription('');
      setCostPrice('0');
      setCostAccount('Cost of Goods Sold');
      setPurchaseDescription('');
      setPreferredVendor('');
      setTrackInventory(true);
      setOpeningStock('10');
      setOpeningStockRate('0');
      setReorderLevel('5');
      setWarehouseLocation('Main Warehouse');
    }
    setErrors([]);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const getFieldError = (fieldName: string) => {
    return errors.find(err => err.field === fieldName)?.message;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedSellingPrice = parseFloat(sellingPrice) || 0;
    const parsedCostPrice = parseFloat(costPrice) || 0;
    const parsedOpeningStock = parseFloat(openingStock) || 0;
    const parsedOpeningRate = parseFloat(openingStockRate) || parsedCostPrice;
    const parsedReorder = parseFloat(reorderLevel) || 0;

    const payload: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      type,
      sku: sku.trim(),
      unit: unit.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim() || undefined,
      salesInfo: {
        sellingPrice: parsedSellingPrice,
        salesAccount: salesAccount.trim(),
        description: salesDescription.trim(),
      },
      purchaseInfo: {
        costPrice: parsedCostPrice,
        costAccount: costAccount.trim(),
        description: purchaseDescription.trim(),
        preferredVendor: preferredVendor.trim() || undefined,
      },
      inventoryInfo:
        type === 'goods'
          ? {
              trackInventory,
              openingStock: trackInventory ? parsedOpeningStock : 0,
              openingStockRate: trackInventory ? parsedOpeningRate : 0,
              reorderLevel: trackInventory ? parsedReorder : 0,
              warehouseLocation: warehouseLocation.trim(),
            }
          : undefined,
    };

    const validationErrors = ItemService.validateItem(
      payload,
      existingItems,
      initialData?.id
    );

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (isEditing && initialData) {
      onUpdate(initialData.id, payload);
    } else {
      onSave(payload);
    }
    onClose();
  };

  return (
    <div className="zb-modal-overlay" onClick={onClose}>
      <div
        className="zb-modal-card zb-item-form-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="zb-modal-header zb-flex-between">
          <div className="zb-modal-title-group">
            <h3 className="zb-modal-title">{isEditing ? 'Edit Item' : 'New Item'}</h3>
            <span className="zb-modal-subtitle">
              {isEditing ? `Modify details for ${initialData?.name}` : 'Create new goods or service catalog item'}
            </span>
          </div>
          <button className="zb-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Validation Summary Box */}
        {errors.length > 0 && (
          <div className="zb-error-summary">
            <AlertCircle size={18} className="zb-error-icon" />
            <div>
              <div className="zb-error-summary-title">Please fix the following validation errors:</div>
              <ul className="zb-error-list">
                {errors.map((err, idx) => (
                  <li key={idx}>{err.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="zb-form-scrollable">
          {/* Section 1: Basic Info */}
          <div className="zb-form-section">
            <h4 className="zb-form-section-title">1. Basic Information</h4>

            {/* Type selector */}
            <div className="zb-form-group">
              <label className="zb-form-label">Item Type *</label>
              <div className="zb-radio-toggle-group">
                <button
                  type="button"
                  className={`zb-radio-btn ${type === 'goods' ? 'selected' : ''}`}
                  onClick={() => {
                    setType('goods');
                    setTrackInventory(true);
                  }}
                >
                  <Package size={16} /> Goods (Physical Inventory)
                </button>
                <button
                  type="button"
                  className={`zb-radio-btn ${type === 'service' ? 'selected' : ''}`}
                  onClick={() => {
                    setType('service');
                    setTrackInventory(false);
                  }}
                >
                  <Wrench size={16} /> Service (Billable Hours/Fees)
                </button>
              </div>
            </div>

            <div className="zb-form-row two-col">
              <div className="zb-form-group">
                <label className="zb-form-label">Item Name *</label>
                <input
                  type="text"
                  className={`zb-input ${getFieldError('name') ? 'is-invalid' : ''}`}
                  placeholder="e.g. Dell 27 Monitor or Consulting Service"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
                {getFieldError('name') && (
                  <span className="zb-field-error">{getFieldError('name')}</span>
                )}
              </div>

              <div className="zb-form-group">
                <label className="zb-form-label">
                  SKU (Stock Keeping Unit) *
                </label>
                <input
                  type="text"
                  className={`zb-input ${getFieldError('sku') ? 'is-invalid' : ''}`}
                  placeholder="e.g. MON-DELL-001"
                  value={sku}
                  onChange={e => setSku(e.target.value.toUpperCase())}
                />
                {getFieldError('sku') && (
                  <span className="zb-field-error">{getFieldError('sku')}</span>
                )}
              </div>
            </div>

            <div className="zb-form-row two-col">
              <div className="zb-form-group">
                <label className="zb-form-label">Unit *</label>
                <select
                  className="zb-select"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                >
                  <option value="pcs">pcs (Pieces)</option>
                  <option value="kg">kg (Kilograms)</option>
                  <option value="box">box (Boxes)</option>
                  <option value="hrs">hrs (Hours)</option>
                  <option value="set">set (Sets)</option>
                  <option value="project">project (Projects)</option>
                </select>
              </div>

              <div className="zb-form-group">
                <label className="zb-form-label">Image URL (Optional)</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="https://images.unsplash.com/..."
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="zb-form-group">
              <label className="zb-form-label">Description</label>
              <textarea
                className="zb-textarea"
                rows={2}
                placeholder="Internal item description or customer invoice notes..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Section 2: Sales Information */}
          <div className="zb-form-section">
            <h4 className="zb-form-section-title">2. Sales Information</h4>
            <div className="zb-form-row two-col">
              <div className="zb-form-group">
                <label className="zb-form-label">Selling Price (₹) *</label>
                <div className="zb-input-addon-group">
                  <span className="zb-addon">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={`zb-input ${getFieldError('sellingPrice') ? 'is-invalid' : ''}`}
                    placeholder="0.00"
                    value={sellingPrice}
                    onChange={e => setSellingPrice(e.target.value)}
                  />
                </div>
                {getFieldError('sellingPrice') && (
                  <span className="zb-field-error">{getFieldError('sellingPrice')}</span>
                )}
              </div>

              <div className="zb-form-group">
                <label className="zb-form-label">Sales Account</label>
                <select
                  className="zb-select"
                  value={salesAccount}
                  onChange={e => setSalesAccount(e.target.value)}
                >
                  <option value="Sales">Sales</option>
                  <option value="General Income">General Income</option>
                  <option value="Service Revenue">Service Revenue</option>
                  <option value="Consulting Revenue">Consulting Revenue</option>
                </select>
              </div>
            </div>

            <div className="zb-form-group">
              <label className="zb-form-label">Sales Description</label>
              <input
                type="text"
                className="zb-input"
                placeholder="Default text to appear on customer invoices"
                value={salesDescription}
                onChange={e => setSalesDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Section 3: Purchase Information */}
          <div className="zb-form-section">
            <h4 className="zb-form-section-title">3. Purchase Information</h4>
            <div className="zb-form-row two-col">
              <div className="zb-form-group">
                <label className="zb-form-label">Cost Price (₹) *</label>
                <div className="zb-input-addon-group">
                  <span className="zb-addon">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={`zb-input ${getFieldError('costPrice') ? 'is-invalid' : ''}`}
                    placeholder="0.00"
                    value={costPrice}
                    onChange={e => setCostPrice(e.target.value)}
                  />
                </div>
                {getFieldError('costPrice') && (
                  <span className="zb-field-error">{getFieldError('costPrice')}</span>
                )}
              </div>

              <div className="zb-form-group">
                <label className="zb-form-label">Cost Account</label>
                <select
                  className="zb-select"
                  value={costAccount}
                  onChange={e => setCostAccount(e.target.value)}
                >
                  <option value="Cost of Goods Sold">Cost of Goods Sold (COGS)</option>
                  <option value="Subcontractor Costs">Subcontractor Costs</option>
                  <option value="Operating Expenses">Operating Expenses</option>
                </select>
              </div>
            </div>

            <div className="zb-form-row two-col">
              <div className="zb-form-group">
                <label className="zb-form-label">Preferred Vendor</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. Dell India / Acme Suppliers"
                  value={preferredVendor}
                  onChange={e => setPreferredVendor(e.target.value)}
                />
              </div>

              <div className="zb-form-group">
                <label className="zb-form-label">Purchase Description</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="Default text to appear on vendor bills"
                  value={purchaseDescription}
                  onChange={e => setPurchaseDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Inventory (Goods Only) */}
          {type === 'goods' ? (
            <div className="zb-form-section highlight-bg">
              <div className="zb-flex-between zb-section-header-row">
                <h4 className="zb-form-section-title">4. Inventory Tracking</h4>
                <label className="zb-switch-label">
                  <input
                    type="checkbox"
                    checked={trackInventory}
                    onChange={e => setTrackInventory(e.target.checked)}
                  />
                  <span>Track Inventory for this item</span>
                </label>
              </div>

              {trackInventory ? (
                <div className="zb-inventory-fields-wrapper">
                  <div className="zb-form-row three-col">
                    <div className="zb-form-group">
                      <label className="zb-form-label">Opening Stock *</label>
                      <input
                        type="number"
                        min="0"
                        className={`zb-input ${getFieldError('openingStock') ? 'is-invalid' : ''}`}
                        value={openingStock}
                        onChange={e => setOpeningStock(e.target.value)}
                      />
                      {getFieldError('openingStock') && (
                        <span className="zb-field-error">{getFieldError('openingStock')}</span>
                      )}
                    </div>

                    <div className="zb-form-group">
                      <label className="zb-form-label">Opening Stock Rate (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="zb-input"
                        placeholder="Same as Cost Price"
                        value={openingStockRate}
                        onChange={e => setOpeningStockRate(e.target.value)}
                      />
                    </div>

                    <div className="zb-form-group">
                      <label className="zb-form-label">Reorder Level</label>
                      <input
                        type="number"
                        min="0"
                        className="zb-input"
                        placeholder="Alert threshold"
                        value={reorderLevel}
                        onChange={e => setReorderLevel(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="zb-form-group">
                    <label className="zb-form-label">Warehouse Location</label>
                    <input
                      type="text"
                      className="zb-input"
                      placeholder="e.g. Main Warehouse - Shelf B2"
                      value={warehouseLocation}
                      onChange={e => setWarehouseLocation(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="zb-info-note">
                  <Info size={16} /> Inventory tracking is disabled. Stock quantity will not be calculated for this item.
                </div>
              )}
            </div>
          ) : (
            <div className="zb-info-note">
              <Info size={16} /> Inventory tracking is disabled for Service items. Services do not hold physical stock.
            </div>
          )}

          {/* Modal Footer */}
          <div className="zb-modal-footer">
            <button type="button" className="zb-btn zb-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="zb-btn zb-btn-primary">
              {isEditing ? 'Update Item' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
