// NewsForge Content Script - 主入口
(function () {
  'use strict';

  let currentAdapter = null;
  let floatIcon = null;
  let adapters = [];

  function createAdapters() {
    try {
      adapters = [
        new BloombergAdapter(),
        new WSJAdapter(),
        new NYTimesAdapter(),
        new FTAdapter(),
        new EconomistAdapter()
      ];
      console.log('[NewsForge] Adapters created:', adapters.map(a => a?.name || 'UNDEFINED'));
      return true;
    } catch (e) {
      console.error('[NewsForge] Error creating adapters:', e);
      return false;
    }
  }

  function getPageURL() {
    try { if (window.location && window.location.href) return window.location.href; } catch (e) {}
    try { if (document.URL) return document.URL; } catch (e) {}
    try { if (document.location && document.location.href) return document.location.href; } catch (e) {}
    return '';
  }

  function selectAdapter(url) {
    url = url || getPageURL();
    console.log('[NewsForge] Selecting adapter for URL:', url);

    if (!url || url === 'about:blank' || url.startsWith('chrome-extension')) {
      console.warn('[NewsForge] Invalid URL, skipping adapter selection');
      return;
    }

    currentAdapter = null;
    for (let i = 0; i < adapters.length; i++) {
      const a = adapters[i];
      if (!a || typeof a.matches !== 'function') continue;
      if (a.matches(url)) {
        currentAdapter = a;
        currentAdapter._pageURL = url;
        console.log('[NewsForge] Selected:', a.name);
        break;
      }
    }

    if (!currentAdapter) {
      console.log('[NewsForge] No adapter matched, using BaseAdapter');
      currentAdapter = new BaseAdapter();
      currentAdapter._pageURL = url;
    }
  }

  function onReady() {
    // 多次检测，适应 SPA 延迟渲染
    var delays = [1500, 3500, 6000];
    var injected = false;
    delays.forEach(function(delay) {
      setTimeout(function() {
        if (injected) return;
        if (currentAdapter && currentAdapter.isArticlePage()) {
          console.log('[NewsForge] Article page detected, injecting icon (after ' + delay + 'ms)');
          injected = true;
          injectFloatIcon();
        }
      }, delay);
    });
  }

  function injectFloatIcon() {
    if (document.getElementById('newsforge-float')) return;

    floatIcon = document.createElement('div');
    floatIcon.id = 'newsforge-float';
    floatIcon.className = 'nf-float-icon';
    floatIcon.title = 'NewsForge - Reader Mode';
    floatIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`;

    floatIcon.addEventListener('click', () => {
      // Recovery: if reader state is stale (active but overlay gone), reset and restore icon
      if (ReaderRenderer.active && !document.getElementById('newsforge-reader')) {
        ReaderRenderer.active = false;
        ReaderRenderer.translated = false;
        if (floatIcon) floatIcon.classList.remove('nf-hidden');
      }
      openReader();
    });
    document.body.appendChild(floatIcon);

    // Auto-recovery: restore icon if reader overlay is gone but icon stays hidden
    setInterval(function() {
      if (!floatIcon) return;
      if (floatIcon.classList.contains('nf-hidden') && !document.getElementById('newsforge-reader')) {
        floatIcon.classList.remove('nf-hidden');
        ReaderRenderer.active = false;
        ReaderRenderer.translated = false;
      }
      // Re-append if removed from DOM by page scripts
      if (!document.body.contains(floatIcon)) {
        document.body.appendChild(floatIcon);
        floatIcon.classList.remove('nf-hidden');
        ReaderRenderer.active = false;
        ReaderRenderer.translated = false;
      }
    }, 3000);
  }

  function openReader(retryCount) {
    if (ReaderRenderer.active) return;
    retryCount = retryCount || 0;

    var paragraphs;
    try {
      paragraphs = currentAdapter.getParagraphs();
    } catch (e) {
      console.error('[NewsForge] getParagraphs error:', e);
      if (retryCount < 2) {
        setTimeout(function() { openReader(retryCount + 1); }, 2000);
        return;
      }
      const toast = document.createElement('div');
      toast.className = 'nf-toast';
      toast.textContent = 'Error extracting article: ' + (e.message || '');
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
      return;
    }
    console.log('[NewsForge] Paragraphs found:', paragraphs.length);

    if (paragraphs.length === 0) {
      // SPA 可能还在加载，重试最多 2 次
      if (retryCount < 2) {
        console.log('[NewsForge] No content yet, retrying in 2s...');
        setTimeout(function() { openReader(retryCount + 1); }, 2000);
        return;
      }
      const toast = document.createElement('div');
      toast.className = 'nf-toast';
      toast.textContent = 'Failed to extract article content';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
      return;
    }

    if (floatIcon) floatIcon.classList.add('nf-hidden');

    ReaderRenderer.onClose = () => {
      if (floatIcon) floatIcon.classList.remove('nf-hidden');
    };

    ReaderRenderer.render({
      title: currentAdapter.getTitle(),
      author: currentAdapter.getAuthor(),
      date: currentAdapter.getPublishDate(),
      source: currentAdapter.name.charAt(0).toUpperCase() + currentAdapter.name.slice(1),
      url: currentAdapter._pageURL || getPageURL(),
      paragraphs: paragraphs,
      featuredImage: currentAdapter.getFeaturedImage()
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'open_reader') {
      openReader();
      sendResponse({ ok: true });
    }
    if (msg.type === 'ping') {
      sendResponse({
        ok: true,
        isArticle: currentAdapter?.isArticlePage(),
        adapter: currentAdapter?.name
      });
    }
  });

  function init() {
    console.log('[NewsForge] init()');

    if (!createAdapters()) {
      setTimeout(init, 500);
      return;
    }

    const url = getPageURL();
    if (url) {
      selectAdapter(url);
      onReady();
    } else {
      // Fallback: ask background for the tab URL
      console.log('[NewsForge] URL not available locally, requesting from background');
      chrome.runtime.sendMessage({ type: 'get_tab_url' }, (resp) => {
        if (resp && resp.url) {
          console.log('[NewsForge] Got URL from background:', resp.url);
          selectAdapter(resp.url);
          onReady();
        } else {
          console.warn('[NewsForge] Could not obtain page URL');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();