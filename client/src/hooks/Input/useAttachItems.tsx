import React, { useRef, useMemo, useState, useCallback } from 'react';
import { SharePointIcon, useToastContext } from '@librechat/client';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  Search,
  FileSearch,
  ImageUpIcon,
  ExternalLink,
  FileType2Icon,
  FileImageIcon,
  FolderArchive,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  getConfiguredMimeAccept,
  isExplicitMimeConfig,
  bedrockDocumentMimeTypes,
  isAssistantsEndpoint,
  defaultAgentCapabilities,
  bedrockDocumentExtensions,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import type {
  TConversation,
  EndpointFileConfig,
  MimeUploadCapability,
} from 'librechat-data-provider';
import type { SharePointFile } from '~/data-provider/Files/sharepoint';
import type { SaveDestination } from '~/components/Chat/Input/Files/SaveToSuiteModal';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  uploadToSuite,
  setLastUsedDataset,
  uploadToLatestChatUploads,
} from '~/data-provider/documentSuite';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { useAgentToolPermissions, useAgentCapabilities, useGetAgentsConfig } from '~/hooks';
import useExtensionFeatures from '~/hooks/Nav/useExtensionFeatures';
import { useFileHandlingNoChatContext } from '~/hooks/Files';
import { useGetStartupConfig } from '~/data-provider';
import { getUploadToolAllowances } from '~/utils';
import { ephemeralAgentByConvoId } from '~/store';
import useLocalize from '~/hooks/useLocalize';

type FileUploadType =
  | 'image'
  | 'document'
  | 'image_document'
  | 'image_document_extended'
  | 'image_document_video_audio'
  | 'image_document_video_audio_configured';

const fileTypeCapabilities: Record<FileUploadType, MimeUploadCapability> = {
  image: { categories: ['image'] },
  document: { categories: ['document'] },
  image_document: { categories: ['image', 'document'] },
  image_document_extended: {
    categories: ['image', 'document'],
    documentMimeTypes: bedrockDocumentMimeTypes,
  },
  image_document_video_audio: {
    categories: ['image', 'document', 'audio', 'video'],
    documentMimeTypes: ['application/pdf'],
  },
  image_document_video_audio_configured: {
    categories: ['image', 'document', 'audio', 'video'],
  },
};

export interface AttachEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  onSelect: () => void;
}

export interface UseAttachItems {
  entries: AttachEntry[];
  inputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isSharePointDialogOpen: boolean;
  setIsSharePointDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSharePointFilesSelected: (files: SharePointFile[]) => Promise<void>;
  isProcessing: boolean;
  downloadProgress: ReturnType<typeof useSharePointFileHandlingNoChatContext>['downloadProgress'];
  maxSelectionCount: number | undefined;
  uploadAndSaveInputRef?: React.RefObject<HTMLInputElement>;
  onUploadAndSaveChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isSaveModalOpen?: boolean;
  setIsSaveModalOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  pendingSaveFiles?: File[];
  setPendingSaveFiles?: React.Dispatch<React.SetStateAction<File[]>>;
  onSaveModalConfirm?: (destination: SaveDestination) => Promise<void>;
  isSearchOpen?: boolean;
  setIsSearchOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  onSuiteFilesSelected?: (selectedFiles: File[]) => Promise<void>;
}

interface UseAttachItemsParams {
  agentId?: string | null;
  endpoint?: string | null;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  isUnifiedMode?: boolean;
  useResponsesApi?: boolean;
  conversationId: string;
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function useAttachItems({
  agentId,
  endpoint,
  endpointType,
  endpointFileConfig,
  isUnifiedMode = false,
  useResponsesApi,
  conversationId,
  conversation,
  files,
  setFiles,
  setFilesLoading,
}: UseAttachItemsParams): UseAttachItems {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { documentSuite } = useExtensionFeatures();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAndSaveInputRef = useRef<HTMLInputElement>(null);
  const toolResourceRef = useRef<EToolResources | undefined>();
  const [sharePointResource, setSharePointResource] = useState<EToolResources | undefined>();
  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveFiles, setPendingSaveFiles] = useState<File[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(conversationId));

  const { handleFileChange, handleFiles } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      { toolResource: sharePointResource },
      { files, setFiles, setFilesLoading, conversation },
    );

  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const { contextEnabled, fileSearchEnabled, codeEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );
  const { tools, provider } = useAgentToolPermissions(agentId, ephemeralAgent);
  const { fileSearchAllowedByAgent, codeAllowedByAgent } = getUploadToolAllowances(agentId, tools);

  const routeSuiteFiles = useCallback(
    async (fileList: File[], saveToSuite?: SaveDestination) => {
      if (fileList.length === 0) {
        return;
      }
      const imageFiles = fileList.filter((f) => /^image\//.test(f.type));
      const docFiles = fileList.filter((f) => !/^image\//.test(f.type));

      if (imageFiles.length > 0) {
        await handleFiles(imageFiles);
      }
      if (docFiles.length > 0) {
        setEphemeralAgent((prev) => ({
          ...prev,
          [EToolResources.execute_code]: true,
        }));
        await handleFiles(docFiles, EToolResources.execute_code);
      }

      if (saveToSuite?.datasetId) {
        const { datasetId, datasetTitle } = saveToSuite;
        setLastUsedDataset({ id: datasetId, title: datasetTitle });
        showToast({
          message: localize('com_ds_saving_toast'),
          status: 'info',
          duration: 3000,
        });
        (async () => {
          for (const file of fileList) {
            try {
              await uploadToSuite(file, datasetId);
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
    [handleFiles, setEphemeralAgent, showToast, localize],
  );

  const handleUploadClick = useCallback(
    (fileType?: FileUploadType) => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.value = '';
      const configuredAccept =
        fileType !== undefined
          ? getConfiguredMimeAccept(
              endpointFileConfig?.supportedMimeTypes,
              fileTypeCapabilities[fileType],
            )
          : undefined;
      if (configuredAccept != null) {
        inputRef.current.accept = configuredAccept;
      } else if (fileType === 'image') {
        inputRef.current.accept = 'image/*,.heif,.heic';
      } else if (fileType === 'document') {
        inputRef.current.accept = '.pdf,application/pdf';
      } else if (fileType === 'image_document') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf';
      } else if (fileType === 'image_document_extended') {
        inputRef.current.accept = `image/*,.heif,.heic,${bedrockDocumentExtensions}`;
      } else if (fileType === 'image_document_video_audio') {
        inputRef.current.accept = 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*';
      } else {
        inputRef.current.accept = '';
      }
      inputRef.current.click();
      inputRef.current.accept = '';
    },
    [endpointFileConfig?.supportedMimeTypes],
  );

  const entries = useMemo<AttachEntry[]>(() => {
    const setToolResource = (value: EToolResources | undefined) => {
      toolResourceRef.current = value;
      setSharePointResource(value);
    };

    const appendDocSuiteEntries = (target: AttachEntry[]) => {
      if (!documentSuite) {
        return target;
      }
      target.push(
        {
          id: 'doc_suite:upload_save',
          label: localize('com_ds_upload_save'),
          primary: true,
          icon: <FolderArchive className="icon-md text-emerald-500" aria-hidden="true" />,
          onSelect: () => {
            if (uploadAndSaveInputRef.current) {
              uploadAndSaveInputRef.current.value = '';
              uploadAndSaveInputRef.current.click();
            }
          },
        },
        {
          id: 'doc_suite:search',
          label: localize('com_ds_search_docs'),
          primary: true,
          icon: <Search className="icon-md text-blue-500" aria-hidden="true" />,
          onSelect: () => {
            setIsSearchOpen(true);
          },
        },
        {
          id: 'doc_suite:go_to_suite',
          label: `${localize('com_ds_go_to_suite')} ↗`,
          primary: true,
          icon: <ExternalLink className="icon-md text-amber-500" aria-hidden="true" />,
          onSelect: () => {
            window.open('/document-processor/', '_blank', 'noopener,noreferrer');
          },
        },
      );
      return target;
    };

    const build = (onAction: (fileType?: FileUploadType) => void, prefix: string) => {
      const items: AttachEntry[] = [];
      if (isUnifiedMode) {
        items.push({
          id: `${prefix}:unified`,
          label:
            prefix === 'local'
              ? localize('com_files_upload_local_machine')
              : localize('com_files_upload_sharepoint'),
          primary: true,
          icon:
            prefix === 'local' ? (
              <FileImageIcon className="icon-md" aria-hidden="true" />
            ) : (
              <SharePointIcon className="icon-md" aria-hidden="true" />
            ),
          onSelect: () => {
            setToolResource(undefined);
            if (prefix === 'local') {
              onAction();
            } else {
              setIsSharePointDialogOpen(true);
            }
          },
        });
        return items;
      }
      if (isAssistantsEndpoint(endpoint)) {
        items.push({
          id: `${prefix}:assistants`,
          label: localize('com_sidepanel_attach_files'),
          primary: true,
          icon: <FileImageIcon className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(undefined);
            onAction();
          },
        });
        return items;
      }

      let currentProvider = provider || endpoint;

      if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
        currentProvider = Providers.OPENROUTER;
      }

      const isAzureWithResponsesApi =
        (currentProvider === EModelEndpoint.azureOpenAI ||
          endpointType === EModelEndpoint.azureOpenAI) &&
        useResponsesApi === true;

      if (
        isDocumentSupportedProvider(endpointType) ||
        isDocumentSupportedProvider(currentProvider) ||
        isAzureWithResponsesApi
      ) {
        items.push({
          id: `${prefix}:provider`,
          label: localize('com_ui_upload_provider'),
          primary: true,
          icon: <FileImageIcon className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(undefined);
            let fileType: Exclude<FileUploadType, 'image' | 'document'> = 'image_document';
            if (currentProvider === Providers.GOOGLE || currentProvider === Providers.OPENROUTER) {
              fileType = 'image_document_video_audio';
            } else if (
              currentProvider === Providers.BEDROCK ||
              endpointType === EModelEndpoint.bedrock
            ) {
              fileType = 'image_document_extended';
            } else if (
              endpointType === EModelEndpoint.custom &&
              isExplicitMimeConfig(endpointFileConfig?.supportedMimeTypes)
            ) {
              fileType = 'image_document_video_audio_configured';
            }
            onAction(fileType);
          },
        });
      } else {
        items.push({
          id: `${prefix}:image`,
          label: localize('com_ui_upload_image_input'),
          primary: true,
          icon: <ImageUpIcon className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(undefined);
            onAction('image');
          },
        });
      }

      if (contextEnabled) {
        items.push({
          id: `${prefix}:context`,
          label: localize('com_ui_upload_ocr_text'),
          icon: <FileType2Icon className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(EToolResources.context);
            onAction();
          },
        });
      }

      if (fileSearchEnabled && fileSearchAllowedByAgent) {
        items.push({
          id: `${prefix}:file_search`,
          label: localize('com_ui_upload_file_search'),
          icon: <FileSearch className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(EToolResources.file_search);
            setEphemeralAgent((prev) => ({ ...prev, [EToolResources.file_search]: true }));
            onAction();
          },
        });
      }

      if (codeEnabled && codeAllowedByAgent) {
        items.push({
          id: `${prefix}:execute_code`,
          label: localize('com_ui_upload_code_environment'),
          icon: <TerminalSquareIcon className="icon-md" aria-hidden="true" />,
          onSelect: () => {
            setToolResource(EToolResources.execute_code);
            setEphemeralAgent((prev) => ({ ...prev, [EToolResources.execute_code]: true }));
            onAction();
          },
        });
      }

      return items;
    };

    const local = build(handleUploadClick, 'local');
    if (sharePointEnabled) {
      for (const item of build(() => setIsSharePointDialogOpen(true), 'sharepoint')) {
        local.push({
          ...item,
          primary: isUnifiedMode ? item.primary : false,
          label: isUnifiedMode
            ? item.label
            : `${item.label} (${localize('com_files_upload_sharepoint')})`,
          icon: <SharePointIcon className="icon-md" aria-hidden="true" />,
        });
      }
    }
    return appendDocSuiteEntries(local);
  }, [
    localize,
    endpoint,
    provider,
    endpointType,
    endpointFileConfig?.supportedMimeTypes,
    codeEnabled,
    contextEnabled,
    fileSearchEnabled,
    useResponsesApi,
    isUnifiedMode,
    handleUploadClick,
    setEphemeralAgent,
    sharePointEnabled,
    codeAllowedByAgent,
    fileSearchAllowedByAgent,
    documentSuite,
  ]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files ? Array.from(e.target.files) : [];
      handleFileChange(e, toolResourceRef.current);
      toolResourceRef.current = undefined;
      if (documentSuite && selected.length > 0) {
        (async () => {
          for (const file of selected) {
            try {
              await uploadToLatestChatUploads(file);
            } catch {
              // Silent background sync
            }
          }
        })();
      }
    },
    [handleFileChange, documentSuite],
  );

  const onUploadAndSaveChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      setPendingSaveFiles(fileList);
      setIsSaveModalOpen(true);
      e.target.value = '';
    }
  }, []);

  const onSaveModalConfirm = useCallback(
    async (destination: SaveDestination) => {
      if (pendingSaveFiles.length > 0) {
        const toProcess = [...pendingSaveFiles];
        setPendingSaveFiles([]);
        await routeSuiteFiles(toProcess, destination);
      }
    },
    [pendingSaveFiles, routeSuiteFiles],
  );

  const onSuiteFilesSelected = useCallback(
    async (selectedFiles: File[]) => {
      await routeSuiteFiles(selectedFiles);
    },
    [routeSuiteFiles],
  );

  const onSharePointFilesSelected = useCallback(
    async (sharePointFiles: unknown[]) => {
      try {
        await handleSharePointFiles(sharePointFiles as Parameters<typeof handleSharePointFiles>[0]);
        setIsSharePointDialogOpen(false);
      } catch (error) {
        console.error('SharePoint file processing error:', error);
      }
    },
    [handleSharePointFiles],
  );

  return {
    entries,
    inputRef,
    onFileChange,
    isSharePointDialogOpen,
    setIsSharePointDialogOpen,
    onSharePointFilesSelected,
    isProcessing,
    downloadProgress,
    maxSelectionCount: endpointFileConfig?.fileLimit,
    uploadAndSaveInputRef,
    onUploadAndSaveChange,
    isSaveModalOpen,
    setIsSaveModalOpen,
    pendingSaveFiles,
    setPendingSaveFiles,
    onSaveModalConfirm,
    isSearchOpen,
    setIsSearchOpen,
    onSuiteFilesSelected,
  };
}
