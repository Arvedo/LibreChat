const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class ToolCatalogTool extends Tool {
  name = 'tool_catalog';
  description =
    'Schlägt verfügbare Tools und deren detaillierte Bedienungsanleitung im zentralen Tool-Katalog nach. ' +
    'Nutze action="list" für eine Übersicht aller verfügbaren Tools oder action="details" mit tool_id="<name>", ' +
    'um die genaue Dokumentation, Parameter und Beispiele eines bestimmten Tools abzurufen.';

  schema = z.object({
    action: z
      .enum(['list', 'details'])
      .optional()
      .default('list')
      .describe(
        '"list" zeigt alle verfügbaren Tools mit Kurzbeschreibung; "details" lädt die vollständige Anleitung für ein bestimmtes Tool (erfordert tool_id).',
      ),
    tool_id: z
      .string()
      .optional()
      .describe(
        'Die ID des Tools, für das Details abgerufen werden sollen (z.B. "file_creator", "searxng_search", "read_file", "agent_creator").',
      ),
  });

  constructor(fields = {}) {
    super(fields);
    if (fields.name) {
      this.name = fields.name;
    }
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
  }

  async _call(input) {
    try {
      const action = input?.action || (input?.tool_id ? 'details' : 'list');
      const toolId = input?.tool_id?.trim();

      if (action === 'details' && toolId) {
        const response = await axios.get(
          `${this.baseUrl}/api/tool-catalog/${encodeURIComponent(toolId)}`,
          { timeout: 10000 },
        );
        const tool = response.data;
        let out = `### Tool-Details: ${tool.name} (\`${tool.id}\`)\n`;
        out += `- **Kategorie:** ${tool.category}\n`;
        out += `- **Kurzbeschreibung:** ${tool.short_description}\n`;
        if (tool.when_to_use) {
          out += `- **Wann verwenden:** ${tool.when_to_use}\n`;
        }
        if (tool.parameters_summary) {
          out += `- **Parameter:** ${tool.parameters_summary}\n`;
        }
        if (tool.detailed_instructions) {
          out += `\n**Detaillierte Anleitung:**\n${tool.detailed_instructions}\n`;
        }
        if (tool.examples && tool.examples.length > 0) {
          out += `\n**Beispiele:**\n${tool.examples.map((e) => `- \`${e}\``).join('\n')}\n`;
        }
        return out;
      }

      const response = await axios.get(`${this.baseUrl}/api/tool-catalog/`, { timeout: 10000 });
      const tools = response.data?.tools || [];
      if (tools.length === 0) {
        return 'Keine Tools im Katalog gefunden.';
      }

      let out = `### Verfügbare Tools im Katalog (${tools.length})\n\n`;
      for (const t of tools) {
        out += `- **\`${t.id}\`** (${t.name}, *${t.category}*): ${t.short_description}\n`;
      }
      out += `\n*Tipp: Rufe \`tool_catalog\` mit \`action="details"\` und \`tool_id="<id>"\` auf, um die vollständige Anleitung für ein Tool zu erhalten.*`;
      return out;
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[ToolCatalogTool] Error:', errMsg);
      return `Fehler beim Abrufen des Tool-Katalogs: ${errMsg}`;
    }
  }
}

module.exports = ToolCatalogTool;
