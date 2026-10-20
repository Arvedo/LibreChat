import { useState, useEffect } from 'react';

export interface ExtensionUiFeatures {
  document_suite?: boolean;
  agent_creator?: boolean;
  mailer_suite?: boolean;
}

export interface ExtensionConfigPayload {
  ui_features?: ExtensionUiFeatures;
}

const STORAGE_KEY = 'ai_suite_extensions';
let fetchPromise: Promise<ExtensionConfigPayload | null> | null = null;

function getCachedExtensions(): ExtensionConfigPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const winExt = (window as unknown as { __AI_SUITE_EXTENSIONS__?: ExtensionConfigPayload })
      .__AI_SUITE_EXTENSIONS__;
    if (winExt && typeof winExt === 'object') {
      return winExt;
    }
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExtensionConfigPayload;
      (window as unknown as { __AI_SUITE_EXTENSIONS__?: ExtensionConfigPayload }).__AI_SUITE_EXTENSIONS__ =
        parsed;
      return parsed;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

export function isDocumentSuiteEnabled(): boolean {
  return getCachedExtensions()?.ui_features?.document_suite === true;
}

export function isMailerSuiteEnabled(): boolean {
  return getCachedExtensions()?.ui_features?.mailer_suite === true;
}

export default function useExtensionFeatures() {
  const [features, setFeatures] = useState<ExtensionUiFeatures>(
    () => getCachedExtensions()?.ui_features ?? {},
  );

  useEffect(() => {
    const onExtLoaded = (event: Event) => {
      const detail = (event as CustomEvent<ExtensionConfigPayload>).detail;
      if (detail?.ui_features) {
        setFeatures(detail.ui_features);
      } else {
        setFeatures(getCachedExtensions()?.ui_features ?? {});
      }
    };
    window.addEventListener('ai-suite-extensions-loaded', onExtLoaded);

    if (!fetchPromise && typeof window !== 'undefined' && typeof window.fetch === 'function') {
      fetchPromise = Promise.resolve(window.fetch('/api/extensions'))
        .then((res) => (res && res.ok ? res.json() : null))
        .then((data: ExtensionConfigPayload | null) => {
          if (data && typeof data === 'object') {
            (
              window as unknown as { __AI_SUITE_EXTENSIONS__?: ExtensionConfigPayload }
            ).__AI_SUITE_EXTENSIONS__ = data;
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch {
              // Ignore quota/storage errors
            }
            window.dispatchEvent(new CustomEvent('ai-suite-extensions-loaded', { detail: data }));
          }
          return data;
        })
        .catch(() => null);
    } else if (fetchPromise) {
      fetchPromise.then((data) => {
        if (data?.ui_features) {
          setFeatures(data.ui_features);
        }
      });
    }

    return () => window.removeEventListener('ai-suite-extensions-loaded', onExtLoaded);
  }, []);

  return {
    documentSuite: features.document_suite === true,
    mailerSuite: features.mailer_suite === true,
    agentCreator: features.agent_creator === true,
  };
}
