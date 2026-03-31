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

NYTimesAdapter.prototype.getContentContainer = function() {
  const selectors = [
    '[name="articleBody"]',
    '[class*="article-body"]',
    'section[name="articleBody"]',
    'article section'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) return el;
  }
  return BaseAdapter.prototype.getContentContainer.call(this);
};

NYTimesAdapter.prototype.getParagraphs = function() {
  const container = this.getContentContainer();
  if (!container) return [];

  const paragraphs = [];
  const elements = container.querySelectorAll('p[class*="css-"], h2, p');

  elements.forEach(el => {
    const text = el.innerText?.trim();
    if (!text || text.length < 10) return;
    if (el.closest('footer, aside, [class*="related"]')) return;

    const tagName = el.tagName.toLowerCase();
    paragraphs.push({
      type: tagName.startsWith('h') ? 'heading' : 'text',
      level: tagName.startsWith('h') ? parseInt(tagName[1]) : 0,
      text
    });
  });

  return paragraphs;
};