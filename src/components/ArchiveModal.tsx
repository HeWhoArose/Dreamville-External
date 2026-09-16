import React, { useState, useEffect } from 'react';
import {
  X,
  Archive,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Image as ImageIcon,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'export' | 'import' | 'assets'>('export');
  const [exportedArchive, setExportedArchive] = useState<any | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [importInput, setImportInput] = useState<string>('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errorReason?: string;
    partitionCount?: number;
    manifest?: any;
  } | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(false);

  const fetchExport = async () => {
    setIsExporting(true);
    try {
      const data = await apiClient.exportArchive({ title: 'Dreamville Active Campaign' });
      setExportedArchive(data);
    } catch (err: any) {
      console.error('Failed to export campaign archive:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const fetchAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const data = await apiClient.getArchiveAssets();
      if (data && data.assets) {
        setAssets(data.assets);
      }
    } catch (err) {
      console.error('Failed to fetch assets:', err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchExport();
      fetchAssets();
      setRestoreMessage(null);
      setRestoreError(null);
      setValidationResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!exportedArchive) return;
    const jsonStr = JSON.stringify(exportedArchive, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${exportedArchive.manifest?.campaignId || 'archive'}_${Date.now()}.dreamarchive`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    if (!exportedArchive) return;
    navigator.clipboard.writeText(JSON.stringify(exportedArchive, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleValidateInput = async () => {
    setIsValidating(true);
    setValidationResult(null);
    setRestoreError(null);
    try {
      const parsed = JSON.parse(importInput);
      const res = await apiClient.validateArchive(parsed);
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errorReason: `JSON parse error: ${err?.message || 'Malformed JSON format'}`,
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRestoreArchive = async () => {
    setIsRestoring(true);
    setRestoreMessage(null);
    setRestoreError(null);
    try {
      const parsed = JSON.parse(importInput);
      const res = await apiClient.importArchive(parsed);
      if (res.success) {
        setRestoreMessage(`Campaign '${res.campaignId || 'restored'}' successfully restored into canonical repository.`);
        onRestoreSuccess();
      } else {
        setRestoreError(res.errorReason || 'Restore failed.');
      }
    } catch (err: any) {
      setRestoreError(err?.message || 'Restore error occurred.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportInput(text);
      try {
        const parsed = JSON.parse(text);
        apiClient.validateArchive(parsed).then((res) => setValidationResult(res));
      } catch (err: any) {
        setValidationResult({
          valid: false,
          errorReason: `Uploaded file is not valid JSON: ${err?.message}`,
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="bg-stone-900 border border-stone-750 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-stone-100 text-base">
                Lossless Campaign Archive (.dreamarchive)
              </h3>
              <p className="text-[11px] font-mono text-stone-400">
                DreamBook Challenge 13 & V10.8.31 • Partitioned Canonical Storage & Atomic Restore
              </p>
            </div>
          </div>
          <button
            id="close-archive-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-850 text-stone-400 hover:text-stone-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/30 px-6 pt-2 gap-2">
          <button
            id="archive-tab-export"
            onClick={() => setActiveSubTab('export')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === 'export'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Container</span>
          </button>
          <button
            id="archive-tab-import"
            onClick={() => setActiveSubTab('import')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === 'import'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Validate & Restore</span>
          </button>
          <button
            id="archive-tab-assets"
            onClick={() => setActiveSubTab('assets')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === 'assets'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Visual Asset Registry ({assets.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeSubTab === 'export' && (
            <div className="space-y-4">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-medium text-stone-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Verified Canonical Archive Snapshot
                  </h4>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Schema v{exportedArchive?.manifest?.archiveSchemaVersion || '1.0.0'} • Engine{' '}
                    {exportedArchive?.manifest?.engineVersion || 'dreamville-v10.8'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="export-refresh-btn"
                    onClick={fetchExport}
                    disabled={isExporting}
                    className="p-2 rounded-lg bg-stone-850 hover:bg-stone-800 text-stone-300 border border-stone-700 transition text-xs flex items-center gap-1"
                    title="Refresh Snapshot"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    id="export-copy-btn"
                    onClick={handleCopyJson}
                    className="px-3 py-2 rounded-lg bg-stone-850 hover:bg-stone-800 text-stone-200 border border-stone-700 transition text-xs flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                  <button
                    id="export-download-btn"
                    onClick={handleDownload}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium transition text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .dreamarchive</span>
                  </button>
                </div>
              </div>

              {/* Partition Hashes Matrix */}
              <div className="space-y-2">
                <h5 className="text-xs font-mono uppercase tracking-wider text-stone-400">
                  Partition Cryptographic Hashes (SHA-256)
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {exportedArchive?.manifest?.partitionHashes &&
                    Object.entries(exportedArchive.manifest.partitionHashes).map(([file, hash]) => (
                      <div
                        key={file}
                        className="bg-stone-950/50 border border-stone-850 rounded-lg p-2.5 font-mono text-[11px] flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between text-stone-300 font-semibold">
                          <span>{file}</span>
                          <span className="text-[10px] text-emerald-400/90 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            VERIFIED
                          </span>
                        </div>
                        <div className="text-stone-500 truncate text-[10px] select-all">{hash as string}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'import' && (
            <div className="space-y-4">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-stone-200 flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-amber-400" />
                    Atomic Archive Import & Integrity Staging
                  </h4>
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-stone-850 hover:bg-stone-800 text-stone-300 border border-stone-700 transition text-xs flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept=".dreamarchive,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-xs text-stone-400">
                  Paste or upload a <code className="text-amber-300">.dreamarchive</code> payload. The engine will
                  stage validation without modifying live campaign state. If any partition hash or cross-reference check fails, live state remains 100% untouched.
                </p>
                <textarea
                  id="archive-import-input"
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder="Paste .dreamarchive JSON contents here..."
                  className="w-full h-40 bg-stone-950 border border-stone-800 rounded-lg p-3 font-mono text-xs text-stone-200 focus:outline-none focus:border-amber-500/50 resize-y"
                />

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    id="archive-dryrun-validate-btn"
                    onClick={handleValidateInput}
                    disabled={!importInput.trim() || isValidating}
                    className="px-3.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 transition text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isValidating ? 'Validating...' : 'Dry-Run Validate'}</span>
                  </button>

                  <button
                    id="archive-execute-restore-btn"
                    onClick={handleRestoreArchive}
                    disabled={!importInput.trim() || isRestoring || (validationResult !== null && !validationResult.valid)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                    <span>{isRestoring ? 'Restoring...' : 'Atomic Restore Campaign'}</span>
                  </button>
                </div>
              </div>

              {/* Validation Result Feedback */}
              {validationResult && (
                <div
                  className={`border rounded-xl p-4 flex items-start gap-3 ${
                    validationResult.valid
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {validationResult.valid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold">
                      {validationResult.valid
                        ? 'Archive Integrity Verified (100% Passed)'
                        : 'Archive Validation Failed'}
                    </h5>
                    <p className="text-xs text-stone-300">
                      {validationResult.valid
                        ? `All ${validationResult.partitionCount || 11} partitions matched manifest cryptographic hashes and passed schema cross-reference checks.`
                        : validationResult.errorReason}
                    </p>
                  </div>
                </div>
              )}

              {/* Restore Result Message */}
              {restoreMessage && (
                <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-xl p-4 flex items-center gap-3 text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="text-xs">{restoreMessage}</div>
                </div>
              )}

              {restoreError && (
                <div className="bg-rose-950/30 border border-rose-500/50 rounded-xl p-4 flex items-center gap-3 text-rose-300">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <div className="text-xs">{restoreError}</div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'assets' && (
            <div className="space-y-4">
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-4">
                <h4 className="text-sm font-medium text-stone-200 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  Deterministic Visual Asset Registry (DreamBook §363–§364)
                </h4>
                <p className="text-xs text-stone-400 mt-1">
                  Stable asset IDs with composition safety profiles and generative prompt fallbacks.
                </p>
              </div>

              {isLoadingAssets ? (
                <div className="text-center py-8 text-stone-500 text-xs font-mono">Loading assets...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {assets.map((asset) => (
                    <div
                      key={asset.assetId}
                      className="bg-stone-950/50 border border-stone-850 rounded-xl p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-amber-300">{asset.assetId}</span>
                        <span className="text-[10px] font-mono text-stone-400 px-1.5 py-0.5 rounded bg-stone-800">
                          {asset.mediaType} • {asset.compositionProfile?.aspectRatio || '16:9'}
                        </span>
                      </div>
                      <div className="text-stone-300 text-xs italic bg-stone-900/60 p-2 rounded border border-stone-850">
                        "{asset.promptFallback}"
                      </div>
                      <div className="font-mono text-[10px] text-stone-500 truncate select-all">
                        SHA-256: {asset.mediaSha256}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
