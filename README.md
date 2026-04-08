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
- The New Yorker

## Highlights

- Clean reader mode with article-first layout
- `NewsForge` and `Classic` reader styles
- Progressive translation rendering inside the reader
- Local translation cache to avoid re-translating the same article with the same provider/model settings
- Screenshot export for translated or original content with `JPEG` and `PNG` options
- Optional multi-image export fallback for very long articles that fail as a single image
- PDF export with long-article pagination, image inlining, and safer page breaks
- Export filenames use the article title when possible, with invalid filename characters removed
- Local reading history
- Encrypted settings backup and restore
- Task-focused settings tabs with provider config, reader export, and data maintenance separated
- Built-in test translation for the active on-screen provider settings
- Cleaner SCMP, Bloomberg, and The New Yorker article extraction for inline modules, embedded media UI text, and long-form article chunks
- LLM translation batching tuned for faster first results and better name consistency

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

The settings page is organized into three task-focused tabs:

- `Translation`
  Select provider and target language, configure the current provider, and run a test translation in one place
- `Reader & Export`
  Choose `NewsForge` or `Classic` reader styling, screenshot format, export quality, and long-article image export behavior
- `Data`
  Manage encrypted backups and clear local reading history

Additional behavior:

- Preset model dropdown plus optional custom model input
- `DeepL Free / Pro` switch without manually typing the endpoint
- `Advanced Settings` for endpoint overrides
- Settings changes are explicit: click `Save Settings` after editing
- Backup import starts with file selection, then asks for the backup password
- Successful backup import updates the settings page in place without a full page reload
- `JPEG` is the default screenshot format for broad app compatibility
- `Balanced` is the default export quality
- `PNG` screenshots stay lossless while export quality still controls PDF compression
- Long articles try one full-size image by default, with optional multi-image export if that fails
- Screenshots and PDFs inline remote article images before export to reduce cross-origin blank-image failures
- Repeated export filenames in the same extension session get a five-digit suffix to avoid collisions
- More readable translation error messages

## Recent Updates

### v26.4.11b16

- Removed the accent rule above in-article section headings in reader view and exports
- Updated package/version naming for the `26.4.11b16` beta line

### v26.4.11b15

- Ensured PDF page canvases are released even if page encoding or PDF image insertion fails
- Updated package/version naming for the `26.4.11b15` beta line

### v26.4.11b14

- Ensured screenshot canvases are released even when long-image rendering or encoding fails
- Kept export quality visible for `PNG` so users can still tune PDF image compression
- Improved the multi-image export success message when only one image is produced
- Updated package/version naming for the `26.4.11b14` beta line

### v26.4.11b13

- Restored screenshot export to try one full-size image by default without pre-splitting long articles
- Replaced long-article SVG/mode selection with a default-off multi-image fallback switch
- When multi-image fallback is enabled, long screenshots export as multiple `JPEG` or `PNG` files using the selected format and quality
- Updated package/version naming for the `26.4.11b13` beta line

### v26.4.11b12

- Removed `WebP` screenshot export support and kept the export format choices to `JPEG` and `PNG`
- Raised the long-image canvas threshold with an additional pixel-area guard to reduce unnecessary multi-image splits
- Updated package/version naming for the `26.4.11b12` beta line

### v26.4.11b11

- Fixed SCMP headlines that embed status flags such as `Developing` inside the `h1`
- Updated package/version naming for the `26.4.11b11` beta line

### v26.4.11b10

- Added a Reader & Export setting for long-article image export: multiple readable images or one SVG file
- Optimized the SVG path by embedding JPEG slices and removing duplicate SVG image attributes
- Updated package/version naming for the `26.4.11b10` beta line

### v26.4.11b9

- Changed oversized screenshot export to readable multi-image output in the selected format instead of unreadable downsampled single images
- Uses the article title as export filenames after removing filename-invalid characters
- Adds a five-digit random suffix to repeated export filenames within the same extension session
- Updated package/version naming for the `26.4.11b9` beta line

### v26.4.11b8

- Long-article screenshot export now tries to keep the selected raster format such as `JPEG` by downsampling into one safe-size image
- Keeps the stitched SVG fallback only when the browser rejects an oversized raster canvas
- Improved PDF pagination by cutting at text line boundaries and before image blocks, with PDF-specific image height limits to reduce page-boundary clipping
- Updated package/version naming for the `26.4.11b8` beta line

### v26.4.11b7

- Inlined remote article images before screenshot/PDF export so cross-origin media can render in captured output
- Changed oversized long-article screenshot export to one stitched SVG image instead of many separate image files
- Reduced PDF export stalls by using a lower PDF render scale, asynchronous JPEG encoding, and per-page progress updates
- Updated package/version naming for the `26.4.11b7` beta line

### v26.4.11b6

- Added local translation caching keyed by article, target language, provider, effective model/endpoint, context, and source text
- Reuses cached paragraph translations across repeated reader opens to avoid wasting API tokens during debugging
- Updated package/version naming for the `26.4.11b6` beta line

### v26.4.11b5

- Reworked image and PDF export to render long articles in safe chunks instead of one oversized canvas
- Fixed PDF export black pages by flattening transparent canvas slices onto the reader background before JPEG encoding
- Updated package/version naming for the `26.4.11b5` beta line

### v26.4.11b4

- Fixed The New Yorker drop-cap paragraphs being mistaken for ad blocks because their `lead-...` class contained `ad-`
- Updated package/version naming for the `26.4.11b4` beta line

### v26.4.11b3

- Improved The New Yorker extraction to traverse the full article chunk stream instead of cutting at inline modules
- Restored inline New Yorker images while continuing to skip embedded video recommendations and cartoon UI chrome
- Avoided CORS-blocked rendering for New Yorker media images in reader mode
- Updated package/version naming for the `26.4.11b3` beta line

### v26.4.11b2

- Fixed The New Yorker reader extraction by preserving article paragraphs marked as paywall content
- Filtered embedded New Yorker cartoon and video modules from article body output
- Updated package/version naming for the `26.4.11b2` beta line

### v26.4.11b1

- Added beta support for The New Yorker article pages
- Updated package/version naming for the `26.4.11b1` beta line

### v26.4.10

- Improved SCMP extraction so inline topic prompts and video embeds are skipped without cutting off following article paragraphs
- Filtered hidden Bloomberg Video.js modal and caption-settings text from reader mode
- Reworked settings into `Translation`, `Reader & Export`, and `Data` tabs
- Removed the low-value `Status & Diagnostics` block while keeping test translation in the translation workflow
- Switched the settings active tab and primary action styling to the page accent color
- Improved backup import by selecting the file before password entry, updating the page without reload, and showing a success confirmation
- Tuned LLM translation chunking to show first results sooner while preserving full-article terminology hints

## Install

### Chrome Web Store

Install from the Chrome Web Store:

- [NewsForge on Chrome Web Store](https://chromewebstore.google.com/detail/newsforge-news-reader-tra/pcckppfeljmlhdpiflkokahokeccecjb)

### Manual install

1. Download the latest `newsforge-v26.4.11b16.zip` package.
2. Unzip the package.
3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the unzipped `newsforge-v26.4.11b16` folder.

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
│   ├── newyorker.js
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
3. For release packaging, zip the built extension folder as `newsforge-v26.4.11b16.zip`.

## Privacy

NewsForge does not send data to our own servers.

- Settings are stored locally with `chrome.storage.local`
- Reading history is stored locally
- Translation cache is stored locally and keyed by article, provider, target language, effective model/endpoint, context, and source text
- Backup files are encrypted before export and do not include reading history by default
- Translation requests go directly from the browser to the selected provider

See the full policy in `PRIVACY.md`.

## License

MIT
