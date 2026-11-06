import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Scale } from 'lucide-react';
import { useGetStartupConfig } from '~/data-provider';
import LicensesModal from './LicensesModal';
import { useLocalize } from '~/hooks';

/**
 * Candidate variants that can be selected for the attribution pill:
 * - `partner`: "Powered by <anchorText> and <partner>"
 * - `others`: "Powered by <anchorText> and others"
 * - `standalone`: "Powered by <anchorText>"
 */
type AttributionCandidate =
  | { kind: 'partner'; anchorText: string; partner: string }
  | { kind: 'others'; anchorText: string }
  | { kind: 'standalone'; anchorText: string };

const ROTATION_INTERVAL_MS = 5000;

/**
 * Renders an optional prominent attribution pill at the bottom-center of the authentication
 * layout when `interface.attribution.enabled` is true and `anchor` is set.
 *
 * When two or more `partners` are configured, candidates combine `anchor` with at least two
 * partners so at least three project/model names are shown at once and rotated across views.
 *
 * Clicking the pill opens `LicensesModal` and restores keyboard focus via `triggerRef` on close.
 * See `docs/attribution.md` for configuration and catalog details.
 */
export function AttributionBadge() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [modalOpen, setModalOpen] = useState(false);
  const [seed] = useState(() => Math.random());
  const [step, setStep] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const attribution = startupConfig?.interface?.attribution;
  const enabled = attribution?.enabled === true;
  const anchor = typeof attribution?.anchor === 'string' ? attribution.anchor.trim() : '';

  /** Builds the eligible rotation pool from `partners`, `includeOthers`, and `includeStandalone`. */
  const candidates = useMemo<AttributionCandidate[]>(() => {
    const pool: AttributionCandidate[] = [];
    const rawPartners = Array.isArray(attribution?.partners) ? attribution.partners : [];
    const partners = rawPartners
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0);

    if (partners.length >= 2) {
      for (let i = 0; i < partners.length; i += 1) {
        for (let j = i + 1; j < partners.length; j += 1) {
          pool.push({
            kind: 'partner',
            anchorText: `${anchor}, ${partners[i]}`,
            partner: partners[j],
          });
          if (attribution?.includeOthers !== false) {
            pool.push({
              kind: 'others',
              anchorText: `${anchor}, ${partners[i]}, ${partners[j]}`,
            });
          }
        }
      }
      if (partners.length >= 3) {
        pool.push({
          kind: 'partner',
          anchorText: `${anchor}, ${partners.slice(0, -1).join(', ')}`,
          partner: partners[partners.length - 1],
        });
      }
    } else if (partners.length === 1) {
      pool.push({ kind: 'partner', anchorText: anchor, partner: partners[0] });
      if (attribution?.includeOthers !== false) {
        pool.push({ kind: 'others', anchorText: anchor });
      }
      if (attribution?.includeStandalone !== false) {
        pool.push({ kind: 'standalone', anchorText: anchor });
      }
    } else {
      if (attribution?.includeOthers !== false) {
        pool.push({ kind: 'others', anchorText: anchor });
      }
      if (attribution?.includeStandalone !== false || pool.length === 0) {
        pool.push({ kind: 'standalone', anchorText: anchor });
      }
    }

    if (pool.length === 0) {
      pool.push({ kind: 'standalone', anchorText: anchor });
    }
    return pool;
  }, [anchor, attribution?.includeOthers, attribution?.includeStandalone, attribution?.partners]);

  useEffect(() => {
    if (!enabled || !anchor || candidates.length <= 1 || modalOpen) {
      return undefined;
    }
    const timer = setInterval(() => {
      setStep((prev) => prev + 1);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [anchor, candidates.length, enabled, modalOpen]);

  if (!enabled || !anchor) {
    return null;
  }

  const baseIndex = Math.floor(seed * candidates.length) % candidates.length;
  const selected =
    candidates[(baseIndex + step) % candidates.length] ?? {
      kind: 'standalone',
      anchorText: anchor,
    };

  let label: string;
  if (selected.kind === 'partner') {
    label = localize('com_ui_attribution_powered_by_partner', {
      anchor: selected.anchorText,
      partner: selected.partner,
    });
  } else if (selected.kind === 'others') {
    label = localize('com_ui_attribution_powered_by_others', { anchor: selected.anchorText });
  } else {
    label = localize('com_ui_attribution_powered_by', { anchor: selected.anchorText });
  }

  return (
    <>
      <div className="my-3 flex justify-center px-4">
        <button
          ref={triggerRef}
          type="button"
          data-testid="attribution-badge"
          onClick={() => setModalOpen(true)}
          aria-label={`${label} — ${localize('com_ui_open_source_licenses_view')}`}
          className="border-border-light bg-surface-secondary/70 text-text-secondary hover:bg-surface-secondary hover:text-text-primary inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-xs backdrop-blur-xs transition-colors"
        >
          <Scale className="size-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </button>
      </div>
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
