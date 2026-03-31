// The Economist Adapter
function EconomistAdapter() {
  BaseAdapter.call(this);
  this.name = 'economist';
  this.hostPatterns = ['economist.com'];
}

EconomistAdapter.prototype = Object.create(BaseAdapter.prototype);
EconomistAdapter.prototype.constructor = EconomistAdapter;

EconomistAdapter.prototype.isArticlePage = function() {
  var url = this.getURL();
  // 文章格式: /section/YYYY/...
  if (/economist\.com\/\w+\/\d{4}\//.test(url)) return true;
  // 简报页面
  if (/economist\.com\/the-world-in-brief/.test(url)) return true;
  // DOM 回退
  if (document.querySelector('article')) return true;
  return false;
};

EconomistAdapter.prototype.getTitle = function() {
  const selectors = [
    'h1[class*="headline"]',
    'h1',
    '[class*="article-headline"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 5) return el.innerText.trim();
  }
  return document.title;
};

EconomistAdapter.prototype.getAuthor = function() {
  const el = document.querySelector('[class*="rubric"], [class*="flytitle"]');
  if (el) return el.innerText.trim();
  return '';
};

EconomistAdapter.prototype.getPublishDate = function() {
  const el = document.querySelector('time, [class*="date"], [class*="timestamp"]');
  if (el) {
    const dt = el.getAttribute('datetime');
    if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    return el.innerText.trim();
  }
  return '';
};

EconomistAdapter.prototype.getFeaturedImage = function() {
  var og = document.querySelector('meta[property="og:image"]');
  if (og) {
    var src = og.getAttribute('content') || '';
    // 过滤品牌/站级别的通用图片
    if (/engassets|og-image|\/og\./i.test(src)) return '';
    return src;
  }
  return BaseAdapter.prototype.getFeaturedImage.call(this);
};

EconomistAdapter.prototype.getContentContainer = function() {
  const selectors = [
    '[class*="article-body"]',
    '[class*="story-text"]',
    '.layout-article-body',
    'article',
    'main'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};

EconomistAdapter.prototype._findArticleEndMarker = function(container) {
  // 简报页面：只匹配最后的 "Daily quiz" 等作为结束
  // 普通文章：匹配常见的页尾推荐区
  var isBrief = /the-world-in-brief/.test(this.getURL() || '');
  var allEls = container.querySelectorAll('h2, h3, h4, [role="heading"], p');
  var total = allEls.length;
  for (var i = total - 1; i >= 0; i--) {
    var text = (allEls[i].innerText || '').trim();
    if (text.length > 100) continue;
    var lower = text.toLowerCase();
    if (isBrief) {
      // 简报页：只截断 Daily quiz 及之后的推广
      if (/^(daily quiz|today's quiz|sign up|subscribe|newsletter|copyright)/.test(lower)) {
        return allEls[i];
      }
    } else {
      // 普通文章：只在后 30% 检查
      if (i < total * 0.7) return null;
      if (/^(explore more|more from|related|recommended|popular|trending|you may also|readers also|sign up|subscribe|newsletter|copyright|keep updated|more on this)/.test(lower)) {
        return allEls[i];
      }
    }
  }
  return null;
};

EconomistAdapter.prototype.getParagraphs = function() {
  var paragraphs = [];
  var seen = new Set();
  var seenImgKeys = new Set();
  var featuredSrc = this.getFeaturedImage();
  if (featuredSrc) {
    seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
  }

  var container = this.getContentContainer();
  if (!container) return paragraphs;

  var endMarker = this._findArticleEndMarker(container);

  var elements = container.querySelectorAll('p, h2, h3, h4, img, figure');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];

    if (endMarker) {
      if (el === endMarker) break;
      var pos = endMarker.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
    }

    if (el.closest('nav, header, footer, aside, audio, video, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="sidebar"]')) continue;

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
      if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot|og-image|engassets/i.test(src)) continue;
      if (img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"]')) continue;
      // 去重
      var imgKey = this._normalizeImgUrl(src);
      if (seenImgKeys.has(imgKey)) continue;
      seenImgKeys.add(imgKey);
      // 过滤小图
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (w > 0 && w <= 200) continue;
      if (h > 0 && h <= 200) continue;
      seen.add(src);
      // 提取附注
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
      if (!caption) {
        var alt = (img.getAttribute('alt') || '').trim();
        if (alt && alt.length > 5 && alt.length < 300 && !/^(photo|image|graphic)/i.test(alt)) caption = alt;
      }
      paragraphs.push({ type: 'image', src: src, caption: caption });
      continue;
    }

    // 文本
    if (el.closest('figcaption, audio, video')) continue;
    var text = (el.innerText || '').trim();
    // 修复 Economist 首字母下沉导致的额外空格：如 "T he" → "The"
    text = text.replace(/^([A-Za-z])\s([a-z])/, '$1$2');
    if (text.length < 15) continue;
    if (seen.has(text)) continue;

    if (/^(explore more|more from)/i.test(text)) break;
    if (/^(sign up|subscribe|newsletter|related|recommended|keep updated|more on this)/i.test(text)) continue;
    if (/^copyright/i.test(text)) continue;
    if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;
    if (/^(articles?|audio)\s+(updated|recorded)\s+\d+/i.test(text)) continue;
    if (/^listen to (the )?(briefing|audio|podcast)/i.test(text)) continue;
    if (/^follow (our |the )?latest coverage/i.test(text)) continue;
    if (/^catch up quickly on the global stories/i.test(text)) continue;
    if (/^sign up to enjoy/i.test(text)) continue;
    if (/^figure of the day/i.test(text) && text.length < 200) continue;

    seen.add(text);
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text: text
    });
  }

  return paragraphs;
};

// 归一化图片 URL：去掉 Economist CDN 的尺寸/格式参数
// 例: /cdn-cgi/image/width=1424,quality=80,format=auto/content-assets/... → /content-assets/...
// 例: /img/b/1000/563/90/sites/default/files/... → /sites/default/files/...
EconomistAdapter.prototype._normalizeImgUrl = function(url) {
  if (!url) return '';
  var path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
  // 去掉 Cloudflare CDN 前缀 /cdn-cgi/image/.../
  path = path.replace(/\/cdn-cgi\/image\/[^\/]+\//i, '/');
  // 去掉 Economist CDN 尺寸前缀 /img/b/WW/HH/QUALITY/
  path = path.replace(/\/img\/b\/\d+\/\d+\/\d+\//i, '/');
  return path;
};
