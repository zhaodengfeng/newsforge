// Reader Renderer - 渲染阅读模式 UI
const ReaderRenderer = {
  active: false,
  article: null,
  overlay: null,
  translated: false,
  translating: false,
  onClose: null,
  _targetLang: 'zh-CN',
  _sessionId: 0,
  _translationRunId: 0,

  render(article) {
    this._sessionId++;
    this._translationRunId = 0;
    this.article = article;
    this.active = true;
    this.translated = false;
    this.translating = false;

    // 去重：paragraphs 中与 featuredImage 相同的图片全部移除
    if (article.featuredImage) {
      const fp = article.featuredImage.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
      article.paragraphs = article.paragraphs.filter(p => {
        if (p.type !== 'image') return true;
        if (p.src === article.featuredImage) return false;
        const pp = p.src.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
        return pp !== fp;
      });
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'newsforge-reader';
    this.overlay.className = 'nf-reader';

    this.overlay.innerHTML = `
      <div class="nf-progress-bar" id="nf-progress" style="width: 0%;"></div>
      <div class="nf-reader-toolbar">
        <div class="nf-reader-meta">
          <span class="nf-badge">${article.source}</span>
          ${article.date ? `<span class="nf-date">${article.date}</span>` : ''}
        </div>
        <div class="nf-reader-actions">
          <select class="nf-select nf-translate-mode" title="Translation mode">
            <option value="bilingual">Bilingual</option>
            <option value="target">Translation</option>
          </select>
          <button class="nf-btn nf-btn-translate" title="Translate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
              <path d="M13 14l6-6"/><path d="M14 5l8 8"/><path d="M18 3l2 2"/><path d="M15 22l6-6"/>
            </svg>
            <span>Translate</span>
          </button>
          <button class="nf-btn nf-btn-screenshot" title="Screenshot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span>Screenshot</span>
          </button>
          <button class="nf-btn nf-btn-pdf" title="Export PDF">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>PDF</span>
          </button>
          <button class="nf-btn nf-btn-close" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="nf-reader-content">
        <h1 class="nf-title" data-original="${this.escapeHtml(article.title)}">${this.escapeHtml(article.title)}</h1>
        ${article.standfirst ? `
          <div class="nf-standfirst" data-original="${this.escapeHtml(article.standfirst)}">${this.escapeHtml(article.standfirst)}</div>
        ` : ''}
        ${(article.author || article.date) ? `
          <div class="nf-meta">
            ${article.author ? `<div class="nf-author">${this.escapeHtml(article.author)}</div>` : ''}
          </div>
        ` : ''}
        ${article.featuredImage ? `
          <figure class="nf-featured-image">
            <img src="${this.escapeHtml(article.featuredImage)}" alt="" loading="lazy" crossorigin="anonymous" />
          </figure>
        ` : ''}
        <div class="nf-body" id="nf-body">
          ${article.paragraphs.map(p => this.renderParagraph(p)).join('')}
        </div>
      </div>
    `;

    document.documentElement.appendChild(this.overlay);
    document.body.classList.add('nf-reader-active');
    this.bindEvents();

    chrome.runtime.sendMessage({
      type: 'article_opened',
      data: { title: article.title, source: article.source, url: article.url }
    });
  },

  renderParagraph(p) {
    if (p.type === 'image') {
      return `<figure class="nf-article-image">
        <img src="${this.escapeHtml(p.src)}" alt="" loading="lazy" crossorigin="anonymous" />
        ${p.caption ? `<figcaption>${this.escapeHtml(p.caption)}</figcaption>` : ''}
      </figure>`;
    }
    if (p.type === 'heading') {
      const tag = `h${p.level || 2}`;
      return `<${tag} class="nf-heading" data-original="${this.escapeHtml(p.text)}">${this.escapeHtml(p.text)}</${tag}>`;
    }
    return `<p class="nf-paragraph" data-original="${this.escapeHtml(p.text)}">${this.escapeHtml(p.text)}</p>`;
  },

  bindEvents() {
    this.overlay.querySelector('.nf-btn-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('.nf-btn-translate').addEventListener('click', () => this.handleTranslateClick());
    this.overlay.querySelector('.nf-btn-screenshot').addEventListener('click', () => this.takeScreenshot());
    this.overlay.querySelector('.nf-btn-pdf').addEventListener('click', () => this.exportPDF());

    this.overlay.querySelector('.nf-translate-mode').addEventListener('change', (e) => {
      if (this.translated) {
        this.applyTranslateMode(e.target.value);
      }
    });

    this._escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escHandler);
  },

  close() {
    this._sessionId++;
    this._translationRunId++;
    this.active = false;
    this.translated = false;
    this.translating = false;
    document.body.classList.remove('nf-reader-active');
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
    }
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
    this.onClose = null;
  },

  getTranslateMode() {
    return this.overlay?.querySelector('.nf-translate-mode')?.value || 'bilingual';
  },

  applyTranslateMode(mode) {
    if (!this.overlay) return;
    this.overlay.querySelectorAll('.nf-translated').forEach(el => {
      if (mode === 'target') {
        el.classList.add('nf-target-only');
      } else {
        el.classList.remove('nf-target-only');
      }
    });
  },

  handleTranslateClick() {
    if (!this.overlay) return;
    if (this.translated) {
      const btn = this.overlay.querySelector('.nf-btn-translate');
      const paragraphs = this.overlay.querySelectorAll('.nf-translated');
      const isShowingOriginal = paragraphs[0]?.classList.contains('nf-show-original');

      if (isShowingOriginal) {
        paragraphs.forEach(p => p.classList.remove('nf-show-original'));
        btn.querySelector('span').textContent = 'Show Original';
      } else {
        paragraphs.forEach(p => p.classList.add('nf-show-original'));
        btn.querySelector('span').textContent = 'Show Translation';
      }
      return;
    }
    if (this.translating) return;
    this.translateAll();
  },

  async translateAll() {
    const overlay = this.overlay;
    if (!overlay) return;

    const btn = overlay.querySelector('.nf-btn-translate');
    if (!btn || this.translating) return;

    this.translating = true;
    const sessionId = this._sessionId;
    const translationRunId = ++this._translationRunId;
    const isStale = () => (
      this._sessionId !== sessionId ||
      this._translationRunId !== translationRunId ||
      !this.active ||
      !overlay.isConnected ||
      this.overlay !== overlay
    );

    btn.classList.add('nf-loading');

    const progressBar = overlay.querySelector('#nf-progress');
    const mode = this.getTranslateMode();
    const titleEl = overlay.querySelector('.nf-title');

    // Read target language from storage
    try {
      const settings = await new Promise(resolve =>
        chrome.storage.local.get('targetLang', resolve)
      );
      this._targetLang = settings.targetLang || 'zh-CN';
    } catch (e) {
      // fallback to default
    }
    const targetLang = this._targetLang;

    // Collect body elements in DOM order
    const bodyElements = [];
    overlay.querySelectorAll('.nf-standfirst[data-original], .nf-heading[data-original], .nf-paragraph[data-original]')
      .forEach(el => bodyElements.push(el));

    const total = (titleEl?.dataset.original ? 1 : 0) + bodyElements.length;
    if (total === 0) {
      btn.querySelector('span').textContent = 'Translate';
      btn.classList.remove('nf-loading');
      this.showToast('Nothing to translate');
      return;
    }

    let completed = 0;

    bodyElements.forEach(el => el.classList.add('nf-translating'));

    const applyTranslation = (el, translation) => {
      if (!el || !translation || isStale()) return;
      el.innerHTML = `<span class="nf-original">${this.escapeHtml(el.dataset.original)}</span>
                     <span class="nf-translation">${this.escapeHtml(translation)}</span>`;
      el.classList.remove('nf-translating');
      el.classList.add('nf-translated');
      const isTitle = el.classList.contains('nf-title');
      const isHeading = el.classList.contains('nf-heading');
      const isStandfirst = el.classList.contains('nf-standfirst');
      if (isTitle || isHeading || isStandfirst) el.classList.add('nf-title-like');
      if (mode === 'target') el.classList.add('nf-target-only');
    };

    const updateProgress = () => {
      if (isStale()) return;
      completed++;
      btn.querySelector('span').textContent = `Translating ${completed}/${total}...`;
      if (progressBar) progressBar.style.width = Math.min((completed / total) * 100, 100) + '%';
    };

    try {
      // Step 1: Translate title first for immediate feedback
      if (titleEl?.dataset.original) {
        btn.querySelector('span').textContent = `Translating 1/${total}...`;
        const response = await chrome.runtime.sendMessage({
          type: 'translate',
          data: { texts: [titleEl.dataset.original], from: 'en', to: targetLang }
        });
        if (isStale()) return;
        if (response?.error) throw new Error(response.error);
        if (response?.translations?.[0]) {
          applyTranslation(titleEl, response.translations[0]);
        }
        updateProgress();
      }

      // Step 2: Translate body in small chunks, render as they arrive
      const chunkSize = 3;
      const bodyTexts = bodyElements.map(el => el.dataset.original);

      for (let i = 0; i < bodyElements.length; i += chunkSize) {
        const chunkTexts = bodyTexts.slice(i, i + chunkSize);
        const chunkEls = bodyElements.slice(i, i + chunkSize);

        const response = await chrome.runtime.sendMessage({
          type: 'translate',
          data: { texts: chunkTexts, from: 'en', to: targetLang }
        });

        if (isStale()) return;
        if (response?.error) throw new Error(response.error);

        if (response?.translations) {
          response.translations.forEach((translation, idx) => {
            applyTranslation(chunkEls[idx], translation);
            updateProgress();
          });
        }
      }

      if (isStale()) return;
      this.translated = true;
      btn.querySelector('span').textContent = 'Show Original';
      btn.classList.remove('nf-loading');
      setTimeout(() => {
        if (progressBar) {
          progressBar.style.opacity = '0';
          setTimeout(() => { progressBar.style.width = '0%'; progressBar.style.opacity = '1'; }, 300);
        }
      }, 800);
    } catch (err) {
      if (isStale()) return;
      console.error('NewsForge translation error:', err);
      btn.querySelector('span').textContent = 'Translate';
      btn.classList.remove('nf-loading');
      if (progressBar) progressBar.style.width = '0%';
      bodyElements.forEach(el => el.classList.remove('nf-translating'));
      this.showToast(err.message || 'Translation failed');
    } finally {
      if (!isStale()) {
        this.translating = false;
      }
    }
  },

  showToast(message) {
    if (!this.overlay) return;
    const existing = this.overlay.querySelector('.nf-reader-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'nf-reader-toast';
    toast.textContent = message;
    this.overlay.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  // ========== Shared export clone logic ==========

  // Create a styled clone of .nf-reader-content for screenshot/PDF export
  _createExportClone(mode) {
    if (!this.overlay) return null;
    const content = this.overlay.querySelector('.nf-reader-content');
    if (!content) return null;

    const clone = content.cloneNode(true);
    clone.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: 680px; padding: 56px 32px 80px;
      background: #faf8f5; color: #1a1815;
      font-family: 'Source Serif 4', Georgia, 'Noto Serif SC', serif;
      line-height: 1.8;
    `;

    const origDisplay = mode === 'target' ? 'display:none;' : 'display:block;';
    const cnSans = '"Noto Sans SC","PingFang SC","Microsoft YaHei",-apple-system,sans-serif';
    const cnSerif = '"Noto Serif SC","Source Han Serif SC","SimSun",Georgia,serif';

    const styleMap = {
      '.nf-title': `font-size:38px;font-weight:700;line-height:1.2;margin:0 0 24px;color:#1a1815;letter-spacing:-0.5px;font-family:${cnSerif};`,
      '.nf-standfirst': `font-size:24px;line-height:1.55;margin:0 0 32px;color:#5a5651;font-family:${cnSerif};`,
      '.nf-meta': 'display:flex;align-items:center;gap:20px;margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid #e8e4df;',
      '.nf-author': `font-family:${cnSans};font-size:14px;font-weight:500;color:#5a5651;`,
      '.nf-heading': `font-size:24px;font-weight:600;margin:44px 0 20px;color:#1a1815;letter-spacing:-0.2px;padding-top:12px;border-top:2px solid #c45d3e;display:inline-block;font-family:${cnSerif};`,
      '.nf-paragraph': 'font-size:18px;line-height:1.9;margin:0 0 28px;color:#5a5651;',
      '.nf-original': origDisplay + 'color:#5a5651;margin-bottom:0;',
      '.nf-translation': `display:block;font-family:${cnSans};font-size:18px;line-height:1.9;color:#a84d32;margin-top:10px;`,
      '.nf-featured-image': 'margin:0 -32px 40px;padding:0;',
      '.nf-featured-image img': 'width:100%;height:auto;display:block;border-radius:12px;',
      '.nf-article-image': 'margin:32px -16px;padding:0;',
      '.nf-article-image img': 'width:100%;height:auto;display:block;border-radius:8px;',
      '.nf-article-image figcaption': `font-family:${cnSans};font-size:13px;color:#9a958e;margin-top:10px;padding:0 16px;line-height:1.5;`,
      '.nf-body': 'margin-top:32px;',
    };

    for (const [selector, styles] of Object.entries(styleMap)) {
      clone.querySelectorAll(selector).forEach(el => {
        el.style.cssText += styles;
      });
    }
    for (const [selector, styles] of Object.entries(styleMap)) {
      if (clone.matches && clone.matches(selector)) {
        clone.style.cssText += styles;
      }
    }

    // 标题内的翻译恢复标题字号和字体
    clone.querySelectorAll('.nf-title .nf-translation').forEach(el => {
      el.style.fontSize = '38px';
      el.style.fontWeight = '700';
      el.style.lineHeight = '1.2';
      el.style.fontFamily = cnSerif;
      el.style.letterSpacing = '-0.5px';
      el.style.marginTop = '12px';
    });
    clone.querySelectorAll('.nf-title .nf-original').forEach(el => {
      el.style.fontSize = '38px';
      el.style.fontWeight = '700';
      el.style.lineHeight = '1.2';
      el.style.fontFamily = cnSerif;
      el.style.letterSpacing = '-0.5px';
    });
    clone.querySelectorAll('.nf-standfirst .nf-original').forEach(el => {
      el.style.fontSize = '24px';
      el.style.lineHeight = '1.55';
      el.style.fontFamily = cnSerif;
      el.style.color = '#5a5651';
      el.style.marginTop = '0';
    });
    clone.querySelectorAll('.nf-standfirst .nf-translation').forEach(el => {
      el.style.fontSize = '24px';
      el.style.lineHeight = '1.55';
      el.style.fontFamily = cnSerif;
      el.style.color = '#a84d32';
      el.style.marginTop = '8px';
    });
    // 副标题翻译恢复副标题字号
    clone.querySelectorAll('.nf-heading .nf-original').forEach(el => {
      el.style.fontSize = '24px';
      el.style.fontWeight = '600';
      el.style.lineHeight = '1.3';
      el.style.fontFamily = cnSerif;
      el.style.marginTop = '0';
    });
    clone.querySelectorAll('.nf-heading .nf-translation').forEach(el => {
      el.style.fontSize = '24px';
      el.style.fontWeight = '600';
      el.style.lineHeight = '1.3';
      el.style.fontFamily = cnSerif;
      el.style.color = '#a84d32';
      el.style.marginTop = '8px';
    });

    // 译文模式：段落内的译文样式融入正文
    if (mode === 'target') {
      clone.querySelectorAll('.nf-paragraph .nf-translation').forEach(el => {
        el.style.fontSize = '18px';
        el.style.lineHeight = '1.9';
        el.style.color = '#5a5651';
        el.style.marginTop = '0';
      });
      clone.querySelectorAll('.nf-title .nf-translation').forEach(el => {
        el.style.color = '#1a1815';
      });
      clone.querySelectorAll('.nf-standfirst .nf-translation').forEach(el => {
        el.style.color = '#5a5651';
        el.style.marginTop = '0';
      });
      clone.querySelectorAll('.nf-heading .nf-translation').forEach(el => {
        el.style.color = '#1a1815';
        el.style.marginTop = '0';
      });
    }

    // 文末添加原文链接
    if (this.article?.url) {
      const urlBar = document.createElement('div');
      urlBar.className = 'nf-source-url';
      urlBar.textContent = this.article.url.split('?')[0];
      urlBar.style.cssText = `margin-top:48px;padding-top:20px;border-top:1px solid #e8e4df;font-family:${cnSans};font-size:12px;color:#9a958e;line-height:1.5;word-break:break-all;`;
      clone.appendChild(urlBar);
    }

    return clone;
  },

  // 截图
  async takeScreenshot() {
    if (typeof html2canvas === 'undefined' || !this.overlay) return;

    const btn = this.overlay.querySelector('.nf-btn-screenshot');
    btn.classList.add('nf-loading');
    const mode = this.getTranslateMode();

    try {
      const clone = this._createExportClone(mode);
      if (!clone) throw new Error('No content to capture');

      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: '#faf8f5',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      clone.remove();

      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `newsforge-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      console.error('NewsForge screenshot error:', err);
    }

    btn.classList.remove('nf-loading');
  },

  // PDF 导出：html2canvas → 图片 → PDF，解决 CJK 乱码
  async exportPDF() {
    if ((typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') || !this.overlay) return;
    if (typeof html2canvas === 'undefined') return;

    const btn = this.overlay.querySelector('.nf-btn-pdf');
    btn.classList.add('nf-loading');

    try {
      const mode = this.getTranslateMode();
      const clone = this._createExportClone(mode);
      if (!clone) throw new Error('No content to export');

      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        backgroundColor: '#faf8f5',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      clone.remove();

      // 将 canvas 切割为 A4 页（智能分页：找空白行避免截断文字）
      const { jsPDF } = window.jspdf;
      const pageW = 210, pageH = 297, margin = 10;
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;

      const pxPerMm = canvas.width / contentW;
      const pagePxH = Math.floor(contentH * pxPerMm);

      const imgData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const bgR = 250, bgG = 248, bgB = 245; // #faf8f5
      const threshold = 20;

      const isBlankRow = (y) => {
        const rowStart = y * canvas.width * 4;
        for (let x = 0; x < canvas.width * 4; x += 32) {
          const r = imgData.data[rowStart + x];
          const g = imgData.data[rowStart + x + 1];
          const b = imgData.data[rowStart + x + 2];
          if (Math.abs(r - bgR) > threshold || Math.abs(g - bgG) > threshold || Math.abs(b - bgB) > threshold) {
            return false;
          }
        }
        return true;
      };

      const findSafeCut = (targetY) => {
        const searchRange = Math.floor(pagePxH * 0.25);
        const minUp = Math.max(0, targetY - searchRange);
        const maxDown = Math.min(canvas.height - 1, targetY + searchRange);

        for (let y = targetY; y >= minUp; y -= 2) {
          if (isBlankRow(y)) return y;
        }
        for (let y = targetY + 2; y <= maxDown; y += 2) {
          if (isBlankRow(y)) return y;
        }
        return targetY;
      };

      const cuts = [0];
      let lastCut = 0;
      while (lastCut + pagePxH < canvas.height) {
        const targetY = lastCut + pagePxH;
        const safeY = findSafeCut(targetY);
        if (safeY <= lastCut) {
          cuts.push(targetY);
          lastCut = targetY;
        } else {
          cuts.push(safeY);
          lastCut = safeY;
        }
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      for (let i = 0; i < cuts.length; i++) {
        if (i > 0) doc.addPage();

        doc.setFillColor(250, 248, 245);
        doc.rect(0, 0, pageW, pageH, 'F');

        const srcY = cuts[i];
        const nextY = i + 1 < cuts.length ? cuts[i + 1] : canvas.height;
        const srcH = nextY - srcY;
        const drawH = srcH / pxPerMm;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.92);
        doc.addImage(pageImgData, 'JPEG', margin, margin, contentW, drawH);
      }

      doc.save(`newsforge-${Date.now()}.pdf`);
    } catch (err) {
      console.error('NewsForge PDF export error:', err);
    }

    btn.classList.remove('nf-loading');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
};
