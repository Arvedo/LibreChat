const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class CondenseContextTool extends Tool {
  name = 'condense_context';
  description =
    'Komprimiert und strukturiert sehr lange Texte, Recherche-Ergebnisse oder Gesprächsnotizen auf die wesentlichen Kernpunkte. WICHTIG: Dieses Tool darf NUR verwendet werden, wenn das Kontextfenster bereits zu mindestens 33% (1/3) gefüllt ist! Unter 33% Kontextauslastung wird der Aufruf abgelehnt.';

  schema = z.object({
    text: z
      .string()
      .describe('Der lange Text oder die gesammelten Informationen, die komprimiert werden sollen.'),
    context_percent: z
      .number()
      .min(0)
      .max(100)
      .describe(
        'Deine aktuelle Schätzung der Kontextfenster-Auslastung in Prozent (0-100). Muss mindestens 33 betragen, damit das Tool ausgeführt wird!',
      ),
    focus: z
      .string()
      .optional()
      .describe('Optionaler Fokus: Welche Fakten, Zahlen oder Themen müssen unbedingt erhalten bleiben?'),
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
      const response = await axios.post(
        `${this.baseUrl}/api/web-tools/condense`,
        {
          text: input.text,
          context_percent: input.context_percent ?? 0,
          focus: input.focus || null,
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
      logger.error('[CondenseContextTool] Error:', errMsg);
      return `Fehler beim Komprimieren des Textes: ${errMsg}`;
    }
  }
}

module.exports = CondenseContextTool;
