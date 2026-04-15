// NewsForge Background Service Worker
importScripts('providers.js');

const TRANSLATION_CACHE_VERSION = 'translation-cache-v1';
const TRANSLATION_CACHE_KEY = 'translationCache';
const TRANSLATION_CACHE_MAX_ENTRIES = 1200;
const EXPORT_IMAGE_FETCH_MAX_BYTES = 15 * 1024 * 1024;
const EXPORT_IMAGE_FETCH_TIMEOUT_MS = 12000;

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
  const settings = await chrome.storage.local.get(['translationProvider', 'targetLang']);
  const provider = providerOverride || settings.translationProvider || 'google';
  const targetLang = to || settings.targetLang || 'zh-CN';
  const safeTexts = Array.isArray(texts) ? texts : [];
  const LANG_NAMES = { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian', 'pt': 'Portuguese', 'it': 'Italian', 'ar': 'Arabic' };
  const langName = LANG_NAMES[targetLang] || targetLang;
  const promptContext = buildPromptContext(context);
  const providerIdentity = await resolveProviderIdentity(provider, configOverride);
  const cacheMeta = {
    provider,
    targetLang,
    contentType: contentType || 'body',
    context: promptContext,
    providerIdentity,
    cacheScope: buildCacheScope(cacheScope)
  };

  try {
    return translateWithCache({
      texts: safeTexts,
      cacheMeta,
      translateMissing: (missingTexts) => translateProvider({
        texts: missingTexts,
        targetLang,
        langName,
        provider,
        configOverride,
        promptContext,
        contentType
      })
    });
  } catch (error) {
    const wrapped = new Error(formatTranslationError(provider, error));
    wrapped.userMessage = formatTranslationError(provider, error);
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

  misses.forEach((item, idx) => {
    const translated = missingTranslations[idx] || '';
    translations[item.index] = translated;
    if (translated && String(translated).trim()) {
      cache.entries[item.key] = {
        text: translated,
        createdAt: now
      };
    }
  });

  await writeTranslationCache(cache);
  return { translations, cacheHits, cacheMisses: misses.length };
}

async function readTranslationCache() {
  try {
    const data = await chrome.storage.local.get(TRANSLATION_CACHE_KEY);
    const cache = data[TRANSLATION_CACHE_KEY];
    if (!cache || cache.version !== TRANSLATION_CACHE_VERSION || !cache.entries || typeof cache.entries !== 'object') {
      return { version: TRANSLATION_CACHE_VERSION, entries: {} };
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

function pruneTranslationCache(cache) {
  const entries = Object.entries(cache.entries || {});
  if (entries.length <= TRANSLATION_CACHE_MAX_ENTRIES) return;
  entries.sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
  cache.entries = Object.fromEntries(entries.slice(0, TRANSLATION_CACHE_MAX_ENTRIES));
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
  const lines = [];
  if (context.source) lines.push(`Source: ${context.source}`);
  if (context.title) lines.push(`Title: ${context.title}`);
  if (context.summary) lines.push(`Standfirst: ${context.summary}`);
  if (context.terms) lines.push(`Full-article terminology hints:\n${context.terms}`);
  return lines.length ? `Context:\n${lines.join('\n')}` : '';
}

function buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts }) {
  const contentLabel = getContentTypeLabel(contentType);
  const input = buildTranslationInput(texts);
  const inputJson = JSON.stringify(input);
  const contextBlock = buildContextBlock(context);
  const isMTModel = typeof model === 'string' && model.startsWith('qwen-mt-');
  const isHeadline = contentType === 'headline';

  if (isMTModel) {
    const systemPrompt = isHeadline
      ? `Translate the input news headline into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings.`
      : `Translate the input news ${contentLabel} into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings in the same order as the input array.`;

    const userPrompt = [
      contextBlock,
      'Use the context only to resolve ambiguity. Do not translate the instructions.',
      'For every person, organization, and place name, choose one target-language form and reuse it consistently across this article.',
      'For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible.',
      'If a segment only has a surname or partial name, resolve it against the full-name hints first. For example, if Cheng is linked to a full name, translate Cheng using that person’s chosen Chinese surname; do not alternate between 程/郑/成 or add 女士/先生 unless present in the source.',
      'Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.',
      'Input JSON array:',
      JSON.stringify(texts)
    ].filter(Boolean).join('\n\n');

    return { systemPrompt, userPrompt, useSystemRole: false };
  }

  const systemPrompt = isHeadline
    ? `You are a professional native-level news headline translator working into ${langName}.

Rules:
1. Produce a concise, natural, publication-ready news headline.
2. Preserve the original meaning, tone, and news angle.
3. Keep names, numbers, dates, and factual claims accurate.
4. Use one consistent target-language form for every person, organization, and place name across the article.
5. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the article context and known news usage when possible.
6. Resolve surname-only or partial-name mentions against the full-name terminology hints.
7. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
8. Return only valid JSON.

Output format:
{"translations":[{"id":0,"text":"..."}]}`
    : `You are a professional native-level news translator working into ${langName}.

Translate with the standards of a high-quality news desk.

Rules:
1. Return only valid JSON.
2. Preserve facts, numbers, dates, and attributions exactly.
3. Keep the journalistic tone, register, and structure appropriate for news writing.
4. Use the established target-language form for people, organizations, and places when one clearly exists; otherwise preserve the original term.
5. Maintain one consistent target-language rendering for every named entity across all chunks of this article. Do not alternate between variants.
6. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible. Do not default to English if the news context supports a Chinese rendering.
7. Resolve surname-only or partial-name mentions against the full-name terminology hints. If the article links "Cheng" to one full name, translate every "Cheng" mention using that same chosen Chinese surname.
8. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
9. Never alternate between different Chinese characters for the same romanized person name in one article, such as 程/郑/成 or different given names.
10. Do not add honorifics such as Ms., Mr., 女士, or 先生 unless they are present in the source text.
11. Translate quotes faithfully without adding interpretation.
12. Keep section headings concise and news-style.
13. Use any provided context only to disambiguate meaning; do not introduce information not present in the segment itself.
14. Return translations in the same order as the input.

Output format:
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

  return `${providerName} 翻译失败：${raw.slice(0, 180)}`;
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
    cleaned.push(candidate);
  }

  return cleaned;
}

function parseLLMTranslations(rawContent, texts) {
  let translations;
  const content = typeof rawContent === 'string' ? rawContent : extractTextFromLLMValue(rawContent);

  try {
    const cleaned = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const parsed = JSON.parse(cleaned);
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
      translations = content.split('\n').map(line => line.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(translations)) translations = [normalizeTranslationItem(translations)];
  while (translations.length < texts.length) translations.push('');
  return translations.slice(0, texts.length);
}

// ============================================
// Google 翻译（免费，无需 API Key）— 批量模式
// ============================================
async function googleTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-TW' ? 'zh-TW' : targetLang === 'zh-CN' ? 'zh-CN' : targetLang;

  // Use sequential requests — Google batch response format is unreliable for multi-text
  const translations = [];
  for (const text of texts) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Google Translate error: ${resp.status}`);
    const data = await resp.json();
    let result = '';
    if (data && data[0]) {
      for (const part of data[0]) {
        if (part && part[0]) result += part[0];
      }
    }
    translations.push(result || text);
  }

  return { translations };
}

// ============================================
// 微软翻译（免费，通过 Edge token）
// ============================================
let msToken = null;
let msTokenExpiry = 0;

async function getMicrosoftToken() {
  if (msToken && Date.now() < msTokenExpiry) return msToken;

  // Try restoring from session storage (survives SW restarts)
  if (!msToken) {
    const stored = await chrome.storage.session?.get(['msToken', 'msTokenExpiry']);
    if (stored?.msToken && stored.msTokenExpiry && Date.now() < stored.msTokenExpiry) {
      msToken = stored.msToken;
      msTokenExpiry = stored.msTokenExpiry;
      return msToken;
    }
  }

  try {
    const authResp = await fetch('https://edge.microsoft.com/translate/auth');
    if (!authResp.ok) throw new Error('Auth failed');
    msToken = await authResp.text();
    msTokenExpiry = Date.now() + 8 * 60 * 1000;
    // Persist to session storage
    chrome.storage.session?.set({ msToken, msTokenExpiry }).catch(() => {});
    return msToken;
  } catch (e) {
    throw new Error('Microsoft Translator auth failed, please try again or switch to another engine');
  }
}

async function microsoftTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-CN' ? 'zh-Hans' : targetLang === 'zh-TW' ? 'zh-Hant' : targetLang;

  const token = await getMicrosoftToken();

  const body = texts.map(t => ({ text: t }));
  const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${lang}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    msToken = null;
    chrome.storage.session?.remove('msToken').catch(() => {});
    throw new Error(`Microsoft Translator error: ${response.status}`);
  }

  const data = await response.json();
  const translations = data.map(d => d.translations?.[0]?.text || '');
  return { translations };
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

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.3
  });

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('API returned empty response');
      return { translations: parseLLMTranslations(content, texts) };
    }

    const errText = await response.text();
    const isRetryable = response.status === 503 || response.status === 529 || /unavailable|overloaded/i.test(errText);
    if (attempt < maxRetries && isRetryable) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      continue;
    }

    throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: prompt.systemPrompt,
      messages: [
        { role: 'user', content: prompt.userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || data.content;
  if (!content) throw new Error('Claude API returned empty response');
  return { translations: parseLLMTranslations(content, texts) };
}

// ============================================
// DeepL API 翻译
// ============================================
async function deeplTranslate(texts, targetLang, langName, provider, configOverride) {
  const cfg = await loadProviderConfig(provider, configOverride);
  const apiKey = cfg.apiKey;
  const endpoint = cfg.endpoint || PROVIDERS.deepl.endpoint;

  if (!apiKey) throw new Error('Please configure DeepL API Key in settings');

  // Fix: zh-CN → ZH-HANS, zh-TW → ZH-HANT (DeepL v2 requires specific codes)
  const deeplLang = targetLang === 'zh-CN' ? 'ZH-HANS' : targetLang === 'zh-TW' ? 'ZH-HANT' : targetLang.toUpperCase();

  const params = new URLSearchParams();
  texts.forEach(t => params.append('text', t));
  params.append('target_lang', deeplLang);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      },
      body: params.toString()
    });
  } catch (err) {
    throw new Error('DeepL request failed. Reload the extension to accept the new permission, then try again. If you use a Pro key, set the endpoint to https://api.deepl.com/v2/translate in settings.');
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepL error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const translations = data.translations?.map(t => t.text || '') || [];
  while (translations.length < texts.length) translations.push('');

  return { translations };
}

// ============================================
// 辅助：加载服务商配置
// ============================================
async function loadProviderConfig(provider, override = {}) {
  const keys = [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`];
  const data = await chrome.storage.local.get(keys);
  return {
    apiKey: Object.prototype.hasOwnProperty.call(override, 'apiKey') ? (override.apiKey || '') : (data[`${provider}_apiKey`] || ''),
    model: Object.prototype.hasOwnProperty.call(override, 'model') ? (override.model || '') : (data[`${provider}_model`] || ''),
    endpoint: Object.prototype.hasOwnProperty.call(override, 'endpoint') ? (override.endpoint || '') : (data[`${provider}_endpoint`] || '')
  };
}
