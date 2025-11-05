// Background service worker for Hotel Booking Assistant

// Pattern to match NewBook booking URLs
const BOOKING_URL_PATTERN = /https:\/\/appeu\.newbook\.cloud\/bookings_view\/(\d+)/;

// Listen for tab updates to detect booking pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    checkBookingPage(tab.url, tabId);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    checkBookingPage(tab.url, activeInfo.tabId);
  }
});

// Check booking and update badge/popup (called from dialog detection or page load)
async function checkBookingAndOpenPopup(bookingId, tabId) {
  console.log('[Background] Checking booking:', bookingId);

  // Store the current booking ID
  chrome.storage.local.set({
    currentBookingId: bookingId
  });

  // Check booking status via API to determine badge
  try {
    const settings = await chrome.storage.local.get(['settings']);
    const apiEndpoint = settings.settings?.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';

    // Prepare authentication header
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.settings?.wpUsername && settings.settings?.wpAppPassword) {
      // Create Basic Auth header (remove spaces from Application Password)
      const password = settings.settings.wpAppPassword.replace(/\s+/g, '');
      const credentials = btoa(`${settings.settings.wpUsername}:${password}`);
      headers['Authorization'] = `Basic ${credentials}`;
      console.log('[Background] Using Basic Authentication with username:', settings.settings.wpUsername);
    } else {
      console.warn('[Background] No authentication credentials configured');
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'json'
      })
    });

    if (response.ok) {
      const data = await response.json();

      // Also fetch HTML version for the popup (includes inline ResOS links)
      const htmlResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          booking_id: parseInt(bookingId),
          context: 'chrome-extension'
        })
      });

      let htmlData = null;
      if (htmlResponse.ok) {
        htmlData = await htmlResponse.json();
      }

      // Cache JSON (for badge logic) and HTML (for popup display with inline ResOS links)
      chrome.storage.local.set({
        cachedBookingData: data,
        cachedBookingHtml: htmlData,
        cachedBookingId: bookingId,
        cachedTimestamp: Date.now()
      });

      // Check for warnings and package alerts
      let hasPackageAlert = false;
      let hasWarnings = false;

      if (data.success && data.bookings && data.bookings.length > 0) {
        const booking = data.bookings[0];

        for (const night of booking.nights) {
          const matchCount = night.match_count || 0;
          const hasPackage = night.has_package || false;

          // Check for package booking without restaurant reservation (CRITICAL)
          if (hasPackage && matchCount === 0) {
            hasPackageAlert = true;
            break;  // Package alert is most critical
          }
          // Check for other warnings
          else if (matchCount > 1) {
            // Multiple matches found - this is a warning
            hasWarnings = true;
          } else if (matchCount === 1 && night.resos_bookings) {
            // Check if it's not a primary match
            const match = night.resos_bookings[0];
            if (!match.is_primary) {
              hasWarnings = true;
            }
          }
        }
      }

      // Set badge based on severity (package alert > warnings > success)
      if (tabId) {
        if (hasPackageAlert) {
          chrome.action.setBadgeText({ text: '🍽️', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tabId });
        } else if (hasWarnings) {
          chrome.action.setBadgeText({ text: '⚠', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tabId });
        } else {
          chrome.action.setBadgeText({ text: '✓', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId });
        }
      }

      // Auto-open popup if there are any warnings or critical alerts
      // OR if API explicitly says to auto-open (package booking without reservation)
      if (data.should_auto_open || hasPackageAlert || hasWarnings) {
        console.log('[Background] Auto-opening popup (has alerts/warnings)');
        try {
          await chrome.action.openPopup();
          console.log('[Background] Popup opened successfully');
        } catch (error) {
          // openPopup may fail if not called from user action in some cases
          // This is expected behavior, just log it
          console.log('[Background] Auto-open triggered but popup opening restricted:', error.message);
        }
      }
    } else {
      // API error, show neutral badge
      if (tabId) {
        chrome.action.setBadgeText({ text: '?', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#6b7280', tabId: tabId });
      }
    }
  } catch (error) {
    console.error('[Background] Error checking booking status:', error);
    // On error, just show active badge
    if (tabId) {
      chrome.action.setBadgeText({ text: '✓', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId });
    }
  }
}

// Check if the current page is a booking page
async function checkBookingPage(url, tabId) {
  const match = url.match(BOOKING_URL_PATTERN);

  if (match) {
    const bookingId = match[1];

    // Store the current booking URL
    chrome.storage.local.set({
      currentBookingUrl: url
    });

    // Use the shared function to check booking
    await checkBookingAndOpenPopup(bookingId, tabId);
  } else {
    // Clear badge if not on a booking page
    chrome.action.setBadgeText({ text: '', tabId: tabId });
    chrome.storage.local.remove(['currentBookingId', 'currentBookingUrl']);
  }
}

// Context menu setup (for future right-click feature)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'viewBookingDetails',
    title: 'View Restaurant Bookings',
    contexts: ['all'],
    documentUrlPatterns: ['https://appeu.newbook.cloud/*']
  });

  // Set default settings only if they don't exist (don't overwrite existing settings)
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      // No settings exist, set defaults
      chrome.storage.local.set({
        settings: {
          apiEndpoint: 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match',
          adminBaseUrl: 'https://n4admindev.pterois.co.uk',
          wpUsername: '',
          wpAppPassword: ''
        }
      });
      console.log('[Background] Default settings initialized');
    } else {
      console.log('[Background] Existing settings preserved');
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'viewBookingDetails') {
    // Request booking ID from content script if available
    chrome.tabs.sendMessage(tab.id, { action: 'getBookingIdFromElement' }, (response) => {
      if (response && response.bookingId) {
        chrome.storage.local.set({
          contextBookingId: response.bookingId
        });
        // Open popup programmatically or navigate to admin
        chrome.tabs.create({
          url: `https://admin.hotelnumberfour.com/booking/${response.bookingId}`
        });
      }
    });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentBooking') {
    chrome.storage.local.get(['currentBookingId', 'currentBookingUrl'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  // Handle request from content script to check booking when dialog appears
  if (request.action === 'checkBookingFromDialog') {
    const bookingId = request.bookingId;
    console.log('[Background] Received checkBookingFromDialog for booking:', bookingId);

    // Check the booking and try to open popup
    checkBookingAndOpenPopup(bookingId, sender.tab?.id);

    sendResponse({ success: true });
    return true;
  }
});
