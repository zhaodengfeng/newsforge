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
      if (/^(more from bloomberg|related stories|most read|trending now|you might also|more stories|recommended for you)/.test(text)) {
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

  getParagraphs() {
    const paragraphs = [];
    const seen = new Set();
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
      if (el.closest('dvz-ai2html-wrapper')) continue;

      if (this._isRelatedLinksTable(el)) {
        if (paragraphs.length > 0) break;
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
      if (text.length < 15) continue;
      if (seen.has(text)) continue;
      if (/^(Read More|Share this|Most Read|Sign up|Subscribe|More from Bloomberg|Have a confidential|Terms of Service|Photographer:|Updated on|Related:|Also read|In this Article|Sorry,? something went wrong|Check your internet)/.test(text)) continue;
      if (/sorry.*went wrong|check your internet connection|refresh the page/i.test(text)) continue;
      if (/^get the .+ newsletter/i.test(text)) continue;
      if (/^by continuing.*privacy/i.test(text)) continue;
      if (/^delivered (weekly|daily|monthly)/i.test(text)) continue;
      if (/^\+?\s*sign up$/i.test(text) && text.length < 30) continue;
      const textLower = text.toLowerCase();
      if (/^(more from bloomberg|related stories|recommended|trending|you might)/.test(textLower)) break;
      if (/takeaways.*bloomberg ai|bloomberg ai.*takeaways/i.test(text)) continue;
      if (/^(hide|show|takeaways)$/i.test(text)) continue;
      if (/^get alerts for\b/i.test(text)) break;
      if (/^sign up for notifications/i.test(text)) break;

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
        if (el2.closest('nav, footer, aside')) continue;
        const t2Lower = text2.toLowerCase();
        if (/^(more from bloomberg|related|recommended|trending|you might|get alerts for)/.test(t2Lower)) break;
        seen.add(text2);
        paragraphs.push({ type: 'text', level: 0, text: text2 });
      }
    }

    return paragraphs;
  }
}
