import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import copy from 'copy-to-clipboard';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Scale,
  Search,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import {
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface LicenseEntry {
  id?: string;
  name: string;
  version?: string;
  license: string;
  category?: string;
  url?: string;
  copyright?: string;
  notice?: string;
  licenseText?: string;
  prominent?: boolean;
}

export interface LicensesPayload {
  generatedAt?: string;
  entries: LicenseEntry[];
}

function isSafeExternalUrl(url?: string): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

function resolveSafeLicensesUrl(rawUrl?: string): string {
  if (typeof rawUrl !== 'string') {
    return '/licenses.json';
  }
  const trimmed = rawUrl.trim();
  if ((trimmed.startsWith('/') && !trimmed.startsWith('//')) || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return '/licenses.json';
}

function isValidLicenseEntry(item: unknown): item is LicenseEntry {
  if (item == null || typeof item !== 'object') {
    return false;
  }
  const candidate = item as Partial<LicenseEntry>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.license === 'string' &&
    candidate.license.trim().length > 0
  );
}

function LicenseCard({ entry }: { entry: LicenseEntry }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const textToCopy = entry.licenseText || entry.notice || `${entry.name} (${entry.license})`;
    const ok = copy(textToCopy, { format: 'text/plain' });
    if (!ok) {
      return;
    }
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1800);
  }, [entry.license, entry.licenseText, entry.name, entry.notice]);

  const safeUrl = isSafeExternalUrl(entry.url) ? entry.url.trim() : null;

  return (
    <div
      data-testid="license-card"
      className="border-border-light bg-surface-secondary flex flex-col gap-1.5 rounded-lg border p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-text-primary text-sm font-semibold">{entry.name}</span>
          {entry.version && (
            <span className="border-border-light bg-surface-primary text-text-secondary rounded border px-1.5 py-0.5 font-mono text-xs">
              {entry.version}
            </span>
          )}
          <span className="border-border-light bg-surface-tertiary text-text-primary rounded-md border px-2 py-0.5 text-xs font-medium">
            {entry.license}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={entry.name}
              className="text-text-secondary hover:bg-surface-tertiary hover:text-text-primary inline-flex items-center justify-center rounded-md p-1 transition-colors"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
          {entry.licenseText && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={localize('com_ui_copy_to_clipboard')}
                className="text-text-secondary hover:bg-surface-tertiary hover:text-text-primary inline-flex items-center justify-center rounded-md p-1 transition-colors"
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="border-border-light bg-surface-primary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
              >
                <span>{localize('com_ui_open_source_licenses_show_text')}</span>
                {expanded ? (
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {entry.copyright && <p className="text-text-tertiary text-xs">{entry.copyright}</p>}
      {entry.notice && <p className="text-text-secondary text-xs leading-relaxed">{entry.notice}</p>}

      {expanded && entry.licenseText && (
        <pre className="border-border-light bg-surface-primary text-text-secondary mt-1.5 max-h-60 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {entry.licenseText}
        </pre>
      )}
    </div>
  );
}

export function LicensesModal({
  open,
  onOpenChange,
  licensesUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licensesUrl?: string;
}) {
  const localize = useLocalize();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const resolvedUrl = resolveSafeLicensesUrl(licensesUrl);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [open]);

  const { data, isLoading } = useQuery<LicensesPayload>({
    queryKey: ['openSourceLicenses', resolvedUrl],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(resolvedUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to load licenses (${response.status})`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.toLowerCase().includes('application/json')) {
        throw new Error('Invalid content-type for licenses payload');
      }
      const payload = (await response.json()) as LicensesPayload;
      if (!payload || !Array.isArray(payload.entries)) {
        return { entries: [] };
      }
      return {
        ...payload,
        entries: payload.entries.filter(isValidLicenseEntry),
      };
    },
  });

  const entries = useMemo(() => {
    const raw = data?.entries ?? [];
    return [...raw].sort((a, b) => {
      if (Boolean(a.prominent) === Boolean(b.prominent)) {
        return 0;
      }
      return a.prominent ? -1 : 1;
    });
  }, [data?.entries]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of entries) {
      const cat = typeof item.category === 'string' ? item.category.trim() : '';
      if (cat) {
        seen.add(cat);
      }
    }
    return Array.from(seen);
  }, [entries]);

  const activeCategory =
    selectedCategory !== 'all' && categories.includes(selectedCategory) ? selectedCategory : 'all';

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((item) => {
      const itemCategory = typeof item.category === 'string' ? item.category.trim() : '';
      if (activeCategory !== 'all' && itemCategory !== activeCategory) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [item.name, item.license, item.category, item.copyright, item.notice]
        .filter((val): val is string => typeof val === 'string' && val.length > 0)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeCategory, entries, searchQuery]);

  let bodyContent: JSX.Element;
  if (isLoading) {
    bodyContent = (
      <div className="flex items-center justify-center py-12">
        <Spinner tone="secondary" />
      </div>
    );
  } else if (filteredEntries.length === 0) {
    bodyContent = (
      <div className="text-text-secondary py-10 text-center text-sm">
        {localize('com_ui_open_source_licenses_empty')}
      </div>
    );
  } else {
    bodyContent = (
      <div className="flex flex-col gap-2.5">
        {filteredEntries.map((entry, idx) => (
          <LicenseCard key={entry.id ?? `${entry.name}-${idx}`} entry={entry} />
        ))}
      </div>
    );
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[85vh] w-11/12 max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-border-light shrink-0 border-b px-5 py-4 pe-14">
          <OGDialogHeader className="gap-1 p-0">
            <div className="flex items-center gap-2">
              <Scale className="text-text-secondary size-4 shrink-0" aria-hidden="true" />
              <OGDialogTitle className="text-start text-base font-semibold">
                {localize('com_ui_open_source_licenses')}
              </OGDialogTitle>
            </div>
            <OGDialogDescription className="text-start text-xs">
              {localize('com_ui_open_source_licenses_desc')}
            </OGDialogDescription>
          </OGDialogHeader>
        </div>

        <div className="border-border-light bg-surface-primary flex shrink-0 flex-col gap-2.5 border-b px-5 py-3">
          <div className="relative flex items-center">
            <Search
              className="text-text-tertiary pointer-events-none absolute start-3 size-4"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={localize('com_ui_open_source_licenses_search')}
              aria-label={localize('com_ui_open_source_licenses_search')}
              className="border-border-light bg-surface-secondary text-text-primary placeholder:text-text-tertiary focus-visible:ring-border-heavy w-full rounded-lg border py-1.5 ps-9 pe-3 text-xs focus-visible:ring-1 focus-visible:outline-none"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  activeCategory === 'all'
                    ? 'border-border-heavy bg-surface-tertiary text-text-primary'
                    : 'border-border-light bg-surface-secondary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary',
                )}
              >
                {localize('com_ui_open_source_licenses_all')}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    activeCategory === cat
                      ? 'border-border-heavy bg-surface-tertiary text-text-primary'
                      : 'border-border-light bg-surface-secondary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{bodyContent}</div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default memo(LicensesModal);
