const fs = require('fs');
const path = require('path');
const { loadYaml, redactConfigSecretMaps, createCustomConfigLoader } = require('@librechat/api');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultConfigPath = path.resolve(projectRoot, 'librechat.yaml');

/**
 * Optional modular extension manifest loader.
 * When an extensions directory containing `registry.json` is mounted (default `<projectRoot>/extensions`
 * or `LIBRECHAT_EXTENSIONS_DIR`), merges enabled `extensions/<id>/extension.json` manifests (`mcp_servers`)
 * and optional model/spec overrides from `registry.json` into the raw configuration before schema validation.
 * No-op when `registry.json` is not present.
 *
 * @param {unknown} rawConfig
 * @returns {unknown}
 */
function applyExtensionManifests(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || rawConfig instanceof Error) {
    return rawConfig;
  }

  const extDir = process.env.LIBRECHAT_EXTENSIONS_DIR || path.resolve(projectRoot, 'extensions');
  const regPath = path.join(extDir, 'registry.json');
  if (!fs.existsSync(regPath)) {
    return rawConfig;
  }

  try {
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    if (!reg || typeof reg !== 'object') {
      return rawConfig;
    }

    const installed = [];
    const entries = fs
      .readdirSync(extDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) {
        continue;
      }
      const manifestPath = path.join(extDir, entry.name, 'extension.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (manifest && typeof manifest === 'object') {
            manifest.id = manifest.id || entry.name;
            installed.push(manifest);
          }
        } catch (_) {
          // Ignore malformed extension manifest
        }
      }
    }

    let active = [];
    const maxExt = Number(reg.max_extensions ?? -1);
    if (maxExt !== 0 && installed.length > 0 && Array.isArray(reg.active_extensions)) {
      const norm = reg.active_extensions.map((x) => String(x).trim()).filter(Boolean);
      const lower = norm.map((x) => x.toLowerCase());
      if (norm.length === 0 || lower.includes('none')) {
        active = [];
      } else if (lower.includes('*') || lower.includes('all') || lower.includes('auto')) {
        active = maxExt < 0 ? installed : installed.slice(0, maxExt);
      } else {
        const aliases = {
          document_processor: ['document_processor', 'dateien'],
          dateien: ['dateien', 'document_processor'],
        };
        const matched = [];
        for (const id of norm) {
          const candidates = aliases[id] || [id];
          for (const ext of installed) {
            if (candidates.includes(ext.id) && !matched.includes(ext)) {
              matched.push(ext);
            }
          }
        }
        active = maxExt < 0 ? matched : matched.slice(0, maxExt);
      }
    }

    const mcpServers = {};
    const sidebarLinks = [];
    for (const ext of active) {
      if (Array.isArray(ext.sidebar_links)) {
        for (const link of ext.sidebar_links) {
          if (link && typeof link === 'object' && link.href && link.label) {
            sidebarLinks.push({ ...link });
          }
        }
      }
      if (ext.mcp_servers && typeof ext.mcp_servers === 'object') {
        for (const [serverKey, serverCfg] of Object.entries(ext.mcp_servers)) {
          if (serverCfg && typeof serverCfg === 'object') {
            const copy = { ...serverCfg };
            if (typeof copy.title === 'string') {
              const sanitized = copy.title
                .replace(/&/g, 'and')
                .replace(/[^a-zA-Z0-9\s'-]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              copy.title =
                sanitized ||
                serverKey.replace(/[^a-zA-Z0-9\s'-]/g, ' ').trim() ||
                'MCP Server';
            }
            mcpServers[serverKey] = copy;
          }
        }
      }
    }

    const cfg = /** @type {Record<string, any>} */ (rawConfig);
    const modelName = typeof reg.model_name === 'string' ? reg.model_name.trim() : '';
    const modelLabel =
      typeof reg.model_label === 'string' && reg.model_label.trim()
        ? reg.model_label.trim()
        : modelName;
    const mainAgentId = typeof reg.main_agent_id === 'string' ? reg.main_agent_id.trim() : '';
    const parsedContextLength = Number(reg.context_length);
    const defaultContextLength =
      Number.isFinite(parsedContextLength) && parsedContextLength > 0
        ? parsedContextLength
        : 262144;

    if (modelName) {
      if (cfg.summarization && typeof cfg.summarization === 'object') {
        cfg.summarization.model = modelName;
      }
      if (cfg.endpoints && typeof cfg.endpoints === 'object') {
        if (cfg.endpoints.all) {
          cfg.endpoints.all.titleModel = modelName;
        }
        if (cfg.endpoints.agents) {
          cfg.endpoints.agents.titleModel = modelName;
        }
        if (Array.isArray(cfg.endpoints.custom)) {
          for (const ep of cfg.endpoints.custom) {
            if (ep && ep.allowFunctionCalling !== false) {
              if (Array.isArray(ep.models?.default) && ep.models.default.length > 0) {
                if (!ep.models.default.includes(modelName)) {
                  ep.models.default.unshift(modelName);
                }
              }
              ep.titleModel = modelName;
              if (ep.tokenConfig && typeof ep.tokenConfig === 'object') {
                ep.tokenConfig[modelName] = ep.tokenConfig[modelName] || {
                  context: defaultContextLength,
                };
              }
            }
          }
        }
      }
      if (cfg.memory?.agent) {
        cfg.memory.agent.model = modelName;
      }
      if (cfg.modelSpecs && Array.isArray(cfg.modelSpecs.list) && cfg.modelSpecs.list.length > 0) {
        const existingIndex = cfg.modelSpecs.list.findIndex(
          (s) => s && typeof s.name === 'string' && s.name.toLowerCase() === modelName.toLowerCase(),
        );
        if (existingIndex >= 0) {
          const spec = cfg.modelSpecs.list[existingIndex];
          spec.label = modelLabel;
          if (reg.main_agent_description) {
            spec.description = reg.main_agent_description;
          }
          spec.default = true;
          if (cfg.modelSpecs.list[0]?.subagents && !spec.subagents) {
            spec.subagents = { ...cfg.modelSpecs.list[0].subagents };
          }
          spec.preset = {
            ...(spec.preset || {}),
            ...(mainAgentId ? { agent_id: mainAgentId } : {}),
            model: modelName,
          };
          for (let i = 0; i < cfg.modelSpecs.list.length; i++) {
            if (i !== existingIndex) {
              cfg.modelSpecs.list[i].default = false;
            }
          }
        } else {
          for (const spec of cfg.modelSpecs.list) {
            spec.default = false;
          }
          const baseSpec = cfg.modelSpecs.list[0] || {};
          const basePreset = baseSpec.preset || {};
          const tierSpec = {
            name: modelName.toLowerCase(),
            label: modelLabel,
            ...(reg.main_agent_description ? { description: reg.main_agent_description } : {}),
            default: true,
            ...(baseSpec.subagents ? { subagents: { ...baseSpec.subagents } } : {}),
            preset: {
              ...basePreset,
              ...(mainAgentId ? { agent_id: mainAgentId } : {}),
              model: modelName,
            },
          };
          cfg.modelSpecs.list.unshift(tierSpec);
        }
      }
    }
    if (Object.keys(mcpServers).length > 0) {
      cfg.mcpServers = { ...(cfg.mcpServers || {}), ...mcpServers };
    }
    if (sidebarLinks.length > 0) {
      cfg.interface = { ...(cfg.interface || {}) };
      const existing = Array.isArray(cfg.interface.sidebarLinks)
        ? [...cfg.interface.sidebarLinks]
        : [];
      for (const link of sidebarLinks) {
        if (!existing.some((e) => (link.id && e.id === link.id) || e.href === link.href)) {
          existing.push(link);
        }
      }
      cfg.interface.sidebarLinks = existing;
    }
  } catch (_) {
    // Fallback to unmodified rawConfig if extension manifest parsing fails
  }

  return rawConfig;
}

const loadCustomConfig = createCustomConfigLoader({
  loadLocal: (configPath) => applyExtensionManifests(loadYaml(configPath)),
  defaultConfigPath,
  redactConfig: redactConfigSecretMaps,
});
loadCustomConfig.applyExtensionManifests = applyExtensionManifests;

module.exports = loadCustomConfig;
