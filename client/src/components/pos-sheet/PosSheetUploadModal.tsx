'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Info,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { PosSheetConfig } from './PosSheetConfigModal';

interface PosSheetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
  defaultDate: string;
  config: PosSheetConfig;
  onSuccess: () => void;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export function PosSheetUploadModal({
  isOpen,
  onClose,
  shopId,
  defaultDate,
  config,
  onSuccess,
  onShowToast,
}: PosSheetUploadModalProps) {
  const [sheetDate, setSheetDate] = useState<string>(defaultDate);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, unknown>>>([]);
  const [matchedColsCount, setMatchedColsCount] = useState<number>(0);
  const [unmatchedHeaders, setUnmatchedHeaders] = useState<string[]>([]);
  const [previewTotals, setPreviewTotals] = useState({
    rows: 0,
    pieces: 0,
    netAmount: 0,
    paid: 0,
    balance: 0,
  });
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    setFileSize(file.size);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });

        // First sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Parse to JSON array of objects (header is row 1)
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
          raw: false,
        });

        if (rawRows.length === 0) {
          throw new Error('The uploaded file is empty or has no data rows.');
        }

        // Detect file headers from first row
        const fileHeaders = Object.keys(rawRows[0] || {});

        // Build header mapping index based on shop's active column config
        const columns = config?.columns || [];
        const headerMap = new Map<string, string>(); // lowercase header -> col.key
        columns.forEach((col) => {
          if (col.excelHeader) headerMap.set(col.excelHeader.trim().toLowerCase(), col.key);
          if (col.label) headerMap.set(col.label.trim().toLowerCase(), col.key);
          headerMap.set(col.key.trim().toLowerCase(), col.key);
        });

        let matchedCount = 0;
        const unmatched: string[] = [];

        fileHeaders.forEach((fh) => {
          const norm = fh.trim().toLowerCase();
          if (headerMap.has(norm)) {
            matchedCount++;
          } else {
            unmatched.push(fh);
          }
        });

        setMatchedColsCount(matchedCount);
        setUnmatchedHeaders(unmatched);

        // Normalize rows and calculate preview summary
        let sumPieces = 0;
        let sumNet = 0;
        let sumPaid = 0;
        let sumBalance = 0;

        const normalizedRows = rawRows.map((raw) => {
          const normRow: Record<string, unknown> = {};

          // Copy raw keys as backup
          Object.entries(raw).forEach(([k, v]) => {
            normRow[k] = v;
            const mappedKey = headerMap.get(k.trim().toLowerCase());
            if (mappedKey) {
              normRow[mappedKey] = v;
            }
          });

          const parseNum = (val: unknown) => {
            if (!val) return 0;
            const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
            return isNaN(n) ? 0 : n;
          };

          const pcs = parseNum(normRow.pieces || normRow['Pcs.'] || normRow['Pcs']);
          const net = parseNum(normRow.net_amount || normRow['Net Amount']);
          const paid = parseNum(normRow.paid || normRow['Paid']);
          const bal = parseNum(normRow.balance || normRow['Balance']);

          sumPieces += pcs;
          sumNet += net;
          sumPaid += paid;
          sumBalance += bal;

          return normRow;
        });

        setParsedRows(normalizedRows);
        setPreviewTotals({
          rows: normalizedRows.length,
          pieces: sumPieces,
          netAmount: sumNet,
          paid: sumPaid,
          balance: sumBalance,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to parse Excel file.';
        setError(msg);
        setParsedRows([]);
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleUploadSubmit = async () => {
    if (parsedRows.length === 0) {
      setError('Please select a valid Excel file with orders.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const payload = {
        sheetDate,
        fileName,
        fileSize,
        replaceExisting,
        entries: parsedRows,
      };

      const res = await apiRequest<{ message: string; rowCount: number }>(
        `/api/shops/${shopId}/pos-sheet/upload`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (onShowToast) {
        onShowToast(res.message || `Uploaded ${res.rowCount} orders successfully!`, 'success');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error uploading POS sheet to database.';
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-brand-forest/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl border border-border-subtle shadow-clay-lg p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-cream text-brand-forest border border-border-subtle flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-brand-forest">
                  Import Daily POS Excel Sheet
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Auto Match
                </span>
              </div>
              <p className="text-xs text-content-muted mt-0.5">
                Upload your daily exported POS sheet (.xlsx, .xls, .csv). System will match columns and persist date-wise.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="w-8 h-8 rounded-full bg-surface-cream hover:bg-red-50 text-content-muted hover:text-red-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date Selector & Replace Option Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-surface-cream/50 border border-border-subtle shrink-0 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-brand-forest mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Target Sheet Date *</span>
            </label>
            <input
              type="date"
              required
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-border-subtle bg-white text-xs font-bold text-brand-forest focus:ring-2 focus:ring-brand-forest focus:outline-none"
            />
          </div>

          <div className="flex items-center pt-2 sm:pt-4">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-content-primary">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 rounded text-brand-forest focus:ring-brand-forest"
              />
              <span>Replace previously uploaded batch for this date</span>
            </label>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* File Drop Area */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border-subtle hover:border-brand-forest/60 bg-surface-cream/20 hover:bg-surface-cream/50 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 shrink-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-full bg-white text-brand-forest border border-border-subtle flex items-center justify-center mx-auto shadow-sm">
            {isParsing ? (
              <RefreshCw className="w-6 h-6 animate-spin text-brand-forest" />
            ) : fileName ? (
              <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
            ) : (
              <UploadCloud className="w-6 h-6 text-brand-forest" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-black text-brand-forest">
              {fileName ? fileName : 'Choose or Drag & Drop Excel File'}
            </h4>
            <p className="text-[11px] text-content-muted mt-0.5">
              Supports .xlsx, .xls, or .csv files exported from POS system
            </p>
          </div>
        </div>

        {/* Parsed Summary & Match Validation */}
        {parsedRows.length > 0 && (
          <div className="space-y-3 shrink-0">
            {/* Matching status indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-bold">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Detected <strong>{previewTotals.rows}</strong> rows & <strong>{matchedColsCount}</strong> recognized columns.
                </span>
              </div>
              {unmatchedHeaders.length > 0 && (
                <span className="text-[10px] text-emerald-800 font-medium">
                  {unmatchedHeaders.length} unmapped headers saved in raw record.
                </span>
              )}
            </div>

            {/* Calculated Preview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle">
                <span className="text-[10px] font-bold text-content-muted block uppercase">Orders</span>
                <span className="text-base font-black text-brand-forest">{previewTotals.rows}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle">
                <span className="text-[10px] font-bold text-content-muted block uppercase">Total Pieces</span>
                <span className="text-base font-black text-brand-forest">{previewTotals.pieces}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle">
                <span className="text-[10px] font-bold text-content-muted block uppercase">Net Amount</span>
                <span className="text-base font-black text-brand-forest">
                  ₹{previewTotals.netAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-cream/50 border border-border-subtle">
                <span className="text-[10px] font-bold text-content-muted block uppercase">Balance Due</span>
                <span className="text-base font-black text-rose-700">
                  ₹{previewTotals.balance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Preview First 5 Rows */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-content-muted px-1">
                <span>Data Preview (First 5 Rows)</span>
                <span>Total {parsedRows.length} Orders</span>
              </div>
              <div className="max-h-40 overflow-x-auto overflow-y-auto rounded-xl border border-border-subtle text-[11px]">
                <table className="min-w-full divide-y divide-border-subtle">
                  <thead className="bg-surface-cream/70 font-black text-brand-forest text-left sticky top-0">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">Order No</th>
                      <th className="px-2 py-1">Customer</th>
                      <th className="px-2 py-1">Phone</th>
                      <th className="px-2 py-1">Pcs</th>
                      <th className="px-2 py-1">Net Amt</th>
                      <th className="px-2 py-1">Balance</th>
                      <th className="px-2 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50 bg-white">
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-surface-cream/20">
                        <td className="px-2 py-1 font-mono text-content-muted">{i + 1}</td>
                        <td className="px-2 py-1 font-mono font-bold text-blue-900">
                          {String(row.order_no || row['Order No.'] || '—')}
                        </td>
                        <td className="px-2 py-1 font-bold text-content-primary truncate max-w-[120px]">
                          {String(row.customer_name || row['Name'] || '—')}
                        </td>
                        <td className="px-2 py-1 font-mono text-content-muted">
                          {String(row.phone || row['Phone'] || '—')}
                        </td>
                        <td className="px-2 py-1 font-bold">{String(row.pieces || row['Pcs.'] || '0')}</td>
                        <td className="px-2 py-1 font-bold text-brand-forest">
                          ₹{String(row.net_amount || row['Net Amount'] || '0')}
                        </td>
                        <td className="px-2 py-1 font-bold text-rose-700">
                          ₹{String(row.balance || row['Balance'] || '0')}
                        </td>
                        <td className="px-2 py-1">
                          <span className="px-1.5 py-0.5 rounded bg-surface-cream text-[9px] font-bold text-content-muted">
                            {String(row.order_status || row['Order Status'] || '—')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle shrink-0">
          <span className="text-[11px] text-content-muted flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            <span>Data will be securely synced with shop records.</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl border border-border-subtle bg-white text-content-primary font-bold text-xs hover:bg-surface-cream"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUploadSubmit}
              disabled={isUploading || parsedRows.length === 0}
              className="px-4 py-2 rounded-xl bg-brand-forest text-brand-lime font-black text-xs shadow-sm hover:opacity-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing to Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Upload & Save ({parsedRows.length} Orders)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
