# HeaderX

A lightweight browser extension for Chrome (and other Chromium-based browsers) that injects custom HTTP headers into web requests. Perfect for local development, testing APIs, and adding authentication tokens on the fly.

> Looking for Safari? Safari support lives in a separate project, since Safari extensions ship as a native macOS app and Safari's `declarativeNetRequest` only accepts standard header names.

## Features

- 🔘 **On/off toggle** — Flip the switch in the popup header to enable or disable injection instantly
- 📋 **JSON-based configuration** — Define your headers as JSON in a single textarea
- ☑️ **List view** — Switch to a key/value list where each header has its own on/off checkbox
- 🌐 **Applies everywhere** — While turned on, headers are injected into requests to all URLs
- 📁 **Profiles** — Save named header sets and switch between them
- 🔒 **Persistent storage** — Settings survive browser restarts
- 🚀 **Declarative Net Request API** — Uses native browser APIs (MV3 compliant)

## Installation

1. Clone or download this extension folder
2. Open Chrome and go to `chrome://extensions/`
3. Toggle **Developer mode** (top right corner)
4. Click **Load unpacked**
5. Select this folder
6. The extension icon will appear in your toolbar

## Usage

1. Click the **HeaderX** icon in your browser toolbar
2. Enter your headers as JSON in the textarea. Two formats are accepted:

   ```json
   [
     { "name": "X-Custom-Header", "value": "value" },
     { "name": "Authorization", "value": "Bearer token" }
   ]
   ```

   ```json
   {
     "X-Custom-Header": "value",
     "Authorization": "Bearer token"
   }
   ```

3. Click **Save & Apply**
4. Flip the **toggle** in the top-right corner to turn injection on or off

While the toggle is **on**, the saved headers are injected into every request. While **off**, nothing is injected — your JSON stays saved for next time.

### List View

Use the **JSON / List** switcher above the editor to change display modes:

- **JSON** — edit headers as raw JSON text
- **List** — see each header as a row with a checkbox to turn that individual header on or off; checkbox changes save and apply immediately

In the array JSON format, each entry may carry an optional `"enabled"` flag (defaults to `true` when omitted):

```json
[
  { "name": "X-Custom-Header", "value": "value" },
  { "name": "Authorization", "value": "Bearer token", "enabled": false }
]
```

A header stays saved while unchecked — it just isn't injected until you check it again.

### Profiles

Save the current JSON as a named set and reuse it later:

- **Save** — type a profile name and click **Save Profile** (selecting an existing profile and clicking Save Profile overwrites it)
- **Load** — pick a profile from the dropdown, click **Load**, then **Save & Apply** to activate
- **Delete** — pick a profile and click **Delete**

## File Structure

```
headerx/
├── manifest.json      # Extension configuration (MV3)
├── background.js      # Service worker that applies rules
├── popup.html         # Popup UI
├── popup.js           # Popup UI logic
├── icons/             # Extension icons
└── README.md          # This file
```

## How It Works

1. The popup parses your JSON and sends it to the background service worker
2. The service worker stores it in `chrome.storage.local` and uses Chrome's **declarativeNetRequest API** to register a header-injection rule
3. The toggle simply adds or removes the rule — headers and profiles stay saved either way
4. Rules are restored on browser startup

### Message Format (popup → background)

```javascript
{
  action: "updateRules",
  headers: [
    { name: "Authorization", value: "Bearer token" },
    { name: "X-Custom-Header", value: "custom-value" }
  ],
  enabled: true
}
```

## Limitations

- Headers apply to **all URLs** while enabled — be careful with sensitive headers like `Authorization`, since they'll be sent to every site you visit
- Headers are applied to main frames, subframes, XHR, and ping requests

## Troubleshooting

**Headers not being applied:**
- Check that the toggle in the top-right corner is turned **on**
- Make sure you clicked **Save & Apply** after editing the JSON
- Verify the extension is enabled in your browser settings

**Invalid JSON errors:**
- The textarea must contain a JSON array of `{"name": ..., "value": ...}` objects or a plain `{"Header": "value"}` map
- Each header needs a non-empty name and a value

## Development

To modify the extension:

1. Edit `popup.html`, `popup.js`, or `background.js`
2. Reload the extension from `chrome://extensions/`

## License

MIT — Free to use and modify.
