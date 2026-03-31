# NewsForge

A Chrome extension for clean reading, AI-powered translation, and screenshot/PDF sharing on news sites.

[<img src="https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png" alt="Available in the Chrome Web Store" height="58">](https://chromewebstore.google.com/detail/newsforge-news-reader-tra/pcckppfeljmlhdpiflkokahokeccecjb)

## Supported Sites

- Bloomberg
- Wall Street Journal (WSJ)
- New York Times
- Financial Times (FT)
- The Economist

## Features

- **Reader Mode** — Distraction-free reading with warm editorial design
- **AI Translation** — 15+ translation providers, progressive rendering
  - Free: Google Translate, Microsoft Translator (no API key required)
  - API-based: OpenAI, DeepSeek, Claude, Qwen, Gemini, GLM, MiniMax, Kimi, Xiaomi, OpenRouter, DeepL, and custom endpoints
- **Screenshot Export** — Clean image export respecting translation mode
- **PDF Export** — Smart pagination with CJK support

## Translation Providers

| Provider | API Format | Default Model |
|----------|-----------|---------------|
| Google | Free (no key) | — |
| Microsoft | Free (no key) | — |
| OpenAI | OpenAI compatible | gpt-4o-mini |
| DeepSeek | OpenAI compatible | deepseek-chat |
| Qwen | OpenAI compatible | qwen-plus |
| Gemini | OpenAI compatible | gemini-2.5-flash |
| GLM | OpenAI compatible | glm-4-flash |
| MiniMax | OpenAI compatible | MiniMax-Text-01 |
| Kimi | OpenAI compatible | moonshot-v1-8k |
| Xiaomi | OpenAI compatible | MiMo-7B-RL |
| OpenRouter | OpenAI compatible | google/gemma-3-27b-it:free |
| Claude | Anthropic Messages API | claude-sonnet-4-20250514 |
| DeepL | DeepL API | — |
| Custom OpenAI | OpenAI compatible | user-defined |
| Custom Claude | Anthropic Messages API | user-defined |

## Project Structure

```
src/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker (translation routing, history)
├── content.js             # Content script entry (adapter selection, reader trigger)
├── popup.html/js          # Extension popup UI
├── options.html/js        # Settings page (provider config)
├── adapters/              # Site-specific adapters
│   ├── base.js
│   ├── bloomberg.js
│   ├── wsj.js
│   ├── nytimes.js
│   ├── ft.js
│   └── economist.js
├── reader/
│   ├── renderer.js        # Reader mode UI, screenshot, PDF export
│   └── translator.js      # Paragraph-level translation handler
├── lib/                   # Third-party libraries
├── styles/
│   ├── content.css        # Float icon, toast
│   └── reader.css         # Reader mode styles
└── icons/
```

## License

MIT
