const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class AskUserTool extends Tool {
  name = 'ask_user';
  description =
    'Stellt dem Benutzer eine interaktive Rückfrage mit anklickbaren Antwort-Buttons und einem Freitextfeld direkt im Chat und wartet auf dessen Antwort. Nutze dieses Tool IMMER, wenn eine Anfrage mehrdeutig ist, wichtige Details fehlen oder der Benutzer zwischen mehreren Optionen entscheiden soll.';

  schema = z.object({
    question: z
      .string()
      .describe('Die konkrete, kurze Frage an den Benutzer (Pflichtfeld).'),
    options: z
      .array(z.string())
      .optional()
      .describe(
        'Optionale Liste von 2 bis 5 vorgeschlagenen Antwortmöglichkeiten, die der Benutzer per Klick auswählen kann.',
      ),
    multi_select: z
      .boolean()
      .optional()
      .describe(
        'Wenn true, kann der Benutzer mehrere Optionen gleichzeitig ankreuzen (Standard: false).',
      ),
    context: z
      .string()
      .optional()
      .describe('Optionaler kurzer Kontext oder Erklärung, warum diese Rückfrage wichtig ist.'),
  });

  constructor(fields = {}) {
    super(fields);
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
    this.userId = fields.userId || 'system';
  }

  async _call(input) {
    try {
      const { question, options = [], multi_select = false, context = '' } = input || {};
      if (!question || !String(question).trim()) {
        return 'Fehler: Parameter "question" darf nicht leer sein.';
      }

      const response = await axios.post(
        `${this.baseUrl}/api/user-input/wait`,
        {
          kind: 'ask_user',
          title: 'Rückfrage',
          question: String(question).trim(),
          options: Array.isArray(options) ? options.map((o) => String(o)) : [],
          multi_select: Boolean(multi_select),
          context: context ? String(context).trim() : '',
          user_id: this.userId,
          timeout_seconds: 600,
        },
        { timeout: 615000 },
      );

      const data = response.data || {};
      if (data.status === 'timeout') {
        return 'Der Benutzer hat innerhalb des Zeitlimits nicht auf die Rückfrage geantwortet. Bitte fahre mit einer sinnvollen Standardannahme fort oder weise kurz darauf hin.';
      }
      if (data.status === 'cancelled') {
        return `Der Benutzer hat die Rückfrage übersprungen/abgebrochen${data.custom_text ? ` (Anmerkung: ${data.custom_text})` : ''}.`;
      }

      const parts = [];
      if (Array.isArray(data.selected_options) && data.selected_options.length > 0) {
        parts.push(`Gewählte Antwort(en): ${data.selected_options.join(', ')}`);
      }
      if (data.custom_text && String(data.custom_text).trim()) {
        parts.push(`Freitext-Antwort des Benutzers: ${String(data.custom_text).trim()}`);
      }
      if (parts.length === 0 && data.answer) {
        parts.push(`Antwort des Benutzers: ${data.answer}`);
      }

      return parts.join('\n') || 'Der Benutzer hat ohne spezifische Auswahl bestätigt.';
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[AskUserTool] Error waiting for user response:', errMsg);
      return `Fehler bei der Benutzer-Rückfrage: ${errMsg}`;
    }
  }
}

module.exports = AskUserTool;
