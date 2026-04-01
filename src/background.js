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

function migrateOldSettings() {
  chrome.storage.local.get(['openaiKey', 'deepseekKey', 'translationProvider'], (old) => {
    const updates = {};
    const removes = [];

    if (old.openaiKey) {
      updates.openai_apiKey = old.openaiKey;
      if (old.openaiModel) updates.openai_model = old.openaiModel;
      if (old.openaiEndpoint) updates.openai_endpoint = old.openaiEndpoint;
      removes.push('openaiKey', 'openaiModel', 'openaiEndpoint');
    }
    if (old.deepseekKey) {
      updates.deepseek_apiKey = old.deepseekKey;
      if (old.deepseekModel) updates.deepseek_model = old.deepseekModel;
      if (old.deepseekEndpoint) updates.deepseek_endpoint = old.deepseekEndpoint;
      removes.push('deepseekKey', 'deepseekModel', 'deepseekEndpoint');
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        chrome.storage.local.remove(removes);
      });
    }
  });
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
      sendResponse({ error: err.message });
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
async function handleTranslate({ texts, from, to }) {
  const settings = await chrome.storage.local.get(['translationProvider', 'targetLang']);
  const provider = settings.translationProvider || 'google';
  const targetLang = to || settings.targetLang || 'zh-CN';
  const LANG_NAMES = { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German', 'es': 'Spanish', 'ru': 'Russian', 'pt': 'Portuguese', 'it': 'Italian', 'ar': 'Arabic' };
  const langName = LANG_NAMES[targetLang] || targetLang;

  switch (provider) {
    case 'google':
      return googleTranslate(texts, targetLang);
    case 'microsoft':
      return microsoftTranslate(texts, targetLang);
    case 'deepl':
      return deeplTranslate(texts, targetLang, langName, provider, settings);
    case 'claude':
    case 'custom_claude':
      return claudeTranslate(texts, targetLang, langName, provider);
    default:
      return openaiTranslate(texts, targetLang, langName, provider);
  }
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
async function openaiTranslate(texts, targetLang, langName, provider) {
  const cfg = await loadProviderConfig(provider);
  const apiKey = cfg.apiKey;
  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const endpoint = cfg.endpoint || PROVIDERS[provider]?.endpoint || '';

  if (!apiKey) throw new Error('Please configure API Key in settings');
  if (!endpoint) throw new Error('Please configure API Endpoint in settings');

  const isMTModel = model.startsWith('qwen-mt-');
  const systemPrompt = `You are a professional translator. Translate the following text to ${langName}. Rules:
1. Keep the translation natural and fluent
2. Preserve proper nouns, brand names, and technical terms in English
3. For numbers and dates, keep the original format
4. Output a JSON array of translations, one for each input text
5. Only output the JSON array, nothing else`;

  const messages = isMTModel
    ? [{ role: 'user', content: systemPrompt + '\n\n' + JSON.stringify(texts) }]
    : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(texts) }
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

  let translations;
  try {
    const cleaned = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    translations = JSON.parse(cleaned);
  } catch {
    translations = content.split('\n').filter(l => l.trim());
  }
  if (!Array.isArray(translations)) translations = [translations];
  while (translations.length < texts.length) translations.push('');

  return { translations };
}

// ============================================
// Claude API 翻译
// ============================================
async function claudeTranslate(texts, targetLang, langName, provider) {
  const cfg = await loadProviderConfig(provider);
  const apiKey = cfg.apiKey;
  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const endpoint = cfg.endpoint || PROVIDERS[provider]?.endpoint || '';

  if (!apiKey) throw new Error('Please configure API Key in settings');
  if (!endpoint) throw new Error('Please configure API Endpoint in settings');

  const systemPrompt = `You are a professional translator. Translate the following text to ${langName}. Rules:
1. Keep the translation natural and fluent
2. Preserve proper nouns, brand names, and technical terms in English
3. For numbers and dates, keep the original format
4. Output a JSON array of translations, one for each input text
5. Only output the JSON array, nothing else`;

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
      system: systemPrompt,
      messages: [
        { role: 'user', content: JSON.stringify(texts) }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Claude API returned empty response');

  let translations;
  try {
    translations = JSON.parse(content);
  } catch {
    translations = content.split('\n').filter(l => l.trim());
  }
  if (!Array.isArray(translations)) translations = [translations];
  while (translations.length < texts.length) translations.push('');

  return { translations };
}

// ============================================
// DeepL API 翻译
// ============================================
async function deeplTranslate(texts, targetLang, langName, provider) {
  const cfg = await loadProviderConfig(provider);
  const apiKey = cfg.apiKey;
  const endpoint = cfg.endpoint || PROVIDERS.deepl.endpoint;

  if (!apiKey) throw new Error('Please configure DeepL API Key in settings');

  // Fix: zh-CN → ZH-HANS, zh-TW → ZH-HANT (DeepL v2 requires specific codes)
  const deeplLang = targetLang === 'zh-CN' ? 'ZH-HANS' : targetLang === 'zh-TW' ? 'ZH-HANT' : targetLang.toUpperCase();

  const params = new URLSearchParams();
  texts.forEach(t => params.append('text', t));
  params.append('target_lang', deeplLang);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `DeepL-Auth-Key ${apiKey}`
    },
    body: params.toString()
  });

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
async function loadProviderConfig(provider) {
  const keys = [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`];
  const data = await chrome.storage.local.get(keys);
  return {
    apiKey: data[`${provider}_apiKey`] || '',
    model: data[`${provider}_model`] || '',
    endpoint: data[`${provider}_endpoint`] || ''
  };
}
