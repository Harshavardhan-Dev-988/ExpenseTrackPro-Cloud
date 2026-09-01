import { useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format } from 'date-fns';
import {
  exportBackup,
  downloadBackup,
  parseBackupFile,
  importBackup,
  type BackupData,
} from '../../services/backup';

interface BackupRestoreProps {
  onClose: () => void;
  onRestoreComplete: () => void;
}

export default function BackupRestore({ onClose, onRestoreComplete }: BackupRestoreProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<BackupData | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const backup = await exportBackup();
      downloadBackup(backup);
      setSuccess(`Backup exported successfully! ${backup.metadata.expenseCount} expenses saved.`);
    } catch (err) {
      setError('Failed to export backup. Please try again.');
      console.error('Export error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    setBackupData(null);

    try {
      const backup = await parseBackupFile(file);
      setBackupData(backup);
      setSuccess('Backup file loaded successfully! Review and import below.');
    } catch (err) {
      setError((err as Error).message || 'Failed to parse backup file');
      console.error('Parse error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!backupData) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await importBackup(backupData, importMode);
      setSuccess(
        `Backup imported successfully! ${result.imported.expenses} expenses and ${result.imported.budgets} budgets restored.`
      );
      setBackupData(null);
      
      // Notify parent to refresh data
      setTimeout(() => {
        onRestoreComplete();
        onClose();
      }, 2000);
    } catch (err) {
      setError('Failed to import backup. Please try again.');
      console.error('Import error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Backup and restore"
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-surface w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">
              Backup & Restore
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate hover:text-ink hover:bg-paper transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate mt-1">
            Export your data or restore from a previous backup
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Messages */}
          {error && (
            <div className="bg-ember/10 border border-ember/30 rounded-lg p-4">
              <p className="text-ember-strong dark:text-ember text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-pine/10 border border-pine/30 rounded-lg p-4">
              <p className="text-pine-strong dark:text-pine text-sm">{success}</p>
            </div>
          )}

          {/* Export Section */}
          <div className="bg-paper border border-line rounded-lg p-6">
            <h3 className="font-display text-base font-semibold text-ink mb-2">
              Export Backup
            </h3>
            <p className="text-sm text-slate mb-4">
              Download all your expenses, budgets, and settings as a single JSON file. Keep this file safe
              to restore your data later.
            </p>
            <button
              onClick={handleExport}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {loading ? 'Exporting...' : 'Download Backup'}
            </button>
          </div>

          {/* Import Section */}
          <div className="bg-paper border border-line rounded-lg p-6">
            <h3 className="font-display text-base font-semibold text-ink mb-2">
              Import Backup
            </h3>
            <p className="text-sm text-slate mb-4">
              Restore your data from a previously exported backup file. Choose whether to merge with existing
              data or replace everything.
            </p>

            {/* File Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Select Backup File'}
            </button>

            {/* Backup Preview */}
            {backupData && (
              <div className="mt-6 space-y-4">
                <div className="bg-surface rounded-lg p-4 border border-line">
                  <h4 className="font-semibold text-ink mb-3">
                    Backup Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate">Export Date:</span>
                      <p className="font-medium text-ink font-mono tabular">
                        {format(new Date(backupData.exportDate), 'MMM dd, yyyy HH:mm')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate">Version:</span>
                      <p className="font-medium text-ink font-mono tabular">
                        {backupData.version}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate">Expenses:</span>
                      <p className="font-medium text-ink font-mono tabular">
                        {backupData.metadata.expenseCount}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate">Budgets:</span>
                      <p className="font-medium text-ink font-mono tabular">
                        {backupData.metadata.budgetCount}
                      </p>
                    </div>
                    {backupData.metadata.dateRange.earliest && (
                      <>
                        <div>
                          <span className="text-slate">Earliest:</span>
                          <p className="font-medium text-ink font-mono tabular">
                            {format(new Date(backupData.metadata.dateRange.earliest), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate">Latest:</span>
                          <p className="font-medium text-ink font-mono tabular">
                            {format(new Date(backupData.metadata.dateRange.latest!), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Import Mode Selection */}
                <div className="space-y-3">
                  <label className="font-medium text-ink block text-sm">
                    Import Mode:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border border-line rounded-lg cursor-pointer hover:bg-paper transition-colors">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={(e) => setImportMode(e.target.value as 'merge')}
                        className="mt-1 accent-pine"
                      />
                      <div>
                        <div className="font-medium text-ink text-sm">
                          Merge with existing data
                        </div>
                        <div className="text-sm text-slate">
                          Keep your current expenses and add the backup data
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 border border-ember/30 rounded-lg cursor-pointer hover:bg-ember/5 transition-colors">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={(e) => setImportMode(e.target.value as 'replace')}
                        className="mt-1 accent-ember"
                      />
                      <div>
                        <div className="font-medium text-ember-strong dark:text-ember text-sm">
                          Replace all data
                        </div>
                        <div className="text-sm text-ember-strong dark:text-ember">
                          Delete everything and restore only from backup
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Import Button */}
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {loading ? 'Importing...' : 'Import Backup'}
                </button>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="bg-paper border border-line rounded-lg p-4 text-sm text-slate">
            <h4 className="font-semibold text-ink mb-2">
              Tips
            </h4>
            <ul className="space-y-1 list-disc list-inside">
              <li>Export backups regularly to prevent data loss</li>
              <li>Backup files are stored as JSON and contain all your data</li>
              <li>Use "Merge" mode to combine multiple backups</li>
              <li>Use "Replace" mode for a clean restore from scratch</li>
              <li>Keep backup files in a safe location (cloud storage, USB drive)</li>
            </ul>
          </div>
        </div>

        <div className="sticky bottom-0 bg-paper px-6 py-4 border-t border-line">
          <button
            onClick={onClose}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm font-medium hover:border-pine hover:text-pine-strong active:scale-[0.98] transition-all duration-200"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
