// South China Morning Post (SCMP) Adapter
class SCMPAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'scmp';
    this.hostPatterns = ['scmp.com'];
    this._leafTextBlockCache = new WeakMap();
  }

  isArticlePage() {
    const url = this.getURL();
    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
    let pathname = '';
    let canonicalPath = '';
    try {
      pathname = new URL(url).pathname || '';
    } catch (e) {}
    try {
      canonicalPath = new URL(canonical).pathname || '';
    } catch (e) {}

    return /\/article\/\d+(?:\/|$)/.test(pathname) ||
           /\/article\/\d+(?:\/|$)/.test(canonicalPath) ||
           /scmp\.com\/.+\/article\/\d+/.test(url) ||
           /scmp\.com\/.+\/article\/\d+/.test(canonical);
  }

  _normalizeTitleText(text) {
    return this._cleanTitleString(text)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  _cleanTitleString(text) {
    return (text || '')
      .replace(/\s*\|\s*South China Morning Post\s*$/i, '')
      .replace(/^\s*(developing|live|breaking|updated)\s*\|\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _getCleanTitleText(el) {
    if (!el) return '';

    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-qa="ContentHeadlineTag-renderFlag-Flag"]').forEach(node => node.remove());

    return this._cleanTitleString(clone.innerText || clone.textContent || '');
  }

  _isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) {
      return false;
    }
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    const rect = el.getBoundingClientRect?.();
    return !!rect && rect.width > 0 && rect.height > 0;
  }

  _getCurrentTitleHint() {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    if (metaTitle) return this._normalizeTitleText(metaTitle);
    return this._normalizeTitleText(document.title);
  }

  _getActiveTitleElement() {
    const titleHint = this._getCurrentTitleHint();
    const headings = Array.from(document.querySelectorAll('h1'));
    let best = null;

    for (const el of headings) {
      const text = this._getCleanTitleText(el);
      if (text.length < 5) continue;

      const normalized = this._normalizeTitleText(text);
      let score = text.length;
      if (this._isElementVisible(el)) score += 3000;
      if (titleHint && normalized === titleHint) score += 10000;
      else if (titleHint && normalized && titleHint.includes(normalized)) score += 5000;
      else if (titleHint && normalized && normalized.includes(titleHint)) score += 5000;

      if (!best || score > best.score) {
        best = { el, score };
      }
    }

    return best?.el || null;
  }

  _getActiveContentAnchor() {
    const titleEl = this._getActiveTitleElement();
    if (!titleEl) return null;

    let current = titleEl.parentElement;
    let best = null;

    while (current && current !== document.body) {
      const text = (current.innerText || '').trim();
      if (text.length >= 300) {
        const contentCount = current.querySelectorAll('p, h2, h3, h4, img, figure, picture, section, div').length;
        if (contentCount >= 5) {
          let score = text.length;
          if (this._isElementVisible(current)) score += 3000;
          if (current.tagName && /^(ARTICLE|SECTION|MAIN)$/i.test(current.tagName)) score += 2000;

          if (!best || score < best.score) {
            best = { el: current, score };
          }
        }
      }
      current = current.parentElement;
    }

    return best?.el || titleEl.parentElement || null;
  }

  _getTitleScopedArticleContainer() {
    const titleEl = this._getActiveTitleElement();
    let current = titleEl;

    while (current && current !== document.body) {
      if (current.tagName && current.tagName.toUpperCase() === 'ARTICLE') {
        const text = (current.innerText || '').trim();
        if (text.length > 500 && this._isElementVisible(current)) {
          return current;
        }
      }
      current = current.parentElement;
    }

    return null;
  }

  getTitle() {
    const activeTitle = this._getActiveTitleElement();
    if (activeTitle) {
      const text = this._getCleanTitleText(activeTitle);
      if (text.length > 5) return text;
    }

    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    if (metaTitle.trim().length > 5) {
      return this._cleanTitleString(metaTitle);
    }

    const el = document.querySelector('h1');
    const h1Text = this._getCleanTitleText(el);
    if (h1Text.length > 5) return h1Text;
    return this._cleanTitleString(document.title);
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
    const titleScopedArticle = this._getTitleScopedArticleContainer();
    if (titleScopedArticle) {
      return titleScopedArticle;
    }

    const anchored = this._getActiveContentAnchor();
    if (anchored) {
      const anchoredText = (anchored.innerText || '').trim();
      const anchoredPCount = anchored.querySelectorAll('p').length;
      const anchoredSectionCount = anchored.querySelectorAll('section').length;
      const anchoredLeafDivCount = Array.from(anchored.querySelectorAll('div')).filter(el => this._isLeafTextBlock(el)).length;
      const looksBodyLike =
        anchoredText.length > 800 ||
        anchoredPCount >= 2 ||
        anchoredLeafDivCount >= 3 ||
        anchoredSectionCount > 0;

      if (anchoredText.length > 200 && looksBodyLike) {
        return anchored;
      }
    }

    const titleHint = this._getCurrentTitleHint();
    const articles = Array.from(document.querySelectorAll('article'));
    let best = null;

    for (const el of articles) {
      const text = (el.innerText || '').trim();
      if (text.length < 200) continue;

      let score = text.length;
      if (this._isElementVisible(el)) score += 3000;
      if (titleHint && this._normalizeTitleText(text).includes(titleHint)) score += 5000;

      const h1 = el.querySelector('h1');
      if (h1) {
        const h1Text = this._normalizeTitleText(this._getCleanTitleText(h1));
        if (h1Text && titleHint && h1Text === titleHint) score += 8000;
        if (this._isElementVisible(h1)) score += 2000;
      }

      if (!best || score > best.score) {
        best = { el, score };
      }
    }

    if (best?.el) return best.el;

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

    return /^(further reading|related topics|before you go|discover more stories on|select voice|make scmp preferred on google)/.test(text);
  }

  _isInlineSkipModule(el) {
    if (!el) return false;
    if (el.closest('[class*="oembed"], [class*="methode-html-wrapper"]')) return true;

    const inlineTopicPattern = /^(want to know more|read around this topic)/;
    const ownText = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (inlineTopicPattern.test(ownText)) return true;
    if (ownText.length >= 80) return false;

    let current = el.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 3) {
      if (current.tagName && /^(ARTICLE|MAIN|SECTION)$/i.test(current.tagName)) break;

      const text = (current.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (inlineTopicPattern.test(text)) {
        const longTextBlocks = Array.from(current.querySelectorAll('p, h2, h3, h4'))
          .filter(node => ((node.innerText || '').replace(/\s+/g, ' ').trim().length >= 80));
        const mediaBlocks = current.querySelectorAll('figure, picture, img').length;
        return text.length <= 600 && longTextBlocks.length <= 2 && mediaBlocks === 0;
      }

      current = current.parentElement;
      depth++;
    }

    return false;
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
    if (this._leafTextBlockCache.has(el)) return this._leafTextBlockCache.get(el);
    const result = this._computeIsLeafTextBlock(el);
    this._leafTextBlockCache.set(el, result);
    return result;
  }

  _computeIsLeafTextBlock(el) {
    const tag = el.tagName.toLowerCase();
    if (tag !== 'div') return false;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length < 40 || text.length > 800) return false;
    if (this._isAuthorModule(el) || this._isTerminalModule(el)) return false;
    if (el.querySelector('img, figure, picture')) return false;
    if (this._hasNestedContentChildren(el)) return false;

    const cls = `${el.className || ''} ${el.id || ''}`.toLowerCase();
    if (/newsletter|promo|advert|sponsor|listen|audio|voice|toolbar|meta|time|date|caption|oembed|methode-html-wrapper/i.test(cls)) {
      return false;
    }

    return !/^(\{"@context"|published:|updated:|2-min read|listen|follow\b|advertisement\b)/i.test(text);
  }

  _isBoilerplateText(text) {
    return /^(sign up|subscribe|newsletter|most popular|what to read next|further reading|related|related topics|want to know more|read around this topic|recommended|keep reading|more stories|more from scmp|before you go|discover more stories on|make scmp preferred on google|select voice|listen\b|\{"@context")/i.test(text) ||
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
    const titleEl = this._getActiveTitleElement();

    const headings = container.querySelectorAll('h3');
    for (const el of headings) {
      if (el.closest('nav, header, footer, aside')) continue;
      if (this._isTerminalModule(el)) continue;
      if (titleEl) {
        const pos = titleEl.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) continue;
      }

      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < 40 || text.length > 300) continue;

      const linkedArticle = el.querySelector('a[href*="/article/"]') || el.closest('a[href*="/article/"]');
      if (linkedArticle) continue;

      return text;
    }

    return '';
  }

  _getBodyRoot(container, visibleOnly = true) {
    if (!container) return null;

    const countContentBlocks = (el) => {
      if (!el) return 0;
      const pCount = el.querySelectorAll('p').length;
      const leafDivCount = Array.from(el.querySelectorAll('div')).filter(child => {
        if (visibleOnly && !this._isElementVisible(child)) return false;
        return this._isLeafTextBlock(child);
      }).length;
      return pCount + leafDivCount;
    };

    const pickBest = (selector, tagBonus = 0) => {
      let best = null;
      const nodes = container.querySelectorAll(selector);

      for (const el of nodes) {
        if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="advert"], [class*="sponsor"], [class*="paywall"], [class*="piano-metering"]')) continue;
        if (this._isAuthorModule(el) || this._isTerminalModule(el)) continue;
        if (visibleOnly && !this._isElementVisible(el)) continue;

        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length < 500) continue;

        const pCount = el.querySelectorAll('p').length;
        const imageCount = el.querySelectorAll('img, figure, picture').length;
        const authorLinks = el.querySelectorAll('a[href*="/author/"]').length;
        const leafDivCount = Array.from(el.querySelectorAll('div')).filter(child => {
          if (visibleOnly && !this._isElementVisible(child)) return false;
          return this._isLeafTextBlock(child);
        }).length;

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

    const bestSection = pickBest('section', 800);
    const bestDiv = pickBest('div', 0);

    if (bestDiv && bestSection && bestDiv.contains(bestSection)) {
      const divTextLen = (bestDiv.innerText || '').replace(/\s+/g, ' ').trim().length;
      const sectionTextLen = (bestSection.innerText || '').replace(/\s+/g, ' ').trim().length;
      const divBlockCount = countContentBlocks(bestDiv);
      const sectionBlockCount = countContentBlocks(bestSection);

      if (divBlockCount > sectionBlockCount && divTextLen > sectionTextLen * 1.2) {
        return bestDiv;
      }
    }

    return bestSection || bestDiv;
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
    // Clear memoization cache — DOM may have changed since last extraction
    this._leafTextBlockCache = new WeakMap();
    const url = this.getURL();
    const isPlusPage = /\/plus\//i.test(url) || /[?&]display=plus\b/i.test(url);
    const standfirst = this.getStandfirst();
    const featuredSrc = this.getFeaturedImage();
    const container = this.getContentContainer();
    if (!container) return [];
    const titleEl = this._getActiveTitleElement();
    const bodyRoot = this._getBodyRoot(container, true) || this._getBodyRoot(container, false);
    const primaryRoot = bodyRoot || container;

    const collectFromRoot = (root, useEndMarker = false) => {
      const paragraphs = [];
      const seen = new Set();
      const seenImgKeys = new Set();
      let hasBodyText = false;
      let videoParent = null;

      if (featuredSrc) {
        seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
      }

      const endMarker = useEndMarker ? this._findArticleEndMarker(root) : null;
      const elements = root.querySelectorAll('p, h2, h3, h4, img, figure, picture, div');

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];

        if (titleEl) {
          const pos = titleEl.compareDocumentPosition(el);
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) continue;
        }

        if (endMarker) {
          if (el === endMarker) break;
          const pos = endMarker.compareDocumentPosition(el);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
        }

        if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="most"], [class*="trending"], [class*="video"], [class*="widget"], [class*="paywall"], [class*="piano-metering"], [class*="oembed"], [class*="methode-html-wrapper"]')) continue;

        if (this._isInlineSkipModule(el)) continue;

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

        if ((tagName === 'div' || tagName === 'section') && el.closest('a[href*="/article/"]')) {
          continue;
        }

        if (tagName === 'img' || tagName === 'figure' || tagName === 'picture') {
          const img = tagName === 'img' ? el : el.querySelector('img');
          if (!img) continue;
          let src = this._resolveImageSrc(img);

          if (!src) {
            let picEl = tagName === 'picture' ? el : (el.closest ? el.closest('picture') : null);
            if (!picEl && tagName === 'figure') picEl = el.querySelector('picture');
            if (picEl) {
              const sources = picEl.querySelectorAll('source[srcset]');
              for (const source of sources) {
                const srcset = source.getAttribute('srcset') || '';
                const parts = srcset.split(',');
                for (const part of parts) {
                  const u = part.trim().split(/\s+/)[0];
                  if (u && /^https?:\/\//i.test(u)) {
                    src = u;
                    break;
                  }
                }
                if (src) break;
              }
            }
          }

          if (!src || seen.has(src)) continue;
          if (/\/images\/author\//i.test(src) || this._isAuthorModule(el) || this._isAuthorModule(img)) {
            if (hasBodyText) break;
            continue;
          }
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
            if (alt && alt.length > 5 && alt.length < 300 && !/^(photo|image|graphic)/i.test(alt)) {
              caption = alt;
            }
          }
          paragraphs.push({ type: 'image', src, caption });
          continue;
        }

        if (el.closest('figcaption')) continue;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();

        if (tagName === 'p' && videoParent) {
          if (el.parentElement === videoParent) {
            videoParent = null;
            seen.add(text);
            continue;
          }
          videoParent = null;
        }

        if (tagName === 'p' && /^\d{1,2}:\d{2}$/.test(text)) {
          videoParent = el.parentElement;
          continue;
        }

        if (text.length < 15) continue;
        if (seen.has(text)) continue;
        if (standfirst && text === standfirst) {
          seen.add(text);
          continue;
        }

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
    };

    const primary = collectFromRoot(primaryRoot, primaryRoot === container);
    if (primary.length > 0) return primary;

    if (primaryRoot !== container) {
      const fallback = collectFromRoot(container, true);
      if (fallback.length > 0) return fallback;
    }

    return [];
  }
}
