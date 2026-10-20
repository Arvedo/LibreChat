const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class WebScraperTool extends Tool {
  name = 'web_scraper';
  description =
    'Ruft den Inhalt einer Webseite (URL) ab, bereinigt ihn von Werbung/Menüs und gibt den lesbaren Text zurück. Unterstützt einen intelligenten "condensed"-Modus (komprimiert lange Seiten automatisch auf die wichtigsten Fakten, um das Kontextfenster zu schonen) sowie einen "full"-Modus.';

  schema = z.object({
    url: z.string().describe('Die vollständige URL der Webseite (muss mit http:// oder https:// beginnen).'),
    mode: z
      .enum(['condensed', 'full'])
      .optional()
      .default('condensed')
      .describe(
        '"condensed" (Standard, empfohlen!) extrahiert die wichtigsten Absätze und Fakten kompakt; "full" gibt den gesamten Seitentext bis max_chars zurück.',
      ),
    focus_query: z
      .string()
      .optional()
      .describe(
        'Optional: Worauf beim Extrahieren/Komprimieren der Webseite besonders geachtet werden soll (z.B. "Preise und Öffnungszeiten" oder "Paragraph 12").',
      ),
    max_chars: z
      .number()
      .int()
      .min(500)
      .max(25000)
      .optional()
      .default(6000)
      .describe('Maximale Zeichenanzahl für die Rückgabe (Standard: 6000).'),
  });

  constructor(fields = {}) {
    super(fields);
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
  }

  async _call(input) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/web-tools/scrape`,
        {
          url: input.url,
          mode: input.mode || 'condensed',
          focus_query: input.focus_query || null,
          max_chars: input.max_chars || 6000,
        },
        { timeout: 30000 },
      );

      const d = response.data;
      let out = `### 📄 Webseiten-Inhalt: ${d.title || d.url}\n`;
      out += `- **URL:** ${d.url}\n`;
      out += `- **Modus:** ${d.mode} (${d.returned_chars} von ${d.original_chars} Zeichen)\n\n`;
      out += `${d.content}\n`;

      if (d.links && d.links.length > 0) {
        out += `\n**Wichtige weiterführende Links auf der Seite:**\n`;
        d.links.slice(0, 8).forEach((l) => {
          out += `- [${l.text}](${l.url})\n`;
        });
      }
      return out;
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[WebScraperTool] Error:', errMsg);
      return `Fehler beim Abrufen der Webseite (${input.url}): ${errMsg}`;
    }
  }
}

module.exports = WebScraperTool;
