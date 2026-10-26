const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class CondenseResultsTool extends Tool {
  name = 'condense_results';
  description =
    'Komprimiert und strukturiert lange Recherche-Ergebnisse, Webseiten-Inhalte oder Textdokumente auf die wesentlichen Kernpunkte und Fakten. Nützlich nach Web-Suchen oder Web-Scraping, um wichtige Informationen präzise zusammenzufassen.';

  schema = z.object({
    text: z
      .string()
      .describe('Der lange Text, die gesammelten Recherche-Ergebnisse oder Web-Scraping-Daten, die komprimiert werden sollen.'),
    focus: z
      .string()
      .optional()
      .describe('Optionaler Fokus: Welche Fakten, Zahlen, Fragestellungen oder Themen müssen unbedingt erhalten bleiben?'),
    mode: z
      .enum(['bullet_points', 'key_facts', 'brief_summary'])
      .optional()
      .default('bullet_points')
      .describe(
        'Darstellungsform: "bullet_points" (Stichpunkte), "key_facts" (Zahlen/Daten/Fakten-Sätze), "brief_summary" (kompakter Fließtext).',
      ),
    target_ratio: z
      .number()
      .min(0.1)
      .max(0.8)
      .optional()
      .default(0.3)
      .describe('Ziel-Kompressionsrate (0.3 = auf ca. 30% der ursprünglichen Länge kürzen).'),
  });

  constructor(fields = {}) {
    super(fields);
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
  }

  async _call(input) {
    try {
      const textToCondense = input.text || input.summary || '';
      const focusTopic = input.focus || input.focus_topic || null;

      const response = await axios.post(
        `${this.baseUrl}/api/web-tools/condense`,
        {
          text: textToCondense,
          focus: focusTopic,
          mode: input.mode || 'bullet_points',
          target_ratio: input.target_ratio || 0.3,
        },
        { timeout: 20000 },
      );

      const d = response.data;
      if (d.skipped) {
        return `⚠️ **Komprimierung übersprungen:** ${d.reason}`;
      }
      return (
        `### 🗜️ Komprimierte Zusammenfassung (${d.condensed_chars} statt ${d.original_chars} Zeichen, Ratio: ${d.compression_ratio}):\n\n` +
        `${d.condensed_text}`
      );
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[CondenseResultsTool] Error:', errMsg);
      return `Fehler beim Komprimieren des Textes: ${errMsg}`;
    }
  }
}

module.exports = CondenseResultsTool;
