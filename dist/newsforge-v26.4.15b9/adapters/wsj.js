// WSJ Adapter
class WSJAdapter extends BaseAdapter {
  constructor() {
    super();
    this.name = 'wsj';
    this.hostPatterns = ['wsj.com', 'wsj.net'];
  }

  isArticlePage() {
    const url = this.getURL();
    if (/wsj\.com\/articles\//.test(url)) return true;
    if (/wsj\.com\/[a-z][-a-z]*\/.+-\d{10,}/.test(url)) return true;
    if (/wsj\.com\/livecoverage\//.test(url)) return true;
    const article = document.querySelector('article');
    if (article && (article.innerText || '').trim().length > 500) return true;
    return false;
  }

  getTitle() {
    const selectors = ['h1[class*="headline"]', '[class*="article-headline"]', 'h1'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 5) return el.innerText.trim();
    }
    return document.title;
  }

  getAuthor() {
    const el = document.querySelector('[class*="author"], [class*="byline"], .author');
    if (el) return el.innerText.trim().replace(/^by\s+/i, '');
    return '';
  }

  getContentContainer() {
    const selectors = [
      '[class*="article-content"]', '[class*="articleBody"]',
      '[class*="paragraph"]', 'article'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 200) return el;
    }
    return super.getContentContainer();
  }

  _findArticleEndMarker(container) {
    const allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
    for (let i = 0; i < allEls.length; i++) {
      const text = (allEls[i].innerText || '').trim();
      if (text.length > 100) continue;
      const lower = text.toLowerCase();
      if (/^(what to read next|most popular|trending now|you may also like|more from|recommended|related stories|popular on wsj|readers also|from the archive|sponsor content|content provided by|this explanatory article|free expression)/.test(lower)) {
        return allEls[i];
      }
    }
    return null;
  }

  _normalizeImgUrl(url) {
    if (!url) return '';
    let path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    const imMatch = path.match(/^(\/im-\d+)/i);
    if (imMatch) return imMatch[1];
    path = path.replace(/_\d+px(\.[a-z]+)?$/i, '$1');
    return path;
  }

  getFeaturedImage() {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content') || '';
    return super.getFeaturedImage();
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

    // 找到 AI 摘要结束标记，跳过它及之前的所有内容
    let startIdx = 0;
    for (let si = 0; si < elements.length; si++) {
      const sel = elements[si];
      if (sel.tagName.toLowerCase() !== 'p') continue;
      const stxt = (sel.innerText || '').trim();
      if (/^this summary was generated with ai/i.test(stxt)) {
        startIdx = si + 1;
        for (let sj = 0; sj < si; sj++) {
          const selp = elements[sj];
          if (selp.tagName.toLowerCase() !== 'p') continue;
          const sjtxt = (selp.innerText || '').trim();
          if (sjtxt.length >= 15) seen.add(sjtxt);
        }
        break;
      }
    }

    for (let i = startIdx; i < elements.length; i++) {
      const el = elements[i];
      const wsjBylineRoot = el.closest('[data-testid="timestamp-text"], [data-testid="byline"], [data-testid="author-link"], a[href*="/news/author/"], [class*="Authoring" i], [class*="Byline" i], [class*="HedCut" i], [class*="TimeTag" i]');

      if (endMarker) {
        if (el === endMarker) break;
        const pos = endMarker.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }

      if (wsjBylineRoot) continue;
      if (el.closest('nav, header, footer, aside, video, [class*="newsletter"], [class*="promo"], [class*="series-nav"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="video"], [class*="share-your-thoughts"], [class*="ShareYourThoughts"], [class*="opinion-question"]')) continue;
      if (el.closest('.ai2html_export, .djai2html-foot')) continue;
      if (el.closest('[data-testid="author-module-bio"], [class*="AuthorModuleBio"]')) continue;

      const tagName = el.tagName.toLowerCase();

      // 图片
      if (tagName === 'img' || tagName === 'figure') {
        const img = tagName === 'img' ? el : el.querySelector('img');
        const src = this._resolveImageSrc(img);
        if (!src || seen.has(src)) continue;
        if (this._isFilteredImage(src, img)) continue;
        // WSJ 图片路径去重
        const imgKey = this._normalizeImgUrl(src);
        if (seenImgKeys.has(imgKey)) continue;
        seenImgKeys.add(imgKey);
        // 头图区域容器过滤
        if (img && img.closest('[class*="hero"], [class*="featured"], [class*="lead-image"], [class*="main-image"], [class*="topper-image"], [class*="article-top-image"], [class*="headline-image"], [class*="top-image"], [class*="topper"], [class*="articleTopper"], [class*="article-hero"]')) continue;
        seen.add(src);
        let caption = this._getImageCaption(el, img);
        // WSJ 回退：父容器的兄弟元素
        if (!caption) {
          const parentCandidates = [el.parentElement, img?.parentElement];
          for (const pc of parentCandidates) {
            if (!pc) continue;
            const next = pc.nextElementSibling;
            if (!next) continue;
            const nt = (next.innerText || '').trim();
            if (nt.length > 2 && nt.length < 300 && !/^(sign up|subscribe|newsletter|most popular|what to read|related)/i.test(nt)) {
              caption = nt;
              seen.add(nt);
              break;
            }
          }
        }
        // 最终回退：alt 属性
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

      if (/^copyright ©\d{4}/i.test(text)) continue;
      if (/view more$/i.test(text)) continue;
      // Filter "SHARE YOUR THOUGHTS" interactive section
      if (/^share your thoughts$/i.test(text)) continue;
      if (/join the conversation/i.test(text)) continue;
      // Filter embedded video headings ("Watch: ...")
      if (/^watch:/i.test(text)) continue;
      if (/^\S.+?\bis (a |an |chief |senior |executive |deputy |the )/i.test(text) && text.length < 600 && /\b(wall street journal|the journal|wsj)\b/i.test(text)) continue;
      if (/\b(before joining the journal|began (his|her) (journalism|career))\b/i.test(text)) continue;
      if (/\b(her|his) work has (won|earned|been)\b/i.test(text) && /\b(journalism|award|prize)\b/i.test(text)) continue;
      if (/^(sign up|subscribe|newsletter|what to read next|most popular)/i.test(text)) continue;
      if (/^this explanatory article/i.test(text)) continue;
      if (/^content provided by/i.test(text)) continue;
      if (/^free expression\b/i.test(text)) continue;
      if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
      if (/^plus,\s/i.test(text) && text.length < 200) continue;
      if (/^[0-9a-f]{16,}$/i.test(text)) continue;

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
