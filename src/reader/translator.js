// Reader Translator UI - 段落级翻译交互
const ReaderTranslator = {
  translatedParagraphs: new Map(),

  // 翻译单个段落
  async translateParagraph(paragraphEl) {
    const original = paragraphEl.dataset.original || paragraphEl.textContent.trim();
    if (!original || this.translatedParagraphs.has(paragraphEl)) return;

    // 显示加载状态
    paragraphEl.classList.add('nf-translating');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [original], from: 'en', to: 'zh-CN' }
      });

      if (response && response.translations && response.translations[0]) {
        const translation = response.translations[0];
        paragraphEl.dataset.original = original;
        paragraphEl.innerHTML = `
          <span class="nf-original">${ReaderRenderer.escapeHtml(original)}</span>
          <span class="nf-translation">${ReaderRenderer.escapeHtml(translation)}</span>
        `;
        paragraphEl.classList.add('nf-translated');
        this.translatedParagraphs.set(paragraphEl, translation);
      }
    } catch (err) {
      console.error('NewsForge paragraph translation error:', err);
    }

    paragraphEl.classList.remove('nf-translating');
  },

  // 切换原文/译文显示
  toggleOriginal(paragraphEl) {
    if (paragraphEl.classList.contains('nf-show-original')) {
      paragraphEl.classList.remove('nf-show-original');
    } else {
      paragraphEl.classList.add('nf-show-original');
    }
  },

  // 重置所有翻译
  resetAll() {
    this.translatedParagraphs.clear();
    document.querySelectorAll('.nf-paragraph.nf-translated').forEach(p => {
      const original = p.dataset.original;
      if (original) {
        p.textContent = original;
        p.classList.remove('nf-translated');
      }
    });
  }
};
