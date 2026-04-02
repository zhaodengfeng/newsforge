// NewsForge Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const issueVersion = document.getElementById('issueVersion');
  const btnRead = document.getElementById('btnRead');
  const btnSettings = document.getElementById('btnSettings');
  const btnHistory = document.getElementById('btnHistory');
  const historyList = document.getElementById('historyList');

  if (issueVersion) {
    issueVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  const contentScript = chrome.runtime.getManifest().content_scripts?.[0] || null;

  function isSupportedUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return [
        'bloomberg.com',
        'wsj.com',
        'nytimes.com',
        'nyt.com',
        'ft.com',
        'economist.com',
        'scmp.com'
      ].some(domain => host === domain || host.endsWith(`.${domain}`));
    } catch (e) {
      return false;
    }
  }

  function sendPing(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  function injectContentScripts(tabId) {
    return new Promise((resolve, reject) => {
      if (!contentScript?.js?.length) {
        resolve();
        return;
      }

      const target = { tabId, allFrames: false };
      const onScriptsInjected = () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      };

      const injectScripts = () => {
        chrome.scripting.executeScript({
          target,
          files: contentScript.js
        }, onScriptsInjected);
      };

      if (contentScript.css?.length) {
        chrome.scripting.insertCSS({
          target,
          files: contentScript.css
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          injectScripts();
        });
      } else {
        injectScripts();
      }
    });
  }

  async function ensurePageReady(tab) {
    if (!tab?.id) return null;

    let response = await sendPing(tab.id);
    if (response) return response;
    if (!isSupportedUrl(tab.url)) return null;

    try {
      await injectContentScripts(tab.id);
    } catch (e) {
      console.warn('[NewsForge] Manual injection failed:', e);
      return null;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    return sendPing(tab.id);
  }

  function updateStatus(response) {
    if (!response) {
      statusText.textContent = 'Unsupported site';
      statusDot.classList.remove('active');
      btnRead.disabled = true;
      return;
    }

    if (response.isArticle) {
      statusText.textContent = `${response.adapter} · Article`;
      statusDot.classList.add('active');
      btnRead.disabled = false;
    } else {
      statusText.textContent = `${response.adapter || 'Unknown'} · Not an article`;
      statusDot.classList.remove('active');
      btnRead.disabled = true;
    }
  }

  // 检测当前页面
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    ensurePageReady(tab).then(updateStatus);
  });

  // 进入阅读模式
  btnRead.addEventListener('click', async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      ensurePageReady(tab).then((response) => {
        updateStatus(response);
        if (!response?.isArticle) return;
        chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
        window.close();
      });
    });
  });

  // 设置
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 历史
  btnHistory.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 加载历史
  chrome.storage.local.get('history', (data) => {
    const history = data.history || [];
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="history-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          No reading history
        </div>`;
      return;
    }

    historyList.innerHTML = history.slice(0, 2).map(item => `
      <div class="history-item" data-url="${escapeHtml(item.url)}">
        <div class="history-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <div class="history-info">
          <div class="history-title">${escapeHtml(item.title)}</div>
          <div class="history-meta">
            <span>${item.source || ''}</span>
            <span>${formatTime(item.timestamp)}</span>
          </div>
        </div>
      </div>
    `).join('');

    // 点击历史条目在新标签页打开
    historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  });

  function formatTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML.replace(/"/g, '&quot;');
  }
});
