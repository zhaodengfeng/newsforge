// NewsForge Options Script
document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('providerSelect');
  const providerConfig = document.getElementById('providerConfig');
  const btnSave = document.getElementById('btnSave');
  const saveStatus = document.getElementById('saveStatus');
  const btnClearHistory = document.getElementById('btnClearHistory');

  let currentProvider = 'google';

  function getDeepLPlanFromEndpoint(endpoint) {
    const value = (endpoint || '').trim().toLowerCase();
    if (value.includes('api.deepl.com')) return 'pro';
    return 'free';
  }

  function getDeepLEndpointFromPlan(plan) {
    return plan === 'pro'
      ? 'https://api.deepl.com/v2/translate'
      : 'https://api-free.deepl.com/v2/translate';
  }

  // PROVIDERS is loaded from providers.js via <script> tag in options.html

  // 渲染服务商配置面板
  function renderProviderConfig(provider, savedConfig) {
    const info = PROVIDERS[provider];
    if (!info) { providerConfig.innerHTML = ''; return; }

    if (info.type === 'free') {
      providerConfig.innerHTML = `
        <div class="card">
          <div class="no-config">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div style="font-weight:500; color:var(--text-secondary); margin-bottom:4px;">${info.name}</div>
            <div style="font-size:12px;">Free translation, no API Key required</div>
          </div>
        </div>`;
      return;
    }

    const savedApiKey = savedConfig?.apiKey || '';
    const savedModel = savedConfig?.model || info.model || '';
    const savedEndpoint = savedConfig?.endpoint || info.endpoint || '';
    const savedPlan = savedConfig?.plan || getDeepLPlanFromEndpoint(savedEndpoint);

    let fieldsHtml = '';

    // API Key
    fieldsHtml += `
      <div class="field">
        <label class="field-label">API Key</label>
        <input type="password" class="input" id="cfg_apiKey" value="${escapeAttr(savedApiKey)}" placeholder="Enter API Key">
      </div>`;

    // Model (skip for DeepL — API doesn't use model names)
    if (info.type !== 'deepl' && info.models && info.models.length > 0) {
      const selectedModel = info.models.includes(savedModel) ? savedModel : (info.model || info.models[0] || '');
      const customModel = info.models.includes(savedModel) ? '' : savedModel;
      fieldsHtml += `
        <div class="field">
          <label class="field-label">Preset Model</label>
          <select class="input" id="cfg_model">
            ${info.models.map(m => `<option value="${m}" ${m === selectedModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <div class="field-hint">Choose a preset model or enter a custom one below</div>
        </div>
        <div class="field">
          <label class="field-label">Custom Model Name</label>
          <input type="text" class="input" id="cfg_model_custom" value="${escapeAttr(customModel)}" placeholder="Optional: enter custom model name">
          <div class="field-hint">If filled, the custom model name overrides the preset selection</div>
        </div>`;
    } else if (info.type !== 'deepl') {
      fieldsHtml += `
        <div class="field">
          <label class="field-label">Model Name</label>
          <input type="text" class="input" id="cfg_model" value="${escapeAttr(savedModel)}" placeholder="Enter model name">
        </div>`;
    }

    if (info.type === 'deepl') {
      fieldsHtml += `
        <div class="field">
          <label class="field-label">DeepL Plan</label>
          <select class="input" id="cfg_deeplPlan">
            <option value="free" ${savedPlan === 'free' ? 'selected' : ''}>Free API</option>
            <option value="pro" ${savedPlan === 'pro' ? 'selected' : ''}>Pro API</option>
          </select>
          <div class="field-hint">Free uses api-free.deepl.com, Pro uses api.deepl.com</div>
        </div>
        <div class="field">
          <label class="field-label">API Endpoint</label>
          <input type="text" class="input" id="cfg_endpoint" value="${escapeAttr(getDeepLEndpointFromPlan(savedPlan))}" readonly>
        </div>`;
    } else {
      // Endpoint
      fieldsHtml += `
        <div class="field">
          <label class="field-label">API Endpoint</label>
          <input type="text" class="input" id="cfg_endpoint" value="${escapeAttr(savedEndpoint)}" placeholder="${info.endpoint || 'Enter API endpoint'}">
          ${info.endpoint ? '<div class="field-hint">Modify for custom endpoint</div>' : ''}
        </div>`;
    }

    const typeLabel = info.type === 'openai' ? 'OpenAI-Compatible API' : info.type === 'claude' ? 'Claude API' : info.type === 'deepl' ? 'DeepL API' : '';

    providerConfig.innerHTML = `
      <div class="card">
        <div class="config-card">
          <div class="config-header">
            <div>
              <div class="config-title">${info.name}</div>
              <div class="config-subtitle">${typeLabel}</div>
            </div>
          </div>
          ${fieldsHtml}
        </div>
      </div>`;

    if (info.type === 'deepl') {
      const planEl = document.getElementById('cfg_deeplPlan');
      const endpointEl = document.getElementById('cfg_endpoint');
      if (planEl && endpointEl) {
        planEl.addEventListener('change', () => {
          endpointEl.value = getDeepLEndpointFromPlan(planEl.value);
        });
      }
    }
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 加载设置
  chrome.storage.local.get(['translationProvider', 'targetLang'], (baseSettings) => {
    currentProvider = baseSettings.translationProvider || 'google';
    if (!PROVIDERS[currentProvider]) currentProvider = 'google';
    providerSelect.value = currentProvider;
    document.getElementById('targetLang').value = baseSettings.targetLang || 'zh-CN';

    // 加载当前 provider 的配置
    loadAndRenderConfig(currentProvider);
  });

  function loadAndRenderConfig(provider) {
    const keys = [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`, `${provider}_plan`];
    chrome.storage.local.get(keys, (data) => {
      renderProviderConfig(provider, {
        apiKey: data[`${provider}_apiKey`] || '',
        model: data[`${provider}_model`] || '',
        endpoint: data[`${provider}_endpoint`] || '',
        plan: data[`${provider}_plan`] || ''
      });
    });
  }

  // 切换 provider
  providerSelect.addEventListener('change', () => {
    currentProvider = providerSelect.value;
    loadAndRenderConfig(currentProvider);
  });

  // 保存
  btnSave.addEventListener('click', () => {
    const toSet = {
      translationProvider: currentProvider,
      targetLang: document.getElementById('targetLang').value
    };

    // 保存当前 provider 的配置
    const apiKeyEl = document.getElementById('cfg_apiKey');
    const modelEl = document.getElementById('cfg_model');
    const customModelEl = document.getElementById('cfg_model_custom');
    const endpointEl = document.getElementById('cfg_endpoint');
    const deeplPlanEl = document.getElementById('cfg_deeplPlan');

    if (apiKeyEl) {
      toSet[`${currentProvider}_apiKey`] = apiKeyEl.value.trim();
      const customModel = customModelEl ? customModelEl.value.trim() : '';
      toSet[`${currentProvider}_model`] = customModel || (modelEl ? modelEl.value.trim() : '');
      if (currentProvider === 'deepl') {
        const plan = deeplPlanEl ? deeplPlanEl.value : 'free';
        toSet.deepl_plan = plan;
        toSet.deepl_endpoint = getDeepLEndpointFromPlan(plan);
      } else {
        toSet[`${currentProvider}_endpoint`] = endpointEl ? endpointEl.value.trim() : '';
      }
    }

    chrome.storage.local.set(toSet, () => {
      saveStatus.classList.add('visible');
      setTimeout(() => saveStatus.classList.remove('visible'), 2500);
    });
  });

  // 清除历史
  btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all reading history?')) {
      chrome.storage.local.set({ history: [] }, () => {
        btnClearHistory.textContent = 'Cleared';
        setTimeout(() => { btnClearHistory.textContent = 'Clear'; }, 2000);
      });
    }
  });
});
