# Chrome Hotel Link Extension - Development Guide

Complete technical documentation for development, debugging, and extending this Chrome extension.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Files](#key-files)
4. [Authentication Flow](#authentication-flow)
5. [How It Works](#how-it-works)
6. [API Integration](#api-integration)
7. [Common Development Tasks](#common-development-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Recent Changes](#recent-changes)

---

## Overview

**Purpose**: Chrome extension for Hotel Number Four that integrates NewBook PMS hotel bookings with Resos restaurant reservations.

**What it does**:
- Detects when a booking is viewed in NewBook PMS
- Automatically checks for matching restaurant bookings via WordPress REST API
- Shows alerts/warnings via toolbar badge (!, ?, ✓)
- Auto-opens popup for critical situations (missing package bookings)
- Injects action links directly into NewBook UI

**Key Technologies**:
- Chrome Extension Manifest V3
- WordPress REST API with Application Password authentication
- Material Design icons and styling

---

## Architecture

### Extension Components

```
chrome-hotel-link-extention/
├── manifest.json          # Extension configuration
├── background.js          # Service worker - handles API calls, badge updates
├── content.js            # Injected into NewBook pages - detects bookings, modifies UI
├── popup.js              # Popup window logic - displays booking data
├── popup.html            # Popup HTML structure
├── popup.css             # Popup styling
├── options.js            # Settings page logic
├── options.html          # Settings page UI
└── icon*.png            # Extension icons (16, 48, 128)
```

### WordPress Backend

The extension communicates with a WordPress plugin called **booking-match-api** running at:
- **Production**: `https://admin.hotelnumberfour.com`
- **Dev**: `https://n4admindev.pterois.co.uk`

**API Endpoint**: `/wp-json/bma/v1/bookings/match`

---

## Key Files

### background.js (Service Worker)

**Purpose**: Background process that runs continuously, handles all API communication and badge updates.

**Key Functions**:
- `checkBookingAndOpenPopup(bookingId, tabId)` - Main orchestration function
  - Calls API to check booking status
  - Updates badge based on response (!, ?, ✓)
  - Auto-opens popup for alerts
  - Caches results in chrome.storage.local

- `checkBookingPage(url, tabId)` - Detects booking_view URLs
  - Extracts booking ID from URL pattern: `/bookings_view/(\d+)`
  - Triggers booking check

**Badge Logic**:
```javascript
if (hasPackageAlert) {
  setBadgeText('!') + red background    // Missing restaurant booking
} else if (hasWarnings) {
  setBadgeText('?') + orange background  // Suggested matches need review
} else {
  setBadgeText('✓') + green background   // All matched
}
```

**Storage**:
- `currentBookingId` - Last viewed booking ID
- `cachedBookingHtml` - HTML response for popup display
- `cachedBookingData` - JSON data for logic
- `settings` - API endpoint, credentials, admin URL

### content.js (Content Script)

**Purpose**: Runs on all NewBook pages, detects booking dialogs, modifies page UI.

**Injection Pattern**: Runs on `https://appeu.newbook.cloud/*`

**Key Functions**:

1. **`detectAndHandleBookingPopup()`** - Monitors DOM for booking dialogs
   - Watches for `.ui-dialog` elements
   - Extracts booking ID from title: "Booking #12345"
   - Stores `currentBookingId` in chrome.storage
   - Injects restaurant info row into dialog
   - Sends message to background to check booking

2. **`getCurrentVisibleBookingId()`** - Returns currently visible booking
   - Searches for visible `.ui-dialog` elements
   - Parses booking ID from dialog title
   - Falls back to URL pattern match
   - Used when popup is manually opened

3. **`handleBookingDialog(dialogElement)`** - Processes detected dialog
   - Marks dialog as processed (`dataset.hotelExtensionProcessed`)
   - Waits 2.5 seconds before triggering popup (ensures dialog stays open)
   - Calls `chrome.runtime.sendMessage({ action: 'checkBookingFromDialog' })`

**Message Handlers**:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentBookingId') {
    // Return booking ID from currently visible dialog
    sendResponse({ bookingId: getCurrentVisibleBookingId() });
  }
});
```

### popup.js (Popup Window)

**Purpose**: Displays booking match results in extension popup.

**Key Functions**:

1. **`loadBookingData()`** - Main entry point when popup opens
   - **NEW**: Queries active tab for current booking ID before loading
   - Checks chrome.storage for cached data
   - Fetches fresh data if needed
   - Displays formatted HTML response

2. **Flow**:
```javascript
async loadBookingData() {
  // 1. Ask content script what booking is currently visible
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.tabs.sendMessage(tabs[0].id, {
    action: 'getCurrentBookingId'
  });

  // 2. Update storage if booking found
  if (response.bookingId) {
    await chrome.storage.local.set({ currentBookingId: response.bookingId });
  }

  // 3. Load from storage and display
  const result = await chrome.storage.local.get(['currentBookingId', ...]);
  // ... fetch and display
}
```

**Why This Matters**: Ensures popup always shows the currently visible booking, not stale cached data. Critical for workflow where user:
1. Opens booking preview
2. Switches tabs
3. Returns and manually opens popup

### manifest.json

**Key Configuration**:
```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "tabs",
    "activeTab"
  ],
  "host_permissions": [
    "https://appeu.newbook.cloud/*",
    "https://admin.hotelnumberfour.com/*",
    "https://n4admindev.pterois.co.uk/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://appeu.newbook.cloud/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

---

## Authentication Flow

### WordPress Application Passwords

The extension uses **WordPress Application Passwords** for secure REST API authentication.

**Setup** (in WordPress admin):
1. Users → Select user → Application Passwords section
2. Enter name (e.g., "Chrome Extension")
3. Click "Add New Application Password"
4. Copy generated password (format: `xxxx xxxx xxxx xxxx xxxx xxxx`)
5. Enter in extension settings (Settings → API Configuration)

**Credentials**:
- **Username**: `reception`
- **App Password**: `vbcF vMFd 2z9J eBa7 df51 YJXI`

**How It Works**:

1. Extension stores credentials in `chrome.storage.local`:
```javascript
{
  wpUsername: "reception",
  wpAppPassword: "vbcFvMFd2z9JeBa7df51YJXI" // spaces removed
}
```

2. On API request, creates Basic Auth header:
```javascript
const password = settings.wpAppPassword.replace(/\s+/g, ''); // Remove spaces
const credentials = btoa(`${username}:${password}`);
headers['Authorization'] = `Basic ${credentials}`;
```

3. WordPress receives:
```
Authorization: Basic cmVjZXB0aW9uOnZiY0Z2TUZkMno5SmVCYTdkZjUxWUpYSQ==
```

### Chrome Extension Origin Issue

**Problem**: WordPress's automatic Application Password authentication doesn't work for `chrome-extension://` origins.

**Symptoms**:
- `is_user_logged_in()` returns FALSE
- Authorization header is present and correct
- `PHP_AUTH_USER` and `PHP_AUTH_PW` are set
- But WordPress doesn't validate the Application Password

**Solution** (in WordPress plugin):
```php
// In class-bma-rest-controller.php permissions_check()
if (!is_user_logged_in() && isset($_SERVER['PHP_AUTH_USER']) && isset($_SERVER['PHP_AUTH_PW'])) {
    $username = $_SERVER['PHP_AUTH_USER'];
    $password = $_SERVER['PHP_AUTH_PW'];

    // Manually validate Application Password
    $user = wp_authenticate_application_password(null, $username, $password);

    if ($user instanceof WP_User) {
        wp_set_current_user($user->ID);
        return true; // Authentication successful
    }
}
```

This bypasses WordPress's automatic auth and manually validates Application Passwords for Chrome extension requests.

---

## How It Works

### Complete Flow: Opening a Booking Dialog

```
1. USER OPENS BOOKING IN NEWBOOK
   ↓
2. CONTENT.JS detects dialog
   - MutationObserver finds .ui-dialog element
   - Extracts booking ID from title: "Booking #12345"
   - Stores in chrome.storage.local: { currentBookingId: 12345 }
   ↓
3. CONTENT.JS waits 2.5 seconds
   - Ensures dialog stays open
   ↓
4. CONTENT.JS sends message to BACKGROUND.JS
   chrome.runtime.sendMessage({
     action: 'checkBookingFromDialog',
     bookingId: 12345
   })
   ↓
5. BACKGROUND.JS calls API
   POST /wp-json/bma/v1/bookings/match
   Body: { booking_id: 12345, context: "chrome-extension" }
   Headers: { Authorization: "Basic xxx" }
   ↓
6. WORDPRESS API processes request
   - Authenticates using Application Password
   - Searches NewBook for booking #12345
   - Matches with Resos restaurant bookings
   - Returns HTML + JSON data
   ↓
7. BACKGROUND.JS processes response
   - Caches HTML and JSON in chrome.storage
   - Analyzes for warnings/alerts:
     * hasPackageAlert: Package booking without restaurant reservation
     * hasWarnings: Suggested matches that need review
   - Updates toolbar badge: !, ?, or ✓
   ↓
8. BACKGROUND.JS auto-opens popup (if alerts/warnings)
   chrome.action.openPopup()
   ↓
9. POPUP.JS loads and displays
   - Reads cachedBookingHtml from storage
   - Injects into popup
   - User sees match results, action links
```

### Scenario: Manual Popup Open After Tab Switch

```
1. USER OPENS BOOKING → auto-opens popup → ✓
2. USER SWITCHES TABS → popup closes (Chrome behavior)
3. USER RETURNS TO TAB (booking dialog still visible)
4. USER CLICKS EXTENSION ICON
   ↓
5. POPUP.JS loadBookingData() executes
   ↓
6. POPUP.JS queries active tab
   chrome.tabs.sendMessage(tabId, { action: 'getCurrentBookingId' })
   ↓
7. CONTENT.JS responds with current booking
   getCurrentVisibleBookingId() → searches for visible .ui-dialog
   → Returns booking ID from dialog title
   ↓
8. POPUP.JS updates storage
   chrome.storage.local.set({ currentBookingId: 12345 })
   ↓
9. POPUP.JS loads and displays correct booking data
```

**Why This Matters**: Without step 6-8, popup would show old cached booking instead of current visible booking.

---

## API Integration

### WordPress REST API Endpoint

**URL**: `https://admin.hotelnumberfour.com/wp-json/bma/v1/bookings/match`

**Method**: POST

**Headers**:
```
Content-Type: application/json
Authorization: Basic cmVjZXB0aW9uOnZiY0Z2TUZkMno5SmVCYTdkZjUxWUpYSQ==
```

**Request Body**:
```json
{
  "booking_id": 12345,
  "context": "chrome-extension"
}
```

**Other Search Options** (instead of booking_id):
```json
{
  "email_address": "guest@example.com",
  "phone_number": "+441234567890",
  "guest_name": "John Smith",
  "context": "chrome-extension"
}
```

### Response Format

**Success (200 OK)**:
```json
{
  "success": true,
  "context": "chrome-extension",
  "html": "<div class='bma-result'>...</div>",
  "bookings_found": 1,
  "search_method": "booking_id",
  "should_auto_open": true,
  "has_package_alert": false,
  "has_warnings": true,
  "nights": [
    {
      "date": "2025-11-06",
      "matched": true,
      "match_type": "primary",
      "resos_id": "abc123",
      "warnings": []
    }
  ]
}
```

**Error (401 Unauthorized)**:
```json
{
  "code": "rest_forbidden",
  "message": "Authentication required. Please provide valid WordPress credentials.",
  "data": { "status": 401 }
}
```

**Error (404 Not Found)**:
```json
{
  "code": "booking_not_found",
  "message": "Booking not found",
  "data": { "status": 404 }
}
```

### CORS Configuration

**Required for Chrome Extension** (in WordPress .htaccess):
```apache
# CORS Headers for Booking Match API
<IfModule mod_headers.c>
    SetEnvIf Request_URI "^/wp-json/bma/" CORS=true
    Header always set Access-Control-Allow-Origin "*" env=CORS
    Header always set Access-Control-Allow-Methods "POST, GET, OPTIONS" env=CORS
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization" env=CORS
    Header always set Access-Control-Allow-Credentials "true" env=CORS
</IfModule>
```

Without CORS headers, Chrome extension requests will fail even with correct authentication.

---

## Common Development Tasks

### 1. Testing Changes Locally

```bash
# 1. Make code changes in /home/jtr/Documents/chrome-hotel-link-extention/

# 2. Load unpacked extension in Chrome
chrome://extensions
→ Enable "Developer mode"
→ Click "Load unpacked"
→ Select /home/jtr/Documents/chrome-hotel-link-extention/

# 3. After changes, reload extension
chrome://extensions → Click reload icon on extension card

# 4. Test on NewBook page
https://appeu.newbook.cloud/
```

### 2. Debugging

**View Extension Logs**:
```
1. chrome://extensions → Extension details → Inspect views: "service worker"
   → Opens DevTools for background.js console logs

2. Right-click extension popup → Inspect
   → Opens DevTools for popup.js console logs

3. On NewBook page → F12 → Console
   → Shows content.js console logs
```

**Check Storage**:
```javascript
// In any extension context (background, popup, content):
chrome.storage.local.get(null, (items) => {
  console.log('All storage:', items);
});
```

**Common Log Prefixes**:
- `[Background]` - background.js logs
- `[Hotel Extension]` - content.js logs
- `Popup -` - popup.js logs
- `BMA-AUTH:` - WordPress API authentication logs (in wp-content/debug.log)

### 3. Updating API Endpoint/Credentials

**Option A: Extension Settings Page**
```
1. Click extension icon → ⚙ Settings
2. Update API Configuration:
   - API Endpoint URL
   - Admin Base URL
   - WordPress Username
   - Application Password
3. Click Save
```

**Option B: Directly in Code** (for development)
```javascript
// In popup.js or background.js
const apiEndpoint = settings.apiEndpoint ||
  'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';
```

### 4. Changing Badge Indicators

**File**: `background.js`

**Current Badges**:
```javascript
// Line ~128-136
if (hasPackageAlert) {
  chrome.action.setBadgeText({ text: '!', tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tabId });
} else if (hasWarnings) {
  chrome.action.setBadgeText({ text: '?', tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tabId });
} else {
  chrome.action.setBadgeText({ text: '✓', tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId });
}
```

**To Change**:
- Text: Single character or emoji
- Color: Hex color code

### 5. Modifying Icons

**Source**: `icon.svg` (master SVG file)

**Regenerate PNGs**:
```bash
cd /home/jtr/Documents/chrome-hotel-link-extention/
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

**Current Icon**: Fork + knife on dark blue-grey (#2c3e50) rounded square

### 6. Git Workflow

```bash
cd /home/jtr/Documents/chrome-hotel-link-extention/

# Check current branch
git branch

# Stage changes
git add file1.js file2.html

# Commit
git commit -m "Description of changes"

# Push to GitHub
git push
```

**Current Branch**: `claude/popup-detection-fix-011CUoPaWtD29uB12Z1WB1hf`

**Remote**: `https://github.com/jtricerolph/chrome-hotel-link-extention.git`

---

## Troubleshooting

### Extension Popup Shows "401 Error"

**Symptoms**: API Error: 401 in popup

**Causes & Solutions**:

1. **Wrong credentials**
   - Settings → Check username/password
   - Password must have spaces removed: `vbcFvMFd2z9JeBa7df51YJXI`

2. **CORS not configured**
   - Check .htaccess on WordPress server has CORS headers
   - Test: `curl -I https://admin.hotelnumberfour.com/wp-json/bma/v1/bookings/match`
   - Should see: `access-control-allow-origin: *`

3. **WordPress plugin missing manual auth**
   - Check `class-bma-rest-controller.php` has manual `wp_authenticate_application_password()` call
   - See [Authentication Flow](#authentication-flow) section

### Popup Shows Old/Wrong Booking

**Symptoms**: Manually opening popup shows previous booking instead of current

**Cause**: Popup not re-detecting current booking from active tab

**Solution**: Ensure `popup.js` queries content script for current booking:
```javascript
// At start of loadBookingData()
const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
const response = await chrome.tabs.sendMessage(tabs[0].id, {
  action: 'getCurrentBookingId'
});
```

And `content.js` has handler:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentBookingId') {
    sendResponse({ bookingId: getCurrentVisibleBookingId() });
  }
});
```

### Badge Not Updating

**Symptoms**: Toolbar icon doesn't show badge, or shows wrong status

**Debugging**:
```javascript
// In background.js console:
chrome.action.getBadgeText({ tabId: TAB_ID }, (text) => {
  console.log('Current badge:', text);
});
```

**Common Causes**:
1. API request failed → Check Network tab
2. `hasPackageAlert` / `hasWarnings` logic incorrect → Check API response
3. TabId is undefined → Ensure `tabId` parameter passed to badge functions

### Content Script Not Running

**Symptoms**: Extension doesn't detect bookings on NewBook

**Checks**:
1. **URL match**: Ensure on `https://appeu.newbook.cloud/*`
2. **Extension reloaded**: After code changes, reload in chrome://extensions
3. **Console logs**: Open DevTools on page, filter for `[Hotel Extension]`
4. **Permissions**: Check manifest.json includes NewBook domain

**Debug**:
```javascript
// Add to top of content.js to verify it's running:
console.log('[Hotel Extension] Content script loaded!', window.location.href);
```

### API Request Timeout

**Symptoms**: Popup shows "Error loading booking data" after long wait

**Causes**:
1. WordPress server slow/down
2. NewBook API slow (API searches NewBook PMS)
3. Network issues

**Solutions**:
- Increase timeout in background.js/popup.js fetch calls
- Check WordPress server response time
- Test API directly: `curl -X POST https://admin.hotelnumberfour.com/wp-json/bma/v1/bookings/match ...`

---

## Recent Changes

### November 2025 - Chrome Extension Authentication & UI Improvements

**Issue**: Extension popup showing 401 authentication errors when accessing WordPress API

**Root Cause**: WordPress's automatic Application Password authentication doesn't trigger for `chrome-extension://` origins. Even though Authorization header was present and correctly formatted, `is_user_logged_in()` returned FALSE.

**Solution**:
- Added manual Application Password validation in WordPress plugin `class-bma-rest-controller.php`
- When not logged in via cookie but Basic Auth credentials present:
  - Manually call `wp_authenticate_application_password()`
  - Set current user if successful
  - Check capabilities before allowing access

**Files Changed**:
- `wp-content/plugins/booking-match-api/includes/class-bma-rest-controller.php`
- Lines 102-131: Manual authentication block

**Commit**: "Fix Application Password authentication for Chrome extension requests"

---

### November 2025 - Popup Detection Fix

**Issue**: When user manually opens popup after tab switch, it showed old cached booking instead of currently visible booking

**Scenario**:
1. Open booking preview → popup auto-opens ✓
2. Switch tabs → popup closes (normal)
3. Return to tab with preview still open
4. Manually click extension icon → showed wrong booking ✗

**Solution**:
- `popup.js`: Query active tab for current booking ID when popup opens
- `content.js`: Add `getCurrentBookingId` message handler
- `content.js`: Add `getCurrentVisibleBookingId()` function to search for visible dialogs

**Flow**:
```
popup opens
→ asks content script "what booking is visible?"
→ content script searches DOM for .ui-dialog
→ returns booking ID from dialog title
→ popup updates storage and displays correct booking
```

**Files Changed**:
- `popup.js`: Lines 34-50 (getCurrentBookingId query)
- `content.js`: Lines 17-20 (message handler), 51-84 (getCurrentVisibleBookingId function)

**Commits**:
- "Fix popup to detect current booking when manually opened"
- "Add getCurrentBookingId message handler to content script"

---

### November 2025 - Badge & Icon Improvements

**Badge Symbols Updated**:
- Package Alert: 🍽️ → **!** (cleaner, professional)
- Warnings: ⚠ → **?** (suggests "needs review")
- Success: **✓** (unchanged)
- Error: **?** (unchanged)

**Extension Icons**:
- Replaced placeholder icons with custom restaurant icon
- Fork + knife design on dark blue-grey (#2c3e50) rounded square
- Multiple iterations to improve visibility:
  1. Material UI flatware (rendering issues)
  2. Custom SVG fork/knife/spoon (too small)
  3. Enlarged fork/knife only (final - good visibility)

**Files Changed**:
- `background.js`: Badge text updates
- `icon.svg`, `icon16.png`, `icon48.png`, `icon128.png`

**Commits**:
- "Improve badge icons with cleaner symbols"
- "Change warning badge to question mark"
- "Update extension icons to Material UI flatware symbol"
- "Fix flatware icon rendering in PNG files"
- "Change icon background from circle to rounded square"
- "Replace Material UI icon with custom flatware symbol"
- "Enlarge restaurant icon to fill square better"

---

## Development Environment

**Extension Location**: `/home/jtr/Documents/chrome-hotel-link-extention/`

**WordPress Dev Site**: `/var/www/html/wp-content/plugins/booking-match-api/`

**WordPress Production**: `https://admin.hotelnumberfour.com/`

**Tools Required**:
- Chrome browser (for testing)
- ImageMagick (for icon generation): `apt-get install imagemagick`
- Git (for version control)
- Text editor / VS Code

**Testing NewBook Access**: `https://appeu.newbook.cloud/`

---

## Support & References

**WordPress Plugin Docs**: See `/var/www/html/wp-content/plugins/booking-match-api/README.md`

**Chrome Extension Docs**:
- Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- chrome.storage API: https://developer.chrome.com/docs/extensions/reference/storage/
- Content Scripts: https://developer.chrome.com/docs/extensions/mv3/content_scripts/

**WordPress REST API**:
- Application Passwords: https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/
- Authentication: https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/

**Material Design Icons**: https://fonts.google.com/icons (for future icon updates)

---

## Future Improvements

**Potential Enhancements**:

1. **Caching Strategy**
   - Add cache expiration (currently caches forever)
   - Clear cache on booking dialog close
   - Refresh button in popup

2. **Error Handling**
   - Retry logic for failed API requests
   - Better error messages (network vs auth vs not found)
   - Offline mode with cached data

3. **Performance**
   - Debounce dialog detection
   - Lazy load popup HTML
   - Reduce API payload size

4. **Features**
   - Keyboard shortcuts
   - Badge click action (open popup vs open booking)
   - Export booking data
   - Multi-language support

5. **Testing**
   - Automated tests for background.js logic
   - Mock API responses
   - E2E tests with Puppeteer

---

*Last Updated: November 2025*
*Contributors: Claude (AI Assistant), JTR (Hotel Number Four)*
