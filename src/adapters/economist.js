// The Economist Adapter
class EconomistAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'economist';
    this.hostPatterns = ['economist.com'];
  }

  isArticlePage() {
    const url = this.getURL();
    if (/economist\.com\/\w+\/\d{4}\//.test(url)) return true;
    if (/economist\.com\/the-world-in-brief/.test(url)) return true;
    if (document.querySelector('article')) return true;
    return false;
  }

  getTitle() {
    const selectors = ['h1[class*="headline"]', 'h1', '[class*="article-headline"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    }
    return document.title;
  }

  getAuthor() {
    const el = document.querySelector('[class*="rubric"], [class*="flytitle"]');
    if (el) return el.innerText.trim();
    return '';
  }

  getPublishDate() {
    const el = document.querySelector('time, [class*="date"], [class*="timestamp"]');
    if (el) {
      const dt = el.getAttribute('datetime');
      if (dt) return new Date(dt).toLocaleDateString('zh-CN');
      return el.innerText.trim();
    }
    return '';
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) {
      const src = og.getAttribute('content') || '';
      if (/engassets|og-image|\/og\./i.test(src)) return '';
      return src;
    }
    return super.getFeaturedImage();
  }

  getContentContainer() {
    const selectors = [
      '[class*="article-body"]', '[class*="story-text"]',
      '.layout-article-body', 'article', 'main'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 200) return el;
    }
    return super.getContentContainer();
  }

  _findArticleEndMarker(container) {
    const isBrief = /the-world-in-brief/.test(this.getURL() || '');
    const allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
    const total = allEls.length;
    for (let i = total - 1; i >= 0; i--) {
      const text = (allEls[i].innerText || '').trim();
      if (text.length > 100) continue;
      const lower = text.toLowerCase();
      if (isBrief) {
        if (/^(daily quiz|today's quiz|sign up|subscribe|newsletter|copyright)/.test(lower)) {
          return allEls[i];
        }
      } else {
        if (i < total * 0.7) return null;
        if (/^(explore more|more from|related|recommended|popular|trending|you may also|readers also|sign up|subscribe|newsletter|copyright|keep updated|more on this)/.test(lower)) {
          return allEls[i];
        }
      }
    }
    return null;
  }

  _normalizeImgUrl(url) {
    if (!url) return '';
    let path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    path = path.replace(/\/cdn-cgi\/image\/[^\/]+\//i, '/');
    path = path.replace(/\/img\/b\/\d+\/\d+\/\d+\//i, '/');
    return path;
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const seenImgKeys = new Set();
    const featuredSrc = this.getFeaturedImage();
    if (featuredSrc) {
      seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
    }

    const container = this.getContentContainer();
    if (!container) return paragraphs;

    const endMarker = this._findArticleEndMarker(container);
    const elements = container.querySelectorAll('p, h2, h3, h4, img, figure');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (el.closest('nav, header, footer, aside, audio, video, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="sidebar"]')) continue;

      const tagName = el.tagName.toLowerCase();

      // 图片
      if (tagName === 'img' || tagName === 'figure') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img);
        if (!src || seen.has(src)) continue;
        if (/og-image|engassets/i.test(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        const imgKey = this._normalizeImgUrl(src);
        if (seenImgKeys.has(imgKey)) continue;
        seenImgKeys.add(imgKey);
        seen.add(src);
        let caption = this._getImageCaption(el, img);
        if (!caption) {
          const alt = (img?.getAttribute('alt') || '').trim();
          if (alt && alt.length > 5 && alt.length < 300 && !/^(photo|image|graphic)/i.test(alt)) caption = alt;
        }
        paragraphs.push({ type: 'image', src, caption });
        continue;
      }

      // 文本
      if (el.closest('figcaption, audio, video')) continue;
      let text = (el.innerText || '').trim();
      // 修复 Economist 首字母下沉导致的额外空格
      text = text.replace(/^([A-Za-z])\s([a-z])/, '$1$2');
      if (text.length < 15) continue;
      if (seen.has(text)) continue;

      if (/^(explore more|more from)/i.test(text)) break;
      if (/^(sign up|subscribe|newsletter|related|recommended|keep updated|more on this)/i.test(text)) continue;
      if (/^copyright/i.test(text)) continue;
      if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
      if (/^(articles?|audio)\s+(updated|recorded)\s+\d+/i.test(text)) continue;
      if (/^listen to (the )?(briefing|audio|podcast)/i.test(text)) continue;
      if (/^follow (our |the )?latest coverage/i.test(text)) continue;
      if (/^catch up quickly on the global stories/i.test(text)) continue;
      if (/^sign up to enjoy/i.test(text)) continue;
      if (/^figure of the day/i.test(text) && text.length < 200) continue;

      seen.add(text);
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text
      });
    }

    return paragraphs;
  }
}
