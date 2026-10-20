import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import {
  Search,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  File as FileIcon,
  Loader2,
  CheckSquare,
  Square,
  ExternalLink,
} from 'lucide-react';
import useLocalize from '~/hooks/useLocalize';
import {
  searchLibrary,
  listDatasets,
  downloadAsFile,
  LibraryFileItem,
  LibraryDatasetItem,
} from '~/data-provider/documentSuite';

interface DocumentSuiteSearchDialogProps {
  isVisible: boolean;
  onClose: () => void;
  onFilesSelected: (files: File[]) => Promise<void> | void;
}

function getFileIcon(fileName: string, mimeType: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return <FileImage className="h-5 w-5 text-purple-500" />;
  }
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  }
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'html', 'json', 'xml', 'css'].includes(ext)) {
    return <FileCode className="h-5 w-5 text-blue-500" />;
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  return <FileIcon className="h-5 w-5 text-text-secondary" />;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function DocumentSuiteSearchDialog({
  isVisible,
  onClose,
  onFilesSelected,
}: DocumentSuiteSearchDialogProps) {
  const localize = useLocalize();
  const [query, setQuery] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | undefined>();
  const [datasets, setDatasets] = useState<LibraryDatasetItem[]>([]);
  const [results, setResults] = useState<LibraryFileItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, dsId?: number) => {
    setIsLoading(true);
    try {
      const items = await searchLibrary(q, dsId, 50);
      setResults(items);
    } catch (err) {
      console.error('[DocSearch] Search failed:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      setQuery('');
      setSelectedIds(new Set());
      setSelectedDatasetId(undefined);
      setIsDownloading(false);
      listDatasets()
        .then(setDatasets)
        .catch((e) => console.error('[DocSearch] Failed to fetch datasets:', e));
      doSearch('', undefined);
    }
  }, [isVisible, doSearch]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      doSearch(val, selectedDatasetId);
    }, 280);
  };

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? Number(e.target.value) : undefined;
    setSelectedDatasetId(val);
    doSearch(query, val);
  };

  const toggleSelect = (fileId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.file_id)));
    }
  };

  const handleAddSelectedToChat = async () => {
    const selectedFiles = results.filter((r) => selectedIds.has(r.file_id));
    if (selectedFiles.length === 0) return;

    setIsDownloading(true);
    const downloaded: File[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      setDownloadProgressText(`${i + 1}/${selectedFiles.length}: ${item.file_name}`);
      try {
        const fileObj = await downloadAsFile(item);
        downloaded.push(fileObj);
      } catch (err) {
        console.error(`[DocSearch] Failed to download ${item.file_name}:`, err);
      }
    }

    setIsDownloading(false);
    if (downloaded.length > 0) {
      await onFilesSelected(downloaded);
    }
    onClose();
  };

  if (!isVisible) return null;

  return (
    <OGDialog open={isVisible} onOpenChange={(open) => !open && !isDownloading && onClose()}>
      <OGDialogTemplate
        title={localize('com_ds_search_modal_title')}
        className="w-11/12 sm:w-[650px] md:w-[750px] max-w-4xl"
        main={
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder={localize('com_ds_search_placeholder')}
                  className="w-full rounded-lg border border-border-medium bg-surface-primary py-2 pl-9 pr-3 text-sm text-text-primary focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>

              <select
                value={selectedDatasetId ?? ''}
                onChange={handleDatasetChange}
                className="rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              >
                <option value="">{localize('com_ds_search_all_datasets')}</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.file_count})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-b border-border-light pb-2 pt-1 text-xs text-text-secondary">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 hover:text-text-primary"
              >
                {selectedIds.size > 0 && selectedIds.size === results.length ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span>
                  {selectedIds.size > 0 ? `${selectedIds.size} ausgewählt` : 'Alle auswählen'}
                </span>
              </button>

              <span className="flex items-center gap-1">
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {results.length} Dokumente
              </span>
            </div>

            <div className="max-h-[380px] min-h-[180px] overflow-y-auto pr-1">
              {results.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-text-secondary">
                  <FileText className="mb-2 h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">{localize('com_ds_search_no_results')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {results.map((item) => {
                    const isSelected = selectedIds.has(item.file_id);
                    return (
                      <div
                        key={item.file_id}
                        onClick={() => toggleSelect(item.file_id)}
                        className={`group flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors ${
                          isSelected
                            ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
                            : 'border-border-light hover:bg-surface-hover dark:border-border-medium'
                        }`}
                      >
                        <div className="mt-1">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-text-secondary group-hover:text-text-primary" />
                          )}
                        </div>

                        <div className="mt-0.5">{getFileIcon(item.file_name, item.mime_type)}</div>

                        <div className="flex flex-1 flex-col overflow-hidden">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-text-primary">
                              {item.file_name}
                            </span>
                            <span className="text-xs text-text-secondary flex-shrink-0">
                              {formatBytes(item.file_size)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-0.5 text-xs text-text-secondary">
                            <span className="rounded bg-surface-active px-1.5 py-0.5 text-[11px] font-medium text-text-primary">
                              {item.dataset_title}
                            </span>
                            {item.total_pages > 0 && <span>{item.total_pages} Seiten</span>}
                            {item.ingest_status && item.ingest_status !== 'done' && (
                              <span className="text-amber-500 font-medium">
                                ({item.ingest_status})
                              </span>
                            )}
                          </div>

                          {item.snippet && (
                            <p className="mt-1 text-xs text-text-secondary line-clamp-2 bg-surface-active/30 rounded p-1">
                              {item.snippet}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
        buttons={
          <div className="flex w-full items-center justify-between pt-2">
            <a
              href="/document-processor/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <span>{localize('com_ds_go_to_suite')}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDownloading}
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
              >
                {localize('com_ds_save_cancel')}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || isDownloading}
                onClick={handleAddSelectedToChat}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{downloadProgressText || localize('com_ds_search_downloading')}</span>
                  </>
                ) : (
                  <span>
                    {localize('com_ds_search_add_to_chat')}
                    {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                  </span>
                )}
              </button>
            </div>
          </div>
        }
      />
    </OGDialog>
  );
}
