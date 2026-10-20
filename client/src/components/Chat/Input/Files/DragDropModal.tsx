import React, { useMemo, useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  FolderArchive,
  MessageSquare,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  Constants,
  Providers,
  EToolResources,
  EModelEndpoint,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import {
  useLocalize,
  useUploadOptions,
  useFileUploadRouter,
  useAgentToolPermissions,
} from '~/hooks';
import SaveToSuiteModal, { SaveDestination } from './SaveToSuiteModal';
import {
  uploadToSuite,
  setLastUsedDataset,
  uploadToLatestChatUploads,
} from '~/data-provider/documentSuite';
import useExtensionFeatures from '~/hooks/Nav/useExtensionFeatures';
import { useDragDropContext, useUploadModalContext } from '~/Providers';
import { ephemeralAgentByConvoId } from '~/store';

const insertDocMarkerIntoTextarea = (docFiles: File[]) => {
  if (docFiles.length === 0) {
    return;
  }
  setTimeout(() => {
    const textarea =
      document.querySelector<HTMLTextAreaElement>('[data-testid="text-input"]') ??
      (document.getElementById('prompt-textarea') as HTMLTextAreaElement | null);
    if (!textarea) {
      return;
    }
    const existing = textarea.value;
    const prefix = docFiles
      .filter((f) => !existing.includes(f.name))
      .map((f) => `[Dokument hinzugefügt: "${f.name}"]`)
      .join(' ');
    if (!prefix) {
      return;
    }
    const newVal = existing.trim() ? `${prefix} ${existing}` : `${prefix} `;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, newVal);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, 150);
};

const DragDropModal = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { documentSuite } = useExtensionFeatures();
  const { isVisible, files, closeModal } = useUploadModalContext();
  const { conversationId, agentId, endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const ephemeralAgent = useRecoilValue(
    ephemeralAgentByConvoId(conversationId ?? Constants.NEW_CONVO),
  );
  const { provider } = useAgentToolPermissions(agentId, ephemeralAgent);
  const { getOptions } = useUploadOptions();
  const routeFiles = useFileUploadRouter();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const isProviderDocSupported = useMemo(() => {
    let currentProvider = (provider || endpoint) ?? '';
    if (currentProvider.toLowerCase() === Providers.OPENROUTER) {
      currentProvider = Providers.OPENROUTER;
    }
    const isAzureWithResponsesApi =
      (currentProvider === EModelEndpoint.azureOpenAI ||
        endpointType === EModelEndpoint.azureOpenAI) &&
      useResponsesApi === true;
    return (
      isDocumentSupportedProvider(endpointType) ||
      isDocumentSupportedProvider(currentProvider) ||
      isAzureWithResponsesApi
    );
  }, [provider, endpoint, endpointType, useResponsesApi]);

  const getOptionMeta = (value: EToolResources | undefined) => {
    switch (value) {
      case EToolResources.file_search:
        return {
          label: localize('com_ui_upload_file_search'),
          icon: <FileSearch className="icon-md" />,
        };
      case EToolResources.execute_code:
        return {
          label: localize('com_ui_upload_code_environment'),
          icon: <TerminalSquareIcon className="icon-md" />,
        };
      case EToolResources.context:
        return {
          label: localize('com_ui_upload_ocr_text'),
          icon: <FileType2Icon className="icon-md" />,
        };
      default:
        return isProviderDocSupported
          ? {
              label: localize('com_ui_upload_provider'),
              icon: <FileImageIcon className="icon-md" />,
            }
          : {
              label: localize('com_ui_upload_image_input'),
              icon: <ImageUpIcon className="icon-md" />,
            };
    }
  };

  const options = useMemo(() => getOptions(files), [getOptions, files]);

  const handleSaveModalConfirm = useCallback(
    (destination: SaveDestination) => {
      setIsSaveModalOpen(false);
      closeModal();
      const imageFiles = files.filter((f) => /^image\//.test(f.type));
      const docFiles = files.filter((f) => !/^image\//.test(f.type));
      if (imageFiles.length > 0) {
        routeFiles(imageFiles, undefined);
      }
      if (docFiles.length > 0) {
        routeFiles(docFiles, EToolResources.execute_code);
        insertDocMarkerIntoTextarea(docFiles);
      }
      if (destination.datasetId) {
        setLastUsedDataset({ id: destination.datasetId, title: destination.datasetTitle });
        showToast({
          message: localize('com_ds_saving_toast'),
          status: 'info',
          duration: 3000,
        });
        (async () => {
          for (const file of files) {
            try {
              await uploadToSuite(file, destination.datasetId);
              showToast({
                message: localize('com_ds_saved_toast', { filename: file.name }),
                status: 'success',
                duration: 4000,
              });
            } catch (err) {
              console.error('[DocumentSuite] Upload error:', err);
              showToast({
                message: localize('com_ds_save_error_toast', { filename: file.name }),
                status: 'error',
                duration: 5000,
              });
            }
          }
        })();
      }
    },
    [files, closeModal, routeFiles, showToast, localize],
  );

  const handleChatOnlyUpload = useCallback(() => {
    closeModal();
    const imageFiles = files.filter((f) => /^image\//.test(f.type));
    const docFiles = files.filter((f) => !/^image\//.test(f.type));
    if (imageFiles.length > 0) {
      routeFiles(imageFiles, undefined);
    }
    if (docFiles.length > 0) {
      routeFiles(docFiles, EToolResources.execute_code);
      insertDocMarkerIntoTextarea(docFiles);
    }
    if (documentSuite && files.length > 0) {
      (async () => {
        for (const file of files) {
          try {
            await uploadToLatestChatUploads(file);
          } catch {
            // Silent background sync
          }
        }
      })();
    }
  }, [files, closeModal, routeFiles, documentSuite]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <OGDialog open={isVisible && !isSaveModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogTemplate
          title={documentSuite ? localize('com_ds_drag_modal_title') : localize('com_ui_upload_type')}
          className="w-11/12 sm:w-[min(27.5rem,90vw)] md:w-[min(25rem,90vw)] lg:w-[min(22.5rem,90vw)]"
          main={
            <div className="flex flex-col gap-2">
              {documentSuite ? (
                <>
                  <button
                    type="button"
                    onClick={handleChatOnlyUpload}
                    className="hover:bg-surface-active-alt flex items-center gap-3 rounded-lg p-3 text-left"
                  >
                    <MessageSquare className="icon-md shrink-0 text-blue-500" />
                    <div className="flex flex-col">
                      <span className="font-medium">{localize('com_ds_drag_just_chat')}</span>
                      <span className="text-xs text-text-secondary">
                        {localize('com_ds_drag_just_chat_desc')}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSaveModalOpen(true)}
                    className="hover:bg-surface-active-alt flex items-center gap-3 rounded-lg p-3 text-left"
                  >
                    <FolderArchive className="icon-md shrink-0 text-emerald-500" />
                    <div className="flex flex-col">
                      <span className="font-medium">{localize('com_ds_drag_save_suite')}</span>
                      <span className="text-xs text-text-secondary">
                        {localize('com_ds_drag_save_suite_desc')}
                      </span>
                    </div>
                  </button>
                </>
              ) : (
                options.map((value) => {
                  const { label, icon } = getOptionMeta(value);
                  return (
                    <button
                      key={value ?? 'provider'}
                      onClick={() => {
                        routeFiles(files, value);
                        closeModal();
                      }}
                      className="hover:bg-surface-active-alt flex items-center gap-2 rounded-lg p-2"
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  );
                })
              )}
            </div>
          }
        />
      </OGDialog>
      <SaveToSuiteModal
        files={files}
        isVisible={isSaveModalOpen}
        onClose={() => {
          setIsSaveModalOpen(false);
          closeModal();
        }}
        onConfirm={handleSaveModalConfirm}
      />
    </>
  );
};

export default DragDropModal;
