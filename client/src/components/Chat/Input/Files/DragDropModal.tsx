import React, { useMemo, useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import {
  FileSearch,
  ImageUpIcon,
  FileType2Icon,
  FileImageIcon,
  FolderArchive,
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
import { uploadToSuite, setLastUsedDataset } from '~/data-provider/documentSuite';
import useExtensionFeatures from '~/hooks/Nav/useExtensionFeatures';
import { useDragDropContext, useUploadModalContext } from '~/Providers';
import { ephemeralAgentByConvoId } from '~/store';

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

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <OGDialog open={isVisible && !isSaveModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogTemplate
          title={localize('com_ui_upload_type')}
          className="w-11/12 sm:w-[min(27.5rem,90vw)] md:w-[min(25rem,90vw)] lg:w-[min(22.5rem,90vw)]"
          main={
            <div className="flex flex-col gap-2">
              {options.map((value) => {
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
              })}
              {documentSuite && (
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(true)}
                  className="hover:bg-surface-active-alt flex items-center gap-2 rounded-lg p-2 text-left"
                >
                  <FolderArchive className="icon-md text-emerald-500" />
                  <span>{localize('com_ds_drag_save_suite')}</span>
                </button>
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
