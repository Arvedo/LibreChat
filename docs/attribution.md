# Model and open-source attribution

Deployments serving open-weight models or distributing bundled third-party components can surface an attribution pill in the chat view and a searchable license catalog in **Settings → About** through `interface.attribution` in `librechat.yaml`. Both surfaces open the same license dialog (`LicensesModal`), which reads a JSON catalog (`/licenses.json` by default) on demand.

The feature defaults to disabled (`enabled: false`). When omitted or disabled, neither the chat pill nor the **Settings → About** license section is rendered, and no request to `/licenses.json` is made.

## Configuration

```yaml
interface:
  attribution:
    enabled: true
    anchor: 'Model'
    partners:
      - 'LibreChat'
      - 'vLLM'
    includeOthers: true
    includeStandalone: true
    licensesUrl: '/licenses.json'
```

| Field | Type | Default | Constraints | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `false` | Optional | Enables the attribution pill in the chat container and the **Open-Source Licenses** row under **Settings → About**. |
| `anchor` | `string` | `undefined` | Trimmed, `1..80` characters | Primary model or project name anchored in the chat pill (`Powered by <anchor>`). When omitted or blank, the chat pill does not render while the **Settings → About** entry remains available. |
| `partners` | `string[]` | `[]` | Up to `32` items; each trimmed, `1..80` characters | Partner projects or libraries rotated alongside `anchor` (`Powered by <anchor> and <partner>`). Blank strings are ignored. |
| `includeOthers` | `boolean` | `true` | Optional | Includes `Powered by <anchor> and others` (`com_ui_attribution_powered_by_others`) in the session rotation pool. |
| `includeStandalone` | `boolean` | `true` | Optional | Includes `Powered by <anchor>` (`com_ui_attribution_powered_by`) in the session rotation pool. Also serves as the fallback when no other candidate is eligible. |
| `licensesUrl` | `string` | `'/licenses.json'` | Root-relative path (`/…`, excluding `//…`) or `http(s)://` URL | Endpoint or static asset path from which `LicensesModal` fetches the JSON license catalog when opened. |

`attributionSchema` in `packages/data-provider/src/config.ts` validates these fields at startup, and `loadDefaultInterface` in `packages/data-schemas/src/app/interface.ts` forwards `interface.attribution` into `startupConfig.interface.attribution`.

## UI surfaces and layout behavior

### Chat attribution pill (`AttributionBadge`)

`ChatView` renders `<AttributionBadge maximizeChatSpace={maximizeChatSpace} />` inside `TraceSurface`'s `@container` wrapper and passes the `maximizeChatSpace` preference as a prop:

- **Visibility gates**: The pill renders only when `attribution.enabled === true`, `attribution.anchor` is a non-empty string after trimming, `maximizeChatSpace` is `false`, and the `@container` chat pane is at least `82rem` wide (`hidden @min-[82rem]:inline-flex`). This container-query threshold ensures the bottom-inline-end pill (`absolute inset-e-3 bottom-2 z-20`) never collides with the centered composer or disclaimer footer on narrow viewports or split panels.
- **Session candidate selection**: On mount, `AttributionBadge` draws a single random seed (`useState(() => Math.random())`) and selects deterministically from the candidate pool (`partners` entries, `others` when `includeOthers !== false`, and `standalone` when `includeStandalone !== false` or the pool would otherwise be empty). Keeping the seed in component state prevents the badge text from flickering across conversation switches or streaming updates during the browser session.
- **Accessibility**: Clicking the pill opens `LicensesModal` and passes its button `triggerRef` to `OGDialog` so keyboard focus returns to the pill when the modal closes.

### Settings → About (`About.tsx` and `Settings/context.tsx`)

Because the chat pill hides on viewports narrower than `82rem`, when `maximizeChatSpace` is enabled, or when `anchor` is omitted, **Settings → About** provides a persistent, viewport-independent entry point:

- **Tab visibility (`useSettingsContext`)**: `aboutEnabled` evaluates to `startupConfig?.interface?.buildInfo !== false || startupConfig?.interface?.attribution?.enabled === true`. Operators who hide git/build metadata (`interface.buildInfo: false`) while enabling `interface.attribution` still retain the **About** tab in Settings for license disclosure.
- **Section layout (`About.tsx`)**: When both `buildInfo` and `attribution.enabled` are active, the **Open-Source Licenses** row renders below the version/diagnostics block with a top border separator (`border-border-light mt-4 border-t pt-4`). When `buildInfo: false`, the licenses row renders standalone at the top of the tab.

## License catalog format (`/licenses.json`)

When the user opens `LicensesModal`, React Query fetches `licensesUrl` under query key `[QueryKeys.openSourceLicenses, resolvedUrl]` (`enabled: open`, `staleTime: 5 * 60 * 1000`, `retry: false`) with `Accept: application/json`.

```json
{
  "generatedAt": "2026-10-24",
  "entries": [
    {
      "id": "primary-model",
      "name": "Example Open-Weights Model",
      "version": "3.8",
      "license": "Apache-2.0",
      "category": "AI Models",
      "url": "https://example.org/model/LICENSE",
      "copyright": "Copyright (c) 2026 Example Contributors",
      "notice": "Primary language model powering this deployment.",
      "licenseText": "Apache License\nVersion 2.0, January 2004...",
      "prominent": true
    },
    {
      "id": "librechat",
      "name": "LibreChat",
      "version": "0.8.8",
      "license": "MIT",
      "category": "Core Platform",
      "url": "https://github.com/danny-avila/LibreChat",
      "copyright": "Copyright (c) 2023 Danny Avila and contributors",
      "notice": "Open-source conversational AI platform.",
      "licenseText": "MIT License\n\nPermission is hereby granted...",
      "prominent": true
    }
  ]
}
```

### Entry fields (`LicenseEntry`)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Optional | Stable React key identifier for the card; falls back to `${name}-${index}`. |
| `name` | `string` | **Required** | Non-empty component, model, or library name. Entries with a missing or whitespace-only `name` are dropped. |
| `license` | `string` | **Required** | Non-empty SPDX identifier or license name (e.g., `MIT`, `Apache-2.0`). Entries with a missing or whitespace-only `license` are dropped. |
| `version` | `string` | Optional | Version badge rendered in monospace beside `name`. |
| `category` | `string` | Optional | Category label used to populate the filter bar at the top of the modal (e.g., `AI Models`, `Core Platform`, `Backend`). |
| `url` | `string` | Optional | External project or license URL. Rendered as an external link (`target="_blank" rel="noopener noreferrer"`) only when it begins with `http://` or `https://`. |
| `copyright` | `string` | Optional | Copyright line displayed beneath the card header. |
| `notice` | `string` | Optional | Attribution summary or usage notice displayed on the card and included in search matching. |
| `licenseText` | `string` | Optional | Full verbatim license text. When present, renders a one-click clipboard copy button and an expandable **License text** `<pre>` block. |
| `prominent` | `boolean` | Optional | When `true`, sorts the entry ahead of non-prominent entries while preserving relative catalog order. |

### Validation and security invariants

1. **`licensesUrl` sanitization (`resolveSafeLicensesUrl`)**: Both `attributionSchema` at config load and `resolveSafeLicensesUrl` in the client require `licensesUrl` to be either a root-relative path starting with `/` (and not protocol-relative `//`) or an `http(s)://` URL. Any other value falls back to `/licenses.json`.
2. **HTML fallback rejection**: Single-page application servers often return `200 OK` with `index.html` (`text/html`) when a static file such as `/licenses.json` is absent. `LicensesModal` inspects the response `Content-Type` header and rejects responses that declare a non-JSON content type, rendering the localized empty state (`com_ui_open_source_licenses_empty`) instead of throwing a syntax error or rendering invalid data.
3. **Entry validation (`isValidLicenseEntry`)**: Malformed array items (`null`, primitives, or objects missing a non-empty string `name` or `license`) are filtered out before sorting or rendering.
4. **External link guard (`isSafeExternalUrl`)**: Entry `url` values are checked against `/^https?:\/\//i` before rendering an `<a>` element, preventing `javascript:`, `data:`, or `vbscript:` URIs in a catalog file from producing executable links.
