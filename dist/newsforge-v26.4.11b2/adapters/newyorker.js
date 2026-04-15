// The New Yorker Adapter
class NewYorkerAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'newyorker';
    this.hostPatterns = ['newyorker.com'];
  }

  isArticlePage() {
    const url = this.getURL();
    if (/newyorker\.com\/(magazine|news|culture|books|humor|fiction|cartoons|goings-on|podcasts|video)\//i.test(url)) {
      return document.querySelector('article h1, main h1, h1') !== null || document.querySelector('article, main') !== null;
    }
    return document.querySelector('article h1, main h1') !== null;
  }

  getTitle() {
    const selectors = [
      'article h1',
      'main h1',
      'h1[data-testid*="headline" i]',
      'h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = (el?.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length > 5) return text;
    }

    const og = document.querySelector('meta[property="og:title"]');
    if (og?.content) return og.content.trim();
    return document.title.replace(/\s*\|\s*The New Yorker\s*$/i, '').trim();
  }

  getAuthor() {
    const meta = document.querySelector('meta[name="author"], meta[property="article:author"]');
    if (meta?.content) return meta.content.trim().replace(/^by\s+/i, '');

    const selectors = [
      'a[rel="author"]',
      '[data-testid*="byline" i]',
      '[class*="byline" i]',
      '[class*="Byline" i]',
      '[class*="contributor" i]',
      '[class*="Contributor" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = (el?.innerText || '').replace(/\s+/g, ' ').trim().replace(/^by\s+/i, '');
      if (text.length > 1 && text.length < 160 && !/save this story/i.test(text)) return text;
    }

    return '';
  }

  getPublishDate() {
    const meta = document.querySelector('meta[property="article:published_time"], meta[name="date"], meta[name="parsely-pub-date"]');
    if (meta?.content) return new Date(meta.content).toLocaleDateString('zh-CN');

    const el = document.querySelector('time[datetime], time, [class*="date" i], [class*="Date" i]');
    if (el) {
      const datetime = el.getAttribute('datetime') || el.getAttribute('content');
      if (datetime) return new Date(datetime).toLocaleDateString('zh-CN');
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length > 4 && text.length < 80) return text;
    }

    return '';
  }

  getStandfirst() {
    const selectors = [
      '[class*="dek" i]',
      '[class*="Dek" i]',
      '[class*="standfirst" i]',
      '[class*="description" i]',
      '[data-testid*="dek" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = (el?.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length > 30 && text.length < 500 && !/save this story/i.test(text)) return text;
    }

    const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    return meta?.content?.trim() || '';
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og?.content) return og.content;
    return super.getFeaturedImage();
  }

  getContentContainer() {
    const selectors = [
      '[data-testid="ArticlePageChunks"]',
      '[class*="ArticlePageChunks" i]',
      '[data-attribute-verso-pattern="article-body"]',
      'article [class*="article-body__content" i]',
      'article [class*="article__body" i]',
      'article [class*="body__container" i]',
      'article [class*="body" i]',
      'article [class*="Body" i]',
      '[data-testid*="ContentBody" i]',
      '[data-testid*="article-body" i]',
      'article',
      'main article',
      'main'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = (el?.innerText || '').replace(/\s+/g, ' ').trim();
      const paragraphCount = el ? el.querySelectorAll('p').length : 0;
      if (el && text.length > 300 && paragraphCount >= 2) return el;
    }

    return super.getContentContainer();
  }

  _findArticleEndMarker(container) {
    const allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
    let bodyTextSeen = 0;
    for (const el of allEls) {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const lower = text.toLowerCase();
      if (text.length > 120) {
        bodyTextSeen += text.length;
        continue;
      }
      if (bodyTextSeen < 500) continue;
      if (/^(read more|more:|more from the new yorker|more from the magazine|more stories|recommended|the latest|popular|newsletter|sign up|subscribe|published in the print edition)/.test(lower)) {
        return el;
      }
    }
    return null;
  }

  _isEmbeddedCartoonOrVideo(el) {
    if (!el) return false;
    if (el.closest('video, [data-testid*="cne-interlude" i]')) return true;
    if (el.closest('[class*="VideoFigure"], [class*="Interlude"], [class*="ResponsiveCartoon"], [class*="responsive-cartoon"], [class*="shopping-alert"], [class*="Alert"]')) return true;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (/^(video from the new yorker|cartoon by|copy link to cartoon|shop open cartoon gallery)/i.test(text)) return true;

    const img = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector?.('img');
    const src = this._resolveImageSrc(img) || this._resolvePictureSource(el);
    return /\/cartoons\//i.test(src);
  }

  _isChromeOrPromo(el) {
    if (!el) return false;
    if (el.closest('nav, header, footer, aside, form, button, dialog, [role="dialog"], [aria-hidden="true"], [hidden]')) return true;
    if (el.closest('[class*="newsletter" i], [class*="promo" i], [class*="ad-" i], [class*="-ad" i], [class*="advert" i], [class*="sponsor" i], [class*="recirc" i], [class*="Recirc" i], [class*="related" i], [class*="Related" i], [class*="tout" i], [class*="Tout" i], [class*="social" i], [class*="Social" i], [class*="share" i], [class*="Share" i]')) return true;
    if (this._isEmbeddedCartoonOrVideo(el)) return true;

    const cls = `${el.className || ''}`.toLowerCase();
    if (/responsive-cartoon|cartoon|videopreview|videofigure|interlude|shopping-alert|alert-message/.test(cls)) return true;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    return /^(save this story|listen to this article|open navigation menu|search|buy or license this|view more|copy link|link copied|shop|open cartoon gallery|video from the new yorker)$/i.test(text);
  }

  _isBoilerplateText(text) {
    return /^(save this story|read more|more:|more from the new yorker|newsletter|sign up|subscribe|published in the print edition|the new yorker may earn|letters should be sent|buy or license this|view more|copy link|link copied|sections|more|video from the new yorker)$/i.test(text) ||
      /^(cartoon by|copy link to cartoon|shop open cartoon gallery)/i.test(text) ||
      /^©\s*\d{4}/i.test(text) ||
      /^by\s+the new yorker$/i.test(text);
  }

  _normalizeImgUrl(url) {
    if (!url) return '';
    return url
      .replace(/^https?:\/\/[^\/]+/, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/photos\/[^\/]+\/[^\/]+\/w_\d+[^\/]*\//i, '/');
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const seenImgKeys = new Set();
    const featuredSrc = this.getFeaturedImage();
    if (featuredSrc) seenImgKeys.add(this._normalizeImgUrl(featuredSrc));

    const container = this.getContentContainer();
    if (!container) return paragraphs;

    const endMarker = this._findArticleEndMarker(container);
    const elements = container.querySelectorAll('p, h2, h3, h4, img, figure, picture');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (this._isChromeOrPromo(el)) continue;

      const tagName = el.tagName.toLowerCase();
      if (tagName === 'img' || tagName === 'figure' || tagName === 'picture') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img) || this._resolvePictureSource(el);
        if (!src || seen.has(src)) continue;
        if (this._isEmbeddedCartoonOrVideo(el)) continue;
        if (/\/cartoons\//i.test(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        const imgKey = this._normalizeImgUrl(src);
        if (seenImgKeys.has(imgKey)) continue;
        seenImgKeys.add(imgKey);
        seen.add(src);

        let caption = this._getImageCaption(el, img);
        if (!caption) {
          const alt = (img?.getAttribute('alt') || '').trim();
          if (alt.length > 5 && alt.length < 300 && !/^(image|photo|illustration)$/i.test(alt)) caption = alt;
        }
        paragraphs.push({ type: 'image', src, caption });
        continue;
      }

      if (el.closest('figcaption')) continue;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < 10) continue;
      if (seen.has(text)) continue;
      if (this._isBoilerplateText(text)) continue;

      seen.add(text);
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text
      });
    }

    return paragraphs;
  }

  _resolvePictureSource(el) {
    const picture = el?.tagName?.toLowerCase() === 'picture' ? el : el?.querySelector?.('picture');
    const source = picture?.querySelector?.('source[srcset]');
    const srcset = source?.getAttribute('srcset') || '';
    return srcset.split(',').map(part => part.trim().split(/\s+/)[0]).find(url => /^https?:\/\//i.test(url)) || '';
  }
}
