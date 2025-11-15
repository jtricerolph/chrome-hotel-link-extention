# Hotel Number Four - Booking Assistant Chrome Extension
## Developer Reference

**Version:** 1.7.4
**Last Updated:** 2025-11-15
**Manifest Version:** 3

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Structure](#file-structure)
3. [Code Flow](#code-flow)
4. [Component Reference](#component-reference)
5. [API Integration](#api-integration)
6. [Storage & Settings](#storage--settings)
7. [Badge System](#badge-system)
8. [Event Handling](#event-handling)
9. [URL Detection & Monitoring](#url-detection--monitoring)
10. [Auto-Popup Logic](#auto-popup-logic)
11. [Tab Switching & Navigation](#tab-switching--navigation)
12. [Authentication](#authentication)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Extension Type
**Manifest V3 Chrome Extension** with sidepanel interface

### Core Components
- **Background Service Worker** (`background.js`) - URL monitoring, badge management
- **Content Script** (`content.js`) - NewBook page interaction, tooltip detection
- **Sidepanel** (`sidepanel.html/js/css`) - Main 3-tab UI interface
- **Options Page** (`options.html/js`) - Settings configuration
- **Popup** (`popup.html/js/css`) - Legacy popup (minimal use)

### Technology Stack
- **JavaScript**: Vanilla ES6+ (no frameworks)
- **CSS**: Custom styles with Material Symbols icons
- **API**: WordPress REST API (booking-match-api plugin)
- **Storage**: Chrome Storage API (local)
- **Auth**: WordPress Application Passwords (HTTP Basic Auth)

---

## File Structure

```
chrome-hotel-link-extention/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (URL monitoring, badges)
├── content.js                 # NewBook page interaction
├── sidepanel.html             # Main sidepanel UI template
├── sidepanel.js               # Sidepanel logic (23KB - main application)
├── sidepanel.css              # Sidepanel styles
├── options.html               # Settings page template
├── options.js                 # Settings page logic
├── popup.html                 # Legacy popup template
├── popup.js                   # Legacy popup logic
├── popup.css                  # Legacy popup styles
├── icon16.png                 # Extension icon (16x16)
├── icon48.png                 # Extension icon (48x48)
├── icon128.png                # Extension icon (128x128)
└── README.md                  # User documentation
```

---

## Code Flow

### 1. Extension Initialization Flow

```
Chrome Loads Extension
    ↓
background.js (Service Worker) starts
    ↓
Registers event listeners:
  - chrome.tabs.onUpdated
  - chrome.webNavigation.onHistoryStateUpdated
  - chrome.action.onClicked
    ↓
Monitors for NewBook URLs
    ↓
When detected: Updates badge, prepares sidepanel
```

### 2. NewBook Page Load Flow

```
User navigates to NewBook
    ↓
content.js injected (document_start)
    ↓
Sets up MutationObserver on document.body
    ↓
Watches for:
  - Easy tooltip dialogs (.easyTooltipContent)
  - Planner blocks (data-booking-id)
    ↓
When detected: Extracts booking ID
    ↓
Sends message to background.js
    ↓
background.js updates badge
    ↓
(Optional) Auto-opens sidepanel
```

### 3. Sidepanel Loading Flow

```
User clicks extension icon OR auto-popup triggers
    ↓
Chrome opens sidepanel
    ↓
sidepanel.html loads
    ↓
sidepanel.js executes
    ↓
Loads settings from chrome.storage.local
    ↓
Checks current NewBook tab state
    ↓
Loads initial tab (Summary by default)
    ↓
Sets up refresh countdown timer
    ↓
Watches for URL changes in active tab
```

### 4. Tab Switching Flow

```
User clicks tab button
    ↓
switchTab(tabId) function called
    ↓
Updates active tab UI state
    ↓
Clears refresh countdown
    ↓
Loads tab-specific content:
  - Summary: Calls fetchSummary()
  - Restaurant: Calls fetchBookingMatches(bookingId)
  - Checks: Calls fetchBookingChecks(bookingId)
    ↓
Makes API call to WordPress
    ↓
Injects returned HTML into content area
    ↓
Updates badge count
    ↓
(If issues found) Switches to problem tab
    ↓
Starts new refresh countdown
```

---

## Component Reference

### background.js

**Purpose:** Service worker for URL monitoring and badge management

#### Key Functions

**`updateBadge(tabId, text, color)`**
- **Parameters:**
  - `tabId` (number) - Chrome tab ID
  - `text` (string) - Badge text ('!', '?', '✓', or '')
  - `color` (string) - Badge color ('#dc3545', '#ffc107', '#28a745')
- **Description:** Updates extension icon badge
- **Usage:**
  ```javascript
  updateBadge(tabId, '!', '#dc3545'); // Red badge with exclamation
  updateBadge(tabId, '✓', '#28a745'); // Green checkmark
  ```

**`checkNewBookPage(tabId, url)`**
- **Parameters:**
  - `tabId` (number) - Chrome tab ID
  - `url` (string) - Current page URL
- **Description:** Checks if URL is NewBook and updates badge
- **URL Pattern:** `https://appeu.newbook.cloud/*`
- **Side Effects:**
  - Stores `newBookTabId` in global state
  - Clears badge if not NewBook page

**`chrome.tabs.onUpdated Listener`**
- **Triggered:** When tab URL changes or page loads
- **Flow:**
  1. Check if URL is NewBook domain
  2. If yes: Set badge to blank (waiting state)
  3. Update global `newBookTabId`

**`chrome.webNavigation.onHistoryStateUpdated Listener`**
- **Triggered:** When NewBook SPA navigation occurs (no page reload)
- **Flow:**
  1. Detect URL change within NewBook
  2. Update badge to waiting state
  3. Reset booking detection

**`chrome.action.onClicked Listener`**
- **Triggered:** When extension icon clicked
- **Flow:**
  1. Open sidepanel for clicked tab
  2. `chrome.sidePanel.open({ tabId })`

**`chrome.runtime.onMessage Listener`**
- **Messages Handled:**
  - `'bookingDetected'` - From content.js when booking ID found
  - `'updateBadge'` - Badge update request

**Message: bookingDetected**
```javascript
{
  action: 'bookingDetected',
  bookingId: 12345,
  source: 'tooltip' | 'planner' | 'url'
}
```
- **Response:** Updates badge, optionally auto-opens sidepanel

---

### content.js

**Purpose:** Interact with NewBook page, detect bookings, inject UI

#### Key Functions

**`extractBookingIdFromUrl()`**
- **Returns:** Booking ID (number) or null
- **Logic:** Parse URL for `id=` or `bookingId=` parameter
- **URL Examples:**
  - `...?id=12345` → 12345
  - `...?bookingId=67890` → 67890

**`setupGlobalObserver()`**
- **Description:** Sets up MutationObserver on document.body
- **Watches For:**
  - Tooltip dialogs (`.easyTooltipContent`)
  - Planner blocks (`[data-booking-id]`)
- **Debounced:** 150ms delay to prevent rapid fire
- **Single Observer:** Prevents duplicate observers

**`handleTooltipDetected(element)`**
- **Parameters:** `element` (HTMLElement) - Tooltip dialog
- **Description:** Extracts booking ID from tooltip content
- **Detection Method:**
  1. Look for "Booking ID:" or "ID:" text
  2. Extract number following label
  3. Send to background.js

**`handlePlannerBlockClick(element)`**
- **Parameters:** `element` (HTMLElement) - Planner block
- **Description:** Extracts booking ID from data attribute
- **Attribute:** `data-booking-id="12345"`
- **Trigger:** Click detection (single click only)
- **Debounce:** 150ms to prevent double-clicks

**Message Sending Pattern:**
```javascript
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: bookingId,
  source: 'tooltip' | 'planner' | 'url'
});
```

#### Detection Priority
1. **Planner Click** - Immediate (150ms debounce)
2. **Tooltip Open** - Immediate (150ms debounce)
3. **URL Parameter** - On page load/navigation

---

### sidepanel.js

**Purpose:** Main application logic for 3-tab sidepanel interface

**Size:** ~24KB - Largest file in extension

#### Global State

**`STATE` Object:**
```javascript
const STATE = {
  currentBookingId: null,           // Active booking ID
  currentTab: 'summary',            // Active tab
  refreshCountdown: 0,              // Seconds until auto-refresh
  refreshInterval: null,            // setInterval reference
  settings: {                       // Loaded from storage
    apiEndpoint: '',
    adminBaseUrl: '',
    wpUsername: '',
    wpAppPassword: '',
    enableAutoPopup: true,
    autoPopupDelay: 2500,
    summaryRefreshRate: 60
  },
  navigationContext: null           // Tab navigation state
};
```

#### Key Functions

**`loadSettings()` → Promise<void>**
- **Description:** Loads settings from chrome.storage.local
- **Keys Loaded:**
  - `apiEndpoint` - WordPress REST API base URL
  - `adminBaseUrl` - WordPress admin URL
  - `wpUsername` - WordPress username
  - `wpAppPassword` - Application password
  - `enableAutoPopup` - Auto-open setting
  - `autoPopupDelay` - Delay before auto-open (ms)
  - `summaryRefreshRate` - Refresh interval (seconds)
- **Default Values:** Applied if settings not found
- **Side Effects:** Updates `STATE.settings`

**`init()` → Promise<void>**
- **Description:** Initialize sidepanel on load
- **Flow:**
  1. Load settings
  2. Check current tab state
  3. Extract booking ID if available
  4. Load default tab (Summary)
  5. Start refresh countdown
  6. Set up tab change listener

**`switchTab(tabId)` → void**
- **Parameters:** `tabId` ('summary' | 'restaurant' | 'checks')
- **Description:** Switch between tabs
- **Flow:**
  1. Update active tab button styling
  2. Clear current countdown
  3. Load tab content
  4. Start new countdown (if Summary tab)
  5. Update `STATE.currentTab`

**`fetchSummary()` → Promise<void>**
- **Description:** Load Summary tab content
- **API Call:**
  ```javascript
  GET ${apiEndpoint}/summary?context=chrome-summary
  ```
- **Response Handling:**
  - Inject `html_placed` into placed bookings section
  - Inject `html_cancelled` into cancelled bookings section
  - Update badge with `critical_count + warning_count`
  - Switch to Restaurant tab if issues found
- **Auto-Refresh:** Every 60 seconds (configurable)

**`fetchBookingMatches(bookingId)` → Promise<void>**
- **Parameters:** `bookingId` (number) - NewBook booking ID
- **Description:** Load Restaurant tab content
- **API Call:**
  ```javascript
  POST ${apiEndpoint}/bookings/match
  Body: {
    booking_id: bookingId,
    context: 'chrome-sidepanel'
  }
  ```
- **Response Handling:**
  - Inject HTML into content area
  - Update badge count
  - Identify issues (package without restaurant)
- **No Booking:** Shows search interface

**`fetchBookingChecks(bookingId)` → Promise<void>**
- **Parameters:** `bookingId` (number) - NewBook booking ID
- **Description:** Load Checks tab content
- **API Call:**
  ```javascript
  GET ${apiEndpoint}/checks/${bookingId}?context=chrome-checks
  ```
- **Response Handling:**
  - Inject HTML into content area
  - Update badge count

**`startRefreshCountdown(seconds)` → void**
- **Parameters:** `seconds` (number) - Countdown duration
- **Description:** Start countdown timer with UI update
- **Display:** "Next refresh in: 59s"
- **Auto-Refresh:** Calls tab refresh when reaches 0
- **Cancellable:** Cleared on tab switch or manual refresh

**`manualRefresh()` → void**
- **Description:** Manually refresh current tab
- **Flow:**
  1. Clear countdown
  2. Reload current tab content
  3. Restart countdown

**`navigateToRestaurantDate(bookingId, date, autoAction)` → void**
- **Parameters:**
  - `bookingId` (number) - Booking to load
  - `date` (string, optional) - Date to navigate to
  - `autoAction` (string, optional) - 'create' or 'expand'
- **Description:** Navigate to Restaurant tab with context
- **Flow:**
  1. Set navigation context in STATE
  2. Switch to Restaurant tab
  3. Process navigation context (scroll, expand form, etc.)
  4. Clear context when done

**`processNavigationContext()` → void**
- **Description:** Handle navigation context after tab loads
- **Actions:**
  - Scroll to specific date
  - Auto-expand create booking form
  - Highlight specific match
- **Timeout:** Waits for content to render before acting

#### Auto-Popup Logic

**`checkCurrentTabState()` → Promise<void>**
- **Description:** Check if current tab has detected booking
- **Flow:**
  1. Query active NewBook tab
  2. Send message to content script
  3. If booking detected: Auto-switch to Restaurant tab

**Auto-Popup Conditions:**
- Setting `enableAutoPopup` must be true
- Delay `autoPopupDelay` must elapse
- Valid booking ID detected
- Tab with issues found (Restaurant or Checks)

**Auto-Switch Priority:**
1. **Restaurant tab** - If package booking without restaurant
2. **Checks tab** - If validation issues
3. **Summary tab** - Default (no issues)

#### Inactivity Timeout

**`startInactivityTimer()` → void**
- **Duration:** 60 seconds of no user interaction
- **Action:** Switch back to Summary tab
- **Reset Triggers:** Any user interaction (click, scroll)

---

### options.js

**Purpose:** Settings page logic

#### Settings Managed

**API Configuration:**
- `apiEndpoint` - WordPress REST API URL
- `adminBaseUrl` - WordPress admin URL

**Authentication:**
- `wpUsername` - WordPress username
- `wpAppPassword` - Application password (sanitized: spaces removed)

**Behavior:**
- `enableAutoPopup` - Auto-open sidepanel toggle
- `autoPopupDelay` - Delay before auto-open (milliseconds)
- `summaryRefreshRate` - Auto-refresh interval (seconds)

#### Key Functions

**`saveSettings()` → void**
- **Description:** Save form values to chrome.storage.local
- **Validation:**
  - Remove spaces from application password
  - Validate URL format
  - Ensure numeric values for delays
- **Feedback:** Shows success/error message

**`loadSettings()` → void**
- **Description:** Load saved settings and populate form
- **Defaults:**
  - `apiEndpoint`: ''
  - `enableAutoPopup`: true
  - `autoPopupDelay`: 2500
  - `summaryRefreshRate`: 60

**`testConnection()` → Promise<void>**
- **Description:** Test WordPress API connection
- **API Call:**
  ```javascript
  GET ${apiEndpoint}/summary?context=json
  Headers: {
    Authorization: 'Basic ' + base64(username:password)
  }
  ```
- **Success:** Shows success message with API version
- **Failure:** Shows error message with details

**`requestHostPermissions()` → void**
- **Description:** Request optional host permissions
- **Permissions:** WordPress admin URLs
- **Required:** For cross-origin API calls

---

## API Integration

### Authentication

**Method:** WordPress Application Passwords (HTTP Basic Auth)

**Header Format:**
```javascript
const password = settings.wpAppPassword.replace(/\s+/g, ''); // Remove spaces
const credentials = btoa(`${settings.wpUsername}:${password}`);
const headers = {
  'Authorization': `Basic ${credentials}`,
  'Content-Type': 'application/json'
};
```

**Critical:** Application passwords contain spaces (e.g., "xxxx xxxx xxxx xxxx"). These MUST be removed before base64 encoding.

### API Endpoints Used

#### 1. Summary Endpoint

**URL:** `GET /wp-json/bma/v1/summary?context=chrome-summary`

**Parameters:**
- `context` - 'chrome-summary' (returns HTML)
- `limit` - Number of bookings (default: 5)
- `force_refresh` - Bypass cache (optional)

**Response:**
```javascript
{
  success: true,
  html_placed: "<div>...</div>",
  html_cancelled: "<div>...</div>",
  critical_count: 2,
  warning_count: 3,
  badge_count: 5
}
```

**Usage in Extension:**
```javascript
const response = await fetch(
  `${settings.apiEndpoint}/summary?context=chrome-summary`,
  {
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  }
);
```

---

#### 2. Booking Match Endpoint

**URL:** `POST /wp-json/bma/v1/bookings/match`

**Body:**
```javascript
{
  booking_id: 12345,
  context: 'chrome-sidepanel'
}
```

**Response:**
```javascript
{
  success: true,
  context: 'chrome-sidepanel',
  html: "<div>...</div>",
  badge_count: 2,
  critical_count: 1,
  warning_count: 1
}
```

**Usage in Extension:**
```javascript
const response = await fetch(
  `${settings.apiEndpoint}/bookings/match`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      booking_id: bookingId,
      context: 'chrome-sidepanel'
    })
  }
);
```

---

#### 3. Checks Endpoint

**URL:** `GET /wp-json/bma/v1/checks/{booking_id}?context=chrome-checks`

**Parameters:**
- `booking_id` - In URL path
- `context` - 'chrome-checks'

**Response:**
```javascript
{
  success: true,
  html: "<div>...</div>",
  badge_count: 0
}
```

**Usage in Extension:**
```javascript
const response = await fetch(
  `${settings.apiEndpoint}/checks/${bookingId}?context=chrome-checks`,
  {
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  }
);
```

---

### Error Handling

**Network Errors:**
```javascript
try {
  const response = await fetch(...);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  console.error('API Error:', error);
  showError(`Failed to load: ${error.message}`);
}
```

**Authentication Errors (401):**
- Check username/password in settings
- Verify application password has no spaces
- Test connection in options page

**CORS Errors:**
- Ensure host permissions granted
- Check optional_host_permissions in manifest
- Request permissions via options page

---

## Storage & Settings

### Chrome Storage Schema

**Key:** `settings` (object)

**Structure:**
```javascript
{
  apiEndpoint: "https://site.com/wp-json/bma/v1",
  adminBaseUrl: "https://site.com",
  wpUsername: "admin",
  wpAppPassword: "xxxx xxxx xxxx xxxx",
  enableAutoPopup: true,
  autoPopupDelay: 2500,
  summaryRefreshRate: 60
}
```

### Reading Settings

```javascript
chrome.storage.local.get(['settings'], (result) => {
  const settings = result.settings || DEFAULT_SETTINGS;
  STATE.settings = settings;
});
```

### Writing Settings

```javascript
chrome.storage.local.set({ settings: newSettings }, () => {
  console.log('Settings saved');
});
```

### Default Settings

```javascript
const DEFAULT_SETTINGS = {
  apiEndpoint: '',
  adminBaseUrl: '',
  wpUsername: '',
  wpAppPassword: '',
  enableAutoPopup: true,
  autoPopupDelay: 2500,
  summaryRefreshRate: 60
};
```

---

## Badge System

### Badge States

**Red Badge (!):**
- **Meaning:** Critical issue - Package booking without restaurant
- **Color:** `#dc3545`
- **Priority:** Highest
- **Auto-Switch:** Yes, to Restaurant tab

**Amber Badge (?):**
- **Meaning:** Warning - Multiple matches or non-primary match
- **Color:** `#ffc107`
- **Priority:** Medium
- **Auto-Switch:** Yes, to Restaurant tab

**Green Badge (✓):**
- **Meaning:** Success - All bookings matched correctly
- **Color:** `#28a745`
- **Priority:** Low
- **Auto-Switch:** No

**Blank Badge:**
- **Meaning:** Waiting for data or no bookings
- **Color:** None
- **Priority:** None

### Badge Update Flow

```
API returns badge_count
    ↓
Calculate badge type based on counts:
  - critical_count > 0 → Red (!)
  - warning_count > 0 → Amber (?)
  - All good → Green (✓)
    ↓
Send message to background.js
    ↓
background.js updates icon badge
    ↓
Badge visible on extension icon
```

### Badge Count Calculation

```javascript
const badgeCount = critical_count + warning_count;

if (critical_count > 0) {
  updateBadge(tabId, '!', '#dc3545');
} else if (warning_count > 0) {
  updateBadge(tabId, '?', '#ffc107');
} else {
  updateBadge(tabId, '✓', '#28a745');
}
```

---

## Event Handling

### Chrome Extension Events

**`chrome.tabs.onUpdated`**
- **Triggered:** Tab URL change, page load complete
- **Handler:** `background.js`
- **Action:** Check for NewBook URL, update badge

**`chrome.webNavigation.onHistoryStateUpdated`**
- **Triggered:** SPA navigation (no page reload)
- **Handler:** `background.js`
- **Action:** Detect NewBook SPA navigation, reset detection

**`chrome.action.onClicked`**
- **Triggered:** Extension icon clicked
- **Handler:** `background.js`
- **Action:** Open sidepanel

**`chrome.runtime.onMessage`**
- **Triggered:** Messages from other extension components
- **Handlers:** `background.js`, `sidepanel.js`, `content.js`
- **Messages:** `bookingDetected`, `updateBadge`, `getCurrentBookingId`

### Custom DOM Events

**MutationObserver (content.js):**
- **Target:** `document.body`
- **Options:** `{ childList: true, subtree: true }`
- **Debounce:** 150ms
- **Watches:** Tooltip dialogs, planner blocks

**Click Events (content.js):**
- **Target:** `[data-booking-id]` elements
- **Debounce:** 150ms (single-click detection)
- **Action:** Extract booking ID, send to background

**Tab Button Clicks (sidepanel.js):**
- **Target:** `.tab-button` elements
- **Action:** Switch tabs, load content

**Refresh Button Click (sidepanel.js):**
- **Target:** `#refresh-button`
- **Action:** Manual refresh current tab

---

## URL Detection & Monitoring

### NewBook URL Pattern

**Base URL:** `https://appeu.newbook.cloud/*`

**Booking ID Patterns:**
1. `?id=12345` - Direct booking ID parameter
2. `?bookingId=67890` - Alternative booking ID parameter
3. Tooltip/Planner detection - Fallback when URL doesn't contain ID

### Detection Priority

1. **URL Parameter** - Checked on page load
2. **Tooltip Dialog** - Detected via MutationObserver
3. **Planner Block Click** - Detected via click event

### URL Change Detection

**Method 1: chrome.tabs.onUpdated**
- Full page reloads
- URL changes with page refresh

**Method 2: chrome.webNavigation.onHistoryStateUpdated**
- SPA navigation (no page reload)
- NewBook internal navigation
- Planner date changes

---

## Auto-Popup Logic

### Trigger Conditions

**All must be true:**
1. Setting `enableAutoPopup` === true
2. Valid booking ID detected
3. Delay `autoPopupDelay` milliseconds elapsed
4. Not already open (prevents duplicate opens)

### Auto-Open Flow

```
Booking ID detected (content.js)
    ↓
Message sent to background.js
    ↓
background.js checks settings
    ↓
Wait autoPopupDelay milliseconds
    ↓
chrome.sidePanel.open({ tabId })
    ↓
Sidepanel loads
    ↓
Auto-switches to problem tab (if issues)
```

### Auto-Switch Logic

**Priority:**
1. **Restaurant tab** - If `critical_count > 0` (package without restaurant)
2. **Restaurant tab** - If `warning_count > 0` (multiple matches)
3. **Checks tab** - If `badge_count > 0` in checks
4. **Summary tab** - Default (no issues)

**Implementation:**
```javascript
if (critical_count > 0 || warning_count > 0) {
  switchTab('restaurant');
} else if (checksBadgeCount > 0) {
  switchTab('checks');
} else {
  // Stay on Summary
}
```

---

## Tab Switching & Navigation

### Tab Structure

**Three Tabs:**
1. **Summary** - Recent bookings overview
2. **Restaurant** - Booking matches for selected booking
3. **Checks** - Validation checks for selected booking

### Tab State Management

**Current Tab:** Stored in `STATE.currentTab`

**Tab Content Loading:**
- Summary: No booking ID required
- Restaurant: Requires `STATE.currentBookingId`
- Checks: Requires `STATE.currentBookingId`

### Navigation Context

**Purpose:** Handle cross-tab navigation with context

**Structure:**
```javascript
STATE.navigationContext = {
  fromTab: 'summary',
  toTab: 'restaurant',
  date: '2025-11-15',
  autoAction: 'create',
  bookingId: 12345
};
```

**Actions:**
- `create` - Auto-expand create booking form
- `expand` - Auto-expand specific match
- `scroll` - Scroll to specific date

**Processing:**
```javascript
function processNavigationContext() {
  if (!STATE.navigationContext) return;

  const { date, autoAction } = STATE.navigationContext;

  if (autoAction === 'create') {
    // Find date section, expand form
    const section = document.querySelector(`[data-date="${date}"]`);
    const createForm = section.querySelector('.create-booking-form');
    createForm.style.display = 'block';

    // Scroll into view
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Clear context
  STATE.navigationContext = null;
}
```

### Inactivity Return

**Timer:** 60 seconds of no user interaction

**Action:** Return to Summary tab

**Reset Triggers:**
- Click event
- Scroll event
- Tab switch
- Any user action

---

## Authentication

### WordPress Application Passwords

**Format:** `xxxx xxxx xxxx xxxx` (spaces included)

**Critical:** Spaces MUST be removed before base64 encoding

**Generation:**
1. WordPress Admin → Users → Your Profile
2. Scroll to "Application Passwords"
3. Enter name: "Chrome Extension"
4. Click "Add New Application Password"
5. Copy generated password (with spaces)

**Storage:** Stored in `chrome.storage.local` (encrypted by Chrome)

### Basic Auth Implementation

```javascript
function getAuthHeader(settings) {
  // CRITICAL: Remove all spaces from application password
  const password = settings.wpAppPassword.replace(/\s+/g, '');

  // Base64 encode username:password
  const credentials = btoa(`${settings.wpUsername}:${password}`);

  return `Basic ${credentials}`;
}
```

**Common Issues:**
- **401 Unauthorized:** Spaces not removed from password
- **403 Forbidden:** User lacks required capabilities
- **CORS Error:** Host permissions not granted

### Testing Authentication

**Method:** Use options page "Test Connection" button

**Test API Call:**
```javascript
fetch(`${apiEndpoint}/summary?context=json`, {
  headers: {
    'Authorization': getAuthHeader(settings)
  }
})
```

**Success Response:**
- HTTP 200
- JSON with `success: true`

**Failure Responses:**
- HTTP 401: Check credentials
- HTTP 403: Check user permissions
- HTTP 404: Check API endpoint URL
- Network error: Check CORS/host permissions

---

## Troubleshooting

### Common Issues

#### 1. Badge Not Updating

**Symptoms:**
- Badge stays blank
- Badge doesn't show correct count

**Causes:**
- Background.js not receiving messages
- Invalid booking ID
- API call failing

**Debug Steps:**
1. Open background.js console: `chrome://extensions` → "service worker"
2. Check for messages: `console.log('Message received:', message)`
3. Verify API response has `badge_count`
4. Check `chrome.action.setBadgeText` calls

---

#### 2. Sidepanel Won't Open

**Symptoms:**
- Click extension icon, nothing happens
- Sidepanel opens but is blank

**Causes:**
- Service worker inactive
- Sidepanel permission not granted
- JavaScript error in sidepanel.js

**Debug Steps:**
1. Check service worker status in `chrome://extensions`
2. Open sidepanel console: Right-click sidepanel → Inspect
3. Check for JavaScript errors
4. Verify `chrome.sidePanel` permission in manifest

---

#### 3. API Calls Failing (401 Unauthorized)

**Symptoms:**
- All API calls return 401
- "Authorization failed" errors

**Causes:**
- Spaces not removed from application password
- Invalid username/password
- Expired application password

**Debug Steps:**
1. Open options page
2. Click "Test Connection"
3. Check exact error message
4. Verify password has no spaces in storage:
   ```javascript
   chrome.storage.local.get(['settings'], (result) => {
     console.log('Password:', result.settings.wpAppPassword);
     console.log('Has spaces:', /\s/.test(result.settings.wpAppPassword));
   });
   ```
5. Re-save password in options (auto-removes spaces)

---

#### 4. Auto-Popup Not Working

**Symptoms:**
- Sidepanel doesn't auto-open when booking detected
- Must manually click icon

**Causes:**
- `enableAutoPopup` setting disabled
- Delay too long, user navigates away
- Booking ID not properly detected

**Debug Steps:**
1. Check settings: `enableAutoPopup` should be true
2. Check content.js console for booking detection:
   ```javascript
   console.log('Booking detected:', bookingId);
   ```
3. Check background.js for auto-open attempt:
   ```javascript
   console.log('Auto-opening sidepanel for booking:', bookingId);
   ```
4. Reduce `autoPopupDelay` to test

---

#### 5. Content Not Loading (API Errors)

**Symptoms:**
- Tabs show "Loading..." indefinitely
- Error messages in sidepanel

**Causes:**
- Invalid API endpoint URL
- CORS errors (host permissions)
- WordPress plugin not activated
- Network connectivity issues

**Debug Steps:**
1. Check API endpoint in settings
2. Test endpoint in browser directly
3. Check network tab for CORS errors
4. Verify booking-match-api plugin is active
5. Check WordPress error logs

---

### Debug Mode

**Enable Console Logging:**

**content.js:**
```javascript
const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log('[Content]', ...args);
}
```

**sidepanel.js:**
```javascript
const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log('[Sidepanel]', ...args);
}
```

**background.js:**
```javascript
const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log('[Background]', ...args);
}
```

---

### Performance Monitoring

**API Call Timing:**
```javascript
const startTime = performance.now();
const response = await fetch(...);
const endTime = performance.now();
console.log(`API call took ${endTime - startTime}ms`);
```

**Memory Usage:**
```javascript
if (performance.memory) {
  console.log('Memory usage:', {
    used: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
    total: Math.round(performance.memory.totalJSHeapSize / 1048576) + 'MB'
  });
}
```

---

## Version History

### v1.7.4 (2025-11-08)
- Reduced click detection delay to 150ms
- Improved responsiveness of booking detection

### v1.7.3 (2025-11-07)
- Fixed 404 error in background.js API endpoint construction
- Improved error handling

### v1.7.2 (2025-11-06)
- Fixed sidepanel triggering on hover tooltip instead of click
- Single-click detection improvements

### v1.7.1 (2025-11-05)
- Fixed easyTooltip detection
- Cleaned up countdown UI

### v1.7.0 (2025-11-04)
- Added configurable refresh with countdown
- Fixed API endpoint handling
- Smart tab switching implementation

### v1.6.0 (2025-11-03)
- Smart tab switching based on issues
- Single-click detection for planner blocks

### v1.5.0 (2025-11-02)
- Implemented 3-tab sidepanel interface
- Summary, Restaurant, and Checks tabs

---

## Development Setup

### Prerequisites
- Chrome browser (v120+)
- WordPress site with booking-match-api plugin
- WordPress Application Password
- NewBook PMS access

### Installation (Development)
1. Clone repository
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select extension directory
6. Configure settings in options page

### Testing
1. Navigate to NewBook booking page
2. Click booking or open tooltip
3. Verify badge updates
4. Check sidepanel auto-opens (if enabled)
5. Test all three tabs load correctly
6. Verify API calls succeed

### Building for Production
1. Remove debug logging
2. Update version in manifest.json
3. Test thoroughly
4. Zip extension directory
5. Upload to Chrome Web Store (if publishing)

---

## Dependencies

### External APIs
- **WordPress REST API** - booking-match-api plugin
- **NewBook Cloud API** - Accessed via WordPress proxy

### Chrome APIs Used
- `chrome.storage` - Settings persistence
- `chrome.tabs` - Tab monitoring
- `chrome.webNavigation` - SPA navigation detection
- `chrome.action` - Icon badge management
- `chrome.sidePanel` - Sidepanel interface
- `chrome.runtime` - Messaging between components

### No External Libraries
- Pure vanilla JavaScript
- No npm dependencies
- No build process required

---

## Security Considerations

### Authentication
- Application passwords stored in chrome.storage.local (Chrome encrypted storage)
- Credentials never exposed in console logs (production mode)
- HTTPS required for API calls

### Permissions
- `activeTab` - Only when extension icon clicked
- `storage` - Local settings only
- `sidePanel` - Sidepanel interface
- `host_permissions` - NewBook domain only
- `optional_host_permissions` - WordPress admin (requested on demand)

### Content Security
- No eval() or Function() constructors
- No inline scripts in HTML
- All scripts in separate .js files (Manifest V3 requirement)

---

## Future Enhancements

### Planned Features
- Offline mode with cached data
- Push notifications for critical issues
- Bulk booking operations
- Advanced filtering in Summary tab
- Export functionality
- Dark mode support

### Performance Optimizations
- Service worker caching for API responses
- Lazy loading of tab content
- Debounced API calls
- Request deduplication

---

## Support & Contact

**Repository:** chrome-hotel-link-extention
**Version:** 1.7.4
**Dependencies:** booking-match-api (v1.5.0+)

For issues or questions:
1. Check this developer reference
2. Review console logs (background, content, sidepanel)
3. Test API connection in options page
4. Verify WordPress plugin is active and up-to-date

---

**Last Updated:** 2025-11-15
**Maintained by:** Hotel Number Four Development Team
