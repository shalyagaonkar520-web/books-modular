import React, { useState } from 'react';
import { Invoice, InvoiceLineItem, ApiClient } from '../../services/apiClient';
import { formatINR } from '../../utils/currency';
import { Plus, Trash2, X, FileText } from 'lucide-react';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newInvoice: Invoice) => void;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  if (!isOpen) return null;

  const [client, setClient] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientGstin, setClientGstin] = useState('29AAACI4567B1Z8');
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  );
  const [due, setDue] = useState('30 Sep 2026');
  const [items, setItems] = useState<InvoiceLineItem[]>([
    {
      id: '1',
      name: 'Cloud Infrastructure & Microservices Architecture',
      description: 'Consulting, performance optimization, and GST ledger configuration',
      hsn: '998313',
      quantity: 1,
      rate: 120000,
      taxRate: 18,
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Item Row
  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        name: 'Technical Support & SLA Maintenance',
        description: '24x7 Enterprise priority incident management',
        hsn: '998314',
        quantity: 1,
        rate: 35000,
        taxRate: 18,
      },
    ]);
  };

  // Remove Item Row
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  // Update Item field
  const handleItemChange = (index: number, field: keyof InvoiceLineItem, val: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };
    setItems(updated);
  };

  // Calculation helpers
  const subtotal = items.reduce((acc, itm) => acc + (Number(itm.rate) || 0) * (Number(itm.quantity) || 1), 0);
  const taxAmount = items.reduce(
    (acc, itm) =>
      acc +
      ((Number(itm.rate) || 0) * (Number(itm.quantity) || 1) * (Number(itm.taxRate) || 18)) / 100,
    0
  );
  const grandTotal = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim()) return;

    try {
      setIsSubmitting(true);
      const invoicePayload: Partial<Invoice> = {
        client,
        clientEmail,
        clientGstin,
        date,
        due,
        items,
        subtotal,
        taxAmount,
        amount: grandTotal,
        status: 'Sent',
        notes: 'Payment terms Net 15 days. Remit to HDFC Bank A/C 50200049281928, IFSC: HDFC0000053.',
      };

      let created: Invoice;
      try {
        created = await ApiClient.createInvoice(invoicePayload);
      } catch {
        // Local fallback
        created = {
          id: `INV-${Math.floor(100 + Math.random() * 900)}`,
          client,
          clientEmail,
          clientGstin,
          date,
          due,
          items,
          subtotal,
          taxAmount,
          amount: grandTotal,
          status: 'Sent',
          notes: invoicePayload.notes,
          createdAt: new Date().toISOString(),
        };
      }

      onCreated(created);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="zb-doc-modal-overlay" onClick={onClose}>
      <div
        className="zb-doc-modal-container"
        style={{ maxWidth: '820px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="zb-doc-modal-header">
          <div className="zb-flex-align gap-2">
            <FileText size={20} className="text-primary" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Create New GST Tax Invoice
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Generates GST-compliant invoice with automatic CGST & SGST calculations
              </span>
            </div>
          </div>
          <button className="zb-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="zb-doc-modal-body">
          <form onSubmit={handleSubmit}>
            {/* Customer Details */}
            <div className="zb-paper-grid" style={{ marginBottom: '16px' }}>
              <div>
                <label className="zb-label">Customer / Client Name *</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. Reliance Retail Ventures Ltd"
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="zb-label">Customer GSTIN</label>
                <input
                  type="text"
                  className="zb-input"
                  placeholder="e.g. 29AAACR1234F1Z8"
                  value={clientGstin}
                  onChange={e => setClientGstin(e.target.value)}
                />
              </div>
            </div>

            <div className="zb-paper-grid" style={{ marginBottom: '18px' }}>
              <div>
                <label className="zb-label">Invoice Date</label>
                <input
                  type="text"
                  className="zb-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="zb-label">Payment Due Date</label>
                <input
                  type="text"
                  className="zb-input"
                  value={due}
                  onChange={e => setDue(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items Builder */}
            <div className="zb-invoice-items-builder">
              <div className="zb-items-builder-header">
                <div>ITEM DESCRIPTION</div>
                <div>HSN/SAC</div>
                <div>QTY</div>
                <div>RATE (₹)</div>
                <div></div>
              </div>

              {items.map((itm, index) => (
                <div key={index} className="zb-items-builder-row">
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="Item or service name"
                    value={itm.name}
                    onChange={e => handleItemChange(index, 'name', e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="HSN/SAC"
                    value={itm.hsn}
                    onChange={e => handleItemChange(index, 'hsn', e.target.value)}
                  />
                  <input
                    type="number"
                    min="1"
                    className="zb-input"
                    value={itm.quantity}
                    onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 1)}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="zb-input"
                    placeholder="Rate"
                    value={itm.rate}
                    onChange={e => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)}
                    required
                  />
                  <button
                    type="button"
                    className="zb-btn-icon-danger"
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length <= 1}
                    title="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="zb-btn zb-btn-sm zb-btn-secondary"
                  onClick={handleAddItem}
                >
                  <Plus size={14} /> Add Line Item
                </button>
              </div>
            </div>

            {/* Calculations Summary */}
            <div className="zb-paper-totals-wrap" style={{ marginBottom: '20px' }}>
              <table className="zb-paper-totals-table">
                <tbody>
                  <tr>
                    <td>Subtotal (Taxable):</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(subtotal)}</td>
                  </tr>
                  <tr>
                    <td>CGST (9%):</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(taxAmount / 2)}</td>
                  </tr>
                  <tr>
                    <td>SGST (9%):</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(taxAmount / 2)}</td>
                  </tr>
                  <tr className="zb-paper-grand-total">
                    <td>Total Invoice Value:</td>
                    <td style={{ textAlign: 'right', color: '#2563eb' }}>{formatINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="zb-btn zb-btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="zb-btn zb-btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Generating Invoice...' : 'Save & Generate Invoice'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
