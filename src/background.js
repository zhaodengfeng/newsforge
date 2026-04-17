// NewsForge Background Service Worker
importScripts('providers.js');

const TRANSLATION_CACHE_VERSION = 'translation-cache-v2';
const TRANSLATION_CACHE_KEY = 'translationCache';
const TRANSLATION_CACHE_MAX_ENTRIES = 1200;
const EXPORT_IMAGE_FETCH_MAX_BYTES = 15 * 1024 * 1024;
const EXPORT_IMAGE_FETCH_TIMEOUT_MS = 12000;
const LLM_FETCH_TIMEOUT_MS = 90000; // 90s timeout for LLM API calls

// ============================================
// 安装 & 默认设置
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  // 右键菜单
  chrome.contextMenus.create({ id: 'newsforge-read', title: 'NewsForge - Reader Mode', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'newsforge-translate', title: 'NewsForge - Translate this page', contexts: ['page'] });

  // 默认设置
  const defaults = {
    translationProvider: 'google',
    targetLang: 'zh-CN',
    exportImageFormat: 'jpeg',
    exportQuality: 'balanced',
    longArticleMultiImageExport: false,
  };
  chrome.storage.local.get(Object.keys(defaults), (existing) => {
    const toSet = {};
    for (const [key, val] of Object.entries(defaults)) {
      if (existing[key] === undefined) toSet[key] = val;
    }
    if (Object.keys(toSet).length > 0) chrome.storage.local.set(toSet);
  });

  // 迁移旧格式设置
  migrateOldSettings();
});

migrateOldSettings();

function migrateOldSettings() {
  const legacyKeys = [
    'openaiKey', 'openaiModel', 'openaiEndpoint',
    'deepseekKey', 'deepseekModel', 'deepseekEndpoint'
  ];

  chrome.storage.local.get(legacyKeys, (old) => {
    const { updates, removes } = buildLegacyConfigMigration(old);

    if (Object.keys(updates).length > 0 || removes.length > 0) {
      chrome.storage.local.set(updates, () => {
        chrome.storage.local.remove(removes);
      });
    }
  });
}

function buildLegacyConfigMigration(old = {}) {
  const updates = {};
  const removes = [];

  if (old.openaiKey) {
    updates.openai_apiKey = old.openaiKey;
    removes.push('openaiKey');
  }
  if (old.openaiModel) {
    updates.openai_model = old.openaiModel;
    removes.push('openaiModel');
  }
  if (old.openaiEndpoint) {
    updates.openai_endpoint = old.openaiEndpoint;
    removes.push('openaiEndpoint');
  }

  if (old.deepseekKey) {
    updates.deepseek_apiKey = old.deepseekKey;
    removes.push('deepseekKey');
  }
  if (old.deepseekModel) {
    updates.deepseek_model = old.deepseekModel;
    removes.push('deepseekModel');
  }
  if (old.deepseekEndpoint) {
    updates.deepseek_endpoint = old.deepseekEndpoint;
    removes.push('deepseekEndpoint');
  }

  return { updates, removes };
}

// ============================================
// 右键菜单
// ============================================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'newsforge-read') {
    chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
  } else if (info.menuItemId === 'newsforge-translate') {
    chrome.tabs.sendMessage(tab.id, { type: 'open_reader_translate' });
  }
});

// ============================================
// 消息处理
// ============================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get_tab_url') {
    sendResponse({ url: sender.tab?.url || '' });
    return;
  }

  if (msg.type === 'translate') {
    handleTranslate(msg.data).then(sendResponse).catch(err => {
      sendResponse({ error: err.userMessage || err.message });
    });
    return true; // 异步
  }

  if (msg.type === 'fetch_export_image') {
    fetchExportImage(msg.data).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || 'Image fetch failed' });
    });
    return true; // 异步
  }

  if (msg.type === 'article_opened') {
    chrome.storage.local.get('history', (data) => {
      const history = data.history || [];
      history.unshift({ ...msg.data, timestamp: Date.now() });
      if (history.length > 200) history.length = 200;
      chrome.storage.local.set({ history });
    });
  }
});

async function fetchExportImage({ url } = {}) {
  const parsed = new URL(String(url || ''));
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error('Unsupported image URL');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXPORT_IMAGE_FETCH_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(parsed.href, {
      credentials: 'omit',
      cache: 'force-cache',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    throw new Error('Fetched URL is not an image');
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > EXPORT_IMAGE_FETCH_MAX_BYTES) {
    throw new Error('Image is too large for export inlining');
  }

  return {
    dataUrl: arrayBufferToDataUrl(arrayBuffer, contentType),
    bytes: arrayBuffer.byteLength,
    contentType
  };
}

function arrayBufferToDataUrl(arrayBuffer, mime) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }

  return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
}

// ============================================
// 翻译路由
// ============================================
async function handleTranslate({ texts, from, to, providerOverride, configOverride, context, contentType, cacheScope }) {
  // One-shot settings read — avoids repeated chrome.storage.local.get calls in sub-functions
  const settingsKeys = ['translationProvider', 'targetLang'];
  const provider = providerOverride || 'google';
  if (!providerOverride) settingsKeys.push('translationProvider');
  // Pre-fetch provider config keys to avoid a second storage read in loadProviderConfig
  const resolvedProvider = providerOverride || 'google';
  if (resolvedProvider !== 'google' && resolvedProvider !== 'microsoft') {
    settingsKeys.push(`${resolvedProvider}_apiKey`, `${resolvedProvider}_model`, `${resolvedProvider}_endpoint`);
  }
  const allSettings = await chrome.storage.local.get(settingsKeys);
  const finalProvider = providerOverride || allSettings.translationProvider || 'google';
  // If provider changed after pre-fetch, load its config keys too
  const providerConfig = (finalProvider !== 'google' && finalProvider !== 'microsoft')
    ? {
        apiKey: allSettings[`${finalProvider}_apiKey`] || '',
        model: allSettings[`${finalProvider}_model`] || '',
        endpoint: allSettings[`${finalProvider}_endpoint`] || ''
      }
    : null;
  const mergedConfigOverride = providerConfig && !configOverride
    ? providerConfig
    : configOverride;
  const targetLang = to || allSettings.targetLang || 'zh-CN';
  const safeTexts = Array.isArray(texts) ? texts : [];
  const LANG_NAMES = { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian', 'pt': 'Portuguese', 'it': 'Italian', 'ar': 'Arabic' };
  const langName = LANG_NAMES[targetLang] || targetLang;
  const promptContext = buildPromptContext(context);
  const providerIdentity = await resolveProviderIdentity(finalProvider, mergedConfigOverride);
  const cacheMeta = {
    provider: finalProvider,
    targetLang,
    contentType: contentType || 'body',
    context: promptContext,
    providerIdentity,
    cacheScope: buildCacheScope(cacheScope)
  };

  try {
    return await translateWithCache({
      texts: safeTexts,
      cacheMeta,
      translateMissing: (missingTexts) => translateProvider({
        texts: missingTexts,
        targetLang,
        langName,
        provider: finalProvider,
        configOverride: mergedConfigOverride,
        promptContext,
        contentType
      })
    });
  } catch (error) {
    const wrapped = new Error(formatTranslationError(finalProvider, error));
    wrapped.userMessage = formatTranslationError(finalProvider, error);
    throw wrapped;
  }
}

async function translateProvider({ texts, targetLang, langName, provider, configOverride, promptContext, contentType }) {
  switch (provider) {
    case 'google':
      return googleTranslate(texts, targetLang);
    case 'microsoft':
      return microsoftTranslate(texts, targetLang);
    case 'deepl':
      return deeplTranslate(texts, targetLang, langName, provider, configOverride);
    case 'claude':
    case 'custom_claude':
      return claudeTranslate(texts, targetLang, langName, provider, configOverride, promptContext, contentType);
    default:
      return openaiTranslate(texts, targetLang, langName, provider, configOverride, promptContext, contentType);
  }
}

async function translateWithCache({ texts, cacheMeta, translateMissing }) {
  if (!texts.length) return { translations: [] };
  if (!cacheMeta?.cacheScope?.articleHash) {
    return translateMissing(texts);
  }

  const now = Date.now();
  const cache = await readTranslationCache();
  const translations = new Array(texts.length).fill('');
  const misses = [];
  let cacheHits = 0;

  texts.forEach((text, index) => {
    const original = String(text || '');
    if (!original.trim()) return;
    const key = buildTranslationCacheKey(cacheMeta, original);
    const entry = cache.entries[key];
    if (entry && typeof entry.text === 'string' && entry.text.trim()) {
      translations[index] = entry.text;
      cacheHits++;
      return;
    }
    misses.push({ index, key, text: original });
  });

  if (misses.length === 0) {
    return { translations, cacheHits, cacheMisses: 0 };
  }

  const response = await translateMissing(misses.map(item => item.text));
  const missingTranslations = Array.isArray(response?.translations) ? response.translations : [];

  const newCacheEntries = {};
  misses.forEach((item, idx) => {
    const translated = missingTranslations[idx] || '';
    translations[item.index] = translated;
    if (translated && String(translated).trim()) {
      newCacheEntries[item.key] = {
        text: translated,
        createdAt: now
      };
    }
  });

  // Use merge-based write to avoid race condition with concurrent translation workers
  await mergeTranslationCacheEntries(newCacheEntries);
  return { translations, cacheHits, cacheMisses: misses.length };
}

async function readTranslationCache(bypassMemory = false) {
  // Check in-memory cache first (includes pending entries)
  if (!bypassMemory && _memoryCacheEntries && (Date.now() - _memoryCacheLoadedAt) < MEMORY_CACHE_TTL_MS) {
    // Merge pending entries into a view (without mutating memory cache)
    const merged = Object.keys(_pendingCacheEntries).length > 0
      ? Object.assign({}, _memoryCacheEntries, _pendingCacheEntries)
      : _memoryCacheEntries;
    return { version: TRANSLATION_CACHE_VERSION, entries: merged };
  }
  try {
    const data = await chrome.storage.local.get(TRANSLATION_CACHE_KEY);
    const cache = data[TRANSLATION_CACHE_KEY];
    if (!cache || cache.version !== TRANSLATION_CACHE_VERSION || !cache.entries || typeof cache.entries !== 'object') {
      _memoryCacheEntries = {};
      _memoryCacheLoadedAt = Date.now();
      return { version: TRANSLATION_CACHE_VERSION, entries: {} };
    }
    _memoryCacheEntries = cache.entries;
    _memoryCacheLoadedAt = Date.now();
    // Include any pending entries not yet flushed
    if (Object.keys(_pendingCacheEntries).length > 0) {
      const merged = Object.assign({}, cache.entries, _pendingCacheEntries);
      return { version: cache.version, entries: merged };
    }
    return cache;
  } catch (error) {
    return { version: TRANSLATION_CACHE_VERSION, entries: {} };
  }
}

async function writeTranslationCache(cache) {
  try {
    pruneTranslationCache(cache);
    await chrome.storage.local.set({ [TRANSLATION_CACHE_KEY]: cache });
  } catch (error) {
    console.warn('[NewsForge] Translation cache write skipped:', error?.message || error);
  }
}

// Merge-based cache write: reads latest cache, merges new entries, then writes.
// Prevents concurrent translation workers from overwriting each other's cache entries.
// Uses debounced batching to reduce storage I/O under concurrent chunk translation.
let _pendingCacheEntries = {};
let _cacheFlushTimer = null;
const CACHE_FLUSH_DELAY_MS = 1500;

// In-memory cache layer — avoids repeated chrome.storage.local deserialization
let _memoryCacheEntries = null;
let _memoryCacheLoadedAt = 0;
const MEMORY_CACHE_TTL_MS = 60000; // refresh from storage every 60s

async function mergeTranslationCacheEntries(newEntries) {
  if (!newEntries || Object.keys(newEntries).length === 0) return;
  Object.assign(_pendingCacheEntries, newEntries);
  // Also update in-memory cache immediately so concurrent chunks can hit these entries
  if (_memoryCacheEntries) Object.assign(_memoryCacheEntries, newEntries);
  if (_cacheFlushTimer) clearTimeout(_cacheFlushTimer);
  _cacheFlushTimer = setTimeout(() => flushPendingCacheEntries(), CACHE_FLUSH_DELAY_MS);
}

async function flushPendingCacheEntries() {
  _cacheFlushTimer = null;
  const entries = _pendingCacheEntries;
  _pendingCacheEntries = {};
  if (Object.keys(entries).length === 0) return;
  try {
    const cache = await readTranslationCache(true); // bypass memory cache for flush
    Object.assign(cache.entries, entries);
    pruneTranslationCache(cache);
    await chrome.storage.local.set({ [TRANSLATION_CACHE_KEY]: cache });
    // Update memory cache after successful write
    _memoryCacheEntries = cache.entries;
    _memoryCacheLoadedAt = Date.now();
  } catch (error) {
    // Put entries back to retry on next flush
    Object.assign(_pendingCacheEntries, entries);
    console.warn('[NewsForge] Translation cache merge skipped:', error?.message || error);
  }
}

// Flush pending cache entries before SW suspends to prevent data loss
if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('activate', () => {
    // Periodically flush if there are pending entries (safety net)
    setInterval(() => {
      if (Object.keys(_pendingCacheEntries).length > 0) {
        flushPendingCacheEntries();
      }
    }, 5000);
  });
}

function pruneTranslationCache(cache) {
  const entries = Object.entries(cache.entries || {});
  if (entries.length <= TRANSLATION_CACHE_MAX_ENTRIES) return;
  entries.sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
  // Prune to 75% capacity to avoid oscillating around the limit
  cache.entries = Object.fromEntries(entries.slice(0, Math.floor(TRANSLATION_CACHE_MAX_ENTRIES * 0.75)));
}

function buildCacheScope(cacheScope = {}) {
  return {
    articleUrl: typeof cacheScope.articleUrl === 'string' ? cacheScope.articleUrl.slice(0, 500) : '',
    articleHash: typeof cacheScope.articleHash === 'string' ? cacheScope.articleHash.slice(0, 80) : ''
  };
}

async function resolveProviderIdentity(provider, override = {}) {
  if (provider === 'google' || provider === 'microsoft') {
    return { model: '', endpoint: '', providerType: PROVIDERS[provider]?.type || '' };
  }
  const cfg = await loadProviderConfig(provider, override);
  return {
    model: cfg.model || PROVIDERS[provider]?.model || '',
    endpoint: cfg.endpoint || PROVIDERS[provider]?.endpoint || '',
    providerType: PROVIDERS[provider]?.type || ''
  };
}

function hashForCache(text = '') {
  let hash = 2166136261;
  const input = String(text);
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (!value || typeof value !== 'object') return String(value || '');
  return Object.keys(value)
    .sort()
    .map(key => `${key}:${stableStringify(value[key])}`)
    .join('|');
}

function buildTranslationCacheKey(meta, text) {
  const identity = meta.providerIdentity || {};
  const scope = meta.cacheScope || {};
  return [
    TRANSLATION_CACHE_VERSION,
    meta.provider || '',
    meta.targetLang || '',
    identity.providerType || '',
    identity.model || '',
    identity.endpoint || '',
    meta.contentType || '',
    scope.articleUrl || '',
    scope.articleHash || '',
    hashForCache(stableStringify(meta.context || {})),
    hashForCache(text)
  ].join('|');
}

function buildPromptContext(context = {}) {
  const cleaned = {};
  const entries = [
    ['source', 80],
    ['title', 240],
    ['summary', 360],
    ['terms', 2200]
  ];

  for (const [key, maxLen] of entries) {
    const value = typeof context[key] === 'string' ? context[key].replace(/\s+/g, ' ').trim() : '';
    if (value) cleaned[key] = value.slice(0, maxLen);
  }

  return cleaned;
}

function buildTranslationInput(texts) {
  return texts.map((text, index) => ({
    id: index,
    text: text == null ? '' : String(text)
  }));
}

function getContentTypeLabel(contentType) {
  switch (contentType) {
    case 'headline':
      return 'headline';
    case 'standfirst':
      return 'standfirst';
    case 'heading':
      return 'section heading';
    default:
      return 'body';
  }
}

function buildContextBlock(context) {
  const sanitize = (str) => String(str || '').replace(/\n/g, ' ').slice(0, 500);
  const lines = [];
  if (context.source) lines.push(`Source: ${sanitize(context.source)}`);
  if (context.title) lines.push(`Title: ${sanitize(context.title)}`);
  if (context.summary) lines.push(`Standfirst: ${sanitize(context.summary)}`);
  if (context.terms) lines.push(`Full-article terminology hints:\n${String(context.terms || '').slice(0, 2000)}`);
  return lines.length ? `Context:\n${lines.join('\n')}` : '';
}

function buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts }) {
  const contentLabel = getContentTypeLabel(contentType);
  const input = buildTranslationInput(texts);
  const inputJson = JSON.stringify(input);
  const contextBlock = buildContextBlock(context);
  const isMTModel = typeof model === 'string' && model.startsWith('qwen-mt-');
  const isHeadline = contentType === 'headline';
  const isChinese = /chinese/i.test(langName);

  if (isMTModel) {
    const systemPrompt = isHeadline
      ? `Translate the input news headline into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings.`
      : `Translate the input news ${contentLabel} into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings in the same order as the input array.`;

    const mtUserLines = [
      contextBlock,
      'Use the context only to resolve ambiguity. Do not translate the instructions.',
      'For every person, organization, and place name, choose one target-language form and reuse it consistently across this article.',
    ];
    if (isChinese) {
      mtUserLines.push(
        'For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible.',
        "If a segment only has a surname or partial name, resolve it against the full-name hints first. For example, if Cheng is linked to a full name, translate Cheng using that person\u2019s chosen Chinese surname; do not alternate between \u7a0b/\u90d1/\u6210 or add \u5973\u58eb/\u5148\u751f unless present in the source.",
        'Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.'
      );
    }
    mtUserLines.push('Input JSON array:', JSON.stringify(texts));

    const userPrompt = mtUserLines.filter(Boolean).join('\n\n');

    return { systemPrompt, userPrompt, useSystemRole: false };
  }

  // Build Chinese-specific name rules conditionally
  const chineseHeadlineRules = isChinese ? `
5. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the article context and known news usage when possible.
6. Resolve surname-only or partial-name mentions against the full-name terminology hints.
7. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
` : '';
  const chineseBodyRules = isChinese ? `
6. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible. Do not default to English if the news context supports a Chinese rendering.
7. Resolve surname-only or partial-name mentions against the full-name terminology hints. If the article links "Cheng" to one full name, translate every "Cheng" mention using that same chosen Chinese surname.
8. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
9. Never alternate between different Chinese characters for the same romanized person name in one article, such as \u7a0b/\u90d1/\u6210 or different given names.
10. Do not add honorifics such as Ms., Mr., \u5973\u58eb, or \u5148\u751f unless they are present in the source text.
` : '';
  const hlJsonRule = isChinese ? 8 : 5;
  const bdQuoteRule = isChinese ? 11 : 6;
  const bdHeadingRule = isChinese ? 12 : 7;
  const bdContextRule = isChinese ? 13 : 8;
  const bdOrderRule = isChinese ? 14 : 9;

  const systemPrompt = isHeadline
    ? `You are a professional native-level news headline translator working into ${langName}.

Rules:
1. Produce a concise, natural, publication-ready news headline.
2. Preserve the original meaning, tone, and news angle.
3. Keep names, numbers, dates, and factual claims accurate.
4. Use one consistent target-language form for every person, organization, and place name across the article.
${chineseHeadlineRules}${hlJsonRule}. Return ONLY valid JSON \u2014 no explanations, no markdown fences, no commentary before or after the JSON.

Output format (strictly follow this structure):
{"translations":[{"id":0,"text":"..."}]}`
    : `You are a professional native-level news translator working into ${langName}.

Translate with the standards of a high-quality news desk.

Rules:
1. Return ONLY valid JSON \u2014 no explanations, no markdown fences, no commentary before or after the JSON.
2. Preserve facts, numbers, dates, and attributions exactly.
3. Keep the journalistic tone, register, and structure appropriate for news writing.
4. Use the established target-language form for people, organizations, and places when one clearly exists; otherwise preserve the original term.
5. Maintain one consistent target-language rendering for every named entity across all chunks of this article. Do not alternate between variants.
${chineseBodyRules}${bdQuoteRule}. Translate quotes faithfully without adding interpretation.
${bdHeadingRule}. Keep section headings concise and news-style.
${bdContextRule}. Use any provided context only to disambiguate meaning; do not introduce information not present in the segment itself.
${bdOrderRule}. Return translations in the same order as the input.

Output format (strictly follow this structure):
{"translations":[{"id":0,"text":"..."},{"id":1,"text":"..."}]}`;

  const userPrompt = [
    contextBlock,
    `Translate the following news ${contentLabel} into ${langName}.`,
    'Input:',
    inputJson
  ].filter(Boolean).join('\n\n');

  return { systemPrompt, userPrompt, useSystemRole: true };
}

function providerDisplayName(provider) {
  return PROVIDERS[provider]?.name || provider;
}

function formatTranslationError(provider, error) {
  const providerName = providerDisplayName(provider);
  const raw = (error && error.message ? error.message : String(error || '')).trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return `${providerName} 翻译失败，请稍后重试。`;
  }

  if (provider === 'deepl' && lower.includes('deepl request failed')) {
    return '无法连接到 DeepL。请重载扩展后重试；如果你使用的是 Pro Key，请在设置页切换到 Pro API。';
  }

  if (raw.includes('All configured DeepL API keys have exceeded their quota')) {
    return 'DeepL 所有 API Key 额度均已用尽，请更换 Key 或切换翻译服务。';
  }

  if ((lower.includes('configure') || lower.includes('missing') || lower.includes('required')) && lower.includes('api key')) {
    return `未配置 ${providerName} API Key。请先在设置页填写后重试。`;
  }

  if ((lower.includes('configure') || lower.includes('missing') || lower.includes('required')) && lower.includes('endpoint')) {
    return `${providerName} 未配置 API Endpoint。请在设置页补充后重试。`;
  }

  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication') ||
    lower.includes('auth failed')
  ) {
    return `${providerName} 认证失败，请检查 API Key 是否正确。`;
  }

  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('too many requests')
  ) {
    return `${providerName} 请求被限制或额度不足，请稍后重试。`;
  }

  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('over capacity')
  ) {
    return `${providerName} 服务繁忙（503），请稍后重试，或切换到其他模型。`;
  }

  if (
    lower.includes('model') &&
    (
      lower.includes('not found') ||
      lower.includes('unsupported') ||
      lower.includes('does not exist') ||
      lower.includes('invalid') ||
      lower.includes('no such')
    )
  ) {
    return '当前模型不可用，请改用预设模型或检查自定义模型名称。';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('fetch failed') ||
    lower.includes('request failed')
  ) {
    return `无法连接到 ${providerName}，请检查网络或 endpoint 设置。`;
  }

  if (lower.includes('empty response') || lower.includes('returned empty response')) {
    return `${providerName} 返回了空结果，请更换模型或稍后重试。`;
  }

  if (lower.includes('incomplete') || lower.includes('incomplete response')) {
    return `${providerName} 翻译结果不完整，请重试或切换到其他翻译服务。`;
  }

  return `${providerName} 翻译失败：${raw.slice(0, 180)}`;
}

function stripThinkingTokens(text) {
  if (typeof text !== 'string') return text;
  // Remove <think>...</think> blocks (Gemini 2.5, DeepSeek-R1, Qwen3 reasoning)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Handle <Thought>...</Thought> variant
  cleaned = cleaned.replace(/<Thought>[\s\S]*?<\/Thought>/gi, '');
  // Clean up any remaining orphaned tags (from nested or malformed blocks)
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/<\/?Thought>/gi, '');
  // Handle unclosed thinking blocks (model cut off mid-thinking)
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/<Thought>[\s\S]*$/gi, '');
  return cleaned.trim();
}

function extractTextFromLLMValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value
      .map(item => extractTextFromLLMValue(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof value === 'object') {
    const directKeys = [
      'text',
      'translation',
      'translatedText',
      'output_text',
      'output',
      'content',
      'value',
      'result'
    ];

    for (const key of directKeys) {
      if (key in value) {
        const extracted = extractTextFromLLMValue(value[key]);
        if (extracted) return extracted;
      }
    }

    if (Array.isArray(value.translations)) {
      const extracted = value.translations
        .map(item => extractTextFromLLMValue(item))
        .filter(Boolean)
        .join('\n')
        .trim();
      if (extracted) return extracted;
    }
  }

  return '';
}

function normalizeTranslationItem(item) {
  const text = extractTextFromLLMValue(item);
  if (text) return text;
  if (item == null) return '';
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

function parseJsonLikeTranslationLines(content) {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const cleaned = [];

  for (const line of lines) {
    if (/^[\[\]\{\}]$/.test(line)) continue;

    let candidate = line
      .replace(/^[\[,]\s*/, '')
      .replace(/\s*[,]\s*$/, '')
      .replace(/\s*[\]]\s*$/, '')
      .trim();

    if (!candidate) continue;

    // Try parsing as JSON object with text field (e.g., {"id":0,"text":"翻译"})
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        const obj = JSON.parse(candidate.replace(/,\s*$/, ''));
        const text = normalizeTranslationItem(obj);
        if (text) {
          cleaned.push(text);
          continue;
        }
      } catch {
        // fall through
      }
    }

    if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith('`') && candidate.endsWith('`'))) {
      try {
        const parsed = JSON.parse(candidate.replace(/^`|`$/g, '"'));
        if (typeof parsed === 'string' && parsed.trim()) {
          cleaned.push(parsed.trim());
          continue;
        }
      } catch {
        // fall through to string cleanup below
      }
    }

    candidate = candidate.replace(/^"+|"+$/g, '').trim();
    if (!candidate) continue;
    if (/^[\[\]\{\},:]+$/.test(candidate)) continue;
    // Skip lines that look like JSON keys/metadata rather than translations
    if (/^"?(id|text|translation|index)"?\s*:/.test(candidate)) continue;
    cleaned.push(candidate);
  }

  return cleaned;
}

function extractJsonString(content) {
  const trimmed = content.trim();

  // Strategy 1: Try as-is
  try { JSON.parse(trimmed); return trimmed; } catch {}

  // Strategy 2: Strip code fences aggressively (handles prefix text like "Here's the translation:\n```json")
  let cleaned = trimmed.replace(/^[^{[]*?```(?:json)?\s*\r?\n?/i, '');
  cleaned = cleaned.replace(/\r?\n?\s*```[^}\]]*$/, '');
  cleaned = cleaned.trim();
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // Strategy 3: Strip any non-JSON prefix text (e.g., "Here is the translation:\n{...}")
  const prefixStripped = trimmed.replace(/^[^{[]+/, '').trim();
  if (prefixStripped !== trimmed) {
    try { JSON.parse(prefixStripped); return prefixStripped; } catch {}
  }

  // Strategy 4: Find outermost { or [ and extract balanced JSON
  const source = cleaned.length < trimmed.length ? cleaned : trimmed;
  const startIdx = Math.min(
    source.indexOf('{') >= 0 ? source.indexOf('{') : Infinity,
    source.indexOf('[') >= 0 ? source.indexOf('[') : Infinity
  );
  if (startIdx < Infinity) {
    const openChar = source[startIdx];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0, inStr = false;
    for (let i = startIdx; i < source.length; i++) {
      const c = source[i];
      if (inStr) {
        if (c === '\\') { i++; continue; } // Skip escaped character entirely
        if (c === '"') { inStr = false; }
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      if (depth === 0) {
        const candidate = source.substring(startIdx, i + 1);
        try { JSON.parse(candidate); return candidate; } catch {}
        break;
      }
    }
  }

  return trimmed;
}

function parseLLMTranslations(rawContent, texts) {
  let translations;
  let content = typeof rawContent === 'string' ? rawContent : extractTextFromLLMValue(rawContent);
  // Strip thinking tokens from reasoning models (Gemini 2.5, DeepSeek-R1, Qwen3, etc.)
  content = stripThinkingTokens(content);
  // Strip BOM and normalize whitespace
  content = content.replace(/^\uFEFF/, '').trim();

  try {
    const jsonStr = extractJsonString(content);
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      translations = parsed.map(normalizeTranslationItem);
    } else if (parsed && Array.isArray(parsed.translations)) {
      translations = parsed.translations.map(normalizeTranslationItem);
    } else {
      translations = [normalizeTranslationItem(parsed)];
    }
  } catch {
    translations = parseJsonLikeTranslationLines(content);
    if (translations.length === 0) {
      // Last resort: split by newlines but filter out obvious junk
      translations = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !/^[\[\]\{\},:]+$/.test(line) && !/^```/.test(line))
        .map(line => line.replace(/^["'`]+|["'`]+$/g, '').trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(translations)) translations = [normalizeTranslationItem(translations)];
  // Use id field for alignment when count mismatch (LLM may skip or reorder items)
  if (translations.length !== texts.length) {
    console.warn(`[NewsForge] Translation count mismatch: expected ${texts.length}, got ${translations.length}`);
    // Try to align by id field if the parsed items were objects with id
    try {
      const jsonStr = extractJsonString(stripThinkingTokens(typeof rawContent === 'string' ? rawContent : extractTextFromLLMValue(rawContent)));
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : (parsed?.translations || []);
      if (Array.isArray(items) && items.some(it => it && typeof it === 'object' && 'id' in it)) {
        const aligned = new Array(texts.length).fill('');
        for (const item of items) {
          const id = Number(item?.id);
          if (!isNaN(id) && id >= 0 && id < texts.length) {
            aligned[id] = normalizeTranslationItem(item);
          }
        }
        // Only use aligned result if it has more non-empty entries
        const alignedCount = aligned.filter(t => t.trim()).length;
        const sequentialCount = translations.slice(0, texts.length).filter(t => String(t || '').trim()).length;
        if (alignedCount >= sequentialCount) {
          translations = aligned;
        }
      }
    } catch {
      // Alignment attempt failed, fall through to sequential padding
    }
  }
  while (translations.length < texts.length) translations.push('');

  // Detect incomplete translations — LLM may have truncated or returned partial results
  const nonEmptyCount = translations.slice(0, texts.length).filter(t => String(t).trim()).length;
  if (nonEmptyCount < texts.length && nonEmptyCount / texts.length < 0.7) {
    const err = new Error(`LLM returned incomplete translations: ${nonEmptyCount}/${texts.length}`);
    err.partial = true;
    throw err;
  }

  return translations.slice(0, texts.length);
}

// ============================================
// Google 翻译（免费，无需 API Key）— 批量模式
// ============================================
async function googleTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-TW' ? 'zh-TW' : targetLang === 'zh-CN' ? 'zh-CN' : targetLang;
  const concurrency = 8;
  const translations = new Array(texts.length);
  let nextIdx = 0;

  const worker = async () => {
    while (true) {
      const idx = nextIdx;
      if (idx >= texts.length) break;
      nextIdx = idx + 1;
      const text = texts[idx];
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            if (attempt < 2 && (resp.status === 429 || resp.status >= 500)) {
              await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 500));
              continue;
            }
            throw new Error(`Google Translate error: ${resp.status}`);
          }
          const data = await resp.json();
          let result = '';
          if (data && data[0]) {
            for (const part of data[0]) {
              if (part && part[0]) result += part[0];
            }
          }
          translations[idx] = result || text;
          break;
        } catch (err) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 500));
            continue;
          }
          console.warn('[NewsForge] Google Translate item failed:', err.message);
          translations[idx] = text;
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker());
  await Promise.all(workers);

  return { translations };
}

// ============================================
// 微软翻译（免费，通过 Edge token）
// ============================================
let msToken = null;
let msTokenExpiry = 0;
let msTokenPromise = null;

async function getMicrosoftToken() {
  if (msToken && Date.now() < msTokenExpiry) return msToken;

  // Deduplicate concurrent token fetch requests
  if (msTokenPromise) return msTokenPromise;

  msTokenPromise = (async () => {
    try {
      // Try restoring from session storage (survives SW restarts)
      if (!msToken) {
        const stored = await chrome.storage.session?.get(['msToken', 'msTokenExpiry']);
        if (stored?.msToken && stored.msTokenExpiry && Date.now() < stored.msTokenExpiry) {
          msToken = stored.msToken;
          msTokenExpiry = stored.msTokenExpiry;
          return msToken;
        }
      }

      const authResp = await fetch('https://edge.microsoft.com/translate/auth');
      if (!authResp.ok) throw new Error('Auth failed');
      msToken = await authResp.text();
      msTokenExpiry = Date.now() + 8 * 60 * 1000;
      chrome.storage.session?.set({ msToken, msTokenExpiry }).catch(() => {});
      return msToken;
    } catch (e) {
      throw new Error('Microsoft Translator auth failed, please try again or switch to another engine');
    } finally {
      msTokenPromise = null;
    }
  })();

  return msTokenPromise;
}

async function microsoftTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-CN' ? 'zh-Hans' : targetLang === 'zh-TW' ? 'zh-Hant' : targetLang;
  const body = JSON.stringify(texts.map(t => ({ text: t })));

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getMicrosoftToken();
    const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${lang}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body
    });

    if (response.ok) {
      const data = await response.json();
      const translations = data.map(d => d.translations?.[0]?.text || '');
      return { translations };
    }

    // On auth failure, invalidate token and retry once
    if (response.status === 401 && attempt === 0) {
      msToken = null;
      msTokenExpiry = 0;
      chrome.storage.session?.remove(['msToken', 'msTokenExpiry']).catch(() => {});
      continue;
    }

    msToken = null;
    chrome.storage.session?.remove(['msToken', 'msTokenExpiry']).catch(() => {});
    throw new Error(`Microsoft Translator error: ${response.status}`);
  }
}

// Providers/models that reliably support response_format: {"type":"json_object"}
const JSON_MODE_PROVIDERS = new Set(['openai', 'gemini', 'glm', 'kimi']);

function supportsJsonMode(provider, model) {
  if (JSON_MODE_PROVIDERS.has(provider)) return true;
  // OpenRouter: only OpenAI models reliably support JSON mode through the proxy.
  // Google Gemini/Gemma via OpenRouter may produce garbled output when
  // response_format is set — especially thinking models (2.5 series) and free-tier models.
  if (provider === 'openrouter') {
    const m = (model || '').toLowerCase();
    return m.includes('openai/');
  }
  // DeepSeek: only deepseek-chat supports JSON mode; deepseek-reasoner does not
  if (provider === 'deepseek') {
    return (model || '').toLowerCase() === 'deepseek-chat';
  }
  // Qwen: non-MT models support JSON mode
  if (provider === 'qwen') {
    return !(typeof model === 'string' && model.startsWith('qwen-mt-'));
  }
  return false;
}

// ============================================
// OpenAI 兼容翻译
// ============================================
async function openaiTranslate(texts, targetLang, langName, provider, configOverride, context, contentType) {
  const cfg = await loadProviderConfig(provider, configOverride);
  const apiKey = cfg.apiKey;
  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const endpoint = cfg.endpoint || PROVIDERS[provider]?.endpoint || '';

  if (!apiKey) throw new Error('Please configure API Key in settings');
  if (!endpoint) throw new Error('Please configure API Endpoint in settings');

  const prompt = buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts });
  const messages = prompt.useSystemRole
    ? [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt }
      ]
    : [
        { role: 'user', content: `${prompt.systemPrompt}\n\n${prompt.userPrompt}` }
      ];

  const requestBody = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: Math.max(4096, Math.min(16384, texts.reduce((sum, t) => sum + String(t).length, 0) * 4))
  };

  // Enable JSON mode for compatible providers to avoid garbled/mixed output
  if (supportsJsonMode(provider, model)) {
    requestBody.response_format = { type: 'json_object' };
  }

  const body = JSON.stringify(requestBody);

  const fetchHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  if (provider === 'openrouter') {
    fetchHeaders['HTTP-Referer'] = 'https://github.com/zhaodengfeng/newsforge';
    fetchHeaders['X-Title'] = 'NewsForge';
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
    let response;
    try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: fetchHeaders,
      body,
      signal: controller.signal
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('API returned empty response');
      return { translations: parseLLMTranslations(content, texts) };
    }

    const errText = await response.text();
    const isRetryable = response.status === 503 || response.status === 529 || response.status === 429 || /unavailable|overloaded|rate.?limit/i.test(errText);
    if (attempt < maxRetries && isRetryable) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000));
      continue;
    }

    throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`${providerDisplayName(provider)} request timed out after ${LLM_FETCH_TIMEOUT_MS / 1000}s`);
      }
      // Retry on transient network errors (DNS, TCP reset, TLS handshake, etc.)
      if (attempt < maxRetries && (err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('ECONNRESET') || err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED'))) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================
// Claude API 翻译
// ============================================
async function claudeTranslate(texts, targetLang, langName, provider, configOverride, context, contentType) {
  const cfg = await loadProviderConfig(provider, configOverride);
  const apiKey = cfg.apiKey;
  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const endpoint = cfg.endpoint || PROVIDERS[provider]?.endpoint || '';

  if (!apiKey) throw new Error('Please configure API Key in settings');
  if (!endpoint) throw new Error('Please configure API Endpoint in settings');
  const prompt = buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts });

  const requestBody = JSON.stringify({
    model,
    max_tokens: 8192,
    temperature: 0.3,
    system: prompt.systemPrompt,
    messages: [
      { role: 'user', content: prompt.userPrompt }
    ]
  });

  const fetchHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
    try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: fetchHeaders,
      body: requestBody,
      signal: controller.signal
    });

    if (response.ok) {
      const data = await response.json();
      const content = Array.isArray(data.content) && data.content[0]?.text ? data.content[0].text : null;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Claude API returned empty or invalid response');
      return { translations: parseLLMTranslations(content, texts) };
    }

    const errText = await response.text();
    const isRetryable = response.status === 503 || response.status === 529 || response.status === 429 || /overloaded|rate.?limit/i.test(errText);
    if (attempt < maxRetries && isRetryable) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000));
      continue;
    }

    throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        throw new Error(`Claude request timed out after ${LLM_FETCH_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================
// DeepL API 翻译
// ============================================
// DeepL API key rotation state (in-memory, resets on service worker reload)
let deeplKeyIndex = 0;

// ============================================
// DeepL API 翻译
// ============================================
async function deeplTranslate(texts, targetLang, langName, provider, configOverride) {
  const cfg = await loadProviderConfig(provider, configOverride);
  const endpoint = cfg.endpoint || PROVIDERS.deepl.endpoint;

  // Support multiple API keys from deepl_apiKeys
  let apiKeys = [];
  if (cfg.apiKeys && Array.isArray(cfg.apiKeys) && cfg.apiKeys.length > 0) {
    apiKeys = cfg.apiKeys;
  } else if (cfg.apiKey) {
    apiKeys = [cfg.apiKey];
  }

  if (apiKeys.length === 0) throw new Error('Please configure DeepL API Key in settings');

  // Fix: zh-CN → ZH-HANS, zh-TW → ZH-HANT (DeepL v2 requires specific codes)
  const deeplLang = targetLang === 'zh-CN' ? 'ZH-HANS' : targetLang === 'zh-TW' ? 'ZH-HANT' : targetLang.toUpperCase();

  const params = new URLSearchParams();
  texts.forEach(t => params.append('text', t));
  params.append('target_lang', deeplLang);

  const maxRetries = 3;
  const maxKeyAttempts = apiKeys.length;
  let keyAttempt = 0;

  while (keyAttempt < maxKeyAttempts) {
    // Pick the current key (respecting the rotation index for multi-key)
    const currentIdx = (deeplKeyIndex + keyAttempt) % apiKeys.length;
    const apiKey = apiKeys[currentIdx];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `DeepL-Auth-Key ${apiKey}`
          },
          body: params.toString(),
          signal: controller.signal
        });

        if (response.ok) {
          // Success — persist the working key index
          deeplKeyIndex = currentIdx;
          const data = await response.json();
          const translations = data.translations?.map(t => t.text || '') || [];
          while (translations.length < texts.length) translations.push('');
          return { translations };
        }

        const errText = await response.text();
        const isRetryable = response.status === 429 || response.status === 503 || response.status === 529;
        if (attempt < maxRetries && isRetryable) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000));
          continue;
        }

        // Non-retryable error or all retries exhausted — try next key if quota-related
        const isQuotaError = response.status === 429 || errText.toLowerCase().includes('quota');
        if (isQuotaError && apiKeys.length > 1 && keyAttempt < maxKeyAttempts - 1) {
          keyAttempt++;
          break; // break inner retry loop, try next key
        }

        throw new Error(`DeepL error ${response.status}: ${errText.substring(0, 200)}`);
      } catch (err) {
        if (err.name === 'AbortError') {
          if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          // Timeout — try next key if available
          if (apiKeys.length > 1 && keyAttempt < maxKeyAttempts - 1) { keyAttempt++; break; }
          throw new Error(`DeepL request timed out after ${LLM_FETCH_TIMEOUT_MS / 1000}s`);
        }
        if (attempt < maxRetries && (err.message?.includes('fetch') || err.message?.includes('network'))) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        // Network error — try next key if available
        if (apiKeys.length > 1 && keyAttempt < maxKeyAttempts - 1) { keyAttempt++; break; }
        if (err.message?.includes('DeepL error')) throw err;
        throw new Error('DeepL request failed. Reload the extension to accept the new permission, then try again. If you use a Pro key, set the endpoint to https://api.deepl.com/v2/translate in settings.');
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  // All keys exhausted
  throw new Error('All configured DeepL API keys have exceeded their quota.');
}

// ============================================
// 辅助：加载服务商配置
// ============================================
async function loadProviderConfig(provider, override = {}) {
  const keys = [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`];
  if (provider === 'deepl') keys.push('deepl_apiKeys');
  const data = await chrome.storage.local.get(keys);
  return {
    apiKey: Object.prototype.hasOwnProperty.call(override, 'apiKey') ? (override.apiKey || '') : (data[`${provider}_apiKey`] || ''),
    apiKeys: provider === 'deepl' ? (data.deepl_apiKeys || []) : [],
    model: Object.prototype.hasOwnProperty.call(override, 'model') ? (override.model || '') : (data[`${provider}_model`] || ''),
    endpoint: Object.prototype.hasOwnProperty.call(override, 'endpoint') ? (override.endpoint || '') : (data[`${provider}_endpoint`] || '')
  };
}
