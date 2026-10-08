import { useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { format } from 'date-fns';
import {
  exportBackup,
  downloadBackup,
  parseBackupFile,
  importBackup,
  type BackupData,
  type ImportPhase,
} from '../../services/backup';
import { useToast, errorMessage } from '../ui/toastContext';
import { useConfirm } from '../ui/confirmContext';
import Spinner from '../ui/Spinner';

const PHASE_LABEL: Record<ImportPhase, string> = {
  clearing: 'Clearing current data',
  expenses: 'Restoring expenses',
  budgets: 'Restoring budgets',
  settings: 'Restoring settings',
};

interface BackupRestoreProps {
  onClose: () => void;
  onRestoreComplete: () => void;
}

export default function BackupRestore({ onClose, onRestoreComplete }: BackupRestoreProps) {
  const [busy, setBusy] = useState<null | 'exporting' | 'reading' | 'importing'>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<BackupData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [progress, setProgress] = useState<{ phase: ImportPhase; done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const toast = useToast();
  const confirm = useConfirm();
  const loading = busy !== null;

  const handleExport = async () => {
    setBusy('exporting');
    setError(null);
    try {
      const backup = await exportBackup();
      downloadBackup(backup);
      toast.success(
        'Backup downloaded',
        `${backup.metadata.expenseCount.toLocaleString('en-IN')} expenses and ${backup.metadata.budgetCount} budgets saved to a JSON file.`
      );
    } catch (err) {
      console.error('Export error:', err);
      setError(`Couldn't create the backup. ${errorMessage(err)}`);
      toast.error('Backup failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy('reading');
    setError(null);
    setBackupData(null);
    setFileName(file.name);

    try {
      const backup = await parseBackupFile(file);
      setBackupData(backup);
    } catch (err) {
      console.error('Parse error:', err);
      setError((err as Error).message || "That file doesn't look like an ExpenseTrack backup.");
      setFileName(null);
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (data: BackupData) => {
    setBusy('importing');
    setError(null);
    setProgress(null);
    const toastId = toast.loading('Restoring backup…', 'Starting');

    try {
      const result = await importBackup(data, importMode, (phase, done, total) => {
        setProgress({ phase, done, total });
        toast.update(toastId, {
          description:
            total > 0
              ? `${PHASE_LABEL[phase]} · ${done.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`
              : PHASE_LABEL[phase],
        });
      });
      toast.update(toastId, {
        kind: 'success',
        title: 'Backup restored',
        description: `${result.imported.expenses.toLocaleString('en-IN')} expenses and ${result.imported.budgets} budgets ${
          importMode === 'replace' ? 'restored' : 'added'
        }.`,
      });
      setBackupData(null);
      setFileName(null);
      onRestoreComplete();
      onClose();
    } catch (err) {
      console.error('Import error:', err);
      const msg = errorMessage(err);
      setError(`The restore didn't finish. ${msg}`);
      toast.update(toastId, { kind: 'error', title: "Restore didn't finish", description: msg });
      // Whatever did land is real data now — show it.
      onRestoreComplete();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const handleImport = async () => {
    if (!backupData) return;
    if (importMode === 'replace') {
      const ok = await confirm({
        title: 'Replace all your data?',
        message: (
          <>
            Every expense and budget currently in your ledger will be deleted, then replaced with the{' '}
            {backupData.metadata.expenseCount.toLocaleString('en-IN')} expenses in this backup. This can't be undone.
          </>
        ),
        confirmLabel: 'Replace everything',
        tone: 'danger',
      });
      if (!ok) return;
    }
    runImport(backupData);
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

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

          {busy === 'importing' && (
            <div className="rounded-lg border border-pine/30 bg-pine/5 p-4" role="status">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-ink flex items-center gap-2">
                  <Spinner size="sm" />
                  {progress ? PHASE_LABEL[progress.phase] : 'Starting restore'}…
                </p>
                {progress && progress.total > 0 && (
                  <span className="text-xs font-mono tabular text-slate">
                    {progress.done.toLocaleString('en-IN')} / {progress.total.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div
                  className={`h-full bg-pine rounded-full transition-[width] duration-300 ${pct === null ? 'w-1/3 animate-pulse' : ''}`}
                  style={pct !== null ? { width: `${pct}%` } : undefined}
                />
              </div>
              <p className="text-xs text-slate mt-2">You can close this window — progress also shows in the corner.</p>
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
              {busy === 'exporting' ? (
                <>
                  <Spinner size="sm" tone="paper" /> Preparing backup…
                </>
              ) : (
                'Download backup'
              )}
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
              {busy === 'reading' ? (
                <>
                  <Spinner size="sm" /> Reading file…
                </>
              ) : backupData ? (
                'Choose a different file'
              ) : (
                'Select backup file'
              )}
            </button>
            {fileName && backupData && (
              <p className="mt-2 text-xs text-slate font-mono truncate">Loaded: {fileName}</p>
            )}

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
                  {busy === 'importing' ? (
                    <>
                      <Spinner size="sm" tone="paper" /> {progress?.phase === 'clearing' ? 'Clearing old data…' : 'Restoring…'}
                      {pct !== null ? ` ${pct}%` : ''}
                    </>
                  ) : importMode === 'replace' ? (
                    'Replace with this backup'
                  ) : (
                    'Merge this backup'
                  )}
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
