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

    floatIcon.addEventListener('click', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('[NewsForge] icon clicked, active:', ReaderRenderer.active);
      if (ReaderRenderer.active) {
        ReaderRenderer.close();
        return;
      }
      var staleOverlay = document.getElementById('newsforge-reader');
      if (staleOverlay) staleOverlay.remove();
      ReaderRenderer.active = false;
      ReaderRenderer.translated = false;
      ReaderRenderer.overlay = null;
      floatIcon.classList.remove('nf-hidden');
      console.log('[NewsForge] state reset, calling openReader');
      openReader();
    }, true);

    // Append to <html> instead of <body> — avoids body transform/filter
    // breaking position:fixed, and stays above paywall overlays in body
    document.documentElement.appendChild(floatIcon);

    // MutationObserver: keep icon as last child of <html> so it's always
    // on top (DOM order wins for equal z-index)
    var _iconGuard = new MutationObserver(function() {
      if (!floatIcon) return;
      if (!document.documentElement.contains(floatIcon)) {
        document.documentElement.appendChild(floatIcon);
        return;
      }
      if (document.documentElement.lastElementChild !== floatIcon) {
        document.documentElement.appendChild(floatIcon);
      }
      // Only clean up stale state — if active is true the reader is supposed
      // to be open; the overlay guard (_nfOverlayGuard) will re-append it.
      if (!ReaderRenderer.active) {
        if (floatIcon.classList.contains('nf-hidden')) {
          floatIcon.classList.remove('nf-hidden');
        }
      }
    });
    _iconGuard.observe(document.documentElement, { childList: true });
    _iconGuard.observe(document.body, { childList: true, subtree: false });

    // Fallback: periodic recovery for pages where MutationObserver is insufficient
    setInterval(function() {
      if (!floatIcon) return;
      // Re-append if removed
      if (!document.documentElement.contains(floatIcon)) {
        document.documentElement.appendChild(floatIcon);
      }
      // Ensure on top (last child)
      if (document.documentElement.lastElementChild !== floatIcon) {
        document.documentElement.appendChild(floatIcon);
      }
      // Only clean up stale state — same logic as _iconGuard above
      if (!ReaderRenderer.active) {
        if (floatIcon.classList.contains('nf-hidden')) {
          floatIcon.classList.remove('nf-hidden');
        }
      }
    }, 2000);
  }

  function openReader(retryCount) {
    console.log('[NewsForge] openReader called, active:', ReaderRenderer.active);
    if (ReaderRenderer.active) return;
    // Clean up any stale overlay reference from previous sessions
    if (ReaderRenderer.overlay) {
      ReaderRenderer.overlay.remove();
      ReaderRenderer.overlay = null;
    }
    retryCount = retryCount || 0;

    var paragraphs;
    try {
      paragraphs = currentAdapter.getParagraphs();
      console.log('[NewsForge] paragraphs:', paragraphs.length);
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

    try {
      ReaderRenderer.render({
        title: currentAdapter.getTitle(),
        author: currentAdapter.getAuthor(),
        date: currentAdapter.getPublishDate(),
        source: currentAdapter.name.charAt(0).toUpperCase() + currentAdapter.name.slice(1),
        url: currentAdapter._pageURL || getPageURL(),
        paragraphs: paragraphs,
        featuredImage: currentAdapter.getFeaturedImage()
      });
      console.log('[NewsForge] render() completed, active:', ReaderRenderer.active, 'overlay in DOM:', !!document.getElementById('newsforge-reader'));
    } catch (renderErr) {
      console.error('[NewsForge] render() error:', renderErr);
      if (floatIcon) floatIcon.classList.remove('nf-hidden');
      return;
    }

    // Guard: re-append overlay if page scripts remove it (e.g. WSJ)
    // Overlay lives on documentElement, same as the float icon
    if (!window._nfOverlayGuard) {
      window._nfOverlayGuard = new MutationObserver(function(mutations) {
        if (!ReaderRenderer.active || !ReaderRenderer.overlay) return;
        if (!document.documentElement.contains(ReaderRenderer.overlay)) {
          console.log('[NewsForge] Overlay removed externally, re-appending');
          document.documentElement.appendChild(ReaderRenderer.overlay);
        }
      });
      window._nfOverlayGuard.observe(document.documentElement, { childList: true });
    }
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