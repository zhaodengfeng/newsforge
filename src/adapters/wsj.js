// WSJ Adapter
function WSJAdapter() {
  BaseAdapter.call(this);
  this.name = 'wsj';
  this.hostPatterns = ['wsj.com', 'wsj.net'];
}

WSJAdapter.prototype = Object.create(BaseAdapter.prototype);
WSJAdapter.prototype.constructor = WSJAdapter;

WSJAdapter.prototype.isArticlePage = function() {
  var url = this.getURL();
  // 旧格式: /articles/slug-ID
  if (/wsj\.com\/articles\//.test(url)) return true;
  // 新格式: /section/subsection/slug-ID（ID 为 10+ 位数字结尾）
  if (/wsj\.com\/[a-z][-a-z]*\/.+-\d{10,}/.test(url)) return true;
  // live coverage
  if (/wsj\.com\/livecoverage\//.test(url)) return true;
  // DOM 回退：有 article 元素且内容足够长
  var article = document.querySelector('article');
  if (article && (article.innerText || '').trim().length > 500) return true;
  return false;
};

WSJAdapter.prototype.getTitle = function() {
  const selectors = [
    'h1[class*="headline"]',
    '[class*="article-headline"]',
    'h1'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 5) return el.innerText.trim();
  }
  return document.title;
};

WSJAdapter.prototype.getAuthor = function() {
  const el = document.querySelector('[class*="author"], [class*="byline"], .author');
  if (el) return el.innerText.trim().replace(/^by\s+/i, '');
  return '';
};

WSJAdapter.prototype.getContentContainer = function() {
  const selectors = [
    '[class*="article-content"]',
    '[class*="articleBody"]',
    '[class*="paragraph"]',
    'article'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};

WSJAdapter.prototype._findArticleEndMarker = function(container) {
  var allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
  for (var i = 0; i < allEls.length; i++) {
    var text = (allEls[i].innerText || '').trim();
    if (text.length > 100) continue;
    var lower = text.toLowerCase();
    if (/^(what to read next|most popular|trending now|you may also like|more from|recommended|related stories|popular on wsj|readers also|from the archive|sponsor content|content provided by|this explanatory article)/.test(lower)) {
      return allEls[i];
    }
  }
  return null;
};

// 归一化图片 URL：去掉域名、query、以及分辨率后缀，用于去重
// 例: /ai2html/UUID/name_700px.jpg → /ai2html/UUID/name.jpg
// 例: /im-12345/social → /im-12345
// 例: /im-12345?width=700 → /im-12345
WSJAdapter.prototype._normalizeImgUrl = function(url) {
  if (!url) return '';
  var path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
  // 去掉 _NNNpx 后缀（WSJ ai2html 图片的不同分辨率版本）
  path = path.replace(/_\d+px(\.[a-z]+)?$/i, '$1');
  // 去掉 /social /web 等后缀路径段（WSJ im 图片）
  path = path.replace(/\/(social|web)$/, '');
  return path;
};

WSJAdapter.prototype.getFeaturedImage = function() {
  var og = document.querySelector('meta[property="og:image"]');
  if (og) return og.getAttribute('content') || '';
  return BaseAdapter.prototype.getFeaturedImage.call(this);
};

WSJAdapter.prototype.getParagraphs = function() {
  var paragraphs = [];
  var seen = new Set();
  var seenImgKeys = new Set(); // 图片路径去重（去掉分辨率后缀）
  var featuredSrc = this.getFeaturedImage();
  // 将 og:image 的归一化路径加入已见集合
  if (featuredSrc) {
    seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
  }
  var container = this.getContentContainer();
  if (!container) return paragraphs;

  var endMarker = this._findArticleEndMarker(container);

  var elements = container.querySelectorAll('p, h2, h3, h4, img, figure');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];

    // 到达结束标记后停止
    if (endMarker) {
      if (el === endMarker) break;
      var pos = endMarker.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
    }

    if (el.closest('nav, header, footer, aside, video, [class*="newsletter"], [class*="promo"], [class*="ad"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="video"]')) continue;

    var tagName = el.tagName.toLowerCase();

    // 图片
    if (tagName === 'img' || tagName === 'figure') {
      var img = tagName === 'img' ? el : el.querySelector('img');
      if (!img) continue;
      var srcCandidates = [
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-lazy-src'),
        img.src,
        img.currentSrc
      ];
      var src = '';
      for (var ci = 0; ci < srcCandidates.length; ci++) {
        if (srcCandidates[ci] && /^https?:\/\//i.test(srcCandidates[ci])) { src = srcCandidates[ci]; break; }
      }
      if (!src || seen.has(src)) continue;
      if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot/i.test(src)) continue;
      if (img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"]')) continue;
      // WSJ 图片路径去重：去掉分辨率后缀后比较（同一图片不同尺寸）
      var imgKey = this._normalizeImgUrl(src);
      if (seenImgKeys.has(imgKey)) continue;
      seenImgKeys.add(imgKey);
      // 头图区域容器过滤：hero/featured/lead 区的图片视为头图
      if (img.closest('[class*="hero"], [class*="featured"], [class*="lead-image"], [class*="main-image"], [class*="topper-image"], [class*="article-top-image"], [class*="headline-image"]')) continue;
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (w > 0 && w <= 200) continue;
      if (h > 0 && h <= 200) continue;
      seen.add(src);
      var caption = '';
      var fig = el.closest('figure') || (tagName === 'figure' ? el : null);
      if (fig) {
        var fc = fig.querySelector('figcaption');
        if (fc && (fc.innerText || '').trim()) {
          caption = (fc.innerText || '').trim();
        } else {
          var capEl = fig.querySelector('[class*="caption"], [class*="credit"]');
          if (capEl && (capEl.innerText || '').trim().length < 300) caption = (capEl.innerText || '').trim();
        }
      }
      // 回退：查找图片父容器的下一个兄弟元素（WSJ 常把附注放在图片外部的独立元素中）
      if (!caption) {
        var parentCandidates = [el.parentElement, img.parentElement];
        for (var pi = 0; pi < parentCandidates.length; pi++) {
          if (!parentCandidates[pi]) continue;
          var next = parentCandidates[pi].nextElementSibling;
          if (!next) continue;
          var nt = (next.innerText || '').trim();
          if (nt.length > 2 && nt.length < 300 && !/^(sign up|subscribe|newsletter|most popular|what to read|related)/i.test(nt)) {
            caption = nt;
            seen.add(nt);
            break;
          }
        }
      }
      // 最终回退：alt 属性
      if (!caption) {
        var alt = (img.getAttribute('alt') || '').trim();
        if (alt && alt.length > 5 && alt.length < 300 && !/^(photo|image|graphic)/i.test(alt)) caption = alt;
      }
      paragraphs.push({ type: 'image', src: src, caption: caption });
      continue;
    }

    // 文本
    if (el.closest('figcaption')) continue;
    var text = (el.innerText || '').trim();
    if (text.length < 15) continue;
    if (seen.has(text)) continue;

    // 过滤版权
    if (/^copyright ©\d{4}/i.test(text)) continue;
    // 过滤作者简介：提到 Journal/WSJ 且句式为 "Name is a reporter/correspondent..."
    if (/^\S.+?\bis (a |an )/i.test(text) && text.length < 600 && /\b(wall street journal|the journal|wsj)\b/i.test(text)) continue;
    if (/\b(before joining the journal|began (his|her) (journalism|career))\b/i.test(text)) continue;
    if (/\b(her|his) work has (won|earned|been)\b/i.test(text) && /\b(journalism|award|prize)\b/i.test(text)) continue;
    if (/^(previously she|previously he) (worked|was)/i.test(text)) continue;
    // 过滤推广
    if (/^(sign up|subscribe|newsletter|what to read next|most popular)/i.test(text)) continue;
    if (/^this explanatory article/i.test(text)) continue;
    if (/^content provided by/i.test(text)) continue;
    // 过滤 "X hours/days ago" 行（相关文章的时间戳）
    if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
    // 过滤 "Plus, ..." 开头的推广行
    if (/^plus,\s/i.test(text) && text.length < 200) continue;
    // 过滤纯数字/哈希
    if (/^[0-9a-f]{16,}$/i.test(text)) continue;

    seen.add(text);
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text: text
    });
  }

  return paragraphs;
};