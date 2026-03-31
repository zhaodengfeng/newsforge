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
  return /economist\.com\/\w+\/\d{4}\//.test(url) ||
         /economist\.com\/.+/.test(url) && document.querySelector('article');
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

EconomistAdapter.prototype.getContentContainer = function() {
  const selectors = [
    '[class*="article-body"]',
    '[class*="story-text"]',
    '.layout-article-body',
    'article'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};