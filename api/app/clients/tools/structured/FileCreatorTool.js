const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class FileCreatorTool extends Tool {
  name = 'file_creator';
  description =
    'Führt Python 3 Code in einer sicheren Sandbox aus, um Berechnungen durchzuführen, Daten zu analysieren (pandas, openpyxl), Diagramme (matplotlib) oder vollständige Dateien (Word .docx, Excel .xlsx, PowerPoint .pptx, PDF, HTML, CSV, ZIP) zu erstellen. Erstellte Dateien werden automatisch als klickbare Download-Links zurückgegeben.';

  schema = z.object({
    code: z
      .string()
      .describe(
        'Vollständiger, direkt ausführbarer Python 3 Code. Zum Erstellen von Dateien speichere diese einfach im aktuellen Arbeitsverzeichnis (z.B. open("datei.html", "w") oder doc.save("bericht.docx")).',
      ),
    timeout: z
      .number()
      .int()
      .min(5)
      .max(120)
      .optional()
      .default(60)
      .describe('Maximale Ausführungszeit in Sekunden (Standard: 60).'),
  });

  constructor(fields = {}) {
    super(fields);
    if (fields.name) {
      this.name = fields.name;
    }
    this.baseUrl = fields.baseUrl || process.env.PLUGINS_API_URL || 'http://plugins_api:8000';
    this.userId = fields.userId || 'default';
    this.agentId = fields.agentId || null;
  }

  async _getUploadedFiles() {
    try {
      const mongoose = require('mongoose');
      const File = mongoose.models.File;
      if (!File) {
        return [];
      }

      const uploadedFiles = [];
      const seenPaths = new Set();

      const addFileRecord = (f) => {
        if (!f || !f.filepath || !f.filename) return;
        let localPath = f.filepath;
        if (localPath.startsWith('/uploads/')) {
          localPath = path.join('/app', localPath);
        } else if (localPath.startsWith('/images/')) {
          localPath = path.join('/app/client/public', localPath);
        }
        if (!seenPaths.has(localPath) && fs.existsSync(localPath)) {
          const stat = fs.statSync(localPath);
          if (stat.size <= 50 * 1024 * 1024) {
            seenPaths.add(localPath);
            uploadedFiles.push({
              filename: f.filename,
              content_base64: fs.readFileSync(localPath).toString('base64'),
            });
          }
        }
      };

      if (this.agentId && mongoose.models.Agent) {
        const agentDoc = await mongoose.models.Agent.findOne({ id: this.agentId }).lean();
        if (agentDoc && agentDoc.tool_resources) {
          const fileIds = [];
          for (const resKey of ['file_search', 'execute_code', 'context', 'ocr']) {
            const ids = agentDoc.tool_resources?.[resKey]?.file_ids;
            if (Array.isArray(ids)) {
              fileIds.push(...ids);
            }
          }
          if (fileIds.length > 0) {
            const agentFiles = await File.find({ file_id: { $in: fileIds } }).lean();
            for (const f of agentFiles) {
              addFileRecord(f);
            }
          }
        }
      }

      if (this.userId && this.userId !== 'default') {
        const recentFiles = await File.find({ user: this.userId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        for (const f of recentFiles) {
          addFileRecord(f);
        }
      }

      return uploadedFiles;
    } catch (e) {
      logger.warn('[FileCreatorTool] Could not load user/agent uploaded files for sandbox:', e.message);
      return [];
    }
  }

  async _call(input) {
    try {
      const uploaded_files = await this._getUploadedFiles();
      const response = await axios.post(
        `${this.baseUrl}/api/file-creator/execute`,
        {
          code: input.code,
          timeout: input.timeout || 60,
          user_id: this.userId,
          uploaded_files,
        },
        { timeout: ((input.timeout || 60) + 15) * 1000 },
      );

      const data = response.data;
      let output = '';

      const execTime = typeof data.execution_time_ms === 'number' ? `${data.execution_time_ms} ms` : '';
      const execTimeStr = execTime ? ` (${execTime})` : '';
      if (data.success) {
        output += `✅ **Code erfolgreich ausgeführt**${execTimeStr}\n\n`;
      } else {
        const exitCode = data.exit_code !== undefined ? data.exit_code : 1;
        output += `❌ **Fehler bei der Code-Ausführung** (Exit-Code: ${exitCode}${execTimeStr ? `, ${execTime}` : ''})\n\n`;
      }

      if (data.stdout && data.stdout.trim()) {
        output += `**Ausgabe (stdout):**\n\`\`\`text\n${data.stdout.trim()}\n\`\`\`\n\n`;
      }

      if (data.stderr && data.stderr.trim()) {
        output += `**Fehlermeldung / Warnungen (stderr):**\n\`\`\`text\n${data.stderr.trim()}\n\`\`\`\n\n`;
      }

      if (data.files && data.files.length > 0) {
        output += `### 📁 Erstellte Dateien (${data.files.length}):\n`;
        output += `WICHTIG: Kopiere die folgenden Markdown-Download-Links EXAKT und UNVERÄNDERT in deine Antwort an den Benutzer, damit der Benutzer die Dateien herunterladen oder die Bilder direkt sehen kann:\n\n`;
        const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
        for (const f of data.files) {
          const downloadUrl = f.download_url || f.url || (f.filename ? `/images/generated/${f.filename}` : '#');
          const sizeBytes = typeof f.size_bytes === 'number' ? f.size_bytes : (typeof f.bytes === 'number' ? f.bytes : 0);
          const sizeKb = (sizeBytes / 1024).toFixed(1);
          const ext = path.extname(f.filename || '').toLowerCase();
          if (imageExts.has(ext)) {
            output += `- ![${f.filename}](${downloadUrl})\n  [📥 ${f.filename} herunterladen (${sizeKb} KB)](${downloadUrl})\n`;
          } else {
            output += `- [📥 ${f.filename} herunterladen (${sizeKb} KB)](${downloadUrl})\n`;
          }
        }
      } else if (data.success && (!data.stdout || !data.stdout.trim())) {
        output += `*(Code lief ohne Textausgabe oder Dateierstellung durch.)*\n`;
      }

      return output.trim();
    } catch (error) {
      const errMsg = error.response?.data?.detail || error.message;
      logger.error('[FileCreatorTool] Error:', errMsg);
      return `Fehler im FileCreatorTool: ${errMsg}`;
    }
  }
}

module.exports = FileCreatorTool;
