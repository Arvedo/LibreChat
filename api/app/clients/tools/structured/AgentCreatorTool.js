const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');

class AgentCreatorTool extends Tool {
  name = 'agent_creator';
  description =
    'Erstellt, testet, verwaltet und aktualisiert spezialisierte KI-Agenten in LibreChat. ' +
    'WICHTIGER WORKFLOW FÜR NEUE AGENTEN: ' +
    '1) Kläre zuerst mit dem Benutzer den genauen Zweck, gewünschte Tools und Verhalten ab. ' +
    '2) Rufe `action="propose"` auf, um dem Benutzer einen vollständigen Entwurf (Blueprint) zur Freigabe vorzulegen. ' +
    '3) Erst NACH ausdrücklicher Bestätigung des Benutzers: Rufe `action="test_and_create"` auf — dadurch wird der Agent mit einem Test-Prompt validiert und in LibreChat gespeichert!';

  schema = z.object({
    action: z
      .enum(['propose', 'test_and_create', 'list', 'get', 'update', 'delete'])
      .describe(
        '"propose" erstellt einen strukturierten Agenten-Vorschlag zur Abstimmung mit dem User; ' +
          '"test_and_create" testet den System-Prompt live gegen das LLM und legt den Agenten danach in LibreChat an; ' +
          '"list" listet alle bestehenden Agenten auf; ' +
          '"get" zeigt Details eines Agenten; ' +
          '"update" aktualisiert einen bestehenden Agenten; ' +
          '"delete" löscht einen Agenten.',
      ),
    agent_id: z
      .string()
      .optional()
      .describe('ID des Agenten (erforderlich bei action="get", "update" oder "delete").'),
    name: z
      .string()
      .optional()
      .describe('Anzeigename des Agenten (z.B. "Vertrags-Prüfer" oder "Python-Tutor").'),
    description: z
      .string()
      .optional()
      .describe('Kurze, prägnante Beschreibung für die Agenten-Auswahlliste.'),
    instructions: z
      .string()
      .optional()
      .describe(
        'Ausführlicher, präziser System-Prompt für den Agenten (Rolle, Aufgaben, Regeln, Tonfall, Formatierungsvorgaben).',
      ),
    tools: z
      .array(z.string())
      .optional()
      .describe(
        'Liste der Tools, die der Agent nutzen darf. Verfügbare Werte: "searxng_search", "web_scraper", "file_creator", "execute_code", "read_file", "condense_context", "tool_catalog", "doc_search_mcp_document_search", "doc_sql_mcp_document_search", "agent_creator".',
      ),
    conversation_starters: z
      .array(z.string())
      .optional()
      .describe('Optionale Liste von 2-4 Beispiel-Prompts zum schnellen Starten eines Chats.'),
    test_prompt: z
      .string()
      .optional()
      .describe(
        'Ein realistischer Test-Prompt für action="test_and_create", mit dem automatisch geprüft wird, ob der neue Agent wie gewünscht antwortet.',
      ),
    temperature: z
      .number()
      .min(0)
      .max(1.5)
      .optional()
      .default(0.4)
      .describe('Temperatur des Modells (Standard: 0.4).'),
  });

  constructor(fields = {}) {
    super(fields);
    if (fields.name) {
      this.name = fields.name;
    }
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
    this.userId = fields.userId || null;
  }

  async _call(input, arg2, arg3) {
    try {
      const writeActions = new Set(['test_and_create', 'create', 'update', 'delete']);
      let stateMarkerPrefix = '';
      if (writeActions.has(input?.action)) {
        const config = arg3 ?? arg2;
        const toolCallId = String(config?.toolCall?.id || '');
        const approveRes = await axios.post(
          `${this.baseUrl}/api/user-input/wait`,
          {
            tool_call_id: toolCallId,
            tool_name: this.name || 'agent_creator',
            is_gate: true,
            question: `KI-Agent Aktion "${input.action}"${input.name ? ` für "${input.name}"` : ''} ausführen?`,
            args: input || {},
            user_id: String(this.userId || 'default'),
            timeout: 600,
          },
          { timeout: 615000 },
        );
        const gateData = approveRes.data || {};
        if (gateData.approved !== true) {
          return (
            gateData.formatted_output ||
            `[FREIGABE ABGELEHNT]: Die Agent-Aktion "${input.action}" wurde vom Nutzer abgelehnt.`
          );
        }
        stateMarkerPrefix = gateData.state_marker ? `${gateData.state_marker}\n` : '';
      }

      const response = await axios.post(
        `${this.baseUrl}/api/agent-creator/action`,
        {
          action: input.action === 'create' ? 'test_and_create' : input.action,
          agent_id: input.agent_id || null,
          name: input.name || null,
          description: input.description || null,
          instructions: input.instructions || null,
          tools: input.tools || [],
          conversation_starters: input.conversation_starters || [],
          test_prompt: input.test_prompt || null,
          temperature: input.temperature ?? 0.4,
          user_id: this.userId,
        },
        { timeout: 65000 },
      );

      const d = response.data;

      if (input.action === 'propose' && d.blueprint) {
        const bp = d.blueprint;
        let out = `### 📋 Agenten-Entwurf (Blueprint): **${bp.name}**\n\n`;
        out += `- **Kurzbeschreibung:** ${bp.description}\n`;
        out += `- **Aktivierte Tools (${bp.tools.length}):** ${bp.tools.length ? bp.tools.map((t) => `\`${t}\``).join(', ') : '*(Keine Tools — reiner Konversations-Agent)*'}\n`;
        out += `- **Temperatur:** ${bp.temperature}\n`;
        if (bp.conversation_starters && bp.conversation_starters.length > 0) {
          out += `- **Start-Prompts:** ${bp.conversation_starters.map((s) => `"${s}"`).join(' | ')}\n`;
        }
        out += `- **Geplanter Test-Prompt:** "${bp.test_prompt}"\n\n`;
        out += `**Geplanter System-Prompt (\`instructions\`):**\n\`\`\`markdown\n${bp.instructions}\n\`\`\`\n\n`;
        out += `👉 **Nächster Schritt:** Präsentiere diesen Entwurf jetzt übersichtlich dem Benutzer und frage ihn, ob er Änderungswünsche hat oder ob du den Agenten jetzt testen und erstellen (\`action="test_and_create"\`) sollst.`;
        return out;
      }

      if (input.action === 'test_and_create' || input.action === 'create') {
        let out = `${stateMarkerPrefix}### ✅ Agent **${d.agent?.name}** erfolgreich getestet & erstellt!\n\n`;
        out += `- **Agenten-ID:** \`${d.agent?.id}\`\n`;
        out += `- **Tools:** ${(d.agent?.tools || []).map((t) => `\`${t}\``).join(', ') || 'Keine'}\n`;
        if (d.test_result) {
          out += `- **Selbsttest-Status:** ${d.test_result.passed ? '✅ Bestanden' : '⚠️ Warnung'} (${d.test_result.latency_ms} ms)\n`;
          out += `- **Test-Prompt:** *"${d.test_result.test_prompt}"*\n`;
          out += `- **Test-Antwort des neuen Agenten (Auszug):**\n> ${(d.test_result.response_preview || '').replace(/\n/g, '\n> ')}\n\n`;
        }
        out += `💡 *Hinweis für den Benutzer: Der neue Agent ist ab sofort im Agenten-Menü von LibreChat (ggf. nach kurzem Neuladen der Seite mit F5) auswählbar!*`;
        return out;
      }

      if (input.action === 'list') {
        const agents = d.agents || [];
        if (agents.length === 0) {
          return 'Es sind aktuell keine benutzerdefinierten Agenten vorhanden.';
        }
        let out = `### 🤖 Verfügbare Agenten in LibreChat (${agents.length}):\n\n`;
        for (const a of agents) {
          out += `- **${a.name}** (\`${a.id}\`): ${a.description || '*(Keine Beschreibung)*'}\n  *Tools:* ${(a.tools || []).join(', ') || 'Keine'}\n`;
        }
        return out;
      }

      if (input.action === 'get' && d.agent) {
        const a = d.agent;
        return (
          `### 🤖 Agent: **${a.name}** (\`${a.id}\`)\n` +
          `- **Beschreibung:** ${a.description}\n` +
          `- **Modell:** ${a.model}\n` +
          `- **Tools:** ${(a.tools || []).join(', ') || 'Keine'}\n\n` +
          `**System-Prompt:**\n\`\`\`markdown\n${a.instructions}\n\`\`\``
        );
      }

      return d.message || JSON.stringify(d, null, 2);
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[AgentCreatorTool] Error:', errMsg);
      return `Fehler im AgentCreatorTool: ${errMsg}`;
    }
  }
}

module.exports = AgentCreatorTool;
