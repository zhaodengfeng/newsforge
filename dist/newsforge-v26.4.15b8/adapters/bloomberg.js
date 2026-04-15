// Bloomberg Adapter
class BloombergAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'bloomberg';
    this.hostPatterns = ['bloomberg.com'];
  }

  isArticlePage() {
    const url = this.getURL();
    return /bloomberg\.com\/(news|opinion|features|magazines|technology|politics|business|graphics)/.test(url) ||
           document.querySelector('article') !== null;
  }

  getTitle() {
    const h1 = document.querySelector('article h1, main h1, h1');
    if (h1 && h1.innerText.trim().length > 5) return h1.innerText.trim();
    const og = document.querySelector('meta[property="og:title"]');
    if (og) return og.getAttribute('content') || '';
    return document.title;
  }

  getAuthor() {
    const meta = document.querySelector('meta[name="author"], meta[property="article:author"]');
    if (meta) return (meta.getAttribute('content') || '').replace(/^by\s+/i, '');
    const link = document.querySelector('a[rel="author"]');
    if (link) return link.innerText.trim();
    return super.getAuthor();
  }

  getPublishDate() {
    const meta = document.querySelector('meta[property="article:published_time"], meta[name="date"]');
    if (meta) {
      const dt = meta.getAttribute('content');
      if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    }
    const time = document.querySelector('time[datetime]');
    if (time) {
      const dt2 = time.getAttribute('datetime');
      if (dt2) return new Date(dt2).toLocaleDateString('zh-CN');
      return time.innerText.trim();
    }
    return '';
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content') || '';
    return super.getFeaturedImage();
  }

  _findArticleEndMarker() {
    const allEls = document.querySelectorAll('h2, h3, h4, [role="heading"], a[href], p');
    for (let i = 0; i < allEls.length; i++) {
      const text = (allEls[i].innerText || '').trim().toLowerCase();
      if (text.length > 150) continue;
      if (/^(more from bloomberg|related stories|most read|trending now|you might also|more stories|recommended for you|tech chart of the day|chart of the day|top tech stories|earnings due)/.test(text)) {
        return allEls[i];
      }
      if (/^get alerts for\b/i.test(text)) {
        return allEls[i];
      }
    }
    return null;
  }

  getContentContainer() {
    const article = document.querySelector('article');
    if (article && (article.innerText || '').trim().length > 300) return article;

    const pTags = document.querySelectorAll('p');
    const parentMap = new Map();
    for (let i = 0; i < pTags.length; i++) {
      const p = pTags[i];
      const text = (p.innerText || '').trim();
      if (text.length < 30) continue;
      if (p.closest('nav, header, footer, aside')) continue;
      const parent = p.parentElement;
      if (!parent) continue;
      if (!parentMap.has(parent)) parentMap.set(parent, { el: parent, count: 0, textLen: 0 });
      const info = parentMap.get(parent);
      info.count++;
      info.textLen += text.length;
    }

    let best = null;
    parentMap.forEach(info => {
      if (info.count >= 2 && (!best || info.textLen > best.textLen)) {
        best = info;
      }
    });

    if (best) return best.el;
    return super.getContentContainer();
  }

  _isHeroLikeImage(el, img) {
    const candidates = [el, img, el?.parentElement, img?.parentElement].filter(Boolean);
    for (const node of candidates) {
      const heroAncestor = node.closest(
        '[class*="FeatureHeader"], [class*="ledeImage"], [class*="ledeMedia"], [class*="hero"], [class*="Hero"], [class*="topper"], [class*="Topper"]'
      );
      if (heroAncestor) return true;
    }
    return false;
  }

  _isRelatedLinksTable(el) {
    if (!el) return false;

    const table = el.closest('table, [class*="RichtextMedia_articleTable"], [class*="articleTable"]');
    if (!table) return false;

    const links = Array.from(table.querySelectorAll('a[href]'));
    const storyLinks = links.filter(link => {
      const href = link.getAttribute('href') || '';
      return /bloomberg\.com\/(news|graphics|opinion|features)\//.test(href);
    });

    if (storyLinks.length < 2) return false;

    const texts = storyLinks
      .map(link => (link.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(text => text.length >= 30 && text.length <= 140);

    return texts.length >= 2;
  }

  _isNonArticleChrome(el) {
    if (!el) return false;
    if (el.closest('[aria-hidden="true"], [hidden], [role="dialog"], dialog')) return true;
    if (el.closest('.video-js, [class*="video-js"], [class*="vjs-"], [class*="VideoPlayer"], [class*="video-player"], [data-component*="video"]')) return true;

    const cls = `${el.className || ''} ${el.id || ''}`.toLowerCase();
    if (/vjs-|modal|dialog|video-js|videoplayer|video-player|playlist-player/.test(cls)) return true;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    return /^(this is a modal window|beginning of dialog window|end of dialog window|close modal dialog)$/i.test(text);
  }

  _isInlineRelatedModule(el) {
    if (!el) return false;
    if (el.closest('[class*="RichtextMedia_articleTable"], [class*="articleTable"], .article-table')) return true;

    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (/^read more:\s+\S/i.test(text)) return true;
    if (/^read more on\b/i.test(text)) return true;

    return false;
  }

  _looksLikePodcastPromoText(text) {
    const compact = (text || '').replace(/\s+/g, ' ').trim();
    if (!compact) return false;
    if (/\bbloomberg daybreak\b/i.test(compact)) return true;
    if (/\blisten to\b.{0,160}\bpodcast\b/i.test(compact)) return true;
    if (/\bpodcast\b.{0,120}\b(apple|spotify|anywhere you listen)\b/i.test(compact)) return true;
    return false;
  }

  _isAudioPodcastPromo(el) {
    if (!el) return false;

    let node = el;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      const tagName = (node.tagName || '').toLowerCase();
      if (tagName === 'article' || tagName === 'main' || tagName === 'body') break;

      const className = typeof node.className === 'string' ? node.className : '';
      const markers = [
        className,
        node.id,
        node.getAttribute?.('data-component'),
        node.getAttribute?.('data-testid'),
        node.getAttribute?.('aria-label')
      ].filter(Boolean).join(' ').toLowerCase();
      if (/(podcast|audio)/.test(markers)) return true;

      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length <= 700 && this._looksLikePodcastPromoText(text)) return true;
    }

    return this._looksLikePodcastPromoText(el.innerText || el.textContent || '');
  }

  _getStructuredChartTextSet() {
    if (this._structuredChartTextSet) return this._structuredChartTextSet;

    const texts = new Set();
    const addText = value => {
      if (typeof value !== 'string') return;
      const text = value.replace(/\s+/g, ' ').trim();
      if (text.length >= 15 && text.length <= 500) texts.add(text);
    };

    try {
      const raw = document.getElementById('__NEXT_DATA__')?.textContent || '';
      if (raw) {
        const data = JSON.parse(raw);
        const stack = [data];
        while (stack.length) {
          const value = stack.pop();
          if (!value || typeof value !== 'object') continue;
          if (Array.isArray(value)) {
            value.forEach(item => stack.push(item));
            continue;
          }

          const creator = String(value.creator || '').toUpperCase();
          const typename = String(value.__typename || '').toLowerCase();
          const url = String(value.url || '');
          if (creator === 'TOASTER' || typename.includes('chart') || /\/toaster\/v\d+\/charts\//i.test(url)) {
            addText(value.subtitle);
            addText(value.source);
            addText(value.footnote);
          }

          Object.keys(value).forEach(key => stack.push(value[key]));
        }
      }
    } catch (e) {}

    this._structuredChartTextSet = texts;
    return texts;
  }

  _isRichMediaChartText(el) {
    if (!el) return false;

    let node = el;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      const tagName = (node.tagName || '').toLowerCase();
      if (tagName === 'article' || tagName === 'main' || tagName === 'body') break;
      if (tagName === 'figure' && node.querySelector?.('dvz-ai2html-wrapper')) return true;

      const className = typeof node.className === 'string' ? node.className : '';
      const markers = [
        className,
        node.id,
        node.getAttribute?.('data-component'),
        node.getAttribute?.('data-testid'),
        node.getAttribute?.('aria-label')
      ].filter(Boolean).join(' ').toLowerCase();
      if (/(dvz|ai2html|toaster|chart|graphic)/.test(markers)) return true;
    }

    return false;
  }

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
    const structuredChartTexts = this._getStructuredChartTextSet();
    const featuredSrc = this.getFeaturedImage();
    // Bloomberg 图片模糊匹配：去掉最后一段（尺寸或文件名），保留图片 ID 目录
    let featuredKey = '';
    if (featuredSrc) {
      const fp = this._normalizeImgUrl(featuredSrc);
      featuredKey = fp.replace(/\/[^\/]*$/, '');
    }

    const container = this.getContentContainer();
    if (!container) return paragraphs;

    const endMarker = this._findArticleEndMarker();
    const elements = container.querySelectorAll('p, h2, h3, h4, img, figure');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="signup"], [class*="marketing"], [class*="ad-slot"], [class*="in-article-ad"]')) continue;
      if (this._isNonArticleChrome(el)) continue;
      if (this._isInlineRelatedModule(el)) continue;
      if (this._isAudioPodcastPromo(el)) continue;
      if (el.closest('dvz-ai2html-wrapper')) continue;

      if (this._isRelatedLinksTable(el)) {
        continue;
      }

      const tagName = el.tagName.toLowerCase();

      // 图片
      if (tagName === 'img' || tagName === 'figure') {
        const isChart = tagName === 'figure' && el.querySelector('dvz-ai2html-wrapper');
        const isInChart = tagName === 'img' && el.closest('dvz-ai2html-wrapper');
        if (isChart || isInChart) {
          if (isChart) {
            el.querySelectorAll('h2, h3, h4').forEach(h => {
              const ht = (h.innerText || '').trim();
              if (ht) seen.add(ht);
            });
          }
          continue;
        }

        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img);
        if (!src || seen.has(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        if (this._isHeroLikeImage(el, img)) continue;
        // 跳过与头图相同的图（模糊匹配图片 ID 目录）
        if (featuredKey) {
          const sp = this._normalizeImgUrl(src);
          const srcKey = sp.replace(/\/[^\/]*$/, '');
          if (srcKey === featuredKey || sp === featuredKey || src === featuredSrc) continue;
        }
        seen.add(src);
        const caption = this._getImageCaption(el, img);
        paragraphs.push({ type: 'image', src, caption });
        continue;
      }

      // 文本
      if (el.closest('figcaption')) continue;
      if (tagName.startsWith('h') && el.closest('figure')) continue;
      const text = (el.innerText || '').trim();
      const normalizedText = text.replace(/\s+/g, ' ').trim();
      if (text.length < 15) continue;
      if (seen.has(normalizedText)) continue;
      if (structuredChartTexts.has(normalizedText)) continue;
      if (this._isRichMediaChartText(el)) continue;
      if (/^(Read More|Share this|Most Read|Sign up|Subscribe|More from Bloomberg|Have a confidential|Terms of Service|Photographer:|Updated on|Related:|Also read|In this Article|Sorry,? something went wrong|Check your internet)/.test(text)) continue;
      if (/sorry.*went wrong|check your internet connection|refresh the page/i.test(text)) continue;
      if (/^get the .+ newsletter/i.test(text)) continue;
      if (/^by continuing.*privacy/i.test(text)) continue;
      if (/^delivered (weekly|daily|monthly)/i.test(text)) continue;
      if (/^\+?\s*sign up$/i.test(text) && text.length < 30) continue;
      const textLower = text.toLowerCase();
      if (/^(more from bloomberg|related stories|recommended|trending|you might|tech chart of the day|chart of the day|top tech stories|earnings due)/.test(textLower)) break;
      if (/takeaways.*bloomberg ai|bloomberg ai.*takeaways/i.test(text)) continue;
      if (/^(hide|show|takeaways)$/i.test(text)) continue;
      if (/^get alerts for\b/i.test(text)) break;
      if (/^sign up for notifications/i.test(text)) break;

      seen.add(normalizedText);
      paragraphs.push({
        type: tagName.startsWith('h') ? 'heading' : 'text',
        level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
        text: normalizedText
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
        const normalizedText2 = text2.replace(/\s+/g, ' ').trim();
        if (text2.length < 40) continue;
        if (seen.has(normalizedText2)) continue;
        if (el2.closest('nav, footer, aside')) continue;
        if (this._isNonArticleChrome(el2)) continue;
        if (this._isInlineRelatedModule(el2)) continue;
        if (this._isAudioPodcastPromo(el2)) continue;
        if (structuredChartTexts.has(normalizedText2)) continue;
        if (this._isRichMediaChartText(el2)) continue;
        const t2Lower = normalizedText2.toLowerCase();
        if (/^(more from bloomberg|related|recommended|trending|you might|get alerts for)/.test(t2Lower)) break;
        seen.add(normalizedText2);
        paragraphs.push({ type: 'text', level: 0, text: normalizedText2 });
      }
    }

    return paragraphs;
  }
}
