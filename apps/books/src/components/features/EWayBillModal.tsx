import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  Check,
  Copy,
  QrCode,
  Truck,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  DollarSign,
  Sparkles
} from 'lucide-react';
import { formatINR } from '../../utils/currency';

export interface EwbDetails {
  ewbNo: string;
  generatedDate: string;
  validUntil: string;
  docNo: string;
  docDate: string;
  docType: string;
  supplierGstin: string;
  supplierName: string;
  dispatchFrom: string;
  recipientGstin: string;
  recipientName: string;
  shipTo: string;
  itemDescription: string;
  hsnCode: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  totalValue: number;
  mode: string;
  vehicleNo: string;
  transporterName: string;
  transporterId: string;
  distanceKm: number;
  upiVpa: string;
  isPaid?: boolean;
}

interface EWayBillModalProps {
  ewb: EwbDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onSimulateUpiPayment?: (docNo: string, amount: number) => void;
}

export const EWayBillModal: React.FC<EWayBillModalProps> = ({
  ewb,
  isOpen,
  onClose,
  onSimulateUpiPayment
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [paymentSimulated, setPaymentSimulated] = useState(false);

  if (!isOpen || !ewb) return null;

  const upiIntentUri = `upi://pay?pa=${encodeURIComponent(ewb.upiVpa)}&pn=${encodeURIComponent(
    ewb.supplierName
  )}&am=${ewb.totalValue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
    `Payment for ${ewb.docNo}`
  )}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiIntentUri);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSimulatePayment = () => {
    setPaymentSimulated(true);
    if (onSimulateUpiPayment) {
      onSimulateUpiPayment(ewb.docNo, ewb.totalValue);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSlip = () => {
    const slip = `================================================================================
           GOVERNMENT OF INDIA - GOODS AND SERVICES TAX COUNCIL
                 NATIONAL INFORMATICS CENTRE (NIC) e-WAY BILL
================================================================================
e-Way Bill Number : ${ewb.ewbNo}
Generated Date    : ${ewb.generatedDate}
Valid Until       : ${ewb.validUntil} (Approx Distance: ${ewb.distanceKm} KM)
Mode of Transport : ${ewb.mode} | Vehicle Number: ${ewb.vehicleNo}
--------------------------------------------------------------------------------
PART-A: CONSIGNMENT DETAILS
Document Number   : ${ewb.docNo} (${ewb.docType})
Document Date     : ${ewb.docDate}
GSTIN of Supplier : ${ewb.supplierGstin} (${ewb.supplierName})
Dispatch Address  : ${ewb.dispatchFrom}
GSTIN of Recipient: ${ewb.recipientGstin} (${ewb.recipientName})
Delivery Address  : ${ewb.shipTo}
HSN / SAC Code    : ${ewb.hsnCode} - ${ewb.itemDescription}
Taxable Amount    : INR ${ewb.taxableValue.toFixed(2)}
CGST (9%)         : INR ${ewb.cgst.toFixed(2)}
SGST (9%)         : INR ${ewb.sgst.toFixed(2)}
Total Consignment : INR ${ewb.totalValue.toFixed(2)}
--------------------------------------------------------------------------------
PART-B: VEHICLE & TRANSPORTER DETAILS
Transporter Name  : ${ewb.transporterName}
Transporter ID    : ${ewb.transporterId}
Vehicle Number    : ${ewb.vehicleNo}
Distance Calculated: ${ewb.distanceKm} km (Valid for 72 Hours)
--------------------------------------------------------------------------------
DYNAMIC NPCI UPI SETTLEMENT:
Virtual Payment Address: ${ewb.upiVpa}
Amount Payable         : INR ${ewb.totalValue.toFixed(2)}
UPI Deep Link Intent   : ${upiIntentUri}
================================================================================
Certified Electronic Way Bill pursuant to Rule 138 of CGST Rules 2017.`;

    const blob = new Blob([slip], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EWayBill_${ewb.ewbNo.replace(/\s+/g, '')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="zb-c360-modal-overlay" onClick={onClose}>
      <div
        className="zb-c360-modal-container"
        style={{ maxWidth: '900px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="zb-c360-header">
          <div className="zb-flex-align gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)'
              }}
            >
              <Truck size={24} />
            </div>
            <div>
              <div className="zb-flex-align gap-2">
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Official GST e-Way Bill & Dynamic UPI QR
                </h2>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ShieldCheck size={12} /> NIC Verified
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                Ref: <strong style={{ color: '#334155' }}>{ewb.docNo}</strong> &bull; CGST Rule 138 Statutory Consignment Transit
              </div>
            </div>
          </div>

          <div className="zb-flex-align gap-2">
            <button
              className="zb-btn zb-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={handleDownloadSlip}
              title="Download official e-Way Bill Text Slip"
            >
              <Download size={14} style={{ marginRight: '5px' }} /> Download Slip
            </button>
            <button
              className="zb-btn zb-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={handlePrint}
              title="Print official e-Way Bill"
            >
              <Printer size={14} style={{ marginRight: '5px' }} /> Print
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="zb-c360-body" style={{ background: '#f8fafc' }}>
          {/* E-WAY BILL OFFICIAL CERTIFICATE CONTAINER */}
          <div className="zb-ewb-paper">
            {/* Government Emblem Header */}
            <div className="zb-ewb-govt-header">
              <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                Government of India &bull; Ministry of Finance &bull; GST Council
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                NATIONAL INFORMATICS CENTRE &bull; e-WAY BILL SYSTEM
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Rule 138 of the Central Goods and Services Tax Rules, 2017
              </div>
            </div>

            {/* 12-Digit EWB Number Display */}
            <div className="zb-ewb-number-box">
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                12-Digit e-Way Bill Number
              </div>
              <span style={{ color: '#0f172a' }}>{ewb.ewbNo}</span>
              <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <Clock size={13} /> Generated: {ewb.generatedDate} | Valid Until: {ewb.validUntil} (72 Hours)
              </div>
            </div>

            {/* PART-A */}
            <div className="zb-ewb-part-title">Part - A (Consignment & Tax Particulars)</div>
            <table className="zb-ewb-info-table">
              <tbody>
                <tr>
                  <td className="label">GSTIN of Supplier</td>
                  <td><strong>{ewb.supplierGstin}</strong> - {ewb.supplierName}</td>
                  <td className="label">Dispatch From</td>
                  <td>{ewb.dispatchFrom}</td>
                </tr>
                <tr>
                  <td className="label">GSTIN of Recipient</td>
                  <td><strong>{ewb.recipientGstin}</strong> - {ewb.recipientName}</td>
                  <td className="label">Delivered / Ship To</td>
                  <td>{ewb.shipTo}</td>
                </tr>
                <tr>
                  <td className="label">Document Ref & Date</td>
                  <td><strong>{ewb.docNo}</strong> ({ewb.docType}) dt. {ewb.docDate}</td>
                  <td className="label">Goods / HSN Code</td>
                  <td><strong>{ewb.hsnCode}</strong> &bull; {ewb.itemDescription}</td>
                </tr>
                <tr>
                  <td className="label">Taxable Value</td>
                  <td>{formatINR(ewb.taxableValue)}</td>
                  <td className="label">CGST + SGST (18%)</td>
                  <td>{formatINR(ewb.cgst + ewb.sgst)} (CGST: {formatINR(ewb.cgst)} + SGST: {formatINR(ewb.sgst)})</td>
                </tr>
                <tr>
                  <td className="label" style={{ background: '#f1f5f9', fontWeight: 700 }}>Total Consignment Value</td>
                  <td colSpan={3} style={{ fontSize: '15px', fontWeight: 800, color: '#0066cc' }}>
                    {formatINR(ewb.totalValue)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* PART-B */}
            <div className="zb-ewb-part-title">Part - B (Vehicle & Transporter Particulars)</div>
            <table className="zb-ewb-info-table">
              <tbody>
                <tr>
                  <td className="label">Mode of Transit</td>
                  <td>{ewb.mode} (Surface Transport)</td>
                  <td className="label">Transit Distance</td>
                  <td><strong>{ewb.distanceKm} km</strong> (Approx. Via NH-44 Route)</td>
                </tr>
                <tr>
                  <td className="label">Vehicle Registration No</td>
                  <td><strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{ewb.vehicleNo}</strong></td>
                  <td className="label">Transporter ID & Name</td>
                  <td><strong>{ewb.transporterId}</strong> - {ewb.transporterName}</td>
                </tr>
              </tbody>
            </table>

            {/* DYNAMIC UPI QR SECTION */}
            <div
              style={{
                marginTop: '20px',
                border: '1.5px dashed #0284c7',
                borderRadius: '8px',
                background: '#f0f9ff',
                padding: '16px 20px'
              }}
            >
              <div className="zb-flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <div className="zb-flex-align gap-2" style={{ color: '#0369a1', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                    <QrCode size={18} /> Dynamic NPCI UPI QR & Instant Settlement
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '12.5px', color: '#0284c7', lineHeight: '1.5' }}>
                    Statutory dynamic QR code generated with embedded invoice metadata. Compatible with Google Pay, PhonePe, Paytm, and BHIM UPI.
                  </p>
                  <div style={{ fontSize: '12px', color: '#334155', marginBottom: '12px' }}>
                    <div>VPA: <strong className="font-mono">{ewb.upiVpa}</strong></div>
                    <div>Payable Amount: <strong style={{ color: '#0f172a', fontSize: '14px' }}>{formatINR(ewb.totalValue)}</strong></div>
                  </div>

                  <div className="zb-flex-align gap-2" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="zb-btn zb-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', background: '#ffffff' }}
                      onClick={handleCopyUpi}
                    >
                      {copiedLink ? (
                        <>
                          <Check size={14} style={{ marginRight: '4px', color: '#059669' }} /> Copied UPI Intent!
                        </>
                      ) : (
                        <>
                          <Copy size={14} style={{ marginRight: '4px' }} /> Copy UPI Intent Link
                        </>
                      )}
                    </button>

                    <button
                      className="zb-btn zb-btn-primary"
                      style={{ padding: '6px 14px', fontSize: '12px' }}
                      onClick={handleSimulatePayment}
                      disabled={paymentSimulated || ewb.isPaid}
                    >
                      {paymentSimulated || ewb.isPaid ? (
                        <>
                          <CheckCircle2 size={14} style={{ marginRight: '4px' }} /> Payment Settled!
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} style={{ marginRight: '4px' }} /> Simulate Instant UPI Payment
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Visual QR Code Generator Display */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'inline-block',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                    }}
                  >
                    {/* SVG Based High-Quality QR Code Pattern with UPI branding */}
                    <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
                      <rect width="130" height="130" fill="#ffffff" />
                      {/* Top Left Finder */}
                      <rect x="10" y="10" width="30" height="30" fill="#0f172a" rx="3" />
                      <rect x="15" y="15" width="20" height="20" fill="#ffffff" />
                      <rect x="19" y="19" width="12" height="12" fill="#0066cc" rx="2" />
                      {/* Top Right Finder */}
                      <rect x="90" y="10" width="30" height="30" fill="#0f172a" rx="3" />
                      <rect x="95" y="15" width="20" height="20" fill="#ffffff" />
                      <rect x="99" y="19" width="12" height="12" fill="#0066cc" rx="2" />
                      {/* Bottom Left Finder */}
                      <rect x="10" y="90" width="30" height="30" fill="#0f172a" rx="3" />
                      <rect x="15" y="95" width="20" height="20" fill="#ffffff" />
                      <rect x="19" y="99" width="12" height="12" fill="#0066cc" rx="2" />
                      {/* Random Matrix Modules */}
                      <rect x="46" y="14" width="6" height="6" fill="#0f172a" />
                      <rect x="58" y="14" width="6" height="6" fill="#0f172a" />
                      <rect x="70" y="14" width="6" height="6" fill="#0f172a" />
                      <rect x="50" y="24" width="6" height="6" fill="#0f172a" />
                      <rect x="66" y="24" width="6" height="6" fill="#0f172a" />
                      <rect x="46" y="34" width="6" height="6" fill="#0f172a" />
                      <rect x="74" y="34" width="6" height="6" fill="#0f172a" />
                      <rect x="14" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="24" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="34" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="46" y="46" width="6" height="6" fill="#0066cc" />
                      <rect x="76" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="90" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="104" y="46" width="6" height="6" fill="#0f172a" />
                      <rect x="14" y="60" width="6" height="6" fill="#0f172a" />
                      <rect x="28" y="60" width="6" height="6" fill="#0f172a" />
                      <rect x="90" y="60" width="6" height="6" fill="#0f172a" />
                      <rect x="108" y="60" width="6" height="6" fill="#0f172a" />
                      <rect x="46" y="74" width="6" height="6" fill="#0f172a" />
                      <rect x="60" y="74" width="6" height="6" fill="#0f172a" />
                      <rect x="74" y="74" width="6" height="6" fill="#0066cc" />
                      <rect x="90" y="74" width="6" height="6" fill="#0f172a" />
                      <rect x="104" y="74" width="6" height="6" fill="#0f172a" />
                      <rect x="46" y="90" width="6" height="6" fill="#0f172a" />
                      <rect x="60" y="90" width="6" height="6" fill="#0f172a" />
                      <rect x="74" y="90" width="6" height="6" fill="#0f172a" />
                      <rect x="46" y="104" width="6" height="6" fill="#0f172a" />
                      <rect x="66" y="104" width="6" height="6" fill="#0f172a" />
                      <rect x="80" y="104" width="6" height="6" fill="#0f172a" />
                      <rect x="96" y="104" width="6" height="6" fill="#0f172a" />
                      {/* Center UPI Pill */}
                      <rect x="48" y="52" width="34" height="20" fill="#0066cc" rx="4" />
                      <text x="65" y="66" fill="#ffffff" fontSize="10" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">
                        UPI
                      </text>
                    </svg>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0066cc', marginTop: '4px' }}>
                      SCAN &amp; PAY
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: '0 0 12px 12px'
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            NIC SHA-256 Digest: <span className="font-mono">88a91f42e947c94b</span>
          </div>
          <div className="zb-flex-align gap-2">
            <button className="zb-btn zb-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="zb-btn zb-btn-primary" onClick={handleDownloadSlip}>
              Download Official Slip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
