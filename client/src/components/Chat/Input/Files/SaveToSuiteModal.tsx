import React, { useState, useEffect, useMemo } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { FolderArchive, FolderPlus, History, Loader2 } from 'lucide-react';
import useLocalize from '~/hooks/useLocalize';
import {
  ensureDefaultDataset,
  createDataset,
  getLastUsedDataset,
  LibraryDatasetItem,
} from '~/data-provider/documentSuite';

export interface SaveDestination {
  datasetId: number;
  datasetTitle: string;
}

interface SaveToSuiteModalProps {
  files: File[];
  isVisible: boolean;
  onClose: () => void;
  onConfirm: (destination: SaveDestination) => void;
}

export default function SaveToSuiteModal({
  files,
  isVisible,
  onClose,
  onConfirm,
}: SaveToSuiteModalProps) {
  const localize = useLocalize();
  const [selectedType, setSelectedType] = useState<'default' | 'new' | 'last'>('default');
  const [newTitle, setNewTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDataset, setLastDataset] = useState<LibraryDatasetItem | null>(null);

  const defaultSuggestedTitle = useMemo(() => {
    if (!files || files.length === 0) return 'Dokumente';
    const first = files[0].name;
    const base = first.replace(/\.[^/.]+$/, '').trim();
    return base || 'Dokumente';
  }, [files]);

  useEffect(() => {
    if (isVisible) {
      setNewTitle(defaultSuggestedTitle);
      const last = getLastUsedDataset();
      setLastDataset(last as LibraryDatasetItem | null);
      setSelectedType('default');
      setIsProcessing(false);
    }
  }, [isVisible, defaultSuggestedTitle]);

  const handleProceed = async () => {
    setIsProcessing(true);
    try {
      if (selectedType === 'default') {
        const ds = await ensureDefaultDataset();
        onConfirm({ datasetId: ds.id, datasetTitle: ds.title });
      } else if (selectedType === 'new') {
        const finalTitle = (newTitle || defaultSuggestedTitle).trim();
        const ds = await createDataset(finalTitle);
        onConfirm({ datasetId: ds.id, datasetTitle: ds.title });
      } else if (selectedType === 'last' && lastDataset) {
        onConfirm({ datasetId: lastDataset.id, datasetTitle: lastDataset.title });
      }
      onClose();
    } catch (err) {
      console.error('[SaveToSuiteModal] Failed to determine dataset:', err);
      try {
        const ds = await ensureDefaultDataset();
        onConfirm({ datasetId: ds.id, datasetTitle: ds.title });
        onClose();
      } catch (fallbackErr) {
        console.error('[SaveToSuiteModal] Fallback failed:', fallbackErr);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isVisible) return null;

  return (
    <OGDialog open={isVisible} onOpenChange={(open) => !open && onClose()}>
      <OGDialogTemplate
        title={localize('com_ds_save_modal_title')}
        className="w-11/12 sm:w-[480px]"
        main={
          <div className="flex flex-col gap-3 py-2">
            <div
              onClick={() => setSelectedType('default')}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                selectedType === 'default'
                  ? 'border-primary bg-surface-active-alt shadow-sm'
                  : 'border-border-light hover:bg-surface-hover dark:border-border-medium'
              }`}
            >
              <div className="mt-0.5 rounded-md bg-blue-500/10 p-2 text-blue-500">
                <FolderArchive className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">
                  {localize('com_ds_save_chat_uploads')}
                </span>
                <span className="text-xs text-text-secondary">
                  {localize('com_ds_save_chat_uploads_desc')}
                </span>
              </div>
            </div>

            <div
              onClick={() => setSelectedType('new')}
              className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
                selectedType === 'new'
                  ? 'border-primary bg-surface-active-alt shadow-sm'
                  : 'border-border-light hover:bg-surface-hover dark:border-border-medium'
              }`}
            >
              <div className="flex cursor-pointer items-start gap-3">
                <div className="mt-0.5 rounded-md bg-emerald-500/10 p-2 text-emerald-500">
                  <FolderPlus className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-text-primary">
                    {localize('com_ds_save_new_dataset')}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {localize('com_ds_save_new_dataset_desc')}
                  </span>
                </div>
              </div>

              {selectedType === 'new' && (
                <div className="mt-2 pl-11">
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={defaultSuggestedTitle}
                    className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {lastDataset && lastDataset.title !== 'Chat-Uploads' && (
              <div
                onClick={() => setSelectedType('last')}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selectedType === 'last'
                    ? 'border-primary bg-surface-active-alt shadow-sm'
                    : 'border-border-light hover:bg-surface-hover dark:border-border-medium'
                }`}
              >
                <div className="mt-0.5 rounded-md bg-amber-500/10 p-2 text-amber-500">
                  <History className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-text-primary">{lastDataset.title}</span>
                  <span className="text-xs text-text-secondary">
                    {localize('com_ds_save_last_dataset')}
                  </span>
                </div>
              </div>
            )}
          </div>
        }
        buttons={
          <div className="flex w-full items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              {localize('com_ds_save_cancel')}
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleProceed}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{localize('com_ds_save_confirm')}</span>
            </button>
          </div>
        }
      />
    </OGDialog>
  );
}
