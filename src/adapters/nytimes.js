// NYTimes Adapter
class NYTimesAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'nytimes';
    this.hostPatterns = ['nytimes.com', 'nyt.com'];
  }

  isArticlePage() {
    return /nytimes\.com\/\d{4}\//.test(this.getURL()) ||
           document.querySelector('article') !== null;
  }

  getTitle() {
    const selectors = ['h1[data-testid="headline"]', 'h1', '[class*="headline"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    }
    return document.title;
  }

  getAuthor() {
    const el = document.querySelector('[class*="byline"], [data-testid="byline"]');
    if (el) return el.innerText.trim().replace(/^by\s+/i, '');
    return '';
  }

  getPublishDate() {
    const el = document.querySelector('time, [class*="timestamp"]');
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
    const selectors = ['section[name="articleBody"]', '[class*="article-body"]', 'article'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 200) return el;
    }
    return super.getContentContainer();
  }

  _normalizeImgUrl(url) {
    if (!url) return '';
    let path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    path = path.replace(/-(articleLarge|superJumbo|jumbo|large|medium|small|thumb[^L]|thumbLarge|thumbStandard|master|popup|slide|hpSmall|hpMedium|hpLarge|hpJumbo|inline|mediumSquareAt3X|mediumSquareAt2X|threeByTwoSmallAt2X|threeByTwoMediumAt2X|fourByThreeSmallAt2X|fourByThreeLargeAt2X)\b/gi, '');
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

    const elements = container.querySelectorAll('p, h2, h3, h4, img, figure');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="trending"]')) continue;

      const tagName = el.tagName.toLowerCase();

      // 图片
      if (tagName === 'img' || tagName === 'figure') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img);
        if (!src || seen.has(src)) continue;
        if (/author-/i.test(src)) continue;
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
      if (el.closest('figcaption')) continue;
      const text = (el.innerText || '').trim();
      if (text.length < 15) continue;
      if (seen.has(text)) continue;

      if (/^(sign up|subscribe|newsletter|most popular|what to read next|related|recommended)/i.test(text)) continue;
      if (/^the times is committed to publishing a diversity of letters to the editor\./i.test(text)) continue;
      if (/^follow the new york times opinion section on\b/i.test(text)) continue;
      if (/^content provided by/i.test(text)) continue;
      if (/^copyright ©\d{4}/i.test(text)) continue;
      if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;

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
