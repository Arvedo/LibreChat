const manifest = require('./manifest');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const FluxAPI = require('./structured/FluxAPI');
const OpenWeather = require('./structured/OpenWeather');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const createOpenAIImageTools = require('./structured/OpenAIImageTools');
const TavilySearchResults = require('./structured/TavilySearchResults');
const createGeminiImageTool = require('./structured/GeminiImageGen');
const CronJobTool = require('./structured/CronJobTool');
const ToolCatalogTool = require('./structured/ToolCatalogTool');
const FileCreatorTool = require('./structured/FileCreatorTool');
const WebScraperTool = require('./structured/WebScraperTool');
const SearxngSearchTool = require('./structured/SearxngSearchTool');
const CondenseContextTool = require('./structured/CondenseContextTool');
const AgentCreatorTool = require('./structured/AgentCreatorTool');
const FileReaderTool = require('./structured/FileReaderTool');
const AskUserTool = require('./structured/AskUserTool');

module.exports = {
  ...manifest,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  createOpenAIImageTools,
  createGeminiImageTool,
  CronJobTool,
  ToolCatalogTool,
  FileCreatorTool,
  WebScraperTool,
  SearxngSearchTool,
  CondenseContextTool,
  AgentCreatorTool,
  FileReaderTool,
  AskUserTool,
};
