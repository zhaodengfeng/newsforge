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

  getStandfirst() {
    // 副标题通常是紧跟在 h1 后面的那个 h2
    const h1 = document.querySelector('h1');
    if (h1) {
      let next = h1.nextElementSibling;
      while (next) {
        if (next.tagName === 'H2') {
          const text = next.innerText.trim();
          if (text.length > 10 && text.length < 300) return text;
          break;
        }
        if (next.tagName === 'DIV' && next.innerText.trim().length > 200) break;
        next = next.nextElementSibling;
      }
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
        // "More from [region]" 区域性标题优先检测，不管位置
        if (/^more from \w+/i.test(lower)) return allEls[i];
        if (i < total * 0.7) return null;
        if (/^(explore more|related|recommended|popular|trending|you may also|readers also|sign up|subscribe|newsletter|copyright|keep updated|more on this)/.test(lower)) {
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
    path = path.replace(/\/styles\/[^\/]+\/public\//i, '/');
    return path;
  }

  _isDailyQuizModule(el) {
    if (!el) return false;

    const quizInstructionRe = /we will serve you a new question each weekday|your challenge is to give us all five answers|quizespresso@economist\.com/i;
    let node = el;
    for (let depth = 0; node && depth < 6; depth++) {
      const tagName = (node.tagName || '').toLowerCase();
      if (/^(main|article|body|html)$/.test(tagName)) break;

      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length <= 1200) {
        const hasDailyQuizTitle = /\bdaily quiz\b/i.test(text);
        const hasQuizInstructions = quizInstructionRe.test(text);
        const hasQuizImage = !!node.querySelector?.('img[src*="20250616_ibp366"], img[src*="_ibp366"]');
        if (hasDailyQuizTitle && (hasQuizInstructions || hasQuizImage)) return true;
        if (hasQuizInstructions && hasQuizImage) return true;
      }

      if (tagName === 'section' && text.length > 1200) break;
      node = node.parentElement;
    }

    return false;
  }

  _isNewsletterPromoModule(el) {
    if (!el) return false;

    const promoRe = /stay informed with\b.*\bnewsletter\b|\bwar room newsletter\b.*\bworld-class coverage of defen[cs]e and international security issues|\bfor subscribers only:\s*to see how we design each week(?:’|’)?s cover,\s*sign up to our weekly cover story newsletter\b|\bsign up to\s+[^,]{1,60},\s*our\s+.*?\bnewsletter\b|\bsign up to\s+[A-Z][^,.]{0,50}\s+for\s+(in-depth|exclusive|the latest|daily|weekly|our|more|comprehensive|breaking)\b/i;
    let node = el;
    for (let depth = 0; node && depth < 6; depth++) {
      const tagName = (node.tagName || '').toLowerCase();
      if (/^(main|article|body|html)$/.test(tagName)) break;

      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length <= 1200 && promoRe.test(text)) return true;

      if (tagName === 'section' && text.length > 1200) break;
      node = node.parentElement;
    }

    return false;
  }

  _isPrintEditionPromoModule(el) {
    if (!el) return false;

    const promoRe = /\bthis article appeared in the .* section of the print edition under the headline\b|\bfrom the [a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\s+edition\b|\bdiscover stories from this section and more in the list of contents\b/i;
    let node = el;
    for (let depth = 0; node && depth < 6; depth++) {
      const tagName = (node.tagName || '').toLowerCase();
      if (/^(main|article|body|html)$/.test(tagName)) break;

      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length <= 1400 && promoRe.test(text)) return true;

      if (tagName === 'section' && text.length > 1400) break;
      node = node.parentElement;
    }

    return false;
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const seenImgKeys = new Set();
    const featuredSrc = this.getFeaturedImage();
    const featuredBase = featuredSrc ? this._normalizeImgUrl(featuredSrc).replace(/\.[^.]+$/, '') : '';
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
      if (this._isDailyQuizModule(el)) continue;
      if (this._isNewsletterPromoModule(el)) continue;
      if (this._isPrintEditionPromoModule(el)) continue;

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
        // Prefix check: body image may add variant suffix like _FH to og:image base name
        if (featuredBase && imgKey.replace(/\.[^.]+$/, '').startsWith(featuredBase + '_')) continue;
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
      // 过滤掉作为副标题的 h2（紧跟 h1 后的那个）
      if (tagName === 'h2') {
        const standfirst = this.getStandfirst();
        if (standfirst && text.endsWith(standfirst)) continue;
      }
      // 修复 Economist 首字母下沉导致的额外空格
      text = text.replace(/^([A-Za-z])\s([a-z])/, '$1$2');
      if (seen.has(text)) continue;

      if (/^more from \w+/i.test(text)) break;
      if (/^explore more/i.test(text)) break;
      if (text.length < 15) continue;
      if (/^(sign up|subscribe|newsletter|related|recommended|keep updated|more on this)/i.test(text)) continue;
      if (/^copyright/i.test(text)) continue;
      if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
      if (/^(articles?|audio)\s+(updated|recorded)\s+(?:less than\s+)?\d+\s+(?:minutes?|hours?|days?)\s+ago\b/i.test(text)) continue;
      if (/^listen to (the )?(briefing|audio|podcast)/i.test(text)) continue;
      if (/^follow (our |the )?latest coverage/i.test(text)) continue;
      if (/^sign up to enjoy/i.test(text)) continue;
      if (/how well have you been following.*\bweekly quiz\b/i.test(text)) continue;
      if (/\bsign up to\s+[^,]{1,60},\s*our\s+.*?\bnewsletter\b/i.test(text)) continue;
      if (/\bsign up to\s+[A-Z][^,.]{0,50}\s+for\s+(in-depth|exclusive|the latest|daily|weekly|our|more|comprehensive|breaking)\b/i.test(text)) continue;
      if (/^this article appeared in the .* section of the print edition under the headline\b/i.test(text)) continue;
      if (/^from the [a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\s+edition\b/i.test(text)) continue;
      if (/^discover stories from this section and more in the list of contents\b/i.test(text)) continue;

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
