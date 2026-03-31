// NYTimes Adapter
function NYTimesAdapter() {
  BaseAdapter.call(this);
  this.name = 'nytimes';
  this.hostPatterns = ['nytimes.com', 'nyt.com'];
}

NYTimesAdapter.prototype = Object.create(BaseAdapter.prototype);
NYTimesAdapter.prototype.constructor = NYTimesAdapter;

NYTimesAdapter.prototype.isArticlePage = function() {
  return /nytimes\.com\/\d{4}\//.test(this.getURL()) ||
         document.querySelector('article') !== null;
};

NYTimesAdapter.prototype.getTitle = function() {
  const selectors = [
    'h1[data-testid="headline"]',
    'h1',
    '[class*="headline"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 5) return el.innerText.trim();
  }
  return document.title;
};

NYTimesAdapter.prototype.getAuthor = function() {
  const el = document.querySelector('[class*="byline"], [data-testid="byline"]');
  if (el) return el.innerText.trim().replace(/^by\s+/i, '');
  return '';
};

NYTimesAdapter.prototype.getPublishDate = function() {
  const el = document.querySelector('time, [class*="timestamp"]');
  if (el) {
    const dt = el.getAttribute('datetime');
    if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    return el.innerText.trim();
  }
  return '';
};

NYTimesAdapter.prototype.getFeaturedImage = function() {
  var og = document.querySelector('meta[property="og:image"]');
  if (og) return og.getAttribute('content') || '';
  return BaseAdapter.prototype.getFeaturedImage.call(this);
};

NYTimesAdapter.prototype.getContentContainer = function() {
  const selectors = [
    'section[name="articleBody"]',
    '[class*="article-body"]',
    'article'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};

NYTimesAdapter.prototype.getParagraphs = function() {
  var paragraphs = [];
  var seen = new Set();
  var seenImgKeys = new Set();
  var featuredSrc = this.getFeaturedImage();

  // 将 og:image 的归一化路径加入已见集合
  if (featuredSrc) {
    seenImgKeys.add(this._normalizeImgUrl(featuredSrc));
  }

  var container = this.getContentContainer();
  if (!container) return paragraphs;

  var elements = container.querySelectorAll('p, h2, h3, h4, img, figure');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];

    if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="ad-slot"], [class*="ad-container"], [class*="in-article-ad"], [class*="-ad-"], [class*="advert"], [class*="sponsor"], [class*="related"], [class*="most"], [class*="trending"]')) continue;

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
      // 过滤作者头像、图标等
      if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot|author-/i.test(src)) continue;
      if (img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"]')) continue;
      // NYT 图片路径去重：去掉分辨率后缀
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
      // 回退：alt 属性
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

    // 过滤推广
    if (/^(sign up|subscribe|newsletter|most popular|what to read next|related|recommended)/i.test(text)) continue;
    if (/^content provided by/i.test(text)) continue;
    // 过滤版权
    if (/^copyright ©\d{4}/i.test(text)) continue;
    // 过滤 "X hours/days ago" 行
    if (/^\d+\s+(hours?|days?|minutes?)\s+ago$/i.test(text)) continue;

    seen.add(text);
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text: text
    });
  }

  return paragraphs;
};

// 归一化 NYT 图片 URL：去掉分辨率/裁切后缀
// 例: /30dc-intel-01-mhtc/30dc-intel-01-mhtc-articleLarge.jpg → /30dc-intel-01-mhtc/
// 例: /30dc-intel-01-mhtc/30dc-intel-01-mhtc-superJumbo.jpg → /30dc-intel-01-mhtc/
NYTimesAdapter.prototype._normalizeImgUrl = function(url) {
  if (!url) return '';
  var path = url.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
  // NYT 图片格式: /images/.../slug-hash/slug-hash-sizeKeyword.ext
  // 去掉文件名中的 -sizeKeyword 后缀
  path = path.replace(/-(articleLarge|superJumbo|jumbo|large|medium|small|thumb[^L]|thumbLarge|thumbStandard|master|popup|slide|hpSmall|hpMedium|hpLarge|hpJumbo|inline|mediumSquareAt3X|mediumSquareAt2X|threeByTwoSmallAt2X|threeByTwoMediumAt2X|fourByThreeSmallAt2X|fourByThreeLargeAt2X)\b/gi, '');
  return path;
};
