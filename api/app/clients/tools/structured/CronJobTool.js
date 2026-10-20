const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class CronJobTool extends Tool {
  name = 'cron_scheduler';
  description =
    'Verwaltet zeitgesteuerte KI-Aufgaben und E-Mail-Zusammenfassungen (Cron-Jobs). Kann neue Jobs erstellen (create), bestehende auflisten (list) oder löschen (delete).';

  schema = z.object({
    action: z
      .enum(['create', 'list', 'delete'])
      .describe('Die auszuführende Aktion: create, list oder delete.'),
    name: z
      .string()
      .optional()
      .describe('Name des Cron-Jobs (erforderlich bei action="create").'),
    cron_expression: z
      .string()
      .optional()
      .describe(
        '5-teiliger Standard-Cron-Ausdruck, z.B. "0 8 * * *" für täglich 8:00 Uhr (erforderlich bei action="create").',
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        'Die detaillierte Anweisung an die KI, was bei Ausführung getan werden soll (erforderlich bei action="create").',
      ),
    recipient_email: z
      .string()
      .optional()
      .describe('E-Mail-Adresse des Empfängers (optional bei action="create").'),
    job_id: z
      .number()
      .int()
      .optional()
      .describe('ID des zu löschenden Jobs (erforderlich bei action="delete").'),
  });

  constructor(fields = {}) {
    super(fields);
    if (fields.name) {
      this.name = fields.name;
    }
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
    this.userId = fields.userId || 'system';
  }

  async _call(input) {
    const { action, name, cron_expression, prompt, recipient_email, job_id } = input;
    try {
      if (action === 'list') {
        const response = await axios.get(`${this.baseUrl}/api/cron/list`, {
          params: { user_id: this.userId },
          timeout: 10000,
        });
        const jobs = response.data;
        if (!jobs || jobs.length === 0) {
          return 'Es sind aktuell keine geplanten Aufgaben (Cron-Jobs) eingerichtet.';
        }
        return (
          'Aktive geplante Aufgaben:\n' +
          jobs
            .map(
              (j) =>
                `- ID ${j.id}: "${j.name}" (Zeitplan: \`${j.cron_expression}\`, Nächster Lauf: ${j.next_run || 'unbekannt'}, Empfänger: ${j.recipient_email || 'Standard'})`,
            )
            .join('\n')
        );
      }

      if (action === 'create') {
        if (!name || !cron_expression || !prompt) {
          return 'Fehler: Für action="create" müssen name, cron_expression und prompt angegeben werden.';
        }
        const response = await axios.post(
          `${this.baseUrl}/api/cron/create`,
          {
            user_id: this.userId,
            name,
            cron_expression,
            prompt,
            recipient_email: recipient_email || null,
          },
          { timeout: 10000 },
        );
        const job = response.data;
        return `Geplante Aufgabe erfolgreich eingerichtet!\n- ID: ${job.id}\n- Name: ${job.name}\n- Zeitplan: \`${job.cron_expression}\`\n- Nächste Ausführung (UTC): ${job.next_run}`;
      }

      if (action === 'delete') {
        if (!job_id) {
          return 'Fehler: Für action="delete" muss die job_id angegeben werden.';
        }
        await axios.delete(`${this.baseUrl}/api/cron/${job_id}`, {
          params: { user_id: this.userId },
          timeout: 10000,
        });
        return `Geplante Aufgabe mit ID ${job_id} wurde erfolgreich gelöscht.`;
      }

      return `Unbekannte Aktion: ${action}`;
    } catch (error) {
      const detail = error.response?.data?.detail || error.message;
      logger.error('[CronJobTool] Error:', detail);
      return `Fehler bei der Cron-Job-Verwaltung: ${detail}`;
    }
  }
}

module.exports = CronJobTool;
