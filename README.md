# Hotel Number Four - Booking Assistant Chrome Extension

Chrome extension that integrates NewBook hotel bookings with the Hotel Number Four admin system to cross-reference restaurant reservations.

## Features

- **Automatic Detection**: Detects when viewing a NewBook booking page
- **Restaurant Matching**: Queries admin system for matching restaurant bookings
- **Visual Display**: Shows matched bookings or provides quick link to admin
- **API-Driven UI**: Admin system controls the popup display via HTML/CSS injection
- **Context Menu** (Future): Right-click on booking chart elements to view details

## Installation

### For Development/Testing

1. **Clone or download this repository**

2. **Open Chrome and navigate to**: `chrome://extensions/`

3. **Enable "Developer mode"** (toggle in top right corner)

4. **Click "Load unpacked"**

5. **Select the extension directory** (folder containing manifest.json)

6. **The extension is now installed!** You should see the Hotel Number Four icon in your extensions

### Icon Setup

The extension requires icon files. You can:
- Use placeholder icons temporarily
- Create custom PNG icons (16x16, 48x48, 128x128 pixels)
- Or create simple colored squares for testing:
  - Save as `icon16.png`, `icon48.png`, `icon128.png`

## Usage

### Basic Usage

1. Navigate to a NewBook booking page: `https://appeu.newbook.cloud/bookings_view/{booking_id}`

2. Click the extension icon in your toolbar

3. The popup will:
   - Show matched restaurant bookings (if found)
   - Display a link to open the booking in admin system (if no matches)
   - Show any custom HTML/CSS returned by your API

### Context Menu (Future Feature)

On the booking chart page:
1. Right-click on a booking element
2. Select "View Restaurant Bookings" from the context menu
3. Opens the admin system for that booking

## Admin API Requirements

The extension calls your admin system API at:

```
https://admin.hotelnumberfour.com/api/check-booking?booking_id={id}
```

### Expected API Response

Your API should return JSON or HTML:

#### Option 1: JSON Response

```json
{
  "hasMatches": true,
  "html": "<div>Your custom HTML here...</div>"
}
```

or

```json
{
  "hasMatches": false,
  "matches": 0
}
```

#### Option 2: Direct HTML Response

Return HTML directly with `Content-Type: text/html`:

```html
<div class="match-card">
  <h3>Restaurant Booking Found</h3>
  <div class="match-info">
    <strong>Guest:</strong> John Smith
  </div>
  <div class="match-info">
    <strong>Table:</strong> 12
  </div>
  <div class="match-info">
    <strong>Time:</strong> 7:00 PM
  </div>
  <div class="match-info">
    <strong>Covers:</strong> 4
  </div>
  <a href="https://admin.hotelnumberfour.com/booking/{id}" class="btn-link" target="_blank">
    View in Admin →
  </a>
</div>
```

### API Error Handling

If the API returns an error:

```json
{
  "error": "Database connection failed"
}
```

The extension will display the error message to the user.

## CSS Classes for API HTML

When injecting HTML, you can use these CSS classes (defined in popup.css):

- `.match-card` - Card container for a match
- `.match-info` - Info row (label + value)
- `.btn-link` - Styled button link
- Standard HTML tags (h1, h2, h3, p, a) are pre-styled

Example structure:

```html
<div class="match-card">
  <h3>Match Title</h3>
  <div class="match-info">
    <strong>Label:</strong> Value
  </div>
  <a href="#" class="btn-link">Action Button</a>
</div>
```

## Configuration

Settings are stored in Chrome's local storage. Default values:

- **API Endpoint**: `https://admin.hotelnumberfour.com/api/check-booking`
- **Admin Base URL**: `https://admin.hotelnumberfour.com/booking`

To change these, you can modify `background.js` or add a settings page.

## URL Pattern Detection

The extension currently detects:

- `https://appeu.newbook.cloud/bookings_view/{booking_id}`

Additional patterns can be added in `background.js` by modifying the `BOOKING_URL_PATTERN` regex.

## Development

### File Structure

```
.
├── manifest.json          # Extension configuration
├── background.js          # Service worker (URL monitoring, context menu)
├── content.js            # Content script (page interaction)
├── popup.html            # Popup UI structure
├── popup.css             # Popup styling
├── popup.js              # Popup logic and API calls
├── icon16.png            # Extension icon (16x16)
├── icon48.png            # Extension icon (48x48)
├── icon128.png           # Extension icon (128x128)
└── README.md             # This file
```

### Key Components

**background.js**
- Monitors tab URLs for booking pages
- Extracts booking IDs from URLs
- Sets badge when on a booking page
- Creates context menu items

**popup.js**
- Fetches current booking ID from storage
- Calls admin API with booking ID
- Displays API response HTML
- Handles error states

**content.js**
- Runs on NewBook pages
- Finds booking_id attributes in DOM
- Enables right-click context features
- Adds visual highlighting to booking elements

## Troubleshooting

### Extension doesn't activate on booking pages

- Check that you're on the correct URL pattern
- Verify the URL contains `/bookings_view/{id}`
- Check browser console for errors (F12)

### API calls failing

- Verify admin.hotelnumberfour.com is accessible
- Check CORS headers on your API
- Look at Network tab in DevTools (F12)

### CORS Issues

Your API must include CORS headers:

```php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
```

### Popup shows "Not on a Booking Page"

- Refresh the NewBook page
- Click the extension icon again
- Check that URL matches the pattern

## Future Enhancements

- [ ] Settings page for API endpoint configuration
- [ ] Support for additional NewBook URL patterns
- [ ] Enhanced right-click menu with booking ID detection
- [ ] Caching of API responses
- [ ] Offline mode with last known data
- [ ] Direct integration with Resos system
- [ ] Notification badges for unmatched bookings

## Support

For issues or questions, contact the Hotel Number Four admin system team.

## License

Internal use only - Hotel Number Four
