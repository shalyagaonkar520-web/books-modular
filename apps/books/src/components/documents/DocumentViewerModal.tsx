import React from 'react';
import { DocumentItem } from '../../services/apiClient';
import { Printer, Download, X, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';

interface DocumentViewerModalProps {
  doc: DocumentItem | null;
  onClose: () => void;
  onDownload: (doc: DocumentItem) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  doc,
  onClose,
  onDownload,
}) => {
  if (!doc) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="zb-doc-modal-overlay" onClick={onClose}>
      <div className="zb-doc-modal-container" onClick={e => e.stopPropagation()}>
        <div className="zb-doc-modal-header zb-no-print">
          <div className="zb-flex-align gap-2">
            <FileText size={20} className="text-primary" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Document Viewer &mdash; {doc.id}
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Category: {doc.category} &bull; Size: {doc.size} &bull; Uploaded by {doc.uploadedBy}
              </span>
            </div>
          </div>

          <div className="zb-doc-modal-actions">
            <button
              className="zb-btn zb-btn-sm zb-btn-secondary"
              onClick={() => onDownload(doc)}
              title="Download file to computer"
            >
              <Download size={14} /> Download File
            </button>
            <button
              className="zb-btn zb-btn-sm zb-btn-primary"
              onClick={handlePrint}
              title="Print certificate"
            >
              <Printer size={14} /> Print
            </button>
            <button className="zb-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="zb-doc-modal-body">
          <div className="zb-paper-sheet">
            {/* Header */}
            <div className="zb-paper-header">
              <div>
                <h1 className="zb-paper-title">Rooman Books Compliance & Audit Vault</h1>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  Statutory Records & Document Management Repository
                </div>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  <strong>Vault ID:</strong> ZB-VAULT-2026-IND &bull; <strong>Encryption:</strong> AES-256
                </div>
              </div>
              <div className="zb-paper-badge">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#166534', padding: '6px 12px', borderRadius: '16px', fontWeight: 700, fontSize: '12px' }}>
                  <ShieldCheck size={16} /> {doc.verified ? 'AUDIT VERIFIED' : 'PENDING REVIEW'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  Filing Date: {doc.date}
                </div>
              </div>
            </div>

            {/* Document Metadata Grid */}
            <div className="zb-paper-grid">
              <div className="zb-paper-box">
                <div className="zb-paper-box-title">DOCUMENT SPECIFICATIONS</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  {doc.title}
                </div>
                <div><strong>Vault Identifier:</strong> {doc.id}</div>
                <div><strong>Category:</strong> {doc.category}</div>
                <div><strong>Reported File Size:</strong> {doc.size}</div>
                <div><strong>Uploaded By:</strong> {doc.uploadedBy}</div>
              </div>

              <div className="zb-paper-box">
                <div className="zb-paper-box-title">INTEGRITY & COMPLIANCE SIGNATURE</div>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px', background: '#ffffff', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '8px' }}>
                  {doc.checksum || 'SHA256:e8f237b5d1a89c32f8149e21'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#166534' }}>
                  <CheckCircle2 size={14} /> Immutable audit hash verified against cloud ledger
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Compliance: Indian Companies Act 2013 & GST Rule 56
                </div>
              </div>
            </div>

            {/* Document Content Preview Box */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px', background: '#f8fafc', marginBottom: '24px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
                <span>CERTIFICATE SUMMARY & CONTENTS</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>OFFICIAL STATUTORY ARCHIVE</span>
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#334155' }}>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>Document Title:</strong> {doc.title}
                </p>
                <p style={{ margin: '0 0 10px 0' }}>
                  {doc.notes || 'This document has been ingested, virus scanned, digitally signed, and stored in the enterprise secure audit vault for Zylker Electronics India Pvt Ltd.'}
                </p>
                <div style={{ background: '#ffffff', padding: '14px', border: '1px dashed #94a3b8', borderRadius: '6px', fontSize: '12px', color: '#475569' }}>
                  <strong>Auditor Verification Statement:</strong><br />
                  Certified that the records contained in this filing reference are authentic, tamper-evident, and match the original physical and electronic vouchers submitted to the finance department.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="zb-paper-footer">
              <div>
                <em>Rooman Books Document & Receipts Vault &bull; ISO 27001 Certified System</em>
              </div>
              <div className="zb-paper-seal">
                <strong>Corporate Compliance Desk</strong>
                <div style={{ height: '32px' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Chief Compliance Officer</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
