// NewsForge Background Service Worker
importScripts('providers.js');

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

  if (msg.type === 'article_opened') {
    chrome.storage.local.get('history', (data) => {
      const history = data.history || [];
      history.unshift({ ...msg.data, timestamp: Date.now() });
      if (history.length > 200) history.length = 200;
      chrome.storage.local.set({ history });
    });
  }
});

// ============================================
// 翻译路由
// ============================================
async function handleTranslate({ texts, from, to, providerOverride, configOverride, context, contentType }) {
  const settings = await chrome.storage.local.get(['translationProvider', 'targetLang']);
  const provider = providerOverride || settings.translationProvider || 'google';
  const targetLang = to || settings.targetLang || 'zh-CN';
  const safeTexts = Array.isArray(texts) ? texts : [];
  const LANG_NAMES = { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian', 'pt': 'Portuguese', 'it': 'Italian', 'ar': 'Arabic' };
  const langName = LANG_NAMES[targetLang] || targetLang;
  const promptContext = buildPromptContext(context);

  try {
    switch (provider) {
      case 'google':
        return googleTranslate(safeTexts, targetLang);
      case 'microsoft':
        return microsoftTranslate(safeTexts, targetLang);
      case 'deepl':
        return deeplTranslate(safeTexts, targetLang, langName, provider, configOverride);
      case 'claude':
      case 'custom_claude':
        return claudeTranslate(safeTexts, targetLang, langName, provider, configOverride, promptContext, contentType);
      default:
        return openaiTranslate(safeTexts, targetLang, langName, provider, configOverride, promptContext, contentType);
    }
  } catch (error) {
    const wrapped = new Error(formatTranslationError(provider, error));
    wrapped.userMessage = formatTranslationError(provider, error);
    throw wrapped;
  }
}

function buildPromptContext(context = {}) {
  const cleaned = {};
  const entries = [
    ['source', 80],
    ['title', 240],
    ['summary', 360],
    ['terms', 300]
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
  if (context.terms) lines.push(`Terms: ${context.terms}`);
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
      ? `Translate the input news headline into ${langName}. Return only a JSON array of translated strings.`
      : `Translate the input news ${contentLabel} into ${langName}. Return only a JSON array of translated strings in the same order as the input array.`;

    const userPrompt = [
      contextBlock,
      'Use the context only to resolve ambiguity. Do not translate the instructions.',
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
4. Use any provided context only to resolve ambiguity.
5. Return only valid JSON.

Output format:
{"translations":[{"id":0,"text":"..."}]}`
    : `You are a professional native-level news translator working into ${langName}.

Translate with the standards of a high-quality news desk.

Rules:
1. Return only valid JSON.
2. Preserve facts, numbers, dates, and attributions exactly.
3. Keep the journalistic tone, register, and structure appropriate for news writing.
4. Use the established target-language form for people, organizations, and places when one clearly exists; otherwise preserve the original term.
5. Translate quotes faithfully without adding interpretation.
6. Keep section headings concise and news-style.
7. Use any provided context only to disambiguate meaning; do not introduce information not present in the segment itself.
8. Return translations in the same order as the input.

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
    translations = content.split('\n').map(line => line.trim()).filter(Boolean);
  }

  if (!Array.isArray(translations)) translations = [normalizeTranslationItem(translations)];
  while (translations.length < texts.length) translations.push('');
  return translations.slice(0, Math.max(texts.length, translations.length));
}

// ============================================
// Google 翻译（免费，无需 API Key）— 批量模式
// ============================================
async function googleTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-TW' ? 'zh-TW' : targetLang === 'zh-CN' ? 'zh-CN' : targetLang;

  // Batch: send all texts as multiple q params in one request
  const params = new URLSearchParams();
  params.append('client', 'gtx');
  params.append('sl', 'auto');
  params.append('tl', lang);
  params.append('dt', 't');
  texts.forEach(t => params.append('q', t));

  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Translate error: ${response.status}`);
  const data = await response.json();

  // When batching, data[0] contains translation segments for all texts sequentially
  // Each text's segments end when the source text matches the next input
  const translations = [];
  if (texts.length === 1) {
    // Single text: simple extraction
    let result = '';
    if (data && data[0]) {
      for (const part of data[0]) {
        if (part && part[0]) result += part[0];
      }
    }
    translations.push(result || texts[0]);
  } else {
    // Multiple texts: each q returns its own set of segments
    // Google batches them all into data[0], separated by null entries
    // Fallback to sequential if batch parsing fails
    try {
      let result = '';
      let idx = 0;
      if (data && data[0]) {
        for (const part of data[0]) {
          if (part && part[0]) {
            result += part[0];
          }
          // Check if this segment's source text ends the current input text
          if (part && part[1] && result) {
            // Heuristic: when the accumulated source matches the end of current text, emit
            const srcAccum = part[1];
            if (srcAccum && srcAccum.endsWith('\n') || !part[1]) {
              // Not reliable enough — fall through to sequential
            }
          }
        }
      }
      // Batch parsing is unreliable for multi-text, fall back to sequential
      if (result && texts.length <= 1) {
        translations.push(result);
      } else {
        throw new Error('fallback');
      }
    } catch {
      // Sequential fallback for multiple texts
      for (const text of texts) {
        const singleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
        const resp = await fetch(singleUrl);
        if (!resp.ok) throw new Error(`Google Translate error: ${resp.status}`);
        const singleData = await resp.json();
        let r = '';
        if (singleData && singleData[0]) {
          for (const part of singleData[0]) {
            if (part && part[0]) r += part[0];
          }
        }
        translations.push(r || text);
      }
    }
  }

  return { translations };
}

// ============================================
// 微软翻译（免费，通过 Edge token）
// ============================================
let msToken = null;
let msTokenExpiry = 0;

async function microsoftTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-CN' ? 'zh-Hans' : targetLang === 'zh-TW' ? 'zh-Hant' : targetLang;

  if (!msToken || Date.now() > msTokenExpiry) {
    try {
      const authResp = await fetch('https://edge.microsoft.com/translate/auth');
      if (!authResp.ok) throw new Error('Auth failed');
      msToken = await authResp.text();
      msTokenExpiry = Date.now() + 8 * 60 * 1000;
    } catch (e) {
      throw new Error('Microsoft Translator auth failed, please try again or switch to another engine');
    }
  }

  const body = texts.map(t => ({ text: t }));
  const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${lang}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${msToken}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    msToken = null;
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API returned empty response');
  return { translations: parseLLMTranslations(content, texts) };
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
