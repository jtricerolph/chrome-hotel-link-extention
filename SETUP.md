# Chrome Extension Setup for WordPress REST API

## Quick Start

1. **Install the Extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select this extension folder

2. **Configure Settings**
   - Right-click the extension icon → "Options"
   - Or go to `chrome://extensions/` and click "Details" → "Extension options"
   - Set your API endpoint and booking page URL
   - Click "Save Settings"

3. **Use the Extension**
   - Navigate to a NewBook booking page: `https://appeu.newbook.cloud/bookings_view/{id}`
   - Click the extension icon
   - View matched restaurant bookings

## Default Settings

The extension comes pre-configured with:

**API Endpoint:**
```
https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match
```

**Booking Page URL:**
```
https://n4admindev.pterois.co.uk/bookings
```

## How It Works

1. **Detection**: The extension detects when you're on a NewBook booking page
2. **API Call**: Sends POST request to WordPress REST API with:
   ```json
   {
     "booking_id": 12345,
     "context": "chrome-extension"
   }
   ```
3. **Display**: Shows the HTML response from the API in the popup

## API Response Format

The WordPress API returns HTML when `context: "chrome-extension"`:

```html
<div class="bma-result">
  <div class="bma-booking-summary">
    <h3>Booking Found</h3>
    <table class="bma-info-table">
      <tr><td><strong>Guest:</strong></td><td>John Smith</td></tr>
      <tr><td><strong>Room:</strong></td><td>105</td></tr>
    </table>
  </div>

  <div class="bma-nights">
    <h4>Nights & Restaurant Bookings</h4>
    <div class="bma-night matched">
      <div class="bma-night-date">Mon, 04/11/25</div>
      <div class="bma-night-status matched">
        ✓ Restaurant booking found
      </div>
      <a href="..." class="bma-action-link">View/Update Booking</a>
    </div>
  </div>
</div>
```

The HTML includes embedded CSS so it displays correctly in the extension popup.

## Changing Settings

### Via Options Page
1. Right-click extension icon → Options
2. Update URLs
3. Click Save

### For Production
Update the default settings in `options.js`:

```javascript
const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://your-live-site.com/wp-json/bma/v1/bookings/match',
  adminBaseUrl: 'https://your-live-site.com/bookings'
};
```

And in `background.js`:

```javascript
chrome.storage.local.set({
  settings: {
    apiEndpoint: 'https://your-live-site.com/wp-json/bma/v1/bookings/match',
    adminBaseUrl: 'https://your-live-site.com/bookings'
  }
});
```

## Troubleshooting

### Extension doesn't detect booking page
- Check you're on: `https://appeu.newbook.cloud/bookings_view/{id}`
- The extension icon should show a green checkmark badge

### API call fails
- Check browser console (F12) → Console tab
- Check Network tab to see the API request/response
- Verify your WordPress site is accessible
- Check CORS is properly configured (handled by reverse proxy)

### No data displayed
- The API might be returning JSON instead of HTML
- Check `context: "chrome-extension"` is being sent
- Check WordPress API response in Network tab

### Settings won't save
- Check browser console for errors
- Try resetting to defaults
- Reinstall the extension

## Files Updated for WordPress API

- ✅ `manifest.json` - Added options page, updated permissions
- ✅ `popup.js` - Changed to POST, added chrome-extension context
- ✅ `background.js` - Updated default API endpoint
- ✅ `options.html` - New settings page
- ✅ `options.js` - New settings logic

## Development

After making changes:
1. Go to `chrome://extensions/`
2. Click reload icon on the extension
3. Test on a NewBook booking page

## Next Steps

- [ ] Test with real NewBook booking IDs
- [ ] Verify HTML rendering in popup
- [ ] Test deep links to booking management page
- [ ] Add loading states and better error handling
- [ ] Package for distribution

## Support

For WordPress API issues, check:
- [booking-match-api/README.md](../booking-match-api/README.md)
- WordPress debug log: `wp-content/debug.log`
- Chrome console: F12 → Console
