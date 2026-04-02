// NewsForge Options Script
document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('providerSelect');
  const targetLangSelect = document.getElementById('targetLang');
  const providerConfig = document.getElementById('providerConfig');
  const activeSummaryLine = document.getElementById('activeSummaryLine');
  const statusProvider = document.getElementById('statusProvider');
  const statusModel = document.getElementById('statusModel');
  const statusEndpoint = document.getElementById('statusEndpoint');
  const statusCredential = document.getElementById('statusCredential');
  const btnTestTranslate = document.getElementById('btnTestTranslate');
  const testInput = document.getElementById('testInput');
  const testResult = document.getElementById('testResult');
  const btnSave = document.getElementById('btnSave');
  const saveStatus = document.getElementById('saveStatus');
  const btnClearHistory = document.getElementById('btnClearHistory');

  const TARGET_LANG_LABELS = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'ja': '日本語',
    'ko': '한국어',
    en: 'English',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
    ru: 'Русский',
    pt: 'Português',
    it: 'Italiano',
    ar: 'العربية'
  };

  let currentProvider = 'google';

  function escapeAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

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

  function getProviderInfo(provider) {
    return PROVIDERS[provider] || PROVIDERS.google;
  }

  function getStoredKeys(provider) {
    return [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`, `${provider}_plan`];
  }

  function renderProviderConfig(provider, savedConfig) {
    const info = getProviderInfo(provider);
    if (!info) {
      providerConfig.innerHTML = '';
      return;
    }

    if (info.type === 'free') {
      providerConfig.innerHTML = `
        <div class="card">
          <div class="config-card">
            <div class="no-config">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div style="font-weight:500; color:var(--text-secondary); margin-bottom:4px;">${info.name}</div>
              <div style="font-size:12px;">No API Key required. This provider is ready to use.</div>
            </div>
          </div>
        </div>`;
      return;
    }

    const savedApiKey = savedConfig?.apiKey || '';
    const savedModel = savedConfig?.model || info.model || '';
    const savedEndpoint = savedConfig?.endpoint || info.endpoint || '';
    const savedPlan = savedConfig?.plan || getDeepLPlanFromEndpoint(savedEndpoint);

    let fieldsHtml = `
      <div class="field">
        <label class="field-label">API Key</label>
        <input type="password" class="input" id="cfg_apiKey" value="${escapeAttr(savedApiKey)}" placeholder="Enter API Key">
      </div>`;

    if (info.type !== 'deepl') {
      if (info.models && info.models.length > 0) {
        const selectedModel = info.models.includes(savedModel) ? savedModel : (info.model || info.models[0] || '');
        const customModel = info.models.includes(savedModel) ? '' : savedModel;
        fieldsHtml += `
          <div class="field">
            <label class="field-label">Preset Model</label>
            <select class="input" id="cfg_model">
              ${info.models.map(model => `<option value="${model}" ${model === selectedModel ? 'selected' : ''}>${model}</option>`).join('')}
            </select>
            <div class="field-hint">Choose a preset model, or override it with a custom model name below.</div>
          </div>
          <div class="field">
            <label class="field-label">Custom Model Name</label>
            <input type="text" class="input" id="cfg_model_custom" value="${escapeAttr(customModel)}" placeholder="Optional: enter custom model name">
            <div class="field-hint">Leave empty to use the preset model. If filled, this value takes priority.</div>
          </div>`;
      } else {
        fieldsHtml += `
          <div class="field">
            <label class="field-label">Model Name</label>
            <input type="text" class="input" id="cfg_model" value="${escapeAttr(savedModel)}" placeholder="Enter model name">
          </div>`;
      }
    }

    if (info.type === 'deepl') {
      fieldsHtml += `
        <div class="field">
          <label class="field-label">API Plan</label>
          <select class="input" id="cfg_deeplPlan">
            <option value="free" ${savedPlan === 'free' ? 'selected' : ''}>Free API</option>
            <option value="pro" ${savedPlan === 'pro' ? 'selected' : ''}>Pro API</option>
          </select>
          <div class="field-hint">Free uses api-free.deepl.com. Pro uses api.deepl.com.</div>
        </div>
        <details class="advanced-block">
          <summary>Advanced Settings</summary>
          <div class="advanced-content">
            <div class="field">
              <label class="field-label">API Endpoint</label>
              <input type="text" class="input" id="cfg_endpoint" value="${escapeAttr(getDeepLEndpointFromPlan(savedPlan))}" readonly>
              <div class="field-hint">This endpoint follows the selected DeepL plan automatically.</div>
            </div>
          </div>
        </details>`;
    } else {
      const endpointHint = info.endpoint
        ? 'Leave this as-is unless you need a custom endpoint.'
        : 'Required for custom providers.';
      fieldsHtml += `
        <details class="advanced-block">
          <summary>Advanced Settings</summary>
          <div class="advanced-content">
            <div class="field">
              <label class="field-label">API Endpoint</label>
              <input type="text" class="input" id="cfg_endpoint" value="${escapeAttr(savedEndpoint)}" placeholder="${escapeAttr(info.endpoint || 'Enter API endpoint')}">
              <div class="field-hint">${endpointHint}</div>
            </div>
          </div>
        </details>`;
    }

    const typeLabel = info.type === 'openai'
      ? 'OpenAI-Compatible API'
      : info.type === 'claude'
        ? 'Claude API'
        : info.type === 'deepl'
          ? 'DeepL API'
          : '';

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
          renderSummaryStatus();
        });
      }
    }
  }

  function getDraftConfig() {
    const provider = providerSelect.value;
    const info = getProviderInfo(provider);
    const targetLang = targetLangSelect.value;

    const apiKeyEl = document.getElementById('cfg_apiKey');
    const modelEl = document.getElementById('cfg_model');
    const customModelEl = document.getElementById('cfg_model_custom');
    const endpointEl = document.getElementById('cfg_endpoint');
    const deeplPlanEl = document.getElementById('cfg_deeplPlan');

    const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';
    const customModel = customModelEl ? customModelEl.value.trim() : '';
    const model = customModel || (modelEl ? modelEl.value.trim() : '') || info.model || '';
    const deeplPlan = deeplPlanEl ? deeplPlanEl.value : getDeepLPlanFromEndpoint(endpointEl ? endpointEl.value : info.endpoint);
    const endpoint = info.type === 'deepl'
      ? getDeepLEndpointFromPlan(deeplPlan)
      : ((endpointEl ? endpointEl.value.trim() : '') || info.endpoint || '');

    return {
      provider,
      providerName: info.name,
      providerType: info.type,
      targetLang,
      targetLangLabel: TARGET_LANG_LABELS[targetLang] || targetLang,
      apiKey,
      model,
      endpoint,
      deeplPlan,
      usesCustomModel: Boolean(customModel),
      usesCustomEndpoint: Boolean(endpoint && info.endpoint && endpoint !== info.endpoint)
    };
  }

  function renderSummaryStatus() {
    const draft = getDraftConfig();
    const info = getProviderInfo(draft.provider);

    let modelLabel = 'No API Key required';
    if (info.type === 'deepl') {
      modelLabel = draft.deeplPlan === 'pro' ? 'Pro API' : 'Free API';
    } else if (info.type !== 'free') {
      modelLabel = draft.model || 'Not set';
      if (draft.usesCustomModel) {
        modelLabel += ' (custom)';
      }
    }

    let endpointLabel = 'Built-in service';
    if (info.type === 'deepl') {
      endpointLabel = draft.endpoint;
    } else if (info.type !== 'free') {
      endpointLabel = draft.endpoint || 'Not set';
      if (draft.usesCustomEndpoint) {
        endpointLabel += ' (custom)';
      }
    }

    let credentialLabel = 'Ready';
    if (info.type !== 'free') {
      credentialLabel = draft.apiKey ? 'API Key configured' : 'API Key required';
    }

    activeSummaryLine.textContent = `Current: ${draft.providerName} / ${modelLabel} / ${draft.targetLangLabel}`;
    statusProvider.textContent = draft.providerName;
    statusModel.textContent = modelLabel;
    statusEndpoint.textContent = endpointLabel;
    statusCredential.textContent = credentialLabel;
  }

  function setTestResult(type, message) {
    testResult.className = 'test-result visible';
    if (type) testResult.classList.add(type);
    testResult.textContent = message;
  }

  function clearTestResult() {
    testResult.className = 'test-result';
    testResult.textContent = '';
  }

  function loadAndRenderConfig(provider) {
    chrome.storage.local.get(getStoredKeys(provider), (data) => {
      renderProviderConfig(provider, {
        apiKey: data[`${provider}_apiKey`] || '',
        model: data[`${provider}_model`] || '',
        endpoint: data[`${provider}_endpoint`] || '',
        plan: data[`${provider}_plan`] || ''
      });
      renderSummaryStatus();
    });
  }

  providerSelect.addEventListener('change', () => {
    currentProvider = providerSelect.value;
    clearTestResult();
    loadAndRenderConfig(currentProvider);
  });

  targetLangSelect.addEventListener('change', () => {
    clearTestResult();
    renderSummaryStatus();
  });

  providerConfig.addEventListener('input', () => {
    clearTestResult();
    renderSummaryStatus();
  });

  providerConfig.addEventListener('change', () => {
    clearTestResult();
    renderSummaryStatus();
  });

  btnTestTranslate.addEventListener('click', () => {
    const draft = getDraftConfig();
    const sampleText = testInput.value.trim();

    if (!sampleText) {
      setTestResult('error', 'Please enter some sample text first.');
      return;
    }

    btnTestTranslate.disabled = true;
    setTestResult('pending', 'Testing translation with the current on-screen settings...');

    chrome.runtime.sendMessage({
      type: 'translate',
      data: {
        texts: [sampleText],
        to: draft.targetLang,
        providerOverride: draft.provider,
        configOverride: {
          apiKey: draft.apiKey,
          model: draft.model,
          endpoint: draft.endpoint
        }
      }
    }, (response) => {
      btnTestTranslate.disabled = false;

      if (chrome.runtime.lastError) {
        setTestResult('error', `Test failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (response?.error) {
        setTestResult('error', response.error);
        return;
      }

      const translated = response?.translations?.[0] || '';
      if (!translated) {
        setTestResult('error', 'The provider returned an empty translation. Please try another model or check the current endpoint.');
        return;
      }

      setTestResult('success', translated);
    });
  });

  btnSave.addEventListener('click', () => {
    const draft = getDraftConfig();
    const info = getProviderInfo(draft.provider);
    const toSet = {
      translationProvider: draft.provider,
      targetLang: draft.targetLang
    };

    if (info.type !== 'free') {
      toSet[`${draft.provider}_apiKey`] = draft.apiKey;
      if (info.type === 'deepl') {
        toSet[`${draft.provider}_plan`] = draft.deeplPlan;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      } else {
        toSet[`${draft.provider}_model`] = draft.model;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      }
    }

    chrome.storage.local.set(toSet, () => {
      saveStatus.classList.add('visible');
      setTimeout(() => saveStatus.classList.remove('visible'), 2500);
      renderSummaryStatus();
    });
  });

  btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all reading history?')) {
      chrome.storage.local.set({ history: [] }, () => {
        btnClearHistory.textContent = 'Cleared';
        setTimeout(() => {
          btnClearHistory.textContent = 'Clear';
        }, 2000);
      });
    }
  });

  chrome.storage.local.get(['translationProvider', 'targetLang'], (baseSettings) => {
    currentProvider = baseSettings.translationProvider || 'google';
    if (!PROVIDERS[currentProvider]) currentProvider = 'google';

    providerSelect.value = currentProvider;
    targetLangSelect.value = baseSettings.targetLang || 'zh-CN';
    loadAndRenderConfig(currentProvider);
  });
});
