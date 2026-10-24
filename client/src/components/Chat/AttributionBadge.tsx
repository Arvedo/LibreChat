import { memo, useMemo, useRef, useState } from 'react';
import { Scale } from 'lucide-react';
import { useGetStartupConfig } from '~/data-provider';
import LicensesModal from './LicensesModal';
import { useLocalize } from '~/hooks';

/**
 * Candidate variants that can be selected for the session attribution pill:
 * - `partner`: "Powered by <anchor> and <partner>"
 * - `others`: "Powered by <anchor> and others"
 * - `standalone`: "Powered by <anchor>"
 */
type AttributionCandidate =
  | { kind: 'partner'; partner: string }
  | { kind: 'others' }
  | { kind: 'standalone' };

/**
 * Renders an optional, non-intrusive attribution pill in the bottom-inline-end corner
 * of the chat pane when `interface.attribution.enabled` is true and `anchor` is set.
 *
 * Visibility is gated by:
 * - `maximizeChatSpace` (passed from `ChatView` so the pill yields when the user maximizes chat space), and
 * - `@min-[82rem]:inline-flex` against `TraceSurface`'s `@container` width so the pill never
 *   collides with the centered composer or footer on narrower viewports.
 *
 * Clicking the pill opens `LicensesModal` and restores keyboard focus via `triggerRef` on close.
 * See `docs/attribution.md` for configuration and catalog details.
 */
export function AttributionBadge({
  maximizeChatSpace = false,
}: {
  maximizeChatSpace?: boolean;
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [modalOpen, setModalOpen] = useState(false);
  /** Picked once per mount so the displayed partner/variant stays stable across re-renders in a session. */
  const [seed] = useState(() => Math.random());
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const attribution = startupConfig?.interface?.attribution;
  const enabled = attribution?.enabled === true;
  const anchor = typeof attribution?.anchor === 'string' ? attribution.anchor.trim() : '';

  /** Builds the eligible rotation pool from `partners`, `includeOthers`, and `includeStandalone`. */
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
        ref={triggerRef}
        type="button"
        data-testid="attribution-badge"
        onClick={() => setModalOpen(true)}
        aria-label={`${label} — ${localize('com_ui_open_source_licenses_view')}`}
        className="border-border-light bg-surface-primary/80 text-text-secondary hover:bg-surface-secondary hover:text-text-primary absolute inset-e-3 bottom-2 z-20 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-tight backdrop-blur-xs transition-colors @min-[82rem]:inline-flex"
      >
        <Scale className="size-3 shrink-0" aria-hidden="true" />
        <span className="max-w-56 truncate">{label}</span>
      </button>
      {modalOpen && (
        <LicensesModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          licensesUrl={attribution?.licensesUrl}
          triggerRef={triggerRef}
        />
      )}
    </>
  );
}

export default memo(AttributionBadge);
