import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  HelpCircle,
  Check,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Edit3,
  Code2,
} from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { AttachmentGroup } from './Parts';
import { cn } from '~/utils';

export const GATED_TOOL_BASE_NAMES = new Set([
  'youtrack_create_issue',
  'youtrack_update_issue',
  'coding_task',
  'coding_night_shift',
  'code_change',
]);

export const WRITE_TOOL_NAME_PATTERN =
  /^(youtrack_create_issue|youtrack_update_issue|coding_task|coding_night_shift|code_change)$|(?:^|_)(create|update|delete|remove|write|modify|edit|patch|send|close|assign|comment)(?:_|$)/i;

export const ACTION_GATED_TOOLS = new Set([
  'agent_creator',
  'create_agent',
]);

const READ_ONLY_ACTIONS = new Set(['list', 'get', 'search', 'read', 'propose', 'recommend']);

export function getBaseToolName(rawName?: string): string {
  if (!rawName) return '';
  const idx = rawName.indexOf(Constants.mcp_delimiter);
  if (idx >= 0) {
    const prefix = rawName.slice(0, idx);
    const server = rawName.slice(idx + Constants.mcp_delimiter.length);
    if (server === 'youtrack' && (prefix === 'create_issue' || prefix === 'update_issue')) {
      return `youtrack_${prefix}`;
    }
    return prefix;
  }
  return rawName;
}

export function isGateToolCall(rawName?: string, rawArgs?: unknown): boolean {
  const base = getBaseToolName(rawName);
  if (
    !base ||
    base === 'ask_user' ||
    base === 'rueckfrage' ||
    base === 'file_creator' ||
    base === 'execute_code' ||
    base === 'read_file'
  ) {
    return false;
  }
  if (GATED_TOOL_BASE_NAMES.has(base)) {
    return true;
  }
  if (ACTION_GATED_TOOLS.has(base)) {
    const parsed = parseArgsObject(rawArgs as string | Record<string, unknown> | undefined);
    const action = typeof parsed.action === 'string' ? parsed.action.trim().toLowerCase() : '';
    if (!action) {
      if (typeof rawArgs === 'string') {
        const m = rawArgs.match(/"action"\s*:\s*"([^"]+)"/);
        if (m) {
          return !READ_ONLY_ACTIONS.has(m[1].toLowerCase());
        }
      }
      return false;
    }
    return !READ_ONLY_ACTIONS.has(action);
  }
  return WRITE_TOOL_NAME_PATTERN.test(base);
}

export function isInteractiveUserTool(rawName?: string, rawArgs?: unknown): boolean {
  const base = getBaseToolName(rawName);
  return base === 'ask_user' || base === 'rueckfrage' || isGateToolCall(rawName, rawArgs);
}

interface PersistedUserState {
  tool_call_id?: string;
  tool_name?: string;
  is_gate?: boolean;
  selected_option?: string;
  selected_options?: string[];
  selected_index?: number;
  custom_text?: string;
  is_custom?: boolean;
  final_answer?: string;
  approved?: boolean;
  timed_out?: boolean;
  timestamp?: number;
}

function parseOutputState(rawOutput?: string | null): {
  state: PersistedUserState | null;
  cleanOutput: string;
} {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return { state: null, cleanOutput: '' };
  }
  const match = rawOutput.match(/<!--\s*ASK_USER_STATE:(\{[\s\S]*?\})\s*-->/);
  if (!match) {
    return { state: null, cleanOutput: rawOutput.trim() };
  }
  let parsed: PersistedUserState | null = null;
  try {
    parsed = JSON.parse(match[1]) as PersistedUserState;
  } catch {
    parsed = null;
  }
  const cleanOutput = rawOutput.replace(match[0], '').trim();
  return { state: parsed, cleanOutput };
}

function parseArgsObject(rawArgs: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    return rawArgs as Record<string, unknown>;
  }
  if (typeof rawArgs === 'string') {
    const trimmed = rawArgs.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Partial / streaming JSON fallback: extract parameters if JSON is incomplete or has unescaped characters
      const extractField = (key: string): string | undefined => {
        const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
        const m = trimmed.match(regex);
        if (m) {
          return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t');
        }
        // Incomplete / streaming string fallback (e.g. key started but not terminated by quote)
        const partialRegex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`, 's');
        const pm = trimmed.match(partialRegex);
        if (pm && pm[1].trim()) {
          return pm[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t');
        }
        return undefined;
      };

      const extracted: Record<string, unknown> = {};
      for (const k of ['question', 'reason', 'summary', 'prompt', 'repo', 'branch', 'execution_strategy']) {
        const val = extractField(k);
        if (val !== undefined && val.trim()) {
          extracted[k] = val;
        }
      }
      return extracted;
    }
  }
  return {};
}

const GATE_LABELS: Record<
  string,
  {
    badge: string;
    title: string;
    approveOption: string;
    declineOption: string;
  }
> = {
  youtrack_create_issue: {
    badge: 'Freigabe erforderlich',
    title: 'YouTrack-Ticket erstellen',
    approveOption: 'Ja, Ticket jetzt erstellen',
    declineOption: 'Nein, nicht erstellen',
  },
  youtrack_update_issue: {
    badge: 'Freigabe erforderlich',
    title: 'YouTrack-Ticket ändern',
    approveOption: 'Ja, Änderung jetzt durchführen',
    declineOption: 'Nein, abbrechen',
  },
  coding_task: {
    badge: 'Freigabe erforderlich',
    title: 'Coding-Auftrag starten',
    approveOption: 'Ja, Coding-Auftrag jetzt umsetzen (Extra High)',
    declineOption: 'Nein, abbrechen',
  },
  coding_night_shift: {
    badge: 'Freigabe erforderlich',
    title: 'Ultracode-Nachtschicht einplanen (19:00–06:00 FIFO bei AI-Idle)',
    approveOption: 'Ja, für Nachtschicht (19:00–06:00 Uhr bei AI-Idle) in FIFO-Queue einplanen (Ultracode)',
    declineOption: 'Nein, abbrechen',
  },
  code_change: {
    badge: 'Freigabe erforderlich',
    title: 'Code-Änderung durchführen',
    approveOption: 'Ja, Code-Änderung jetzt umsetzen',
    declineOption: 'Nein, abbrechen',
  },
  agent_creator: {
    badge: 'Freigabe erforderlich',
    title: 'KI-Agent erstellen / ändern',
    approveOption: 'Ja, Agent-Aktion jetzt ausführen',
    declineOption: 'Nein, abbrechen',
  },
  create_agent: {
    badge: 'Freigabe erforderlich',
    title: 'KI-Agent erstellen / ändern',
    approveOption: 'Ja, Agent-Aktion jetzt ausführen',
    declineOption: 'Nein, abbrechen',
  },
};

const PARAM_LABELS: Record<string, string> = {
  project: 'Projekt',
  issue_id: 'Ticket-ID',
  summary: 'Titel / Summary',
  title: 'Titel',
  description: 'Beschreibung',
  state: 'Neuer Status',
  assignee: 'Bearbeiter',
  priority: 'Priorität',
  issue_type: 'Typ',
  comment: 'Kommentar',
  file: 'Datei',
  path: 'Pfad',
  diff: 'Änderungen',
  code: 'Code',
  repo: 'Repository',
  branch: 'Branch',
  execution_strategy: 'Ausführungsmodus',
  timeout: 'Timeout (Sekunden)',
  notify_email: 'Abschluss-Mail an',
  notify_mode: 'Mail-Modus',
};

const HIDDEN_PARAM_KEYS = new Set([
  'prompt',
  'reason',
  'question',
  'options',
  'context',
  'multi_select',
  '_gate_token',
  '_tool_call_id',
  'tool_call_id',
  'user_email',
]);

export interface AskUserCardProps {
  toolCallId?: string;
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
  isSubmitting: boolean;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
}

export default function AskUserCard({
  toolCallId = '',
  name,
  args: rawArgs,
  output,
  isSubmitting,
  attachments,
  hideAttachments = false,
}: AskUserCardProps) {
  const baseName = useMemo(() => getBaseToolName(name), [name]);
  const isGate = useMemo(() => isGateToolCall(name, rawArgs), [name, rawArgs]);
  const parsedArgs = useMemo(() => parseArgsObject(rawArgs), [rawArgs]);
  const { state: persistedState, cleanOutput } = useMemo(() => parseOutputState(output), [output]);
  const hasOutput = Boolean(output && output.length > 0);

  const gateMeta = isGate
    ? GATE_LABELS[baseName] ?? {
        badge: 'Freigabe erforderlich',
        title: `Aktion bestätigen: ${baseName}`,
        approveOption: 'Ja, jetzt ausführen',
        declineOption: 'Nein, abbrechen',
      }
    : null;

  const options = useMemo(() => {
    if (isGate && gateMeta) {
      if (baseName === 'coding_task' || baseName === 'coding_night_shift') {
        const strat = String(parsedArgs.execution_strategy || '').toLowerCase();
        const isNight = baseName === 'coding_night_shift' || strat.includes('overnight') || strat.includes('night') || strat.includes('ultracode');
        return isNight
          ? [
              'Ja, für Nachtschicht (19:00–06:00 Uhr bei AI-Idle) in FIFO-Queue einplanen (Ultracode)',
              'Jetzt sofort mit Extra High ausführen',
              'Nein, abbrechen',
            ]
          : [
              'Ja, Coding-Auftrag jetzt umsetzen (Extra High)',
              'Ja, für Nachtschicht (19:00–06:00 Uhr bei AI-Idle) in FIFO-Queue einplanen (Ultracode)',
              'Nein, abbrechen',
            ];
      }
      return [gateMeta.approveOption, gateMeta.declineOption];
    }
    const rawOpts = parsedArgs.options;
    let list: string[] = [];
    if (Array.isArray(rawOpts)) {
      list = rawOpts.map((item) => String(item).trim()).filter(Boolean);
    } else if (typeof rawOpts === 'string' && rawOpts.trim()) {
      list = rawOpts
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // Filter out any manual "Eigene Angabe" / "Other" option since we always provide a dedicated write-in field
    list = list.filter(
      (opt) =>
        !/^(eigene angabe|sonstiges|other|eigener text|freitext)\b/i.test(opt.trim()),
    );
    if (list.length === 0) {
      return ['Ja', 'Nein'];
    }
    return list;
  }, [isGate, gateMeta, parsedArgs.options]);

  const isMultiSelect = Boolean(!isGate && parsedArgs.multi_select);

  // Preselect the topmost option (Index 0) by default!
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([0]);
  const [isCustomSelected, setIsCustomSelected] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');
  const [localPhase, setLocalPhase] = useState<'idle' | 'sending' | 'waiting_execution' | 'done'>(
    hasOutput ? 'done' : 'idle',
  );
  const [optimisticAnswer, setOptimisticAnswer] = useState<string>('');
  const [optimisticApproved, setOptimisticApproved] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (hasOutput) {
      setLocalPhase('done');
    }
  }, [hasOutput]);

  const questionText = useMemo(() => {
    if (isGate) {
      const reason =
        typeof parsedArgs.reason === 'string' && parsedArgs.reason.trim()
          ? parsedArgs.reason.trim()
          : '';
      if (reason) return reason;
      if (typeof parsedArgs.prompt === 'string' && parsedArgs.prompt.trim()) {
        const firstLine = parsedArgs.prompt.trim().split(/\r?\n/)[0].replace(/^[#\s*-]+/, '').trim();
        if (firstLine) {
          return `Soll folgender Coding-Auftrag ausgeführt werden: "${firstLine.slice(0, 140)}"?`;
        }
      }
      if (baseName === 'youtrack_create_issue') {
        return 'Der Agent möchte folgendes YouTrack-Ticket erstellen. Möchtest du diese Aktion freigeben?';
      }
      if (baseName === 'youtrack_update_issue') {
        return 'Der Agent möchte folgende Änderungen an einem YouTrack-Ticket vornehmen. Möchtest du diese Aktion freigeben?';
      }
      return `Der Agent möchte die Aktion "${gateMeta?.title ?? baseName}" ausführen. Darf diese jetzt umgesetzt werden?`;
    }
    if (typeof parsedArgs.question === 'string' && parsedArgs.question.trim()) {
      return parsedArgs.question.trim();
    }
    if (typeof parsedArgs.prompt === 'string' && parsedArgs.prompt.trim()) {
      return parsedArgs.prompt.trim();
    }
    return 'Bitte wähle eine Antwortmöglichkeit:';
  }, [isGate, parsedArgs.reason, parsedArgs.question, parsedArgs.prompt, baseName, gateMeta]);

  const contextText = useMemo(() => {
    if (typeof parsedArgs.context === 'string' && parsedArgs.context.trim()) {
      return parsedArgs.context.trim();
    }
    return '';
  }, [parsedArgs.context]);

  const previewEntries = useMemo(() => {
    if (!isGate) return [];
    const entries: Array<{ key: string; label: string; value: string }> = [];
    for (const [k, v] of Object.entries(parsedArgs)) {
      if (HIDDEN_PARAM_KEYS.has(k) || v === undefined || v === null || v === '') continue;
      const valStr = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
      if (!valStr.trim()) continue;
      entries.push({
        key: k,
        label: PARAM_LABELS[k] || k,
        value: valStr,
      });
    }
    return entries;
  }, [isGate, parsedArgs]);

  const isLocked = localPhase !== 'idle' || hasOutput;

  const handleSelectOption = useCallback(
    (idx: number) => {
      if (isLocked) return;
      setErrorMsg(null);
      if (isMultiSelect) {
        setSelectedMulti((prev) =>
          prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
        );
      } else {
        setIsCustomSelected(false);
        setSelectedIndex(idx);
      }
    },
    [isLocked, isMultiSelect],
  );

  const handleSelectCustom = useCallback(() => {
    if (isLocked) return;
    setErrorMsg(null);
    setIsCustomSelected(true);
    setTimeout(() => {
      customInputRef.current?.focus();
    }, 10);
  }, [isLocked]);

  const handleSubmit = useCallback(async () => {
    if (isLocked) return;
    const trimmedCustom = customText.trim();

    if (isCustomSelected && !trimmedCustom) {
      setErrorMsg('Bitte gib eine eigene Antwort in das Textfeld ein.');
      customInputRef.current?.focus();
      return;
    }

    const chosenOption = isCustomSelected
      ? trimmedCustom
      : options[selectedIndex] ?? options[0] ?? 'Ja';

    const chosenMulti = isMultiSelect
      ? selectedMulti.map((i) => options[i]).filter(Boolean)
      : undefined;

    const approved = isGate ? !isCustomSelected && selectedIndex === 0 : true;

    // Instant Optimistic UI Feedback (Workspace Rule: Instant Local Reactivity)
    setErrorMsg(null);
    setOptimisticAnswer(
      isCustomSelected
        ? `Eigene Angabe: ${trimmedCustom}`
        : isMultiSelect && chosenMulti && chosenMulti.length > 0
          ? chosenMulti.join(', ') + (trimmedCustom ? ` (${trimmedCustom})` : '')
          : chosenOption,
    );
    setOptimisticApproved(approved);
    setLocalPhase('sending');

    const payload = {
      tool_call_id: toolCallId,
      tool_name: name,
      selected_option: chosenOption,
      selected_options: chosenMulti,
      selected_index: isCustomSelected ? -1 : selectedIndex,
      custom_text: trimmedCustom,
      is_custom: isCustomSelected,
      approved,
    };

    try {
      let res = await fetch('/api/user-input/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        res = await fetch('/api/config/user-input/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        throw new Error(`Server antwortete mit Status ${res.status}`);
      }

      setLocalPhase('waiting_execution');
    } catch (err) {
      setLocalPhase('idle');
      setErrorMsg(
        err instanceof Error
          ? `Übermittlung fehlgeschlagen: ${err.message}`
          : 'Übermittlung fehlgeschlagen.',
      );
    }
  }, [
    isLocked,
    customText,
    isCustomSelected,
    options,
    selectedIndex,
    isMultiSelect,
    selectedMulti,
    isGate,
    toolCallId,
    name,
  ]);

  const effectiveFinalAnswer =
    persistedState?.final_answer ||
    persistedState?.selected_option ||
    optimisticAnswer ||
    (hasOutput ? cleanOutput : '');

  const effectiveApproved =
    persistedState?.approved !== undefined ? persistedState.approved : optimisticApproved;

  return (
    <div
      className={cn(
        'my-3 w-full max-w-2xl overflow-hidden rounded-xl border transition-all duration-200',
        isGate
          ? 'border-amber-500/40 bg-surface-secondary shadow-sm'
          : 'border-border-medium bg-surface-secondary shadow-sm',
      )}
      data-testid="ask-user-card"
    >
      {/* Header Bar */}
      <div
        className={cn(
          'flex items-center justify-between border-b px-4 py-2.5',
          isGate
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-border-light bg-surface-tertiary/60',
        )}
      >
        <div className="flex items-center gap-2">
          {isGate ? (
            <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
          ) : (
            <HelpCircle className="size-4 shrink-0 text-text-primary" aria-hidden="true" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {isGate ? gateMeta?.badge ?? 'Freigabe erforderlich' : 'Rückfrage vom Agenten'}
          </span>
          {isGate && gateMeta?.title && (
            <span className="rounded-md bg-surface-primary/80 px-2 py-0.5 text-xs font-medium text-text-primary">
              {gateMeta.title}
            </span>
          )}
        </div>

        {/* Live Status Badge */}
        {localPhase === 'sending' && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
            <Loader2 className="size-3.5 animate-spin" />
            Wird übermittelt…
          </span>
        )}
        {localPhase === 'waiting_execution' && !hasOutput && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <Loader2 className="size-3.5 animate-spin" />
            {isGate && optimisticApproved
              ? 'Freigabe erteilt – wird ausgeführt…'
              : 'Antwort übermittelt – Modell arbeitet…'}
          </span>
        )}
        {hasOutput && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              isGate && !effectiveApproved ? 'text-amber-500' : 'text-emerald-500',
            )}
          >
            {isGate && !effectiveApproved ? (
              <>
                <XCircle className="size-3.5" />
                Abgelehnt / Geändert
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                {isGate ? 'Freigegeben' : 'Beantwortet'}
              </>
            )}
          </span>
        )}
      </div>

      {/* Body Content */}
      <div className="space-y-3 p-4">
        {/* Question or Gate Reason */}
        <div className="text-sm font-medium leading-relaxed text-text-primary">{questionText}</div>

        {contextText && (
          <div className="rounded-lg bg-surface-tertiary/50 px-3 py-2 text-xs leading-relaxed text-text-secondary">
            {contextText}
          </div>
        )}

        {/* Dedicated Coding Prompt Preview */}
        {isGate && typeof parsedArgs.prompt === 'string' && parsedArgs.prompt.trim() && (
          <div className="overflow-hidden rounded-lg border border-border-light bg-surface-primary/70">
            <div className="flex items-center justify-between border-b border-border-light bg-surface-tertiary/40 px-3 py-1.5 text-xs font-semibold text-text-secondary">
              <span className="flex items-center gap-1.5">
                <Code2 className="size-3.5 text-text-secondary" />
                Geplanter Coding-Prompt / Aufgabenstellung
              </span>
              <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-normal text-text-secondary">
                {parsedArgs.prompt.trim().length} Zeichen
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto p-3 font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap select-text">
              {parsedArgs.prompt.trim()}
            </div>
          </div>
        )}

        {/* Gate Planned Parameters Preview */}
        {isGate && previewEntries.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border-light bg-surface-primary/70">
            <div className="border-b border-border-light bg-surface-tertiary/40 px-3 py-1.5 text-xs font-semibold text-text-secondary">
              Geplante Parameter & Details
            </div>
            <div className="divide-y divide-border-light text-xs">
              {previewEntries.map((item) => (
                <div key={item.key} className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-4">
                  <span className="font-medium text-text-secondary">{item.label}:</span>
                  <span className="whitespace-pre-wrap break-words font-mono text-text-primary sm:col-span-3">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Options Selection List */}
        <div className="space-y-2 pt-1" role="radiogroup" aria-label={questionText}>
          {options.map((optionLabel, idx) => {
            const isChecked = hasOutput
              ? !persistedState?.is_custom &&
                (persistedState?.selected_index === idx ||
                  persistedState?.selected_option === optionLabel)
              : isMultiSelect
                ? selectedMulti.includes(idx)
                : !isCustomSelected && selectedIndex === idx;

            return (
              <button
                key={`${idx}-${optionLabel}`}
                type="button"
                disabled={isLocked}
                onClick={() => handleSelectOption(idx)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-all',
                  isChecked
                    ? 'border-emerald-500/70 bg-emerald-500/10 font-medium text-text-primary'
                    : 'border-border-light bg-surface-primary/60 text-text-secondary hover:border-border-medium hover:bg-surface-hover hover:text-text-primary',
                  isLocked && 'cursor-default opacity-85',
                )}
              >
                <div
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                    isChecked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border-heavy bg-transparent',
                  )}
                >
                  {isChecked && <Check className="size-2.5 stroke-[3]" />}
                </div>
                <span className="flex-1 break-words">{optionLabel}</span>
                {idx === 0 && !hasOutput && (
                  <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-normal text-text-secondary">
                    Vorausgewählt
                  </span>
                )}
              </button>
            );
          })}

          {/* Always-present "Eigene Angabe" (Write-In) Option */}
          <div
            onClick={() => {
              if (!isLocked) handleSelectCustom();
            }}
            className={cn(
              'flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 transition-all',
              (hasOutput ? Boolean(persistedState?.is_custom) : isCustomSelected)
                ? 'border-emerald-500/70 bg-emerald-500/10 text-text-primary'
                : 'border-border-light bg-surface-primary/60 text-text-secondary hover:border-border-medium',
              isLocked && ' opacity-85',
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  (hasOutput ? Boolean(persistedState?.is_custom) : isCustomSelected)
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-border-heavy bg-transparent',
                )}
              >
                {(hasOutput ? Boolean(persistedState?.is_custom) : isCustomSelected) && (
                  <Check className="size-2.5 stroke-[3]" />
                )}
              </div>
              <Edit3 className="size-3.5 shrink-0 text-text-secondary" />
              <span className="text-sm font-medium">
                {isGate
                  ? 'Eigene Angabe / Änderungswunsch vor Ausführung:'
                  : 'Eigene Angabe:'}
              </span>
            </div>

            {!isLocked ? (
              <div className="pl-7">
                <input
                  ref={customInputRef}
                  type="text"
                  value={customText}
                  onFocus={() => setIsCustomSelected(true)}
                  onChange={(e) => {
                    setErrorMsg(null);
                    setIsCustomSelected(true);
                    setCustomText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={
                    isGate
                      ? 'z. B. "Nein, bitte zuerst den Titel anpassen auf..."'
                      : 'Eigene Antwort hier eintippen…'
                  }
                  className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            ) : (
              (persistedState?.custom_text || (isCustomSelected && customText)) && (
                <div className="pl-7 text-xs italic text-text-primary">
                  „{persistedState?.custom_text || customText}“
                </div>
              )
            )}
          </div>
        </div>

        {/* Validation Error */}
        {errorMsg && <div className="text-xs font-medium text-red-500">{errorMsg}</div>}

        {/* Action Button or Answered Summary */}
        {!isLocked ? (
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <Send className="size-3.5" />
              <span>
                {isGate
                  ? isCustomSelected
                    ? 'Änderungswunsch senden'
                    : selectedIndex === 0
                      ? 'Freigeben & Ausführen'
                      : 'Ablehnen'
                  : 'Antwort absenden'}
              </span>
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border-light bg-surface-primary/80 px-3 py-2 text-xs text-text-secondary">
            <div className="flex items-center gap-1.5 font-medium text-text-primary">
              <span>Gewählte Antwort:</span>
              <span className="text-emerald-500">{effectiveFinalAnswer || 'Übermittelt'}</span>
            </div>
            {hasOutput && cleanOutput && (
              <div className="mt-1.5 whitespace-pre-wrap border-t border-border-light pt-1.5 font-mono text-[11px] text-text-secondary">
                {cleanOutput}
              </div>
            )}
          </div>
        )}
      </div>

      {!hideAttachments && attachments && attachments.length > 0 && (
        <div className="px-4 pb-3">
          <AttachmentGroup attachments={attachments} />
        </div>
      )}
    </div>
  );
}
