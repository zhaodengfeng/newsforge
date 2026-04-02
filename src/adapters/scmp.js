// South China Morning Post (SCMP) Adapter
class SCMPAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'scmp';
    this.hostPatterns = ['scmp.com'];
  }

  isArticlePage() {
    const url = this.getURL();
    return /scmp\.com\/.+\/article\/\d+/.test(url) ||
           document.querySelector('article') !== null;
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
    if (el.closest('a[href*="/author/"]')) return true;
    if (el.querySelector && el.querySelector('a[href*="/author/"]')) return true;
    return !!el.closest('[class*="author"], [class*="byline"], [class*="bio"], [class*="profile"], [class*="contributor"]');
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
    const featuredSrc = this.getFeaturedImage();
    if (featuredSrc) {
      seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
    }

    const container = this.getContentContainer();
    if (!container) return paragraphs;

    let _videoParent = null;
    const endMarker = this._findArticleEndMarker(container);
    const elements = container.querySelectorAll('p, h2, h3, h4, img, figure, picture');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="trending"], [class*="video"], [class*="widget"], [class*="paywall"], [class*="piano-metering"]')) continue;

      if (this._isAuthorModule(el)) {
        if (hasBodyText) break;
        continue;
      }

      const tagName = el.tagName.toLowerCase();

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
      const text = (el.innerText || '').trim();

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

      // Keep the standfirst once, but avoid rendering the duplicated summary paragraph.
      if (tagName === 'h3' && !paragraphs.some(p => p.type === 'text')) {
        seen.add(text);
        paragraphs.push({ type: 'text', level: 0, text });
        hasBodyText = true;
        continue;
      }

      // Skip headings linking to other articles (any position)
      if (/^h[234]$/.test(tagName)) {
        const link = el.querySelector('a[href*="/article/"]') || el.closest('a[href*="/article/"]');
        if (link) continue;
      }

      // Filter common non-article content
      if (/^(sign up|subscribe|newsletter|most popular|what to read next|related|recommended|keep reading|more stories|more from scmp)/i.test(text)) continue;
      if (/^content provided by/i.test(text)) continue;
      if (/^copyright/i.test(text)) continue;
      if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
      if (/^share your thoughts$/i.test(text)) continue;
      if (/join the conversation/i.test(text)) continue;
      if (/^watch:/i.test(text)) continue;

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
