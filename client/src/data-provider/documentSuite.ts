import { getTokenHeader, request } from 'librechat-data-provider';

export interface LibraryFileItem {
  file_id: number;
  dataset_id: number;
  dataset_title: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  total_pages: number;
  created_at: string;
  match_type: 'name' | 'content' | 'recent';
  snippet?: string | null;
  ingest_status?: string | null;
}

export interface LibraryDatasetItem {
  id: number;
  title: string;
  file_count: number;
  created_at: string;
}

const BASE_URL = '/dateien/api';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const tokenHeader = getTokenHeader();
  const headers = new Headers(options.headers || {});

  if (tokenHeader) {
    headers.set('Authorization', tokenHeader);
  }

  let res = await fetch(url, { credentials: 'include', ...options, headers });

  if (res.status === 401) {
    try {
      await request.refreshToken();
      const newTokenHeader = getTokenHeader();
      if (newTokenHeader) {
        headers.set('Authorization', newTokenHeader);
      }
      res = await fetch(url, { credentials: 'include', ...options, headers });
    } catch (e) {
      console.error('[DocumentSuite] Token refresh failed:', e);
    }
  }

  return res;
}

export async function searchLibrary(
  q = '',
  datasetId?: number,
  limit = 40,
): Promise<LibraryFileItem[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (datasetId) params.set('dataset_id', String(datasetId));
  params.set('limit', String(limit));

  const res = await fetchWithAuth(`${BASE_URL}/library/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed: ${res.statusText}`);
  }
  return res.json();
}

export async function listDatasets(): Promise<LibraryDatasetItem[]> {
  const res = await fetchWithAuth(`${BASE_URL}/library/datasets`);
  if (!res.ok) {
    throw new Error(`Failed to list datasets: ${res.statusText}`);
  }
  return res.json();
}

export async function ensureDefaultDataset(): Promise<LibraryDatasetItem> {
  const res = await fetchWithAuth(`${BASE_URL}/library/default-dataset`);
  if (!res.ok) {
    throw new Error(`Failed to get default dataset: ${res.statusText}`);
  }
  return res.json();
}

export async function ensureLatestDataset(): Promise<LibraryDatasetItem> {
  const res = await fetchWithAuth(`${BASE_URL}/library/latest-dataset`);
  if (!res.ok) {
    throw new Error(`Failed to get latest dataset: ${res.statusText}`);
  }
  return res.json();
}

export async function ensureAiGeneratedDataset(): Promise<LibraryDatasetItem> {
  const res = await fetchWithAuth(`${BASE_URL}/library/ai-generated-dataset`);
  if (!res.ok) {
    throw new Error(`Failed to get AI-Generated dataset: ${res.statusText}`);
  }
  return res.json();
}

export async function createDataset(title: string): Promise<LibraryDatasetItem> {
  const res = await fetchWithAuth(`${BASE_URL}/datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create dataset: ${res.statusText}`);
  }
  return res.json();
}

export async function downloadAsFile(item: LibraryFileItem): Promise<File> {
  const res = await fetchWithAuth(`${BASE_URL}/library/files/${item.file_id}/download`);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.statusText}`);
  }
  const blob = await res.blob();
  const mimeType = item.mime_type || blob.type || 'application/octet-stream';
  return new File([blob], item.file_name, { type: mimeType });
}

export async function uploadToSuite(file: File, datasetId: number): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetchWithAuth(`${BASE_URL}/datasets/${datasetId}/files/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${errorText || res.statusText}`);
  }
  return res.json();
}

export async function uploadToLatestChatUploads(file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetchWithAuth(`${BASE_URL}/library/latest-uploads`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Latest-Chat-Uploads sync failed (${res.status}): ${errorText || res.statusText}`);
  }
  return res.json();
}

export async function uploadToAiGenerated(file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetchWithAuth(`${BASE_URL}/library/ai-generated`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI-Generated sync failed (${res.status}): ${errorText || res.statusText}`);
  }
  return res.json();
}

export function getLastUsedDataset(): { id: number; title: string } | null {
  try {
    const raw = localStorage.getItem('ds_last_dataset');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLastUsedDataset(ds: { id: number; title: string }): void {
  try {
    localStorage.setItem('ds_last_dataset', JSON.stringify(ds));
  } catch {
    // Ignore storage errors
  }
}
