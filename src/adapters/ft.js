// Financial Times Adapter
function FTAdapter() {
  BaseAdapter.call(this);
  this.name = 'ft';
  this.hostPatterns = ['ft.com'];
}

FTAdapter.prototype = Object.create(BaseAdapter.prototype);
FTAdapter.prototype.constructor = FTAdapter;

FTAdapter.prototype.isArticlePage = function() {
  return /ft\.com\/content\//.test(this.getURL());
};

FTAdapter.prototype.getTitle = function() {
  const selectors = [
    '[class*="headline"]',
    'h1',
    '[data-trackable="headline"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 5) return el.innerText.trim();
  }
  return document.title;
};

FTAdapter.prototype.getAuthor = function() {
  const el = document.querySelector('[class*="author"], [data-trackable="author"]');
  if (el) return el.innerText.trim().replace(/^by\s+/i, '');
  return '';
};

FTAdapter.prototype.getPublishDate = function() {
  const el = document.querySelector('time, [class*="date"]');
  if (el) {
    const dt = el.getAttribute('datetime');
    if (dt) return new Date(dt).toLocaleDateString('zh-CN');
    return el.innerText.trim();
  }
  return '';
};

FTAdapter.prototype.getContentContainer = function() {
  const selectors = [
    '[class*="article-body"]',
    '[class*="story-body"]',
    '.article__content',
    'article'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};

FTAdapter.prototype._findArticleEndMarker = function() {
  // 只在 article 容器内搜索，避免 header/sidebar 中的匹配导致正文被截断
  var scope = document.querySelector('article') || this.getContentContainer() || document;
  var allEls = scope.querySelectorAll('h2, h3, h4, [role="heading"], a[href], p');
  var total = allEls.length;
  for (var i = 0; i < total; i++) {
    var text = (allEls[i].innerText || '').trim().toLowerCase();
    // recommended 只在后 30% 视为结束标记（文章中间的 recommended 块跳过）
    if (i < total * 0.7 && /^(recommended)$/.test(text)) continue;
    if (/^(managing risk and opportunity|get ahead with daily|keep up with|follow the topics|more from the ft|related|recommended|popular in|more stories|explore the ft|try premium|myft|copyright|newsletter|sign up|subscribe|understanding the most|signed in as|edit commenting|show comments)/.test(text)) {
      return allEls[i];
    }
  }
  return null;
};

FTAdapter.prototype.getParagraphs = function() {
  var paragraphs = [];
  var seen = new Set();
  var featuredSrc = this.getFeaturedImage();
  var container = this.getContentContainer();
  if (!container) return paragraphs;

  var endMarker = this._findArticleEndMarker();

  // 同时搜索容器内和 article 内的图片，避免漏图
  var articleEl = document.querySelector('article') || container;
  var elements = articleEl.querySelectorAll('p, h2, h3, h4, img, figure, picture');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];

    // 到达结束标记后停止
    if (endMarker) {
      if (el === endMarker) break;
      var pos = endMarker.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) break;
    }

    if (el.closest('nav, header, footer, aside, [class*="ad"], [class*="sponsor"], [class*="newsletter"], [class*="promo"], [class*="related"], [class*="article-info"], [class*="byline"], [class*="timestamp"], [class*="meta"]')) continue;

    var tagName = el.tagName.toLowerCase();

    // 图片：处理 img, figure, picture
    if (tagName === 'img' || tagName === 'figure' || tagName === 'picture') {
      // 找到实际 img 元素
      var img = null;
      if (tagName === 'img') {
        img = el;
      } else {
        img = el.querySelector('img');
      }
      // 优先取 data-* 属性中的真实 URL，跳过 data: 占位符
      var src = '';
      if (img) {
        var srcCandidates = [
          img.getAttribute('data-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-lazy-src'),
          img.src,
          img.currentSrc
        ];
        for (var ci = 0; ci < srcCandidates.length; ci++) {
          if (srcCandidates[ci] && /^https?:\/\//i.test(srcCandidates[ci])) { src = srcCandidates[ci]; break; }
        }
      }
      // 如果 img 没有 https src，尝试从 <picture> 内的 <source srcset> 提取
      if (!src) {
        var picEl = tagName === 'picture' ? el : (el.closest ? el.closest('picture') : null);
        // <figure> 包含 <picture>，但 closest 向上查找找不到，需要向下查找子元素
        if (!picEl && tagName === 'figure') {
          picEl = el.querySelector('picture');
        }
        if (picEl) {
          var sources = picEl.querySelectorAll('source[srcset]');
          for (var si = 0; si < sources.length; si++) {
            var srcset = sources[si].getAttribute('srcset') || '';
            // srcset 格式: "url 1x, url 2x" 或 "url 100w, url 200w"
            var parts = srcset.split(',');
            for (var pi = 0; pi < parts.length; pi++) {
              var url = parts[pi].trim().split(/\s+/)[0];
              if (url && /^https?:\/\//i.test(url)) { src = url; break; }
            }
            if (src) break;
          }
        }
      }
      if (!img && !src) continue;
      // 如果只有 picture/source 但没有 img，跳过
      if (!img) continue;
      if (!src || seen.has(src)) continue;
      if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot/i.test(src)) continue;
      if (img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"]')) continue;
      // 跳过头图
      if (src === featuredSrc) continue;
      var w = img.naturalWidth || img.width || 0;
      if (w > 0 && w <= 50) continue;
      seen.add(src);
      var caption = '';
      var fig = el.closest('figure') || (tagName === 'figure' ? el : null);
      if (fig) {
        var fc = fig.querySelector('figcaption');
        if (fc && (fc.innerText || '').trim()) {
          caption = (fc.innerText || '').trim();
        } else {
          var capEl = fig.querySelector('[class*="caption"], [class*="credit"], [class*="Caption"], [class*="Credit"]');
          if (capEl && (capEl.innerText || '').trim().length < 300) caption = (capEl.innerText || '').trim();
        }
      }
      // 回退：查找图片紧邻的下一个兄弟元素
      if (!caption) {
        var next = img.parentElement && img.parentElement.nextElementSibling;
        if (!next) next = el.nextElementSibling;
        if (next && next.tagName) {
          var nt = (next.innerText || '').trim();
          if (nt.length > 2 && nt.length < 300 && !/^(sign up|subscribe|newsletter|myft|try premium|more from|read more|share this|follow|copyright|get ahead|managing risk)/i.test(nt)) {
            caption = nt;
          }
        }
      }
      paragraphs.push({ type: 'image', src: src, caption: caption });
      continue;
    }

    // 文本
    if (el.closest('figcaption')) continue;
    var text = (el.innerText || '').trim();
    if (text.length < 15) continue;
    if (seen.has(text)) continue;

    // 过滤发布时间：Published 4 hours ago / Published2 hours ago（无空格拼接）
    if (/^(published|updated|first published)\s*/i.test(text) && /\b(ago|yesterday|\d{4})\b/i.test(text)) continue;
    // 过滤推广语
    if (/^get ahead with daily|^keep up with|^stay informed|^follow the topics/i.test(text)) continue;
    // 过滤邮箱地址
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) continue;
    if (/email|@ft\.com/i.test(text) && text.length < 80) continue;
    // 过滤标语
    if (/^managing risk and opportunity in the world/i.test(text)) continue;
    // 过滤其他非正文
    if (/^(sign up|subscribe|newsletter|myft|try premium|more from|read more|share this|follow|copyright|signed in as|edit commenting|show comments|understanding the most)/i.test(text)) continue;
    // 过滤 FT 推广类标题（newsletter 摘要等）
    if (/^understanding the (most|key|latest|important)/i.test(text) && text.length < 120) continue;
    if (/signed in as/i.test(text) && /edit (commenting|display name)/i.test(text)) continue;
    // 过滤短链接行
    if (/^https?:\/\//i.test(text) && text.length < 120) continue;
    // 过滤作者署名行：Name in City
    if (/^[\w\s]+\s+in\s+[A-Z][\w\s]+$/.test(text) && text.length < 60) continue;

    seen.add(text);
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text: text
    });
  }

  // Fallback
  if (paragraphs.filter(function(p) { return p.type === 'text'; }).length < 3) {
    paragraphs = [];
    seen.clear();
    var allP = document.querySelectorAll('p');
    for (var j = 0; j < allP.length; j++) {
      var el2 = allP[j];
      var text2 = (el2.innerText || '').trim();
      if (text2.length < 40) continue;
      if (seen.has(text2)) continue;
      if (el2.closest('nav, footer, aside')) continue;
      var t2Lower = text2.toLowerCase();
      if (/^(managing risk|get ahead|keep up|more from the ft|related|popular in|more stories|explore the ft|try premium|myft|sign up|subscribe|newsletter|understanding the most|signed in as|edit commenting|show comments)/.test(t2Lower)) break;
      if (/^recommended$/i.test(text2)) continue; // 中间的 recommended 块跳过而非截断
      seen.add(text2);
      paragraphs.push({ type: 'text', level: 0, text: text2 });
    }
  }

  return paragraphs;
};