// NewsForge Options Script
document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('providerSelect');
  const targetLangSelect = document.getElementById('targetLang');
  const readerThemeSelect = document.getElementById('readerTheme');
  const exportImageFormatSelect = document.getElementById('exportImageFormat');
  const exportQualitySelect = document.getElementById('exportQuality');
  const exportQualityField = document.getElementById('exportQualityField');
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

  function updateExportQualityVisibility() {
    if (!exportImageFormatSelect || !exportQualityField) return;
    exportQualityField.style.display = exportImageFormatSelect.value === 'png' ? 'none' : '';
  }

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
      targetLang: draft.targetLang,
      readerTheme: readerThemeSelect ? readerThemeSelect.value : 'default',
      exportImageFormat: exportImageFormatSelect ? exportImageFormatSelect.value : 'jpeg',
      exportQuality: exportQualitySelect ? exportQualitySelect.value : 'balanced'
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

  chrome.storage.local.get(['translationProvider', 'targetLang', 'readerTheme', 'exportImageFormat', 'exportQuality'], (baseSettings) => {
    currentProvider = baseSettings.translationProvider || 'google';
    if (!PROVIDERS[currentProvider]) currentProvider = 'google';

    providerSelect.value = currentProvider;
    targetLangSelect.value = baseSettings.targetLang || 'zh-CN';
    if (readerThemeSelect) readerThemeSelect.value = baseSettings.readerTheme || 'default';
    if (exportImageFormatSelect) exportImageFormatSelect.value = baseSettings.exportImageFormat || 'jpeg';
    if (exportQualitySelect) exportQualitySelect.value = baseSettings.exportQuality || 'balanced';
    updateExportQualityVisibility();
    loadAndRenderConfig(currentProvider);
  });

  exportImageFormatSelect?.addEventListener('change', updateExportQualityVisibility);

  // ================================================================
  // Encrypted Backup / Restore  (PBKDF2 + AES-GCM via Web Crypto API)
  // ================================================================

  const BACKUP_KEYS = [
    'translationProvider',
    'targetLang',
    'readerTheme',
    'exportImageFormat',
    'exportQuality',
    'google_apiKey',
    'microsoft_apiKey',
    'openai_apiKey',
    'openai_model',
    'openai_endpoint',
    'deepseek_apiKey',
    'deepseek_model',
    'deepseek_endpoint',
    'qwen_apiKey',
    'qwen_model',
    'qwen_endpoint',
    'gemini_apiKey',
    'gemini_model',
    'gemini_endpoint',
    'glm_apiKey',
    'glm_model',
    'glm_endpoint',
    'kimi_apiKey',
    'kimi_model',
    'kimi_endpoint',
    'openrouter_apiKey',
    'openrouter_model',
    'openrouter_endpoint',
    'claude_apiKey',
    'claude_model',
    'claude_endpoint',
    'deepl_apiKey',
    'deepl_plan',
    'deepl_endpoint',
    'custom_openai_apiKey',
    'custom_openai_model',
    'custom_openai_endpoint',
    'custom_claude_apiKey',
    'custom_claude_model',
    'custom_claude_endpoint',
  ];

  // Derive an AES-GCM key from password using PBKDF2
  async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt data object → base64 string  (salt || iv || ciphertext)
  async function encryptBackup(data, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));  // NIST SP 800-132 recommends ≥ 16 bytes
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(data))
    );
    // Concatenate: salt (16) + iv (12) + ciphertext
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    // Base64 encode
    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt base64 string → data object
  async function decryptBackup(base64Str, password) {
    try {
      const combined = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
      // v2 format: salt(16) + iv(12) + ciphertext
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const ciphertext = combined.slice(28);
      const key = await deriveKey(password, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decrypted));
    } catch (e) {
      return null; // wrong password or corrupted file
    }
  }

  // Collect all backup-able settings from chrome.storage
  function collectBackupData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(BACKUP_KEYS, (items) => {
        items._backupVersion = chrome.runtime.getManifest().version;
        resolve(items);
      });
    });
  }

  // Write restored data to chrome.storage (whitelist only known keys)
  function restoreBackupData(data) {
    const backupVersion = data._backupVersion || 'unknown';
    console.log('[NewsForge] Restoring backup from version:', backupVersion);

    const allowed = new Set(BACKUP_KEYS);
    const safeData = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        safeData[key] = value;
      } else {
        console.warn('[NewsForge] Skipping unknown backup key:', key);
      }
    }
    // Validate translationProvider is a known provider
    if (safeData.translationProvider && !PROVIDERS[safeData.translationProvider]) {
      console.warn('[NewsForge] Unknown provider in backup, resetting to google:', safeData.translationProvider);
      safeData.translationProvider = 'google';
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(BACKUP_KEYS, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        chrome.storage.local.set(safeData, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    });
  }

  // ---- Modal UI ----
  let _modalMode = null; // 'export' | 'import'
  let _pendingImportFile = null; // stored in closure so password is collected after file selection

  function showBackupModal(mode) {
    _modalMode = mode;
    const modal = document.getElementById('backupModal');
    const title = document.getElementById('backupModalTitle');
    const desc = document.getElementById('backupModalDesc');
    const pwField = document.getElementById('backupPasswordField');
    const confirmField = document.getElementById('backupConfirmField');
    const confirmBtn = document.getElementById('backupModalConfirmBtn');
    const confirmText = document.getElementById('backupModalConfirmText');
    const errorEl = document.getElementById('backupModalError');
    const pwInput = document.getElementById('backupModalPassword');
    const confirmInput = document.getElementById('backupModalConfirm');

    errorEl.style.display = 'none';
    pwInput.value = '';
    confirmInput.value = '';

    if (mode === 'export') {
      title.textContent = 'Export Encrypted Backup';
      desc.textContent = 'Enter a password to encrypt your settings. You will need this password to restore the backup on another device.';
      confirmField.style.display = 'block';
      confirmText.textContent = 'Export .nfbackup';
    } else {
      title.textContent = 'Import Encrypted Backup';
      const fileName = _pendingImportFile ? _pendingImportFile.name : '.nfbackup file';
      desc.textContent = `Selected ${fileName}. Enter the password used during export.`;
      confirmField.style.display = 'none';
      confirmText.textContent = 'Import';
    }

    modal.style.display = 'flex';
    pwInput.focus();
  }

  function hideBackupModal() {
    document.getElementById('backupModal').style.display = 'none';
    _modalMode = null;
    _pendingImportFile = null;
  }

  document.getElementById('backupModalCancelBtn').addEventListener('click', hideBackupModal);

  document.getElementById('backupModalPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (_modalMode === 'import') {
        document.getElementById('backupModalConfirmBtn').click();
      } else {
        document.getElementById('backupModalConfirm').focus();
      }
    }
  });

  document.getElementById('backupModalConfirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('backupModalConfirmBtn').click();
  });

  document.getElementById('backupModalConfirmBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('backupModalError');
    const pwInput = document.getElementById('backupModalPassword');
    const confirmInput = document.getElementById('backupModalConfirm');
    errorEl.style.display = 'none';

    const password = pwInput.value;

    if (_modalMode === 'export') {
      const confirm = confirmInput.value;
      if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
      }
      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
        return;
      }
      confirmInput.value = '';
      pwInput.value = '';
      hideBackupModal();
      await doExportBackup(password);

    } else if (_modalMode === 'import') {
      if (!password) {
        errorEl.textContent = 'Please enter the password.';
        errorEl.style.display = 'block';
        return;
      }
      if (!_pendingImportFile) {
        errorEl.textContent = 'Please select a backup file first.';
        errorEl.style.display = 'block';
        return;
      }

      const file = _pendingImportFile;
      await doImportBackup(file, password);
    }
  });

  // ---- Export ----
  async function doExportBackup(password) {
    const btn = document.getElementById('btnExportBackup');
    const orig = btn.textContent;
    btn.textContent = 'Encrypting...';
    btn.disabled = true;

    try {
      const data = await collectBackupData();
      const encrypted = await encryptBackup(data, password);

      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsforge-backup-${new Date().toISOString().slice(0, 10)}.nfbackup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = 'Exported!';
      setTimeout(() => { btn.textContent = orig; }, 3000);
    } catch (err) {
      console.error('[NewsForge] export error:', err);
      btn.textContent = 'Export failed';
      setTimeout(() => { btn.textContent = orig; }, 3000);
    } finally {
      btn.disabled = false;
    }
  }

  // ---- Import ----
  async function doImportBackup(file, password) {
    const btn = document.getElementById('btnImportBackup');
    const confirmBtn = document.getElementById('backupModalConfirmBtn');
    const confirmText = document.getElementById('backupModalConfirmText');
    const pwInput = document.getElementById('backupModalPassword');
    const orig = btn.textContent;
    const origConfirm = confirmText.textContent;
    btn.textContent = 'Decrypting...';
    btn.disabled = true;
    confirmBtn.disabled = true;
    confirmText.textContent = 'Decrypting...';
    pwInput.value = ''; // clear from DOM before async decrypt work

    try {
      const text = await file.text();
      const data = await decryptBackup(text.trim(), password);

      if (!data) {
        throw new Error('Invalid password or corrupted file.');
      }

      // Restore data
      await restoreBackupData(data);

      _pendingImportFile = null;
      hideBackupModal();
      btn.textContent = 'Imported!';
      setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
        // Refresh the page to reflect restored settings
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('[NewsForge] import error:', err);
      btn.textContent = 'Import failed';
      btn.disabled = false;
      confirmBtn.disabled = false;
      confirmText.textContent = origConfirm;
      // Show error in the modal if still visible, otherwise alert
      if (document.getElementById('backupModal').style.display !== 'none') {
        const errEl = document.getElementById('backupModalError');
        errEl.textContent = err.message || 'Invalid password or corrupted file.';
        errEl.style.display = 'block';
        pwInput.focus();
      } else {
        alert(err.message || 'Import failed: invalid password or corrupted file.');
      }
      setTimeout(() => { btn.textContent = orig; }, 3000);
    }
  }

  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // reset so same file can be re-selected
    if (!file) return;

    _pendingImportFile = file;
    showBackupModal('import');
  });

  // ---- Button wiring ----
  document.getElementById('btnExportBackup').addEventListener('click', () => {
    showBackupModal('export');
  });

  document.getElementById('btnImportBackup').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  // Close modal on backdrop click
  document.getElementById('backupModal').addEventListener('click', (e) => {
    if (e.target.id === 'backupModal') hideBackupModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('backupModal').style.display !== 'none') {
      hideBackupModal();
    }
  });

});
