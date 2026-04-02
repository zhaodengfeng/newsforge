# Privacy Policy for NewsForge

**Last updated: April 2, 2026**

## Overview

NewsForge is a Chrome extension for reader mode, article translation, and screenshot / PDF export on supported news sites.

Your privacy matters to us. NewsForge does not operate its own backend service, does not run analytics, and does not track users across the web.

## What We Collect

**We do not collect, store, or transmit personal data to our own servers.**

NewsForge does not collect:

- Your name, email address, or contact information
- Payment information
- Cookies for analytics or advertising
- Browsing activity for our own tracking purposes
- Your translation API keys on our servers

## What Is Stored Locally On Your Device

NewsForge uses Chrome's local extension storage (`chrome.storage.local`) to save settings on your device.

This can include:

- Selected translation provider
- Target language preference
- Provider-specific API settings such as API key, model, endpoint, or DeepL Free / Pro selection
- Reading history used by the extension's local history feature

This local data stays on your device unless you explicitly use a third-party translation provider.

## When Data Is Sent To Third Parties

NewsForge supports both free and API-based translation providers.

When you use translation features, article text or test text may be sent directly from your browser to the provider you selected.

Examples include:

- Google Translate
- Microsoft Translator
- OpenAI
- DeepSeek
- Qwen
- Gemini
- GLM
- Kimi
- OpenRouter
- Claude
- DeepL
- Custom OpenAI-compatible endpoints
- Custom Claude-compatible endpoints

We do not proxy, inspect, store, or relay these requests through our own servers.

## Reader Mode And Article Extraction

To provide reader mode, NewsForge reads content from supported article pages in your browser tab. This processing happens locally inside the extension.

Supported site permissions currently cover:

- Bloomberg
- The Wall Street Journal
- The New York Times
- Financial Times
- The Economist
- South China Morning Post, including SCMP Plus / DAILY PULSE pages

## Test Translation

The settings page includes a `Test Translation` feature.

When you click that button:

- the sample text you entered is sent directly to the currently selected translation provider
- the test uses the on-screen provider settings, even if you have not saved them yet
- we do not store that test text on our servers

## Permissions Explained

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save settings and reading history locally on your device |
| `activeTab` | Interact with the current page when you open reader mode |
| `contextMenus` | Add right-click menu actions such as opening reader mode |
| `scripting` | Re-inject extension logic when needed on supported pages |
| Host permissions for supported news sites | Let the extension read article content and render reader mode on supported domains |
| `api.deepl.com` / `api-free.deepl.com` host permissions | Allow direct requests to the selected DeepL API endpoint |

## Data Sharing

We do not sell, rent, or share user data with third parties for marketing or analytics.

The only external data transfer happens when you choose to use a third-party translation service, in which case text is sent directly to that provider under their own terms and privacy policy.

## Security Notes

- API keys are stored locally in the browser extension storage on your device
- We recommend using only providers and endpoints you trust
- If you use a custom endpoint, you are responsible for understanding where your data is sent

## Children's Privacy

NewsForge is not intended for children under 13, and we do not knowingly collect personal data from children.

## Changes To This Policy

We may update this policy as the extension changes. When we do, we will update the date at the top of this page.

## Contact

If you have questions about this privacy policy, please open an issue on GitHub:

[https://github.com/zhaodengfeng/newsforge/issues](https://github.com/zhaodengfeng/newsforge/issues)
