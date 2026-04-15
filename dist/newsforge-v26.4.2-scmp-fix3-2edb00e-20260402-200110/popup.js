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

  // 检测当前页面
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { type: 'ping' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusText.textContent = 'Unsupported site';
        statusDot.classList.remove('active');
        return;
      }

      if (response.isArticle) {
        statusText.textContent = `${response.adapter} · Article`;
        statusDot.classList.add('active');
        btnRead.disabled = false;
      } else {
        statusText.textContent = `${response.adapter || 'Unknown'} · Not an article`;
      }
    });
  });

  // 进入阅读模式
  btnRead.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'open_reader' });
      window.close();
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
