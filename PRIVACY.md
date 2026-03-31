# Privacy Policy for NewsForge

**Last updated: March 31, 2026**

## Overview

NewsForge is a Chrome browser extension that provides a clean reading mode, AI-powered translation, and screenshot/PDF export for news articles. Your privacy is important to us.

## Data Collection

**NewsForge does NOT collect, store, or transmit any personal data to us.** We have no servers, no analytics, and no tracking.

Specifically, we do NOT collect:
- Personal information (name, email, address)
- Browsing history
- Cookies or tracking identifiers
- Authentication credentials

## Data Stored Locally

The following data is stored **only on your device** using Chrome's built-in `chrome.storage.local` API:

- **Translation provider settings**: Your chosen translation engine, API key, model, and endpoint configuration
- **Target language preference**: Your preferred translation output language
- **Reading history**: Titles and URLs of articles you've read (stored locally for the history feature)

This data never leaves your device unless you explicitly configure a third-party translation API.

## Third-Party Services

NewsForge supports multiple translation providers. When you use a translation feature:

- **Free providers** (Google Translate, Microsoft Translator): Article text is sent to the respective public translation API
- **Paid/API providers** (OpenAI, DeepSeek, Claude, DeepL, etc.): Article text is sent directly from your browser to the API endpoint **you configure**. We do not intercept, log, or relay this traffic

**You are responsible for reviewing the privacy policy of any translation provider you configure.**

## Permissions Explained

| Permission | Why it's needed |
|-----------|----------------|
| `storage` | Save your settings and reading history locally |
| `activeTab` | Detect and interact with the current article page |
| `contextMenus` | Add right-click menu items for quick access |
| Host permissions (bloomberg.com, wsj.com, nytimes.com, ft.com, economist.com) | Extract article content and render the reading mode on supported news sites |

## Data Sharing

We do NOT sell, share, or transfer any user data to third parties.

## Children's Privacy

NewsForge is not directed at children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository:
https://github.com/zhaodengfeng/newsforge/issues
