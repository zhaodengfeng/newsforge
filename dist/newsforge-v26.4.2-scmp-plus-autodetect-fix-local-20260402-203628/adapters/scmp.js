// South China Morning Post (SCMP) Adapter
class SCMPAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'scmp';
    this.hostPatterns = ['scmp.com'];
  }

  isArticlePage() {
    const url = this.getURL();
    let pathname = '';
    try {
      pathname = new URL(url).pathname || '';
    } catch (e) {}

    return /\/article\/\d+(?:\/|$)/.test(pathname) ||
           /scmp\.com\/.+\/article\/\d+/.test(url) ||
           document.querySelector('article') !== null ||
           !!document.querySelector('h1');
  }

  getTitle() {
    const el = document.querySelector('h1');
    if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    return document.title;
  }

  getAuthor() {
    const selectors = [
      '[class*="author-name"]',
      '[class*="author"] a',
      '[class*="byline"]',
      '[data-v6-testid="author-name"]',
      'a[href*="/author/"]'
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
    const time = document.querySelector('time[datetime]');
    if (time) {
      const dt = time.getAttribute('datetime');
      if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    }
    const meta = document.querySelector('meta[property="article:published_time"]');
    if (meta) {
      const dt = meta.getAttribute('content');
      if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    }
    const timeText = document.querySelector('time');
    if (timeText) {
      const text = (timeText.innerText || '').trim();
      if (text.length > 4 && text.length < 50) return text;
    }
    return '';
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content') || '';
    return super.getFeaturedImage();
  }

  getContentContainer() {
    const el = document.querySelector('article');
    if (el && el.innerText?.trim().length > 200) return el;
    return super.getContentContainer();
  }

  _findArticleEndMarker(container) {
    const allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
    const total = allEls.length;
    const startIdx = Math.floor(total * 0.7);

    // Linked headings: search top-to-bottom to find the FIRST related article
    for (let i = startIdx; i < total; i++) {
      if (/^H[234]$/.test(allEls[i].tagName)) {
        const link = allEls[i].querySelector('a[href*="/article/"]') || allEls[i].closest('a[href*="/article/"]');
        if (link) return allEls[i];
      }
    }

    // Text pattern markers: search bottom-to-top
    for (let i = total - 1; i >= startIdx; i--) {
      const text = (allEls[i].innerText || '').trim();
      if (text.length > 100) continue;
      const lower = text.toLowerCase();
      if (/^(sign up|subscribe|newsletter|more from|related|recommended|popular|trending|you may also|readers also|keep reading|explore|more on this|more stories|copyright|share your thoughts|join the conversation)/.test(lower)) {
        return allEls[i];
      }
    }
    return null;
  }

  _isAuthorModule(el) {
    if (!el) return false;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    const cls = `${el.className || ''} ${el.id || ''}`.toLowerCase();
    const hasAuthorLink = !!(
      el.closest('a[href*="/author/"]') ||
      (el.querySelector && el.querySelector('a[href*="/author/"]'))
    );
    const hasAuthorClass = /author|byline|bio|profile|contributor/.test(cls);
    const hasBioText = /follow|joined the post|reporter on the|worked with reuters|china desk/i.test(text);
    const img = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector?.('img');
    const imgSrc = img ? this._resolveImageSrc(img) : '';
    const hasAvatarLikeImage = !!imgSrc && /300x300|author|liu_zhen|public\/[^\/]+\.jpg/i.test(imgSrc);

    if (hasAuthorLink && (hasAuthorClass || hasBioText || text.length < 250 || hasAvatarLikeImage)) {
      return true;
    }

    return !hasAuthorLink && hasAuthorClass && hasBioText;
  }

  _isTerminalModule(el) {
    if (!el) return false;
    if (this._isAuthorModule(el)) return true;

    const cls = `${el.className || ''} ${el.id || ''}`.toLowerCase();
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();

    if (/piano-metering|paywall|swiper|related|topic|conversation|discover|recommend|voice-select|audio-player/i.test(cls)) {
      return true;
    }

    return /^(related topics|before you go|discover more stories on|select voice|make scmp preferred on google)/.test(text);
  }

  _hasNestedContentChildren(el) {
    if (!el || !el.children || el.children.length === 0) return false;

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (/^(p|h2|h3|h4|figure|picture|img|section)$/.test(tag)) return true;
      if (tag === 'div') {
        if (child.querySelector('img, figure, picture, p, h2, h3, h4, section')) return true;
        const childText = (child.innerText || '').replace(/\s+/g, ' ').trim();
        if (childText.length >= 40) return true;
      }
    }

    return false;
  }

  _isLeafTextBlock(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'div') return false;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length < 40 || text.length > 800) return false;
    if (this._isAuthorModule(el) || this._isTerminalModule(el)) return false;
    if (el.querySelector('img, figure, picture')) return false;
    if (this._hasNestedContentChildren(el)) return false;

    const cls = `${el.className || ''} ${el.id || ''}`.toLowerCase();
    if (/newsletter|promo|advert|sponsor|listen|audio|voice|toolbar|meta|time|date|caption/i.test(cls)) {
      return false;
    }

    return !/^(published:|updated:|2-min read|listen|follow\b|advertisement\b)/i.test(text);
  }

  _isBoilerplateText(text) {
    return /^(sign up|subscribe|newsletter|most popular|what to read next|related|related topics|recommended|keep reading|more stories|more from scmp|before you go|discover more stories on|make scmp preferred on google|select voice|listen\b)/i.test(text) ||
      /^content provided by/i.test(text) ||
      /^copyright/i.test(text) ||
      /^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text) ||
      /^share your thoughts$/i.test(text) ||
      /join the conversation/i.test(text) ||
      /^watch:/i.test(text) ||
      /^(published:|updated:)/i.test(text);
  }

  getStandfirst() {
    const container = this.getContentContainer();
    if (!container) return '';

    const headings = container.querySelectorAll('h3');
    for (const el of headings) {
      if (el.closest('nav, header, footer, aside')) continue;
      if (this._isTerminalModule(el)) continue;

      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < 40 || text.length > 300) continue;

      const linkedArticle = el.querySelector('a[href*="/article/"]') || el.closest('a[href*="/article/"]');
      if (linkedArticle) continue;

      return text;
    }

    return '';
  }

  _getBodyRoot(container) {
    if (!container) return null;

    const pickBest = (selector, tagBonus = 0) => {
      let best = null;
      const nodes = container.querySelectorAll(selector);

      for (const el of nodes) {
        if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="advert"], [class*="sponsor"], [class*="paywall"], [class*="piano-metering"]')) continue;
        if (this._isAuthorModule(el) || this._isTerminalModule(el)) continue;

        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length < 500) continue;

        const pCount = el.querySelectorAll('p').length;
        const imageCount = el.querySelectorAll('img, figure, picture').length;
        const authorLinks = el.querySelectorAll('a[href*="/author/"]').length;
        const leafDivCount = Array.from(el.querySelectorAll('div')).filter(child => this._isLeafTextBlock(child)).length;

        if (pCount + leafDivCount < 3) continue;

        let score = text.length + pCount * 240 + leafDivCount * 180 + imageCount * 40 + tagBonus;
        if (authorLinks > 0) score -= authorLinks * 1200;
        if (el.querySelector('h1')) score -= 1500;
        if (/published:|updated:/i.test(text.slice(0, 160))) score -= 600;

        if (!best || score > best.score) {
          best = { el, score };
        }
      }

      return best?.el || null;
    };

    return pickBest('section', 800) || pickBest('div', 0);
  }

  // Normalize SCMP image URLs for deduplication
  _normalizeImgUrl(url) {
    if (!url) return '';
    let path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    path = path.replace(/\/styles\/[^\/]+\/public\//i, '/');
    path = path.replace(/\/cdn-cgi\/image\/[^\/]+\//i, '/');
    return path;
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const seenImgKeys = new Set();
    let hasBodyText = false;
    const standfirst = this.getStandfirst();
    const featuredSrc = this.getFeaturedImage();
    if (featuredSrc) {
      seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
    }

    const container = this.getContentContainer();
    if (!container) return paragraphs;
    const bodyRoot = this._getBodyRoot(container) || container;

    let _videoParent = null;
    const endMarker = bodyRoot === container ? this._findArticleEndMarker(container) : null;
    const elements = bodyRoot.querySelectorAll('p, h2, h3, h4, img, figure, picture, div');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="most"], [class*="trending"], [class*="video"], [class*="widget"], [class*="paywall"], [class*="piano-metering"]')) continue;

      if (this._isTerminalModule(el)) {
        if (hasBodyText) break;
        continue;
      }

      if (this._isAuthorModule(el)) {
        if (hasBodyText) break;
        continue;
      }

      const tagName = el.tagName.toLowerCase();

      if ((tagName === 'div' || tagName === 'section') && !this._isLeafTextBlock(el)) {
        continue;
      }

      // Images: handle img, figure, picture
      if (tagName === 'img' || tagName === 'figure' || tagName === 'picture') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        if (!img) continue;
        let src = this._resolveImageSrc(img);
        // Try <picture> <source srcset> fallback
        if (!src) {
          const picEl = tagName === 'picture' ? el : (el.closest ? el.closest('picture') : null);
          if (!picEl && tagName === 'figure') picEl = el.querySelector('picture');
          if (picEl) {
            const sources = picEl.querySelectorAll('source[srcset]');
            for (const source of sources) {
              const srcset = source.getAttribute('srcset') || '';
              const parts = srcset.split(',');
              for (const part of parts) {
                const u = part.trim().split(/\s+/)[0];
                if (u && /^https?:\/\//i.test(u)) { src = u; break; }
              }
              if (src) break;
            }
          }
        }
        if (!src || seen.has(src)) continue;
        // Author photo/card = end of main article
        if (/\/images\/author\//i.test(src) || this._isAuthorModule(el) || this._isAuthorModule(img)) {
          if (hasBodyText) break;
          continue;
        }
        // YouTube thumbnails
        if (/ytimg\.com|youtube\.com/i.test(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        const imgKey = this._normalizeImgUrl(src);
        if (seenImgKeys.has(imgKey)) continue;
        seenImgKeys.add(imgKey);
        if (img.closest('[class*="hero"], [class*="featured"], [class*="lead-image"], [class*="main-image"], [class*="top-image"]')) continue;
        seen.add(src);
        let caption = this._getImageCaption(el, img);
        if (!caption) {
          const alt = (img.getAttribute('alt') || '').trim();
          if (alt && alt.length > 5 && alt.length < 300 && !/^(photo|image|graphic)/i.test(alt)) caption = alt;
        }
        paragraphs.push({ type: 'image', src, caption });
        continue;
      }

      // Text
      if (el.closest('figcaption')) continue;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();

      // Video title detection: skip <p> that follows a duration <p> in same parent
      if (tagName === 'p' && _videoParent) {
        if (el.parentElement === _videoParent) {
          _videoParent = null;
          seen.add(text);
          continue;
        }
        _videoParent = null;
      }

      // Video duration → track parent so next <p> from same parent is also skipped
      if (tagName === 'p' && /^\d{1,2}:\d{2}$/.test(text)) {
        _videoParent = el.parentElement;
        continue;
      }

      if (text.length < 15) continue;
      if (seen.has(text)) continue;
      if (standfirst && text === standfirst) {
        seen.add(text);
        continue;
      }

      // Skip headings linking to other articles (any position)
      if (/^h[234]$/.test(tagName)) {
        const link = el.querySelector('a[href*="/article/"]') || el.closest('a[href*="/article/"]');
        if (link) continue;
      }

      if (this._isBoilerplateText(text)) continue;

      seen.add(text);
      hasBodyText = true;
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text
      });
    }

    return paragraphs;
  }
}
