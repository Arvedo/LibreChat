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

  async _call(input, arg2, arg3) {
    try {
      const { question, options = [], multi_select = false, context = '' } = input || {};
      if (!question || !String(question).trim()) {
        return 'Fehler: Parameter "question" darf nicht leer sein.';
      }
      const config = arg3 ?? arg2;
      const toolCallId = String(config?.toolCall?.id || '');
      const cleanOptions = Array.isArray(options) ? options.map((o) => String(o)) : [];

      const response = await axios.post(
        `${this.baseUrl}/api/user-input/wait`,
        {
          tool_call_id: toolCallId,
          tool_name: this.name || 'ask_user',
          is_gate: false,
          question: String(question).trim(),
          options: cleanOptions,
          context: context ? String(context).trim() : '',
          args: {
            question: String(question).trim(),
            options: cleanOptions,
            multi_select: Boolean(multi_select),
            context: context ? String(context).trim() : '',
          },
          user_id: String(this.userId || 'system'),
          timeout: 600,
        },
        { timeout: 615000 },
      );

      const data = response.data || {};
      if (data.formatted_output) {
        return data.formatted_output;
      }
      if (data.status === 'timeout') {
        return 'Der Benutzer hat innerhalb des Zeitlimits nicht auf die Rückfrage geantwortet. Bitte fahre mit einer sinnvollen Standardannahme fort oder weise kurz darauf hin.';
      }
      if (data.final_answer) {
        return `${data.state_marker ? `${data.state_marker}\n` : ''}Antwort des Nutzers: "${data.final_answer}"`;
      }
      return 'Der Benutzer hat ohne spezifische Auswahl bestätigt.';
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[AskUserTool] Error waiting for user response:', errMsg);
      return `Fehler bei der Benutzer-Rückfrage: ${errMsg}`;
    }
  }
}

module.exports = AskUserTool;
