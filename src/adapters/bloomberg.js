// Bloomberg Adapter
function BloombergAdapter() {
  BaseAdapter.call(this);
  this.name = 'bloomberg';
  this.hostPatterns = ['bloomberg.com'];
}

BloombergAdapter.prototype = Object.create(BaseAdapter.prototype);
BloombergAdapter.prototype.constructor = BloombergAdapter;

BloombergAdapter.prototype.isArticlePage = function() {
  var url = this.getURL();
  return /bloomberg\.com\/(news|opinion|features|magazines|technology|politics|business|graphics)/.test(url) ||
         document.querySelector('article') !== null;
};

BloombergAdapter.prototype.getTitle = function() {
  var h1 = document.querySelector('article h1, main h1, h1');
  if (h1 && h1.innerText.trim().length > 5) return h1.innerText.trim();
  var og = document.querySelector('meta[property="og:title"]');
  if (og) return og.getAttribute('content') || '';
  return document.title;
};

BloombergAdapter.prototype.getAuthor = function() {
  var meta = document.querySelector('meta[name="author"], meta[property="article:author"]');
  if (meta) return (meta.getAttribute('content') || '').replace(/^by\s+/i, '');
  var link = document.querySelector('a[rel="author"]');
  if (link) return link.innerText.trim();
  return BaseAdapter.prototype.getAuthor.call(this);
};

BloombergAdapter.prototype.getPublishDate = function() {
  var meta = document.querySelector('meta[property="article:published_time"], meta[name="date"]');
  if (meta) {
    var dt = meta.getAttribute('content');
    if (dt) return new Date(dt).toLocaleDateString('zh-CN');
  }
  var time = document.querySelector('time[datetime]');
  if (time) {
    var dt2 = time.getAttribute('datetime');
    if (dt2) return new Date(dt2).toLocaleDateString('zh-CN');
    return time.innerText.trim();
  }
  return '';
};

BloombergAdapter.prototype.getFeaturedImage = function() {
  var og = document.querySelector('meta[property="og:image"]');
  if (og) return og.getAttribute('content') || '';
  return BaseAdapter.prototype.getFeaturedImage.call(this);
};

// 找到"正文结束"的位置——在此之后的内容全部丢弃
// 策略：找 "More from Bloomberg" / "Related" 等标题，取其在 DOM 中最早出现的位置
BloombergAdapter.prototype._findArticleEndMarker = function() {
  var allEls = document.querySelectorAll('h2, h3, h4, [role="heading"], a[href]');
  for (var i = 0; i < allEls.length; i++) {
    var text = (allEls[i].innerText || '').trim().toLowerCase();
    if (/^(more from bloomberg|related stories|most read|trending now|you might also|more stories|recommended for you)/.test(text)) {
      return allEls[i];
    }
  }
  return null;
};

BloombergAdapter.prototype.getContentContainer = function() {
  var article = document.querySelector('article');
  if (article && (article.innerText || '').trim().length > 300) return article;

  var pTags = document.querySelectorAll('p');
  var parentMap = new Map();
  for (var i = 0; i < pTags.length; i++) {
    var p = pTags[i];
    var text = (p.innerText || '').trim();
    if (text.length < 30) continue;
    if (p.closest('nav, header, footer, aside')) continue;
    var parent = p.parentElement;
    if (!parent) continue;
    if (!parentMap.has(parent)) parentMap.set(parent, { el: parent, count: 0, textLen: 0 });
    var info = parentMap.get(parent);
    info.count++;
    info.textLen += text.length;
  }

  var best = null;
  parentMap.forEach(function(info) {
    if (info.count >= 2 && (!best || info.textLen > best.textLen)) {
      best = info;
    }
  });

  if (best) return best.el;
  return BaseAdapter.prototype.getContentContainer.call(this);
};

BloombergAdapter.prototype.getParagraphs = function() {
  var paragraphs = [];
  var seen = new Set();
  var featuredSrc = this.getFeaturedImage();
  // 提取图片 ID 用于模糊匹配
  // Bloomberg 图片格式: https://assets.bwbx.io/images/users/xxxID/1200x800.jpg
  // 同一张图可能有不同尺寸后缀，所以只比较去掉最后一段尺寸/文件名后的路径
  var featuredKey = '';
  if (featuredSrc) {
    var fp = featuredSrc.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
    // 去掉最后一段（尺寸或文件名），保留图片 ID 目录
    featuredKey = fp.replace(/\/[^\/]*$/, '');
  }

  var container = this.getContentContainer();
  if (!container) return paragraphs;

  // 找到正文结束标记
  var endMarker = this._findArticleEndMarker();

  var elements = container.querySelectorAll('p, h2, h3, h4, img, figure');
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];

    // 如果到了结束标记，停止
    if (endMarker) {
      if (el === endMarker) break;
      var pos = endMarker.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        break;
      }
    }

    if (el.closest('nav, header, footer, aside, [class*="newsletter"], [class*="promo"], [class*="signup"], [class*="marketing"], [class*="ad-slot"], [class*="in-article-ad"]')) continue;

    // Skip any content inside Bloomberg chart/infographic wrappers
    if (el.closest('dvz-ai2html-wrapper')) continue;

    var tagName = el.tagName.toLowerCase();

    // 图片
    if (tagName === 'img' || tagName === 'figure') {
      // Skip Bloomberg chart/infographic content entirely (dvz-ai2html-wrapper)
      // Check BEFORE finding img, because charts may contain fallback images
      var isChart = tagName === 'figure' && el.querySelector('dvz-ai2html-wrapper');
      var isInChart = tagName === 'img' && el.closest('dvz-ai2html-wrapper');
      if (isChart || isInChart) {
        if (isChart) {
          el.querySelectorAll('h2, h3, h4').forEach(function(h) {
            var ht = (h.innerText || '').trim();
            if (ht) seen.add(ht);
          });
        }
        continue;
      }

      var img = tagName === 'img' ? el : el.querySelector('img');
      if (!img) continue;
      // 优先取 data-* 属性中的真实 URL，跳过 data: 占位符
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
      if (/avatar|icon|logo|pixel|spacer|badge|\.svg|profile|headshot|head-shot|person|bio-photo/i.test(src)) continue;
      // 过滤作者头像：通常在 class 含 author/byline/writer/bio 的容器内
      if (img.closest('[class*="author"], [class*="byline"], [class*="writer"], [class*="bio"], [class*="contributor"], [class*="person"], [rel="author"]')) continue;
      // 过滤 newsletter/promo 容器内的图片
      if (img.closest('[class*="newsletter"], [class*="promo"], [class*="signup"], [class*="marketing"]')) continue;
      // 跳过与头图相同的图（模糊匹配图片 ID 目录）
      if (featuredKey) {
        var sp = src.replace(/^https?:\/\/[^\/]+/, '').split('?')[0].split('#')[0];
        var srcKey = sp.replace(/\/[^\/]*$/, '');
        if (srcKey === featuredKey || sp === featuredKey || src === featuredSrc) continue;
      }
      var w = img.naturalWidth || img.width || 0;
      var h = img.naturalHeight || img.height || 0;
      if (w > 0 && w <= 200) continue;
      if (h > 0 && h <= 200) continue;
      seen.add(src);
      var caption = '';
      var fig = el.closest('figure') || (tagName === 'figure' ? el : null);
      if (fig) {
        // 优先 figcaption
        var fc = fig.querySelector('figcaption');
        if (fc && (fc.innerText || '').trim()) {
          caption = (fc.innerText || '').trim();
        } else {
          // 回退：查找 figure 内含 caption/credit 类的元素
          var capEl = fig.querySelector('[class*="caption"], [class*="credit"], [class*="Caption"], [class*="Credit"]');
          if (capEl && (capEl.innerText || '').trim().length < 300) caption = (capEl.innerText || '').trim();
        }
      }
      // 仍无附注：查找图片紧邻的下一个兄弟元素
      if (!caption) {
        var next = img.parentElement && img.parentElement.nextElementSibling;
        if (!next) next = el.nextElementSibling;
        if (next && next.tagName) {
          var nt = (next.innerText || '').trim();
          if (nt.length > 2 && nt.length < 300 && !/^(Read More|Share|Most Read|Sign up|Subscribe)/.test(nt)) {
            caption = nt;
          }
        }
      }
      paragraphs.push({ type: 'image', src: src, caption: caption });
      continue;
    }

    // 文本
    if (el.closest('figcaption')) continue;
    // Skip headings inside figure elements (chart titles, handled by figure logic above)
    if (tagName.startsWith('h') && el.closest('figure')) continue;
    var text = (el.innerText || '').trim();
    if (text.length < 15) continue;
    if (seen.has(text)) continue;
    // 过滤非正文内容
    if (/^(Read More|Share this|Most Read|Sign up|Subscribe|More from Bloomberg|Have a confidential|Terms of Service|Photographer:|Updated on|Related:|Also read|In this Article|Sorry,? something went wrong|Check your internet)/.test(text)) continue;
    if (/sorry.*went wrong|check your internet connection|refresh the page/i.test(text)) continue;
    // 过滤 newsletter 推广：Get the ... newsletter in your inbox / By continuing / Delivered weekly
    if (/^get the .+ newsletter/i.test(text)) continue;
    if (/^by continuing.*privacy/i.test(text)) continue;
    if (/^delivered (weekly|daily|monthly)/i.test(text)) continue;
    if (/^\+?\s*sign up$/i.test(text) && text.length < 30) continue;
    var textLower = text.toLowerCase();
    if (/^(more from bloomberg|related stories|recommended|trending|you might)/.test(textLower)) break;
    // 过滤 Bloomberg AI 摘要区
    if (/takeaways.*bloomberg ai|bloomberg ai.*takeaways/i.test(text)) continue;
    if (/^(hide|show|takeaways)$/i.test(text)) continue;

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
      if (/^(more from bloomberg|related|recommended|trending|you might)/.test(t2Lower)) break;
      seen.add(text2);
      paragraphs.push({ type: 'text', level: 0, text: text2 });
    }
  }

  return paragraphs;
};
