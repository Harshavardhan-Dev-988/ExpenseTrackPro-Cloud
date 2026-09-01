import { useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { CategoryType, PaymentMethod } from '../../types';
import { CATEGORY_LABELS } from '../../utils/constants';
interface BulkUploadProps {
  onUpload: (expenses: Array<{
    date: Date;
    amount: number;
    category: CategoryType;
    description: string;
    paymentMethod?: PaymentMethod;
    tags?: string[];
  }>) => Promise<void>;
  onCancel: () => void;
}

export default function BulkUpload({ onUpload, onCancel }: BulkUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError('');
    setPreview([]);
    setIsProcessing(true);

    try {
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      let parsedData: any[] = [];

      if (fileExt === 'csv') {
        parsedData = await parseCSV(selectedFile);
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        parsedData = await parseExcel(selectedFile);
      } else if (fileExt === 'json') {
        parsedData = await parseJSON(selectedFile);
      } else {
        throw new Error('Unsupported file format. Please use CSV, Excel, or JSON.');
      }

      setPreview(parsedData.slice(0, 10)); // Show first 10 rows
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseCSV = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error('CSV parsing error'));
          } else {
            resolve(results.data);
          }
        },
        error: (error) => reject(error),
      });
    });
  };

  const parseExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (err) {
          reject(new Error('Excel parsing error'));
        }
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseJSON = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          resolve(Array.isArray(jsonData) ? jsonData : [jsonData]);
        } catch (err) {
          reject(new Error('Invalid JSON format'));
        }
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsText(file);
    });
  };

  const handleUpload = async () => {
    if (!file || preview.length === 0) return;

    setIsProcessing(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      let allData: any[] = [];

      if (fileExt === 'csv') {
        allData = await parseCSV(file);
      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        allData = await parseExcel(file);
      } else if (fileExt === 'json') {
        allData = await parseJSON(file);
      }

      // Create reverse mapping for category labels to keys
      const categoryLabelToKey: Record<string, CategoryType> = {};
      Object.entries(CATEGORY_LABELS).forEach(([key, label]) => {
        categoryLabelToKey[label] = key as CategoryType;
      });

      // Transform data to match expense format
      const expenses = allData.map((row) => {
        const rawCategory = row.category || row.Category;
        // Try to match as key first, then as label (for legacy exports)
        let category = rawCategory as CategoryType;
        if (categoryLabelToKey[rawCategory]) {
          category = categoryLabelToKey[rawCategory];
        }
        
        return {
          date: new Date(row.date || row.Date),
          amount: parseFloat(row.amount || row.Amount),
          category,
          description: row.description || row.Description || '',
          paymentMethod: (row.paymentMethod || row['Payment Method'] || 'cash') as PaymentMethod,
          tags: row.tags ? row.tags.split(',').map((t: string) => t.trim()) : undefined,
        };
      });

      // Validate expenses
      const validExpenses = expenses.filter((exp) => 
        exp.date instanceof Date && !isNaN(exp.date.getTime()) &&
        !isNaN(exp.amount) && exp.amount > 0 &&
        exp.category && exp.description
      );

      if (validExpenses.length === 0) {
        throw new Error('No valid expenses found in file');
      }

      await onUpload(validExpenses);
    } catch (err: any) {
      setError(err.message || 'Failed to upload expenses');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk upload expenses"
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Bulk upload expenses</h2>
              <p className="text-xs text-slate mt-0.5">Bring in a batch of entries from a CSV, Excel, or JSON file.</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
            >
              ✕
            </button>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-ink mb-2">
              Select File (CSV, Excel, or JSON)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-ink border border-line rounded-lg cursor-pointer bg-paper focus:outline-none focus:border-pine"
            />
            <p className="mt-2 text-xs text-slate">
              Expected columns: date, amount, category, description, paymentMethod (optional), tags (optional)
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-ember/10 text-ember-strong dark:text-ember rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="mb-6">
              <h3 className="font-display text-base font-semibold text-ink mb-3">
                Preview (first 10 rows)
              </h3>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="min-w-full divide-y divide-line">
                  <thead className="bg-paper">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate uppercase tracking-wide">Category</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate uppercase tracking-wide">Description</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-line">
                    {preview.map((row, idx) => (
                      <tr key={idx} className="hover:bg-paper transition-colors">
                        <td className="px-4 py-2 text-sm text-ink font-mono tabular">{row.date || row.Date}</td>
                        <td className="px-4 py-2 text-sm text-ink font-mono tabular">{row.amount || row.Amount}</td>
                        <td className="px-4 py-2 text-sm text-ink">{row.category || row.Category}</td>
                        <td className="px-4 py-2 text-sm text-ink">{row.description || row.Description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={isProcessing || preview.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isProcessing ? 'Processing...' : 'Upload Expenses'}
            </button>
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
