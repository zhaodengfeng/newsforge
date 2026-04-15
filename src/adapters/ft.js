// Financial Times Adapter
class FTAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'ft';
    this.hostPatterns = ['ft.com'];
  }

  isArticlePage() {
    return /ft\.com\/content\//.test(this.getURL());
  }

  getTitle() {
    const selectors = ['[class*="headline"]', 'h1', '[data-trackable="headline"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    }
    return document.title;
  }

  getAuthor() {
    const el = document.querySelector('[class*="author"], [data-trackable="author"]');
    if (el) return el.innerText.trim().replace(/^by\s+/i, '');
    return '';
  }

  getPublishDate() {
    const el = document.querySelector('time, [class*="date"]');
    if (el) {
      const dt = el.getAttribute('datetime');
      if (dt) return new Date(dt).toLocaleDateString('zh-CN');
      return el.innerText.trim();
    }
    return '';
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content') || '';
    return super.getFeaturedImage();
  }

  getContentContainer() {
    const selectors = [
      '[class*="article-body"]', '[class*="story-body"]',
      '.article__content', 'article'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 200) return el;
    }
    return super.getContentContainer();
  }

  _findArticleEndMarker() {
    const scope = document.querySelector('article') || this.getContentContainer() || document;
    const allEls = scope.querySelectorAll('h2, h3, h4, [role="heading"], a[href], p');
    const total = allEls.length;
    for (let i = total - 1; i >= 0; i--) {
      const text = (allEls[i].innerText || '').trim().toLowerCase();
      if (i < total * 0.7) return null;
      if (/^(latest on|more from the ft|related|recommended|popular in|more stories|explore the ft|try premium|myft|copyright|newsletter|sign up|subscribe|understanding the most|signed in as|edit commenting|show comments|exclusively for subscribers)/.test(text)) {
        return allEls[i];
      }
    }
    return null;
  }

  // Resolve image src with <picture>/<source srcset> support
  _resolveImageSrc(img, el) {
    // Try standard resolution first
    const src = super._resolveImageSrc(img);
    if (src) return src;

    // FT uses <picture> with <source srcset>
    const tagName = el ? el.tagName.toLowerCase() : '';
    let picEl = tagName === 'picture' ? el : null;
    if (!picEl && el) picEl = el.closest ? el.closest('picture') : null;
    if (!picEl && tagName === 'figure' && el) picEl = el.querySelector('picture');

    if (picEl) {
      const sources = picEl.querySelectorAll('source[srcset]');
      for (const source of sources) {
        const srcset = source.getAttribute('srcset') || '';
        const parts = srcset.split(',');
        for (const part of parts) {
          const url = part.trim().split(/\s+/)[0];
          if (url && /^https?:\/\//i.test(url)) return url;
        }
      }
    }
    return '';
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const featuredSrc = this.getFeaturedImage();
    const container = this.getContentContainer();
    if (!container) return paragraphs;
    const skipSelector = 'nav, header, footer, aside, [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="newsletter"], [class*="promo"], [class*="related"], [class*="article-info"], [class*="byline"], [class*="timestamp"], [class*="meta"], [class*="teaser"], [class*="magnet"], [class*="event-promo"]';

    const endMarker = this._findArticleEndMarker();

    const articleEl = document.querySelector('article') || container;
    const elements = articleEl.querySelectorAll('p, h2, h3, h4, img, figure, picture');

    let skipAfterMethodology = false;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (el.closest(skipSelector)) continue;

      const tagName = el.tagName.toLowerCase();

      // 图片：处理 img, figure, picture
      if (tagName === 'img' || tagName === 'figure' || tagName === 'picture') {
        if (skipAfterMethodology) continue;
        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img, el);
        if (!src || seen.has(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        if (src === featuredSrc) continue;
        // FT uses smaller images, lower size threshold
        const w = img ? (img.naturalWidth || img.width || 0) : 0;
        if (w > 0 && w <= 50) continue;
        seen.add(src);
        let caption = this._getImageCaption(el, img);
        // FT-specific fallback: filter promo text from captions
        if (!caption) {
          let next = img && img.parentElement && img.parentElement.nextElementSibling;
          if (!next) next = el.nextElementSibling;
          if (next && next.tagName) {
            const nt = (next.innerText || '').trim();
            if (nt.length > 2 && nt.length < 300 && !/^(sign up|subscribe|newsletter|myft|try premium|more from|read more|share this|follow|copyright|get ahead|managing risk)/i.test(nt)) {
              caption = nt;
            }
          }
        }
        paragraphs.push({ type: 'image', src, caption });
        continue;
      }

      // 文本
      const text = (el.innerText || '').trim();

      // Track Methodology section: skip heading and all subsequent content until next heading
      if (/^methodology$/i.test(text) && tagName.startsWith('h')) {
        skipAfterMethodology = true;
        continue;
      }
      if (skipAfterMethodology) {
        if (tagName.startsWith('h')) {
          skipAfterMethodology = false;
        } else {
          continue;
        }
      }

      if (text.length < 15) continue;

      if (el.closest('figcaption')) continue;
      if (text.length < 15) continue;
      if (seen.has(text)) continue;

      // Filter interactive sections and video embeds
      if (/^share your thoughts$/i.test(text)) continue;
      if (/join the conversation/i.test(text)) continue;
      if (/^watch:/i.test(text)) continue;
      if (/^(published|updated|first published)\s*/i.test(text) && /\b(ago|yesterday|\d{4})\b/i.test(text)) continue;
      if (/^get ahead with daily|^keep up with|^stay informed|^follow the topics/i.test(text)) continue;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) continue;
      if (/email|@ft\.com/i.test(text) && text.length < 80) continue;
      if (/^exclusively for subscribers\b/i.test(text)) continue;
      if (/^latest on\b/i.test(text)) continue;
      if (/^managing risk and opportunity in the world/i.test(text)) continue;
      if (/^(sign up|subscribe|newsletter|myft|try premium|more from|read more|share this|follow|copyright|signed in as|edit commenting|show comments|understanding the most)/i.test(text)) continue;
      if (/^understanding the (most|key|latest|important)/i.test(text) && text.length < 120) continue;
      if (/signed in as/i.test(text) && /edit (commenting|display name)/i.test(text)) continue;
      if (/^https?:\/\//i.test(text) && text.length < 120) continue;
      if (/^[\w\s]+\s+in\s+[A-Z][\w\s]+$/.test(text) && text.length < 60) continue;

      seen.add(text);
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text
      });
    }

    // Fallback
    if (paragraphs.filter(p => p.type === 'text').length < 3) {
      paragraphs.length = 0;
      seen.clear();
      const allP = document.querySelectorAll('p');
      for (let j = 0; j < allP.length; j++) {
        const el2 = allP[j];
        const text2 = (el2.innerText || '').trim();
        if (text2.length < 40) continue;
        if (seen.has(text2)) continue;
        if (el2.closest(skipSelector)) continue;
        const t2Lower = text2.toLowerCase();
        if (/^(managing risk|get ahead|keep up|latest on|more from the ft|related|popular in|more stories|explore the ft|try premium|myft|sign up|subscribe|newsletter|understanding the most|signed in as|edit commenting|show comments|exclusively for subscribers|methodology)/.test(t2Lower)) break;
        if (/^exclusively for subscribers\b/i.test(text2)) continue;
        if (/^latest on\b/i.test(text2)) continue;
        if (/^recommended$/i.test(text2)) continue;
        seen.add(text2);
        paragraphs.push({ type: 'text', level: 0, text: text2 });
      }
    }

    return paragraphs;
  }
}
