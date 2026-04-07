# NewsForge

NewsForge is a Chrome extension for clean article reading, inline translation, and quick export on major news sites.

[<img src="https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png" alt="Available in the Chrome Web Store" height="58">](https://chromewebstore.google.com/detail/newsforge-news-reader-tra/pcckppfeljmlhdpiflkokahokeccecjb)

## What It Does

- Opens a distraction-free reader view on supported news sites
- Translates article content with free or API-based translation providers
- Supports screenshots and PDF export from reader mode
- Keeps settings, reading history, and encrypted backups locally in the browser

## Supported Sites

- Bloomberg
- The Wall Street Journal
- The New York Times
- Financial Times
- The Economist
- South China Morning Post
- SCMP Plus / DAILY PULSE

## Highlights

- Clean reader mode with article-first layout
- `NewsForge` and `Classic` reader styles
- Progressive translation rendering inside the reader
- Screenshot export for translated or original content with `JPEG`, `PNG`, and `WebP` options
- PDF export with better long-article pagination
- Local reading history
- Encrypted settings backup and restore
- Built-in settings diagnostics and test translation

## Translation Providers

### Free, no API key required

- Google Translate
- Microsoft Translator

### API providers

| Provider | API Type | Default Model / Mode |
| --- | --- | --- |
| OpenAI | OpenAI-compatible | `gpt-4o-mini` |
| DeepSeek | OpenAI-compatible | `deepseek-chat` |
| Qwen | OpenAI-compatible | `qwen-mt-turbo` |
| Gemini | OpenAI-compatible | `gemini-3.1-flash-lite-preview` |
| GLM | OpenAI-compatible | `glm-4-flash` |
| Kimi | OpenAI-compatible | `moonshot-v1-32k` |
| OpenRouter | OpenAI-compatible | `gpt-oss-120b:free` |
| Claude | Anthropic Messages API | `claude-haiku-4-5` |
| DeepL | DeepL API | `Free API` by default |
| Custom (OpenAI) | OpenAI-compatible | user-defined |
| Custom (Claude) | Anthropic Messages API | user-defined |

## Settings Experience

The settings page is organized around the current workflow:

- `Quick Setup`
  Select provider and target language
- `Engine Config`
  Only show the fields required for the current provider
- `Status & Diagnostics`
  Review the active config and run a test translation
- `Reading Style`
  Choose `NewsForge` or `Classic` reader styling
- `Export Settings`
  Choose screenshot format and export quality
- `Data & Maintenance`
  Clear local reading history and manage encrypted backups

Additional behavior:

- Preset model dropdown plus optional custom model input
- `DeepL Free / Pro` switch without manually typing the endpoint
- `Advanced Settings` for endpoint overrides
- `JPEG` is the default screenshot format for broad app compatibility
- `Balanced` is the default export quality
- `PNG` export hides the quality selector because PNG is lossless
- More readable translation error messages

## Install

### Chrome Web Store

Install from the Chrome Web Store:

- [NewsForge on Chrome Web Store](https://chromewebstore.google.com/detail/newsforge-news-reader-tra/pcckppfeljmlhdpiflkokahokeccecjb)

### Manual install

1. Download the latest `newsforge-v26.4.10.zip` from the GitHub release page.
2. Unzip the package.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the unzipped `newsforge-v26.4.10` folder.

## Development

Project layout:

```text
src/
├── manifest.json
├── background.js
├── providers.js
├── content.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── adapters/
│   ├── base.js
│   ├── bloomberg.js
│   ├── wsj.js
│   ├── nytimes.js
│   ├── ft.js
│   ├── economist.js
│   └── scmp.js
├── reader/
│   └── renderer.js
├── styles/
│   ├── content.css
│   └── reader.css
├── lib/
└── icons/
```

To work locally:

1. Make changes under `src/`.
2. Load the `src` folder as an unpacked extension during development.
3. For release packaging, zip the built extension folder as `newsforge-v26.4.10.zip`.

## Privacy

NewsForge does not send data to our own servers.

- Settings are stored locally with `chrome.storage.local`
- Reading history is stored locally
- Backup files are encrypted before export and do not include reading history by default
- Translation requests go directly from the browser to the selected provider

See the full policy in `PRIVACY.md`.

## License

MIT
