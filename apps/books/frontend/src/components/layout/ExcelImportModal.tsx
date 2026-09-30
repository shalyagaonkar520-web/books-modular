import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FileSpreadsheet, Layers, Upload, Eye, Trash2 } from 'lucide-react';

import { documentsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
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
      toast.success(t('header.excel.extracted', { rows: result.total_rows, sheets: result.total_sheets }));
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
      toast.success(t('header.excel.rowsDeleted', { count: selectedRowIndices.size }));
    }
  };

  const activeSection = categorized?.sections[selectedSectionIndex];

  if (!open) return null;

  return createPortal(
    <Modal
      open={open}
      size="xl"
      title={t('header.excel.title')}
      subtitle={t('header.excel.subtitle')}
      onClose={handleClose}
      footer={
        commitResult ? (
          <Button variant="primary" onClick={handleClose}>
            {t('header.excel.done')}
          </Button>
        ) : categorized ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={resetAll} disabled={commitSubmit.submitting}>
                {t('header.excel.chooseAnother')}
              </Button>
              <Button
                variant="danger"
                onClick={resetAll}
                disabled={commitSubmit.submitting}
                icon={<Trash2 size={16} />}
              >
                {t('header.excel.deleteAll')}
              </Button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={handleClose} disabled={commitSubmit.submitting}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                loading={commitSubmit.submitting}
                onClick={handleCommit}
                disabled={!categorized.ready}
                title={categorized.ready ? undefined : t('header.excel.fixColumnsFirst')}
                icon={<CheckCircle2 size={16} />}
              >
                {t('header.excel.import')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!file}
              loading={analyzeSubmit.submitting}
              onClick={handleAnalyze}
              icon={<Layers size={16} />}
            >
              {t('header.excel.analyze')}
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
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>{t('header.excel.imported')}</h3>
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
                {t('header.excel.readySummary', { rows: categorized.total_rows, sheets: categorized.total_sheets })}
              </small>
            </div>
            {categorized.ready ? <Badge tone="success">{t('header.excel.ready')}</Badge> : <Badge tone="danger">{t('header.excel.columnsMissing')}</Badge>}
          </div>

          {/* Nothing has been written yet - this is the preview of what would be. */}
          {categorized.blocking_problems.length > 0 ? (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '6px' }}>
                {t('header.excel.fixBeforeImport')}
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#991b1b', fontSize: '0.875rem' }}>
                {categorized.blocking_problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
              {t('header.excel.detectedCategories')}
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
                      border: isActive ? '2px solid var(--primary)' : '1px solid var(--color-border)',
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
                    <span className="text-muted small">{t('header.excel.sectionRows', { count: section.count })}</span>
                    <button
                      type="button"
                      title={t('header.excel.deleteSectionHint')}
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
              {/* What this sheet must contain, and what we actually read from it. */}
              <div
                style={{
                  marginBottom: '12px',
                  padding: '12px 14px',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '8px',
                  background: 'var(--color-bg-subtle, #f8fafc)',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                  {t('header.excel.columnsFor', { category: activeSection.category })}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <strong>{t('header.excel.required')}</strong>{' '}
                  {activeSection.rules.required.map((rule) => rule.label).join(', ') || '—'}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <strong>{t('header.excel.optional')}</strong>{' '}
                  {activeSection.rules.optional.map((rule) => rule.label).join(', ') || '—'}
                </div>
                <div style={{ marginBottom: activeSection.unmapped_headers.length || activeSection.skipped_count ? '4px' : 0 }}>
                  <strong>{t('header.excel.readFromFile')}</strong>{' '}
                  {Object.entries(activeSection.mapped_columns).length
                    ? Object.entries(activeSection.mapped_columns)
                        .map(([field, header]) => `${header} → ${field}`)
                        .join(', ')
                    : '—'}
                </div>
                {activeSection.unmapped_headers.length > 0 ? (
                  <div style={{ color: '#92400e' }}>
                    <strong>{t('header.excel.ignored')}</strong> {activeSection.unmapped_headers.join(', ')}
                  </div>
                ) : null}
                {activeSection.missing_required.length > 0 ? (
                  <div style={{ color: '#991b1b', marginTop: '4px' }}>
                    <strong>{t('header.excel.missingRequired')}</strong> {activeSection.missing_required.join(', ')}
                  </div>
                ) : null}
                {activeSection.skipped_count > 0 ? (
                  <div style={{ marginTop: '6px', color: '#92400e' }}>
                    <strong>{t('header.excel.willSkip', { count: activeSection.skipped_count })}</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                      {activeSection.issues.map((issue) => (
                        <li key={issue.row_number}>
                          {t('header.excel.rowIssue', { row: issue.row_number, errors: issue.errors.join('; ') })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={15} />
                  <span>{t('header.excel.previewFor', { category: activeSection.category.toUpperCase(), sheet: activeSection.sheet_name })}</span>
                </h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleToggleSelectAllRows}
                  >
                    {activeSection.rows.length > 0 && selectedRowIndices.size === activeSection.rows.length ? t('header.excel.deselectAll') : t('header.excel.selectAll')}
                  </Button>
                  {selectedRowIndices.size > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={handleDeleteSelectedRows}
                      icon={<Trash2 size={13} />}
                    >
                      {t('header.excel.deleteSelected', { count: selectedRowIndices.size })}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDeleteSection(selectedSectionIndex)}
                    icon={<Trash2 size={13} />}
                  >
                    {t('header.excel.deleteSection')}
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
                          aria-label={t('common.table.selectAll')}
                        />
                      </th>
                      {/* Show the fields that will actually be imported, not
                          every raw header - unrecognised columns are ignored. */}
                      {Object.entries(activeSection.mapped_columns).map(([field, header]) => (
                        <th key={field} style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}>
                          {header}
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
                              aria-label={t('common.table.selectRow', { key: rIdx + 1 })}
                            />
                          </td>
                          {Object.keys(activeSection.mapped_columns).map((field) => (
                            <td key={field} style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}>
                              {String(row[field] ?? '')}
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
              href="/Rooman_Books_Indian_Data.xlsx"
              download="Rooman_Books_Indian_Data.xlsx"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--color-text)' }}
            >
              <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
              <span>{t('header.excel.downloadDemo')}</span>
            </a>
            <a
              href="/Rooman_Books_Import_Template.xlsx"
              download="Rooman_Books_Import_Template.xlsx"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--color-text)' }}
            >
              <FileSpreadsheet size={15} style={{ color: '#0284c7' }} />
              <span>{t('header.excel.downloadTemplate')}</span>
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
              {file ? file.name : t('header.excel.chooseFile')}
            </div>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>
              {t('header.excel.supports')}
            </div>
            {file ? (
              <div style={{ marginTop: '12px' }}>
                <Badge tone="info">
                  {t('header.excel.fileSize', { size: (file.size / 1024).toFixed(1) })}
                </Badge>
              </div>
            ) : null}
          </div>

          {analyzeSubmit.submitting ? (
            <div style={{ marginTop: '20px' }}>
              <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '8px' }}>
                {t('header.excel.reading')}
              </p>
              <SkeletonRows rows={4} columns={4} />
            </div>
          ) : null}
        </div>
      )}
    </Modal>,
    document.body
  );
}
