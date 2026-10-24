import { memo, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import LicensesModal from './LicensesModal';
import { useLocalize } from '~/hooks';
import store from '~/store';

type AttributionCandidate =
  | { kind: 'partner'; partner: string }
  | { kind: 'others' }
  | { kind: 'standalone' };

export function AttributionBadge() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const [modalOpen, setModalOpen] = useState(false);
  const [seed] = useState(() => Math.random());

  const attribution = startupConfig?.interface?.attribution;
  const enabled = attribution?.enabled === true;
  const anchor = typeof attribution?.anchor === 'string' ? attribution.anchor.trim() : '';

  const selected = useMemo<AttributionCandidate>(() => {
    const candidates: AttributionCandidate[] = [];
    const partners = Array.isArray(attribution?.partners) ? attribution.partners : [];
    for (const raw of partners) {
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (trimmed) {
        candidates.push({ kind: 'partner', partner: trimmed });
      }
    }
    if (attribution?.includeOthers !== false) {
      candidates.push({ kind: 'others' });
    }
    if (attribution?.includeStandalone !== false || candidates.length === 0) {
      candidates.push({ kind: 'standalone' });
    }
    const index = Math.floor(seed * candidates.length) % candidates.length;
    return candidates[index] ?? { kind: 'standalone' };
  }, [attribution?.includeOthers, attribution?.includeStandalone, attribution?.partners, seed]);

  if (!enabled || !anchor || maximizeChatSpace) {
    return null;
  }

  let label: string;
  if (selected.kind === 'partner') {
    label = localize('com_ui_attribution_powered_by_partner', {
      anchor,
      partner: selected.partner,
    });
  } else if (selected.kind === 'others') {
    label = localize('com_ui_attribution_powered_by_others', { anchor });
  } else {
    label = localize('com_ui_attribution_powered_by', { anchor });
  }

  return (
    <>
      <button
        type="button"
        data-testid="attribution-badge"
        onClick={() => setModalOpen(true)}
        aria-label={`${label} — ${localize('com_ui_open_source_licenses_view')}`}
        className="border-border-light bg-surface-primary/80 text-text-secondary hover:bg-surface-secondary hover:text-text-primary absolute right-3 bottom-2 z-20 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-tight backdrop-blur-xs transition-colors @min-[82rem]:inline-flex"
      >
        <Scale className="size-3 shrink-0" aria-hidden="true" />
        <span className="max-w-56 truncate">{label}</span>
      </button>
      {modalOpen && (
        <LicensesModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          licensesUrl={attribution?.licensesUrl}
        />
      )}
    </>
  );
}

export default memo(AttributionBadge);
