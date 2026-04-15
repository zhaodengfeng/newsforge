copy(JSON.stringify({
  standfirst: document.querySelector('[class*="subhead"], [class*="standfirst"], [class*="kicker"], [data-testid*="standfirst"]')?.outerHTML?.substring(0, 500),
  h2Subhead: (() => {
    const h2s = document.querySelectorAll('h2');
    return Array.from(h2s).map(h => ({ text: h.innerText, parent: h.parentElement?.className, container: '' }));
  })(),
  articleInner: document.querySelector('article')?.innerHTML?.substring(0, 1000),
  containerSelector: (() => {
    const selectors = ['[class*="article-body"]', '[class*="story-text"]', '.layout-article-body', 'article', 'main'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 200) return sel + ' --> ' + el.className;
    }
    return 'NOT FOUND';
  })()
}, null, 2))
