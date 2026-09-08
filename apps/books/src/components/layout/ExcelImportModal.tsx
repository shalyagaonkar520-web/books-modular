import { useState, useRef } from 'react';
import { CheckCircle2, FileSpreadsheet, Layers, Upload, Eye, Trash2 } from 'lucide-react';

import { documentsApi } from '@/api/endpoints';
import type { ExcelCategorizeResponse, ExcelCommitResponse } from '@/api/types';
import { useSubmit } from '@/hooks/useSubmit';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormError, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import type { Tone } from '@/utils/status';

interface ExcelImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORY_COLORS: Record<string, Tone> = {
  invoices: 'info',
  bills: 'warning',
  customers: 'neutral',
  expenses: 'success',
  general: 'neutral',
};

export function ExcelImportModal({ open, onClose, onSuccess }: ExcelImportModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [categorized, setCategorized] = useState<ExcelCategorizeResponse | null>(null);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [commitResult, setCommitResult] = useState<ExcelCommitResponse | null>(null);

  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  const analyzeSubmit = useSubmit();
  const commitSubmit = useSubmit();

  const resetAll = () => {
    setFile(null);
    setCategorized(null);
    setSelectedSectionIndex(0);
    setSelectedRowIndices(new Set());
    setCommitResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setCategorized(null);
      setCommitResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setCategorized(null);
      setCommitResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const result = await analyzeSubmit.run(() => documentsApi.importExcelCategorize(formData));
    if (result) {
      setCategorized(result);
      setSelectedSectionIndex(0);
      toast.success(`Extracted ${result.total_rows} rows across ${result.total_sheets} sheet(s)`);
    }
  };

  const handleCommit = async () => {
    if (!categorized || !categorized.sections.length) return;
    const result = await commitSubmit.run(() => documentsApi.importExcelCommit(categorized.sections));
    if (result) {
      setCommitResult(result);
      toast.success(result.message);
      if (onSuccess) onSuccess();
    }
  };

  const handleDeleteSection = (indexToDelete: number) => {
    if (!categorized) return;
    const remaining = categorized.sections.filter((_, i) => i !== indexToDelete);
    if (remaining.length === 0) {
      resetAll();
    } else {
      const newTotal = remaining.reduce((acc, s) => acc + s.count, 0);
      setCategorized({
        ...categorized,
        total_sheets: remaining.length,
        total_rows: newTotal,
        sections: remaining,
      });
      setSelectedSectionIndex(0);
      setSelectedRowIndices(new Set());
    }
  };

  const handleToggleSelectAllRows = () => {
    if (!activeSection) return;
    if (selectedRowIndices.size === activeSection.rows.length) {
      setSelectedRowIndices(new Set());
    } else {
      setSelectedRowIndices(new Set(activeSection.rows.map((_, i) => i)));
    }
  };

  const handleToggleRowSelection = (rIdx: number) => {
    const next = new Set(selectedRowIndices);
    if (next.has(rIdx)) next.delete(rIdx);
    else next.add(rIdx);
    setSelectedRowIndices(next);
  };

  const handleDeleteSelectedRows = () => {
    if (!categorized || !activeSection) return;
    const remaining = activeSection.rows.filter((_, i) => !selectedRowIndices.has(i));
    if (remaining.length === 0) {
      handleDeleteSection(selectedSectionIndex);
    } else {
      const updated = [...categorized.sections];
      updated[selectedSectionIndex] = {
        ...activeSection,
        count: remaining.length,
        rows: remaining,
      };
      const newTotal = updated.reduce((acc, s) => acc + s.count, 0);
      setCategorized({
        ...categorized,
        total_rows: newTotal,
        sections: updated,
      });
      setSelectedRowIndices(new Set());
      toast.success(`Deleted ${selectedRowIndices.size} row(s).`);
    }
  };

  const activeSection = categorized?.sections[selectedSectionIndex];

  return (
    <Modal
      open={open}
      size="xl"
      title="Excel & CSV Data Input"
      subtitle="Upload invoices, bills, customers, or expenses spreadsheets to auto-extract and categorize into your books."
      onClose={handleClose}
      footer={
        commitResult ? (
          <Button variant="primary" onClick={handleClose}>
            Done
          </Button>
        ) : categorized ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={resetAll} disabled={commitSubmit.submitting}>
                Choose Another File
              </Button>
              <Button
                variant="danger"
                onClick={resetAll}
                disabled={commitSubmit.submitting}
                icon={<Trash2 size={16} />}
              >
                Delete All
              </Button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={handleClose} disabled={commitSubmit.submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={commitSubmit.submitting}
                onClick={handleCommit}
                icon={<CheckCircle2 size={16} />}
              >
                Import Categorized Data to Books
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!file}
              loading={analyzeSubmit.submitting}
              onClick={handleAnalyze}
              icon={<Layers size={16} />}
            >
              Analyze & Categorize
            </Button>
          </>
        )
      }
    >
      <FormError message={analyzeSubmit.error || commitSubmit.error} />

      {commitResult ? (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Data Successfully Imported!</h3>
          <p className="text-muted" style={{ maxWidth: '480px', margin: '0 auto 24px' }}>
            {commitResult.message}
          </p>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '24px',
            }}
          >
            {Object.entries(commitResult.imported_counts).map(([cat, count]) => (
              <div
                key={cat}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  minWidth: '120px',
                  backgroundColor: 'var(--color-bg-subtle, #f9fafb)',
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)' }}>{count}</div>
                <div style={{ fontSize: '0.85rem', textTransform: 'capitalize' }} className="text-muted">
                  {cat}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : categorized ? (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              padding: '12px 16px',
              background: 'var(--color-bg-subtle, #f9fafb)',
              borderRadius: '8px',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} style={{ color: '#16a34a' }} />
                <span>{categorized.filename}</span>
              </div>
              <small className="text-muted">
                {categorized.total_rows} total rows extracted across {categorized.total_sheets} sheet(s)
              </small>
            </div>
            <Badge tone="success">Ready for Import</Badge>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
              Detected Categories:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {categorized.sections.map((section, idx) => {
                const isActive = idx === selectedSectionIndex;
                const tone = CATEGORY_COLORS[section.category.toLowerCase()] || 'neutral';
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedSectionIndex(idx);
                      setSelectedRowIndices(new Set());
                    }}
                    style={{
                      border: isActive ? '2px solid var(--color-primary, #0284c7)' : '1px solid var(--color-border)',
                      backgroundColor: isActive ? 'var(--color-bg, #ffffff)' : 'var(--color-bg-subtle, #f9fafb)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <Badge tone={tone}>{section.category.toUpperCase()}</Badge>
                    <span>{section.sheet_name}</span>
                    <span className="text-muted small">({section.count} rows)</span>
                    <button
                      type="button"
                      title="Delete this section"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(idx);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted, #94a3b8)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted, #94a3b8)')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {activeSection ? (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={15} />
                  <span>Preview for {activeSection.category.toUpperCase()} ({activeSection.sheet_name})</span>
                </h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleToggleSelectAllRows}
                  >
                    {activeSection.rows.length > 0 && selectedRowIndices.size === activeSection.rows.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedRowIndices.size > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={handleDeleteSelectedRows}
                      icon={<Trash2 size={13} />}
                    >
                      Delete Selected ({selectedRowIndices.size})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDeleteSection(selectedSectionIndex)}
                    icon={<Trash2 size={13} />}
                  >
                    Delete Section
                  </Button>
                </div>
              </div>

              <div
                style={{
                  maxHeight: '260px',
                  overflowX: 'auto',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                }}
              >
                <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '38px', padding: '8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={activeSection.rows.length > 0 && selectedRowIndices.size === activeSection.rows.length}
                          onChange={handleToggleSelectAllRows}
                          aria-label="Select all rows"
                        />
                      </th>
                      {activeSection.headers.map((h, i) => (
                        <th key={i} style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSection.rows.slice(0, 10).map((row, rIdx) => {
                      const isSelected = selectedRowIndices.has(rIdx);
                      return (
                        <tr key={rIdx} style={{ backgroundColor: isSelected ? 'var(--color-bg-subtle, #f0fdf4)' : undefined }}>
                          <td style={{ width: '38px', padding: '6px 8px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRowSelection(rIdx)}
                              aria-label={`Select row ${rIdx + 1}`}
                            />
                          </td>
                          {activeSection.headers.map((h, cIdx) => (
                            <td key={cIdx} style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}>
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href="/api/documents/download-sample-excel?type=indian"
              download="Rooman_Books_Indian_Data.xlsx"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--color-text)' }}
            >
              <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
              <span>Download Indian Demo Data (.xlsx)</span>
            </a>
            <a
              href="/api/documents/download-sample-excel?type=template"
              download="Rooman_Books_Import_Template.xlsx"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--color-text)' }}
            >
              <FileSpreadsheet size={15} style={{ color: '#0284c7' }} />
              <span>Download Import Template (.xlsx)</span>
            </a>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: '10px',
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--color-bg-subtle, #f9fafb)',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <Upload size={24} style={{ color: '#0284c7' }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
              {file ? file.name : 'Choose an Excel or CSV file or drag it here'}
            </div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>
              Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv). Automatically detects customer lists, sales invoices, vendor bills, and expenses.
            </div>
            {file ? (
              <div style={{ marginTop: '12px' }}>
                <Badge tone="info">
                  {(file.size / 1024).toFixed(1)} KB selected
                </Badge>
              </div>
            ) : null}
          </div>

          {analyzeSubmit.submitting ? (
            <div style={{ marginTop: '20px' }}>
              <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                Reading sheets and auto-categorizing records...
              </p>
              <SkeletonRows rows={4} columns={4} />
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
