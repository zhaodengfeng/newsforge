// Base Adapter - 所有站点适配器的基类
function BaseAdapter() {
  this.name = 'base';
  this.hostPatterns = [];
}

BaseAdapter.prototype.getURL = function() {
  if (this._pageURL) return this._pageURL;
  try { return window.location.href; } catch (e) {}
  try { return document.URL; } catch (e) {}
  return '';
};

BaseAdapter.prototype.matches = function(url) {
  return this.hostPatterns.some(pattern => url.includes(pattern));
};

BaseAdapter.prototype.isArticlePage = function() {
  return false;
};

BaseAdapter.prototype.getTitle = function() {
  const selectors = ['h1', '[class*="headline"]', '[class*="title"]'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 5) {
      return el.innerText.trim();
    }
  }
  return document.title;
};

BaseAdapter.prototype.getAuthor = function() {
  const selectors = [
    '[class*="author"]', '[class*="byline"]', '[rel="author"]',
    '[itemprop="author"]', '.writer', '.reporter'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.innerText.trim().replace(/^by\s+/i, '');
      if (text.length > 1 && text.length < 100) return text;
    }
  }
  return '';
};

BaseAdapter.prototype.getPublishDate = function() {
  const selectors = [
    'time', '[class*="date"]', '[class*="time"]',
    '[class*="publish"]', '[itemprop="datePublished"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const datetime = el.getAttribute('datetime') || el.getAttribute('content');
      if (datetime) return new Date(datetime).toLocaleDateString('zh-CN');
      const text = el.innerText.trim();
      if (text.length > 4 && text.length < 50) return text;
    }
  }
  return '';
};

BaseAdapter.prototype.getParagraphs = function() {
  const container = this.getContentContainer();
  if (!container) return [];

  const paragraphs = [];
  const seen = new Set();
  const elements = container.querySelectorAll('p, h2, h3, h4');

  elements.forEach(el => {
    const text = el.innerText?.trim();
    if (!text || text.length < 10) return;
    if (seen.has(text)) return;
    if (el.closest('pre, code, nav, header, footer, aside')) return;
    const parent = el.closest('[class*="ad"], [class*="sponsor"], [class*="recommend"], [class*="related"], [class*="newsletter"]');
    if (parent) return;

    seen.add(text);
    const tagName = el.tagName.toLowerCase();
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text
    });
  });

  // Fallback: 如果容器内没找到足够内容，全局扫描 p 标签
  if (paragraphs.length < 3) {
    paragraphs.length = 0;
    seen.clear();
    document.querySelectorAll('p').forEach(el => {
      const text = el.innerText?.trim();
      if (!text || text.length < 40) return;
      if (seen.has(text)) return;
      if (el.closest('nav, footer, aside')) return;
      seen.add(text);
      paragraphs.push({ type: 'text', level: 0, text });
    });
  }

  return paragraphs;
};

BaseAdapter.prototype.getContentContainer = function() {
  const candidates = [];
  const elements = document.querySelectorAll('article, main, [role="main"], [class*="article-body"], [class*="story-body"]');

  elements.forEach(el => {
    const score = this.calculateScore(el);
    if (score > 50) candidates.push({ element: el, score });
  });

  if (candidates.length === 0) {
    const divs = document.querySelectorAll('div, section');
    divs.forEach(el => {
      const score = this.calculateScore(el);
      if (score > 80) candidates.push({ element: el, score });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].element : document.body;
};

BaseAdapter.prototype.calculateScore = function(element) {
  const tagScores = { 'article': 100, 'main': 80, 'section': 60, 'div': 40 };
  let score = tagScores[element.tagName.toLowerCase()] || 20;

  const cls = (element.className + ' ' + element.id).toLowerCase();
  if (cls.includes('content')) score += 50;
  if (cls.includes('article')) score += 50;
  if (cls.includes('story')) score += 40;
  if (cls.includes('body')) score += 40;
  if (cls.includes('main')) score += 30;

  const text = element.innerText?.trim() || '';
  const links = element.querySelectorAll('a');
  const linkText = Array.from(links).reduce((sum, a) => sum + (a.innerText?.trim().length || 0), 0);
  const density = text.length > 0 ? (text.length - linkText) / text.length : 0;
  score *= (0.5 + 0.5 * density);

  score *= Math.min(text.length / 1000, 2);

  return score;
};

BaseAdapter.prototype.getFeaturedImage = function() {
  const selectors = [
    'article img', '[class*="hero"] img', '[class*="featured"] img',
    '[class*="lead"] img', 'figure img'
  ];
  for (const sel of selectors) {
    const img = document.querySelector(sel);
    if (img) {
      const src = img.src || img.getAttribute('data-src');
      if (src && !src.includes('avatar') && !src.includes('icon')) {
        return src;
      }
    }
  }
  return '';
};

