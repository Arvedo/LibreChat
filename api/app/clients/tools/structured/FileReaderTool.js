const { z } = require('zod');
const { Tool } = require('@librechat/agents/langchain/tools');
const { logger } = require('@librechat/data-schemas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.gif',
]);

class FileReaderTool extends Tool {
  name = 'read_file';
  description =
    'Liest oder durchsucht den Inhalt von hochgeladenen Dokumenten (PDF, Word, Text, CSV, Code) sowie Bildern/Scans (automatische OCR-Texterkennung). ' +
    'WICHTIG: Nutze dieses Tool IMMER zuerst, wenn im Chat ein Hinweis wie [Dokument hinzugefügt: "..."] steht oder der Benutzer Fragen zu einer hochgeladenen Datei stellt!';

  schema = z.object({
    filename: z
      .string()
      .optional()
      .describe(
        'Name (oder Teil des Namens) der hochgeladenen Datei. Wenn leer, werden alle kürzlich hochgeladenen Dateien der Konversation gelesen.',
      ),
    query: z
      .string()
      .optional()
      .describe(
        'Optionaler Suchbegriff oder Stichwort, um gezielt relevante Textstellen im Dokument zu finden. Wenn leer, wird der Dokumentinhalt direkt gelesen.',
      ),
    full_text: z
      .boolean()
      .optional()
      .default(true)
      .describe('Wenn true (Standard), wird möglichst der gesamte Text des Dokuments zurückgegeben.'),
  });

  constructor(fields = {}) {
    super(fields);
    if (fields.name) {
      this.name = fields.name;
    }
    this.userId = fields.userId || 'default';
    this.agentId = fields.agentId || null;
    this.ocrServiceUrl =
      fields.ocrServiceUrl || process.env.OCR_SERVICE_URL || 'http://ocr_service:8080';
  }

  _resolveLocalPath(filepath) {
    if (!filepath) return null;
    let localPath = filepath;
    if (localPath.startsWith('/uploads/')) {
      localPath = path.join('/app', localPath);
    } else if (localPath.startsWith('/images/')) {
      localPath = path.join('/app/client/public', localPath);
    }
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    return null;
  }

  async _extractWithOcrService(localPath, filename) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(localPath), { filename });
      const response = await axios.post(`${this.ocrServiceUrl}/v1/ocr/process`, form, {
        headers: form.getHeaders(),
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      if (response.data && typeof response.data.text === 'string') {
        return {
          text: response.data.text.trim(),
          metadata: response.data.metadata || {},
        };
      }
      return { text: '', metadata: {} };
    } catch (err) {
      logger.warn(`[FileReaderTool] OCR service call failed for ${filename}: ${err.message}`);
      return null;
    }
  }

  async _extractFileText(f) {
    if (f.text && f.text.trim().length > 0) {
      return f.text.trim();
    }

    const localPath = this._resolveLocalPath(f.filepath);
    if (!localPath) {
      return '';
    }

    const ext = path.extname(f.filename || localPath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext) || (f.type && f.type.startsWith('image/'));
    const isPdf = ext === '.pdf' || f.type === 'application/pdf';

    if (isImage || isPdf) {
      const ocrResult = await this._extractWithOcrService(localPath, f.filename || path.basename(localPath));
      if (ocrResult !== null) {
        const { text, metadata } = ocrResult;
        if (text && text.length > 0) {
          try {
            const mongoose = require('mongoose');
            if (mongoose.models.File && f._id) {
              await mongoose.models.File.updateOne({ _id: f._id }, { $set: { text } });
            }
          } catch (dbErr) {
            logger.debug(`[FileReaderTool] Could not cache OCR text in Mongo: ${dbErr.message}`);
          }
          return text;
        }
        if (isImage && metadata.document_type === 'natural_image_no_text') {
          return '[Bild-Analyse: Auf diesem Bild wurde kein lesbarer Text erkannt (reines Foto/Grafik ohne Textinhalt).]';
        }
        if (isImage) {
          return '[OCR-Hinweis: Auf diesem Bild konnte kein lesbarer Text erkannt werden.]';
        }
      }
    }

    if (isPdf) {
      try {
        const { execFileSync } = require('child_process');
        const extracted = execFileSync(
          'python3',
          [
            '-c',
            `import sys\ntry:\n    import fitz\n    doc = fitz.open(sys.argv[1])\n    print("\\n\\n".join(f"--- Seite {i+1} ---\\n" + page.get_text() for i, page in enumerate(doc)))\nexcept Exception:\n    from pypdf import PdfReader\n    r = PdfReader(sys.argv[1])\n    print("\\n\\n".join(f"--- Seite {i+1} ---\\n" + (p.extract_text() or "") for i, p in enumerate(r.pages)))`,
            localPath,
          ],
          { encoding: 'utf-8', timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
        );
        if (extracted && extracted.trim()) {
          return extracted.trim();
        }
      } catch (e) {
        logger.warn('[FileReaderTool] PDF fallback extraction error:', e.message);
      }
    }

    try {
      const stat = fs.statSync(localPath);
      if (stat.size <= 5 * 1024 * 1024 && !isImage && !isPdf) {
        const raw = fs.readFileSync(localPath, 'utf-8');
        if (!raw.includes('\u0000')) {
          return raw.trim();
        }
      }
    } catch (e) {
      logger.warn('[FileReaderTool] File read error:', e.message);
    }

    return '';
  }

  async _call(input) {
    try {
      const mongoose = require('mongoose');
      const File = mongoose.models.File;
      if (!File) {
        return 'Fehler: Datei-Datenbankmodell nicht verfügbar.';
      }

      const filenameFilter = (input?.filename || '').trim().toLowerCase();
      const searchQuery = (input?.query || '').trim().toLowerCase();

      const candidates = [];
      const seenIds = new Set();

      const addCandidate = (doc) => {
        if (!doc || !doc.file_id || seenIds.has(doc.file_id)) return;
        seenIds.add(doc.file_id);
        candidates.push(doc);
      };

      if (this.agentId && mongoose.models.Agent) {
        const agentDoc = await mongoose.models.Agent.findOne({ id: this.agentId }).lean();
        if (agentDoc && agentDoc.tool_resources) {
          const fileIds = [];
          for (const resKey of ['file_search', 'execute_code', 'context', 'ocr']) {
            const ids = agentDoc.tool_resources?.[resKey]?.file_ids;
            if (Array.isArray(ids)) fileIds.push(...ids);
          }
          if (fileIds.length > 0) {
            const agentFiles = await File.find({ file_id: { $in: fileIds } })
              .sort({ createdAt: -1 })
              .lean();
            for (const f of agentFiles) addCandidate(f);
          }
        }
      }

      if (this.userId && this.userId !== 'default') {
        const userFiles = await File.find({ user: this.userId })
          .sort({ createdAt: -1 })
          .limit(15)
          .lean();
        for (const f of userFiles) addCandidate(f);
      }

      if (candidates.length === 0) {
        return 'Es wurden keine hochgeladenen Dateien für diesen Benutzer oder Agenten gefunden.';
      }

      let matchedFiles = candidates;
      if (filenameFilter) {
        matchedFiles = candidates.filter((f) =>
          (f.filename || '').toLowerCase().includes(filenameFilter),
        );
        if (matchedFiles.length === 0) {
          matchedFiles = candidates.slice(0, 3);
        }
      } else {
        matchedFiles = candidates.slice(0, 5);
      }

      let output = '';
      for (const f of matchedFiles) {
        const text = await this._extractFileText(f);
        output += `### 📄 Datei: \`${f.filename}\` (${f.type || 'unbekannt'}, ${((f.bytes || 0) / 1024).toFixed(1)} KB)\n`;

        if (!text) {
          output += `*(Kein direkter Textinhalt extrahierbar. Falls es sich um eine komplexe Binärdatei wie Excel/.xlsx handelt, kannst du sie mit \`execute_code\` unter \`/mnt/data/${f.filename}\` per Python einlesen.)*\n\n`;
          continue;
        }

        if (searchQuery) {
          const paragraphs = text.split(/\n\s*\n/);
          const terms = searchQuery.split(/\s+/).filter((t) => t.length > 2);
          const hits = paragraphs.filter((p) => {
            const lower = p.toLowerCase();
            return terms.some((t) => lower.includes(t));
          });

          if (hits.length > 0) {
            const joinedHits = hits.slice(0, 15).join('\n\n---\n\n');
            output += `**Gefundene relevante Abschnitte (${hits.length} Treffer für "${input.query}"):**\n${joinedHits.slice(0, 25000)}\n\n`;
          } else {
            output += `*(Keine direkten Treffer für "${input.query}" — hier ist der Dokumentanfang:)*\n${text.slice(0, 15000)}\n\n`;
          }
        } else {
          const maxChars = 35000;
          if (text.length > maxChars) {
            output += `${text.slice(0, maxChars)}\n\n...[Dokument gekürzt nach ${maxChars} von ${text.length} Zeichen. Nutze den Parameter \`query\`, um gezielt nach Begriffen im Rest des Dokuments zu suchen.]\n\n`;
          } else {
            output += `${text}\n\n`;
          }
        }
      }

      return output.trim();
    } catch (error) {
      logger.error('[FileReaderTool] Error:', error);
      return `Fehler beim Lesen der Datei: ${error.message}`;
    }
  }
}

module.exports = FileReaderTool;
