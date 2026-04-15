// Reader Renderer - 渲染阅读模式 UI
// Theme support: NewsForge Default · Classic

// Theme definitions — SINGLE SOURCE OF TRUTH
const THEMES = {
  default: {
    label: 'NewsForge',
    bg: '#faf8f5',
    bgWarm: '#f5f2ed',
    text: '#1a1815',
    textSecondary: '#5a5651',
    accent: '#c45d3e',
    accentHover: '#a84d32',
    border: '#e8e4df',
    fontSerif: "'Source Serif 4', Georgia, 'Noto Serif SC', serif",
    fontSans: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontTitleCn: "'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif",
    toolbarBg: 'rgba(250, 248, 245, 0.92)',
    blankThreshold: 20,
    blankSearchSpan: 0.25,
  },
  classic: {
    label: 'Classic',
    bg: '#ffffff',
    bgWarm: '#f6f6f5',
    text: '#000000',
    textSecondary: '#000000',
    accent: '#000000',
    accentHover: '#333333',
    border: '#e0e0e0',
    fontSerif: "'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif",
    fontSans: "'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif",
    fontTitleCn: "'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif",
    toolbarBg: 'rgba(255, 255, 255, 0.95)',
    blankThreshold: 20,
    blankSearchSpan: 0.25,
  },
};

// Theme key registry — drives theme-select dropdown options in the toolbar
const THEME_KEYS = Object.keys(THEMES);

const EXPORT_IMAGE_FORMATS = {
  webp: { mime: 'image/webp', ext: 'webp' },
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
};

const EXPORT_QUALITY_PRESETS = {
  high: { screenshotQuality: 0.96, pdfQuality: 0.92 },
  balanced: { screenshotQuality: 0.9, pdfQuality: 0.88 },
  small: { screenshotQuality: 0.82, pdfQuality: 0.78 },
};

const PROMPT_AWARE_TRANSLATION_PROVIDERS = new Set([
  'openai',
  'deepseek',
  'qwen',
  'gemini',
  'glm',
  'kimi',
  'openrouter',
  'claude',
  'custom_openai',
  'custom_claude',
]);

const FALLBACK_TRANSLATION_CHUNK_SIZE = 3;
const LLM_FIRST_CHUNK_ITEMS = 3;
const LLM_FIRST_CHUNK_CHARS = 2200;
const LLM_MAX_CHUNK_ITEMS = 5;
const LLM_MAX_CHUNK_CHARS = 4200;
const EXPORT_CANVAS_SCALE = 2;
const EXPORT_MAX_CANVAS_SIDE = 24000;

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
  _currentTheme: 'default',

  // Load saved theme from storage — populates in-memory cache.
  // Returns a Promise so callers must await it before render().
  // Common path (cache warm): resolves immediately from cache.
  // Cold path (first ever open): reads from storage, resolves when callback fires.
  _loadTheme() {
    return new Promise((resolve) => {
      // Hot path: return cached value synchronously, resolve immediately
      if (this._cachedTheme && THEMES[this._cachedTheme]) {
        this._currentTheme = this._cachedTheme;
        resolve(this._currentTheme);
        return;
      }
      // Cold path: read from storage
      chrome.storage.local.get('readerTheme', (data) => {
        const saved = (data.readerTheme && THEMES[data.readerTheme]) ? data.readerTheme : 'default';
        this._currentTheme = saved;
        this._cachedTheme = saved;
        resolve(saved);
      });
    });
  },

  _saveTheme(theme) {
    // Validate BEFORE updating memory state
    if (!THEMES[theme]) return false;
    this._currentTheme = theme;
    this._cachedTheme = theme;
    chrome.storage.local.set({ readerTheme: theme }, () => {
      // Storage write is fire-and-forget; errors are silently ignored
    });
    return true;
  },

  _loadExportSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['exportImageFormat', 'exportQuality'], (data) => {
        const formatKey = EXPORT_IMAGE_FORMATS[data.exportImageFormat] ? data.exportImageFormat : 'jpeg';
        const qualityKey = EXPORT_QUALITY_PRESETS[data.exportQuality] ? data.exportQuality : 'balanced';
        resolve({
          imageFormat: EXPORT_IMAGE_FORMATS[formatKey],
          quality: EXPORT_QUALITY_PRESETS[qualityKey],
        });
      });
    });
  },

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
    // Store theme key in data attribute — the authoritative source for _getCurrentThemeKey()
    this.overlay.dataset.theme = this._currentTheme;
    this.overlay.className = `nf-reader nf-theme-${this._currentTheme}`;

    this.overlay.innerHTML = `
      <div class="nf-progress-bar" id="nf-progress" style="width: 0%;"></div>
      <div class="nf-reader-toolbar">
        <div class="nf-reader-meta">
          <span class="nf-badge">${article.source}</span>
          ${article.date ? `<span class="nf-date">${article.date}</span>` : ''}
        </div>
        <div class="nf-reader-actions">
          <select class="nf-select nf-theme-select" title="Style">
            ${THEME_KEYS.map(key =>
              `<option value="${key}" ${key === this._currentTheme ? 'selected' : ''}>${THEMES[key].label}</option>`
            ).join('')}
          </select>
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
            <img ${this.imageAttributes(article.featuredImage)} />
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

  imageAttributes(src, alt = '') {
    const skipCors = /media\.newyorker\.com/i.test(src || '');
    const corsAttr = skipCors ? '' : ' crossorigin="anonymous"';
    return `src="${this.escapeHtml(src || '')}" alt="${this.escapeHtml(alt || '')}" loading="lazy" decoding="async"${corsAttr}`;
  },

  renderParagraph(p) {
    if (p.type === 'image') {
      return `<figure class="nf-article-image">
        <img ${this.imageAttributes(p.src)} />
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

    // Theme switcher
    this.overlay.querySelector('.nf-theme-select').addEventListener('change', (e) => {
      const newTheme = e.target.value;
      if (this._saveTheme(newTheme)) {
        // Update data attribute and class — both kept in sync
        this.overlay.dataset.theme = newTheme;
        this.overlay.className = `nf-reader nf-theme-${newTheme}`;
      } else {
        // Invalid theme — reset select to current
        e.target.value = this._currentTheme;
      }
    });

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

  buildTranslationContext() {
    return {
      source: this.article?.source || '',
      title: this.article?.title || '',
      summary: this.article?.standfirst || '',
      terms: this.buildTranslationTerms()
    };
  },

  buildTranslationTerms() {
    const article = this.article || {};
    const pieces = [
      article.title || '',
      article.standfirst || '',
      ...(Array.isArray(article.paragraphs)
        ? article.paragraphs
            .filter(p => p && p.type !== 'image' && p.text)
            .map(p => p.text)
        : [])
    ];
    const fullText = pieces.join('\n').replace(/\s+/g, ' ').trim();
    if (!fullText) return '';

    const generic = new Set([
      'South China Morning Post', 'Hong Kong', 'Mainland China', 'United States',
      'US', 'UK', 'China', 'Chinese', 'Beijing', 'Taiwan', 'Asia', 'Europe',
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'
    ]);
    const seen = new Set();
    const terms = [];
    const namePattern = /\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:[-'][A-Za-z]+)?(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})(?:[-'][A-Za-z]+)?){1,3}\b/g;
    let match;

    while ((match = namePattern.exec(fullText)) && terms.length < 36) {
      const term = match[0].replace(/\s+/g, ' ').trim();
      if (term.length < 4 || term.length > 80) continue;
      if (generic.has(term)) continue;
      if (/^(The|This|That|These|Those|After|Before|During|For|With|From|About|Against|According)\b/.test(term)) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }

    const aliases = [];
    for (const term of terms) {
      const parts = term.split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      const first = parts[0].replace(/[^A-Za-z'-]/g, '');
      const last = parts[parts.length - 1].replace(/[^A-Za-z'-]/g, '');
      if (first && first.length > 2) aliases.push(`${first} => ${term}`);
      if (last && last.length > 2 && last.toLowerCase() !== first.toLowerCase()) aliases.push(`${last} => ${term}`);
    }

    return [
      terms.length ? `Full-name candidates for entity consistency: ${terms.join('; ')}` : '',
      aliases.length ? `Alias/coreference hints, not translations: ${aliases.slice(0, 32).join('; ')}` : ''
    ].filter(Boolean).join('\n').slice(0, 2200);
  },

  _hashForCache(text = '') {
    let hash = 2166136261;
    const input = String(text);
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },

  buildTranslationCacheScope() {
    const article = this.article || {};
    const paragraphs = Array.isArray(article.paragraphs) ? article.paragraphs : [];
    const articleText = [
      article.title || '',
      article.standfirst || '',
      ...paragraphs
        .filter(p => p && p.type !== 'image' && p.text)
        .map(p => p.text)
    ].join('\n');

    return {
      articleUrl: String(article.url || '').split('#')[0].split('?')[0],
      articleHash: this._hashForCache(articleText)
    };
  },

  isPromptAwareTranslationProvider(provider) {
    return PROMPT_AWARE_TRANSLATION_PROVIDERS.has(provider);
  },

  buildTranslationChunks(texts, provider) {
    const safeTexts = texts.map(text => String(text || ''));
    const promptAware = this.isPromptAwareTranslationProvider(provider);

    if (!promptAware) {
      const chunks = [];
      for (let i = 0; i < safeTexts.length; i += FALLBACK_TRANSLATION_CHUNK_SIZE) {
        chunks.push({ start: i, end: Math.min(i + FALLBACK_TRANSLATION_CHUNK_SIZE, safeTexts.length) });
      }
      return chunks;
    }

    const chunks = [];
    let start = 0;
    let chunkIndex = 0;
    while (start < safeTexts.length) {
      let end = start;
      let chars = 0;
      const maxItems = chunkIndex === 0 ? LLM_FIRST_CHUNK_ITEMS : LLM_MAX_CHUNK_ITEMS;
      const maxChars = chunkIndex === 0 ? LLM_FIRST_CHUNK_CHARS : LLM_MAX_CHUNK_CHARS;

      while (end < safeTexts.length && end - start < maxItems) {
        const nextLen = safeTexts[end].length;
        if (end > start && chars + nextLen > maxChars) break;
        chars += nextLen;
        end++;
      }

      if (end === start) end++;
      chunks.push({ start, end });
      start = end;
      chunkIndex++;
    }

    return chunks;
  },

  hasIncompleteTranslations(texts, translations) {
    if (!Array.isArray(translations) || translations.length < texts.length) return true;
    return texts.some((text, idx) => String(text || '').trim() && !String(translations[idx] || '').trim());
  },

  async requestTranslationsWithFallback({ texts, targetLang, contentType, context, provider, cacheScope, isStale }) {
    const response = await chrome.runtime.sendMessage({
      type: 'translate',
      data: {
        texts,
        from: 'en',
        to: targetLang,
        contentType,
        context,
        cacheScope
      }
    });

    if (isStale()) return null;
    if (response?.error) throw new Error(response.error);

    const translations = Array.isArray(response?.translations) ? response.translations : [];
    if (!this.hasIncompleteTranslations(texts, translations)) {
      return translations.slice(0, texts.length);
    }

    if (this.isPromptAwareTranslationProvider(provider) && texts.length > 1) {
      const mid = Math.ceil(texts.length / 2);
      const left = await this.requestTranslationsWithFallback({
        texts: texts.slice(0, mid),
        targetLang,
        contentType,
        context,
        provider,
        cacheScope,
        isStale
      });
      if (isStale() || !left) return null;

      const right = await this.requestTranslationsWithFallback({
        texts: texts.slice(mid),
        targetLang,
        contentType,
        context,
        provider,
        cacheScope,
        isStale
      });
      if (isStale() || !right) return null;
      return [...left, ...right];
    }

    if (!translations.length) {
      throw new Error('Translation returned empty response');
    }

    if (this.isPromptAwareTranslationProvider(provider)) {
      throw new Error('Translation returned incomplete response');
    }

    return texts.map((_, idx) => translations[idx] || '');
  },

  _normalizeTranslationCompareText(text = '') {
    return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
  },

  _escapeRegExp(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  sanitizeTitleLikeTranslation(translation, original) {
    let text = String(translation || '').replace(/\r\n/g, '\n').trim();
    const originalText = String(original || '').trim();
    if (!text || !originalText) return text;

    const originalNorm = this._normalizeTranslationCompareText(originalText);
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length > 1 && this._normalizeTranslationCompareText(lines[0]) === originalNorm) {
      text = lines.slice(1).join(' ').trim();
    }

    const originalPattern = this._escapeRegExp(originalText).replace(/\s+/g, '\\s+');
    const prefixedOriginalPattern = new RegExp(
      `^\\s*${originalPattern}\\s*(?:[:：\\-–—|]\\s*)?`,
      'i'
    );
    const withoutOriginalPrefix = text.replace(prefixedOriginalPattern, '').trim();
    if (withoutOriginalPrefix && withoutOriginalPrefix !== text) {
      text = withoutOriginalPrefix;
    }

    return text.replace(/\s*\n+\s*/g, ' ').trim();
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
    const translationContext = this.buildTranslationContext();
    const translationCacheScope = this.buildTranslationCacheScope();

    try {
      const settings = await new Promise(resolve =>
        chrome.storage.local.get(['targetLang', 'translationProvider'], resolve)
      );
      this._targetLang = settings.targetLang || 'zh-CN';
      this._translationProvider = settings.translationProvider || 'google';
    } catch (e) {
      this._targetLang = 'zh-CN';
      this._translationProvider = 'google';
    }
    const targetLang = this._targetLang;
    const translationProvider = this._translationProvider;

    const bodyElements = [];
    overlay.querySelectorAll('.nf-standfirst[data-original], .nf-heading[data-original], .nf-paragraph[data-original]')
      .forEach(el => bodyElements.push(el));

    const total = (titleEl?.dataset.original ? 1 : 0) + bodyElements.length;
    if (total === 0) {
      btn.querySelector('span').textContent = 'Translate';
      btn.classList.remove('nf-loading');
      this.showToast('Nothing to translate');
      this.translating = false;
      return;
    }

    let completed = 0;
    bodyElements.forEach(el => el.classList.add('nf-translating'));

    const applyTranslation = (el, translation) => {
      if (!el || !translation || isStale()) return;
      const isTitleLike = (
        el.classList.contains('nf-title') ||
        el.classList.contains('nf-heading') ||
        el.classList.contains('nf-standfirst')
      );
      const normalizedTranslation = isTitleLike
        ? this.sanitizeTitleLikeTranslation(translation, el.dataset.original)
        : String(translation || '').trim();
      if (!normalizedTranslation) return;
      el.innerHTML = `<span class="nf-original">${this.escapeHtml(el.dataset.original)}</span>
                     <span class="nf-translation">${this.escapeHtml(normalizedTranslation)}</span>`;
      el.classList.remove('nf-translating');
      el.classList.add('nf-translated');
      if (isTitleLike) {
        el.classList.add('nf-title-like');
      }
      if (mode === 'target') el.classList.add('nf-target-only');
    };

    const updateProgress = () => {
      if (isStale()) return;
      completed++;
      btn.querySelector('span').textContent = `Translating ${completed}/${total}...`;
      if (progressBar) progressBar.style.width = Math.min((completed / total) * 100, 100) + '%';
    };

    try {
      if (titleEl?.dataset.original) {
        btn.querySelector('span').textContent = `Translating 1/${total}...`;
        const translations = await this.requestTranslationsWithFallback({
          texts: [titleEl.dataset.original],
          targetLang,
          contentType: 'headline',
          context: translationContext,
          provider: translationProvider,
          cacheScope: translationCacheScope,
          isStale
        });
        if (isStale()) return;
        if (translations?.[0]) {
          applyTranslation(titleEl, translations[0]);
        }
        updateProgress();
      }

      const bodyTexts = bodyElements.map(el => el.dataset.original);
      const chunks = this.buildTranslationChunks(bodyTexts, translationProvider);

      for (const chunk of chunks) {
        const chunkTexts = bodyTexts.slice(chunk.start, chunk.end);
        const chunkEls = bodyElements.slice(chunk.start, chunk.end);

        const translations = await this.requestTranslationsWithFallback({
          texts: chunkTexts,
          targetLang,
          contentType: 'body',
          context: translationContext,
          provider: translationProvider,
          cacheScope: translationCacheScope,
          isStale
        });

        if (isStale()) return;
        if (!translations) return;

        chunkEls.forEach((el, idx) => {
          applyTranslation(el, translations[idx]);
          updateProgress();
        });
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

  // ========== Export clone logic ==========

  // Read theme from data attribute — the authoritative source set by render() and theme switch
  _getCurrentThemeKey() {
    return this.overlay?.dataset?.theme || 'default';
  },

  _createExportClone(mode) {
    if (!this.overlay) return null;
    const content = this.overlay.querySelector('.nf-reader-content');
    if (!content) return null;

    const themeKey = this._getCurrentThemeKey();
    const theme = THEMES[themeKey] || THEMES.default;
    const clone = content.cloneNode(true);

    clone.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: 680px; padding: 56px 32px 80px;
      background: ${theme.bg}; color: ${theme.text};
      font-family: ${theme.fontSerif};
      line-height: 1.8;
    `;

    const origDisplay = mode === 'target' ? 'display:none;' : 'display:block;';

    const styleMap = {
      '.nf-title': `font-size:${theme.titleSize || '38px'};font-weight:${theme.titleWeight || '700'};line-height:1.2;margin:0 0 24px;color:${theme.text};letter-spacing:-0.5px;font-family:${theme.fontTitleCn};`,
      '.nf-standfirst': `font-size:24px;line-height:1.55;margin:0 0 32px;color:${theme.textSecondary};font-family:${theme.fontSerif};`,
      '.nf-meta': `display:flex;align-items:center;gap:20px;margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid ${theme.border};`,
      '.nf-author': `font-family:${theme.fontSans};font-size:14px;font-weight:500;color:${theme.textSecondary};`,
      '.nf-heading': `font-size:24px;font-weight:600;margin:44px 0 20px;color:${theme.text};letter-spacing:-0.2px;padding-top:12px;border-top:2px solid ${theme.accent};display:inline-block;font-family:${theme.fontSerif};`,
      '.nf-paragraph': `font-size:18px;line-height:1.9;margin:0 0 28px;color:${theme.textSecondary};`,
      '.nf-original': origDisplay + `color:${theme.textSecondary};margin-bottom:0;`,
      '.nf-translation': `display:block;font-family:${theme.fontSans};font-size:18px;line-height:1.9;color:${theme.accentHover};margin-top:10px;`,
      '.nf-featured-image': 'margin:0 -32px 40px;padding:0;',
      '.nf-featured-image img': 'width:100%;height:auto;display:block;border-radius:12px;',
      '.nf-article-image': 'margin:32px -16px;padding:0;',
      '.nf-article-image img': 'width:100%;height:auto;display:block;border-radius:8px;',
      '.nf-article-image figcaption': `font-family:${theme.fontSans};font-size:13px;color:${theme.textSecondary};margin-top:10px;padding:0 16px;line-height:1.5;opacity:0.7;`,
      '.nf-body': 'margin-top:32px;',
    };

    for (const [selector, styles] of Object.entries(styleMap)) {
      clone.querySelectorAll(selector).forEach(el => {
        el.style.cssText = styles;   // overwrite, not append
      });
    }
    if (clone.matches && clone.matches('.nf-reader-content')) {
      const match = Object.entries(styleMap).find(([s]) => clone.matches(s));
      if (match) clone.style.cssText = match[1];
    }

    // Title translation keeps title font/size/family
    clone.querySelectorAll('.nf-title .nf-translation').forEach(el => {
      el.style.cssText = `display:block;font-size:${theme.titleSize || '38px'};font-weight:${theme.titleWeight || '700'};line-height:1.2;font-family:${theme.fontTitleCn};letter-spacing:-0.5px;margin-top:12px;color:${theme.accentHover};`;
    });
    clone.querySelectorAll('.nf-title .nf-original').forEach(el => {
      el.style.cssText = `display:block;font-size:${theme.titleSize || '38px'};font-weight:${theme.titleWeight || '700'};line-height:1.2;font-family:${theme.fontTitleCn};letter-spacing:-0.5px;color:${theme.text};`;
    });

    // Standfirst translation
    clone.querySelectorAll('.nf-standfirst .nf-original').forEach(el => {
      el.style.cssText = `display:block;font-size:24px;line-height:1.55;font-family:${theme.fontSerif};color:${theme.textSecondary};margin-top:0;`;
    });
    clone.querySelectorAll('.nf-standfirst .nf-translation').forEach(el => {
      el.style.cssText = `display:block;font-size:24px;line-height:1.55;font-family:${theme.fontSans};color:${theme.accentHover};margin-top:8px;`;
    });

    // Heading translation
    clone.querySelectorAll('.nf-heading .nf-original').forEach(el => {
      el.style.cssText = `display:block;font-size:24px;font-weight:600;line-height:1.3;font-family:${theme.fontSerif};margin-top:0;color:${theme.text};`;
    });
    clone.querySelectorAll('.nf-heading .nf-translation').forEach(el => {
      el.style.cssText = `display:block;font-size:24px;font-weight:600;line-height:1.3;font-family:${theme.fontSans};color:${theme.accentHover};margin-top:8px;`;
    });

    // Target-only mode: translation blends into body
    if (mode === 'target') {
      clone.querySelectorAll('.nf-paragraph .nf-translation').forEach(el => {
        el.style.cssText = `display:block;font-size:18px;line-height:1.9;color:${theme.textSecondary};margin-top:0;`;
      });
      clone.querySelectorAll('.nf-title .nf-translation').forEach(el => {
        el.style.color = theme.text;
      });
      clone.querySelectorAll('.nf-standfirst .nf-translation').forEach(el => {
        el.style.cssText = `display:block;font-size:24px;line-height:1.55;color:${theme.textSecondary};margin-top:0;`;
      });
      clone.querySelectorAll('.nf-heading .nf-translation').forEach(el => {
        el.style.color = theme.text;
        el.style.marginTop = '0';
      });
    }

    // Source URL bar at bottom
    if (this.article?.url) {
      const urlBar = document.createElement('div');
      urlBar.className = 'nf-source-url';
      urlBar.textContent = this.article.url.split('?')[0];
      urlBar.style.cssText = `margin-top:48px;padding-top:20px;border-top:1px solid ${theme.border};font-family:${theme.fontSans};font-size:12px;color:${theme.textSecondary};line-height:1.5;word-break:break-all;opacity:0.6;`;
      clone.appendChild(urlBar);
    }

    return clone;
  },

  _getExportSize(clone) {
    const rect = clone.getBoundingClientRect();
    return {
      width: Math.ceil(Math.max(clone.scrollWidth || 0, clone.offsetWidth || 0, rect.width || 0)),
      height: Math.ceil(Math.max(clone.scrollHeight || 0, clone.offsetHeight || 0, rect.height || 0))
    };
  },

  _calculateExportCuts(clone, pageCssHeight, totalHeight) {
    const cuts = [0];
    const rootTop = clone.getBoundingClientRect().top;
    const breakCandidates = Array.from(clone.querySelectorAll('.nf-title, .nf-standfirst, .nf-meta, .nf-featured-image, .nf-heading, .nf-paragraph, .nf-article-image, .nf-source-url'))
      .map(el => Math.ceil(el.getBoundingClientRect().bottom - rootTop))
      .filter(y => y > 0 && y < totalHeight)
      .sort((a, b) => a - b);

    let lastCut = 0;
    while (lastCut + pageCssHeight < totalHeight) {
      const target = lastCut + pageCssHeight;
      const minSafe = lastCut + Math.floor(pageCssHeight * 0.55);
      const safeCut = breakCandidates.filter(y => y > minSafe && y <= target).pop();
      const nextCut = safeCut || target;
      const boundedCut = Math.min(Math.max(Math.floor(nextCut), lastCut + 120), totalHeight);
      if (boundedCut <= lastCut || boundedCut >= totalHeight) break;
      cuts.push(boundedCut);
      lastCut = boundedCut;
    }

    if (cuts[cuts.length - 1] !== totalHeight) {
      cuts.push(totalHeight);
    }
    return cuts;
  },

  async _renderExportCanvas(clone, theme, options = {}) {
    const size = this._getExportSize(clone);
    const width = Math.max(1, Math.ceil(options.width || size.width));
    const height = Math.max(1, Math.ceil(options.height || size.height));
    const y = Math.max(0, Math.floor(options.y || 0));
    return html2canvas(clone, {
      backgroundColor: theme.bg,
      scale: options.scale || EXPORT_CANVAS_SCALE,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 10000,
      logging: false,
      width,
      height,
      x: 0,
      y,
      scrollX: 0,
      scrollY: 0,
      windowWidth: width,
      windowHeight: height
    });
  },

  _flattenCanvas(canvas, backgroundColor) {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    return flat;
  },

  _canvasToBlob(canvas, mime, quality) {
    return new Promise(resolve => {
      canvas.toBlob(resolve, mime, quality);
    });
  },

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async takeScreenshot() {
    if (typeof html2canvas === 'undefined' || !this.overlay) return;

    const btn = this.overlay.querySelector('.nf-btn-screenshot');
    btn.classList.add('nf-loading');
    const mode = this.getTranslateMode();
    const themeKey = this._getCurrentThemeKey();
    const theme = THEMES[themeKey] || THEMES.default;
    let clone = null;

    try {
      clone = this._createExportClone(mode);
      if (!clone) throw new Error('No content to capture');

      document.body.appendChild(clone);

      const exportSettings = await this._loadExportSettings();
      const { mime, ext } = exportSettings.imageFormat;
      const quality = mime === 'image/png' ? undefined : exportSettings.quality.screenshotQuality;
      const size = this._getExportSize(clone);
      const maxTileCssHeight = Math.floor(EXPORT_MAX_CANVAS_SIDE / EXPORT_CANVAS_SCALE);
      const timestamp = Date.now();

      if (size.height <= maxTileCssHeight) {
        const canvas = await this._renderExportCanvas(clone, theme, { width: size.width, height: size.height });
        const blob = await this._canvasToBlob(this._flattenCanvas(canvas, theme.bg), mime, quality);
        if (!blob) throw new Error('Screenshot export failed');
        this._downloadBlob(blob, `newsforge-${timestamp}.${ext}`);
      } else {
        const cuts = this._calculateExportCuts(clone, maxTileCssHeight, size.height);
        for (let i = 0; i < cuts.length - 1; i++) {
          const y = cuts[i];
          const height = cuts[i + 1] - y;
          const canvas = await this._renderExportCanvas(clone, theme, { width: size.width, height, y });
          const blob = await this._canvasToBlob(this._flattenCanvas(canvas, theme.bg), mime, quality);
          if (!blob) throw new Error('Screenshot export failed');
          const part = String(i + 1).padStart(2, '0');
          const total = String(cuts.length - 1).padStart(2, '0');
          this._downloadBlob(blob, `newsforge-${timestamp}-${part}-of-${total}.${ext}`);
        }
        this.showToast(`Long article exported as ${cuts.length - 1} images`);
      }
    } catch (err) {
      console.error('NewsForge screenshot error:', err);
      this.showToast(err.message || 'Screenshot failed');
    } finally {
      clone?.remove();
      btn.classList.remove('nf-loading');
    }
  },

  // PDF 导出：按页分片 html2canvas → 图片 → PDF，避免超长文章超过浏览器 canvas 上限。
  async exportPDF() {
    if ((typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') || !this.overlay) return;
    if (typeof html2canvas === 'undefined') return;

    const btn = this.overlay.querySelector('.nf-btn-pdf');
    btn.classList.add('nf-loading');
    let clone = null;

    try {
      const mode = this.getTranslateMode();
      const themeKey = this._getCurrentThemeKey();
      const theme = THEMES[themeKey] || THEMES.default;
      const exportSettings = await this._loadExportSettings();
      const pdfQuality = exportSettings.quality.pdfQuality;

      clone = this._createExportClone(mode);
      if (!clone) throw new Error('No content to export');

      document.body.appendChild(clone);

      // Parse theme bg color for blank-detection
      const bgHex = theme.bg; // '#faf8f5' or '#000000'
      const bgR = parseInt(bgHex.slice(1, 3), 16);
      const bgG = parseInt(bgHex.slice(3, 5), 16);
      const bgB = parseInt(bgHex.slice(5, 7), 16);

      const { jsPDF } = window.jspdf;
      const pageW = 210, pageH = 297, margin = 10;
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      const size = this._getExportSize(clone);
      const pageCssHeight = Math.floor((contentH / contentW) * size.width);
      const cuts = this._calculateExportCuts(clone, pageCssHeight, size.height);
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      for (let i = 0; i < cuts.length - 1; i++) {
        if (i > 0) doc.addPage();

        doc.setFillColor(bgR, bgG, bgB);
        doc.rect(0, 0, pageW, pageH, 'F');

        const srcY = cuts[i];
        const nextY = cuts[i + 1];
        const srcH = nextY - srcY;
        const canvas = await this._renderExportCanvas(clone, theme, { width: size.width, height: srcH, y: srcY });
        const pageCanvas = this._flattenCanvas(canvas, theme.bg);
        const drawH = Math.min(contentH, (srcH / size.width) * contentW);
        const pageImgData = pageCanvas.toDataURL('image/jpeg', pdfQuality);
        doc.addImage(pageImgData, 'JPEG', margin, margin, contentW, drawH);
      }

      doc.save(`newsforge-${Date.now()}.pdf`);
    } catch (err) {
      console.error('NewsForge PDF export error:', err);
      this.showToast('PDF export failed');
    } finally {
      clone?.remove();
      btn.classList.remove('nf-loading');
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
};
