const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class SearxngSearchTool extends Tool {
  name = 'searxng_search';
  description =
    'Durchsucht das Internet live über die lokale Metasuchmaschine SearXNG (aggregiert Google, Bing, DuckDuckGo, Wikipedia etc.) nach aktuellen Informationen, Nachrichten, Fakten, Preisen, Gesetzen oder Websites. Gibt Titel, URLs und Textausschnitte zurück. Nutze anschließend `web_scraper`, um die vielversprechendsten URLs vollständig zu lesen.';

  schema = z.object({
    query: z
      .string()
      .describe('Der Suchbegriff oder die Suchanfrage (präzise Stichworte liefern die besten Ergebnisse).'),
    category: z
      .enum(['general', 'news', 'science', 'it'])
      .optional()
      .default('general')
      .describe(
        'Suchkategorie: "general" (Standard-Websuche), "news" (aktuelle Nachrichten), "science" (Wissenschaft), "it" (Technik/Programmierung).',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .default(6)
      .describe('Maximale Anzahl der Suchergebnisse (Standard: 6, max: 15).'),
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
      const response = await axios.post(
        `${this.baseUrl}/api/web-tools/search`,
        {
          query: input.query,
          category: input.category || 'general',
          max_results: input.max_results || 6,
        },
        { timeout: 25000 },
      );

      const data = response.data;
      const results = data.results || [];
      if (results.length === 0) {
        return `Keine Suchergebnisse für "${input.query}" gefunden. Versuche es mit allgemeineren oder anders formulierten Suchbegriffen.`;
      }

      let out = `### 🌐 Web-Suchergebnisse für "${data.query}" (${results.length} Treffer):\n\n`;
      results.forEach((r, idx) => {
        out += `**${idx + 1}. [${r.title}](${r.url})**\n`;
        if (r.publishedDate) {
          out += `   *Datum: ${r.publishedDate}*\n`;
        }
        out += `   ${r.snippet || '*(Kein Textausschnitt verfügbar)*'}\n`;
        out += `   🔗 URL: \`${r.url}\`\n\n`;
      });

      out += `*Tipp: Nutze das Tool \`web_scraper\` mit einer oder mehreren dieser URLs, um den vollständigen Seiteninhalt zu lesen.*`;
      return out;
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[SearxngSearchTool] Error:', errMsg);
      return `Fehler bei der Websuche: ${errMsg}`;
    }
  }
}

module.exports = SearxngSearchTool;
