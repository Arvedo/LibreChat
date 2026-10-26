const CondenseResultsTool = require('./CondenseResultsTool');

class CondenseContextTool extends CondenseResultsTool {
  name = 'condense_context';
  description =
    'Komprimiert und strukturiert lange Recherche-Ergebnisse, Webseiten-Inhalte oder Textdokumente auf die wesentlichen Kernpunkte und Fakten (Alias für condense_results).';
}

module.exports = CondenseContextTool;
