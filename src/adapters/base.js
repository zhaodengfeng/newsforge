// Base Adapter - 所有站点适配器的基类
class BaseAdapter {
  constructor() {
    this.name = 'base';
    this.hostPatterns = [];
  }

  getURL() {
    try {
      if (window.location && window.location.href) {
        this._pageURL = window.location.href;
        return this._pageURL;
      }
    } catch (e) {}
    try {
      if (document.URL) {
        this._pageURL = document.URL;
        return this._pageURL;
      }
    } catch (e) {}
    if (this._pageURL) return this._pageURL;
    return '';
  }

  matches(url) {
    return this.hostPatterns.some(pattern => url.includes(pattern));
  }

  isArticlePage() {
    return false;
  }

  getTitle() {
    const selectors = ['h1', '[class*="headline"]', '[class*="title"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 5) {
        return el.innerText.trim();
      }
    }
    return document.title;
  }

  getAuthor() {
    const selectors = [
      '[class*="author"]', '[class*="byline"]', '[rel="author"]',
      '[itemprop="author"]', '.writer', '.reporter'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText.trim().replace(/^by\s+/i, '');
        if (text.length > 1 && text.length < 100) return text;
      }
    }
    return '';
  }

  getPublishDate() {
    const selectors = [
      'time', '[class*="date"]', '[class*="time"]',
      '[class*="publish"]', '[itemprop="datePublished"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const datetime = el.getAttribute('datetime') || el.getAttribute('content');
        if (datetime) return new Date(datetime).toLocaleDateString('zh-CN');
        const text = (el.innerText || '').trim();
        if (text.length > 4 && text.length < 50) return text;
      }
    }
    return '';
  }

  getFeaturedImage() {
    const selectors = [
      'article img', '[class*="hero"] img', '[class*="featured"] img',
      '[class*="lead"] img', 'figure img'
    ];
    for (const sel of selectors) {
      const img = document.querySelector(sel);
      if (img) {
        const src = img.src || img.getAttribute('data-src');
        if (src && !src.includes('avatar') && !src.includes('icon')) {
          return src;
        }
      }
    }
    return '';
  }

  getStandfirst() {
    return '';
  }

  getParagraphs() {
    const container = this.getContentContainer();
    if (!container) return [];

    const paragraphs = [];
    const seen = new Set();
    const elements = container.querySelectorAll('p, h2, h3, h4');

    elements.forEach(el => {
      const text = el.innerText?.trim();
      if (!text || text.length < 10) return;
      if (seen.has(text)) return;
      if (el.closest('pre, code, nav, header, footer, aside')) return;
      const parent = el.closest('[class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="recommend"], [class*="related"], [class*="newsletter"]');
      if (parent) return;

      seen.add(text);
      const tagName = el.tagName.toLowerCase();
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text
      });
    });

    // Fallback: 如果容器内没找到足够内容，全局扫描 p 标签
    if (paragraphs.length < 3) {
      paragraphs.length = 0;
      seen.clear();
      document.querySelectorAll('p').forEach(el => {
        const text = el.innerText?.trim();
        if (!text || text.length < 40) return;
        if (seen.has(text)) return;
        if (el.closest('nav, footer, aside')) return;
        seen.add(text);
        paragraphs.push({ type: 'text', level: 0, text });
      });
    }

    return paragraphs;
  }

  getContentContainer() {
    const candidates = [];
    const elements = document.querySelectorAll('article, main, [role="main"], [class*="article-body"], [class*="story-body"]');

    elements.forEach(el => {
      const score = this.calculateScore(el);
      if (score > 50) candidates.push({ element: el, score });
    });

    if (candidates.length === 0) {
      const divs = document.querySelectorAll('div, section');
      divs.forEach(el => {
        const score = this.calculateScore(el);
        if (score > 80) candidates.push({ element: el, score });
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.length > 0 ? candidates[0].element : document.body;
  }

  calculateScore(element) {
    const tagScores = { 'article': 100, 'main': 80, 'section': 60, 'div': 40 };
    let score = tagScores[element.tagName.toLowerCase()] || 20;

    const cls = (element.className + ' ' + element.id).toLowerCase();
    if (cls.includes('content')) score += 50;
    if (cls.includes('article')) score += 50;
    if (cls.includes('story')) score += 40;
    if (cls.includes('body')) score += 40;
    if (cls.includes('main')) score += 30;

    const text = element.innerText?.trim() || '';
    const links = element.querySelectorAll('a');
    const linkText = Array.from(links).reduce((sum, a) => sum + (a.innerText?.trim().length || 0), 0);
    const density = text.length > 0 ? (text.length - linkText) / text.length : 0;
    score *= (0.5 + 0.5 * density);

    score *= Math.min(text.length / 1000, 2);

    return score;
  }

  // ========== Shared image extraction helpers ==========

  // Resolve best image src from an img element (prefers data-* over src)
  _resolveImageSrc(img) {
    if (!img) return '';
    const candidates = [
      img.getAttribute('data-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src'),
      img.src,
      img.currentSrc
    ];
    for (const c of candidates) {
      if (c && /^https?:\/\//i.test(c)) return c;
    }
    return '';
  }

  // Check if an image src should be filtered out (avatars, icons, small images, etc.)
  _isFilteredImage(src, img) {
    if (!src) return true;
    if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot|head-shot|person|bio-photo/i.test(src)) return true;
    if (img && img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"], [class*="person"], [rel="author"]')) return true;
    if (img && img.closest('[class*="newsletter"], [class*="promo"], [class*="signup"], [class*="marketing"]')) return true;
    const w = img ? (img.naturalWidth || img.width || 0) : 0;
    const h = img ? (img.naturalHeight || img.height || 0) : 0;
    if (w > 0 && w <= 200) return true;
    if (h > 0 && h <= 200) return true;
    return false;
  }

  // Extract caption from figure/figcaption or adjacent element
  _getImageCaption(el, img) {
    const tagName = el.tagName.toLowerCase();
    const fig = el.closest('figure') || (tagName === 'figure' ? el : null);
    if (fig) {
      const fc = fig.querySelector('figcaption');
      if (fc && (fc.innerText || '').trim()) {
        return (fc.innerText || '').trim();
      }
      const capEl = fig.querySelector('[class*="caption"], [class*="credit"], [class*="Caption"], [class*="Credit"]');
      if (capEl && (capEl.innerText || '').trim().length < 300) {
        return (capEl.innerText || '').trim();
      }
    }
    // Fallback: next sibling element
    let next = img && img.parentElement && img.parentElement.nextElementSibling;
    if (!next) next = el.nextElementSibling;
    if (next && next.tagName) {
      const nt = (next.innerText || '').trim();
      if (nt.length > 2 && nt.length < 300 && !/^(Read More|Share|Most Read|Sign up|Subscribe)/i.test(nt)) {
        return nt;
      }
    }
    return '';
  }

  // Normalize image URL for deduplication (override in subclasses for site-specific logic)
  _normalizeImgUrl(url) {
    if (!url) return '';
    return url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
  }
}
