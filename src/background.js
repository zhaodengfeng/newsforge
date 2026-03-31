// NewsForge Background Service Worker

// ============================================
// Provider 配置表
// ============================================
const PROVIDERS = {
  google:       { name: 'Google Translate', type: 'free' },
  microsoft:    { name: 'Microsoft Translator', type: 'free' },
  openai:       { name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
  deepseek:     { name: 'DeepSeek', type: 'openai', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  qwen:         { name: 'Qwen', type: 'openai', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  gemini:       { name: 'Gemini', type: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', models: ['gemini-2.0-flash', 'gemini-2.5-pro-preview-05-06'] },
  glm:          { name: 'GLM', type: 'openai', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'] },
  minimax:      { name: 'MiniMax', type: 'openai', endpoint: 'https://api.minimax.chat/v1/text/chatcompletion_v2', model: 'MiniMax-Text-01', models: ['MiniMax-Text-01', 'abab6.5s-chat'] },
  kimi:         { name: 'Kimi', type: 'openai', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  xiaomi:       { name: 'Xiaomi', type: 'openai', endpoint: '', model: '' },
  claude:       { name: 'Claude', type: 'claude', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-opus-4-20250514'] },
  deepl:        { name: 'DeepL', type: 'deepl', endpoint: 'https://api.deepl.com/v2/translate' },
  custom_openai:{ name: 'Custom (OpenAI)', type: 'openai', endpoint: '', model: '' },
  custom_claude:{ name: 'Custom (Claude)', type: 'claude', endpoint: '', model: '' },
};

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
  if (info.menuItemId === 'newsforge-read' || info.menuItemId === 'newsforge-translate') {
    chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
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
  const langName = targetLang === 'zh-CN' ? 'Simplified Chinese' : targetLang === 'zh-TW' ? 'Traditional Chinese' : targetLang;

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
      // openai, deepseek, qwen, gemini, glm, minimax, kimi, xiaomi, custom_openai
      return openaiTranslate(texts, targetLang, langName, provider);
  }
}

// ============================================
// Google 翻译（免费，无需 API Key）
// ============================================
async function googleTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-TW' ? 'zh-TW' : targetLang === 'zh-CN' ? 'zh-CN' : targetLang;
  const translations = [];

  for (const text of texts) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Translate error: ${response.status}`);
    const data = await response.json();
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

async function microsoftTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-CN' ? 'zh-Hans' : targetLang === 'zh-TW' ? 'zh-Hant' : targetLang;

  // 获取/刷新 token
  if (!msToken || Date.now() > msTokenExpiry) {
    try {
      const authResp = await fetch('https://edge.microsoft.com/translate/auth');
      if (!authResp.ok) throw new Error('Auth failed');
      msToken = await authResp.text();
      msTokenExpiry = Date.now() + 8 * 60 * 1000; // 8分钟有效期
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
    // Token 可能过期，清除重试
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
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(texts) }
      ],
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
    translations = JSON.parse(content);
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

  const deeplLang = targetLang === 'zh-CN' ? 'ZH' : targetLang === 'zh-TW' ? 'ZH' : targetLang.toUpperCase();

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
