// Background service worker for Hotel Booking Assistant

// Pattern to match NewBook booking URLs
const BOOKING_URL_PATTERN = /https:\/\/appeu\.newbook\.cloud\/bookings_view\/(\d+)/;

// Listen for extension icon clicks - open sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Background] Extension icon clicked, opening sidepanel');
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('[Background] Sidepanel opened successfully');
  } catch (error) {
    console.error('[Background] Failed to open sidepanel:', error);
  }
});

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
      console.log('[Background] Password length:', settings.settings.wpAppPassword.length);
      console.log('[Background] Password has spaces:', /\s/.test(settings.settings.wpAppPassword));
      console.log('[Background] Cleaned password length:', password.length);
      console.log('[Background] Auth header length:', credentials.length);
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

    console.log('[Background] First fetch (json) response status:', response.status, response.statusText);

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

      console.log('[Background] Second fetch (popup html) response status:', htmlResponse.status, htmlResponse.statusText);

      let htmlData = null;
      if (htmlResponse.ok) {
        htmlData = await htmlResponse.json();
      } else {
        console.warn('[Background] Popup HTML fetch failed:', htmlResponse.status);
      }

      // Also fetch HTML version for the sidepanel (wider layout)
      const sidepanelResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          booking_id: parseInt(bookingId),
          context: 'chrome-sidepanel'
        })
      });

      console.log('[Background] Third fetch (sidepanel html) response status:', sidepanelResponse.status, sidepanelResponse.statusText);

      let sidepanelHtmlData = null;
      if (sidepanelResponse.ok) {
        sidepanelHtmlData = await sidepanelResponse.json();
      } else {
        console.warn('[Background] Sidepanel HTML fetch failed:', sidepanelResponse.status);
      }

      // Cache JSON (for badge logic), popup HTML, and sidepanel HTML
      chrome.storage.local.set({
        cachedBookingData: data,
        cachedBookingHtml: htmlData,
        cachedSidepanelHtml: sidepanelHtmlData,
        cachedBookingId: bookingId,
        cachedSidepanelBookingId: bookingId,
        cachedTimestamp: Date.now(),
        cachedSidepanelTimestamp: Date.now()
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
          chrome.action.setBadgeText({ text: '!', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tabId });
        } else if (hasWarnings) {
          chrome.action.setBadgeText({ text: '?', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tabId });
        } else {
          chrome.action.setBadgeText({ text: '✓', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId });
        }
      }

      // Auto-open sidepanel if there are any warnings or critical alerts
      // OR if API explicitly says to auto-open (package booking without reservation)
      // Check if auto-popup is enabled in settings
      const autoPopupResult = await chrome.storage.local.get(['settings']);
      const autoPopupSettings = autoPopupResult.settings || {};
      const enableAutoPopup = autoPopupSettings.enableAutoPopup !== undefined ? autoPopupSettings.enableAutoPopup : true;
      const autoPopupDelay = autoPopupSettings.autoPopupDelay || 2500;

      if (enableAutoPopup && (data.should_auto_open || hasPackageAlert || hasWarnings)) {
        console.log('[Background] Auto-opening sidepanel in', autoPopupDelay, 'ms (has alerts/warnings)');
        setTimeout(async () => {
          try {
            // Get the window ID for the current tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs.length > 0) {
              const windowId = tabs[0].windowId;
              await chrome.sidePanel.open({ windowId: windowId });
              console.log('[Background] Sidepanel opened successfully');
            }
          } catch (error) {
            // sidePanel.open may fail if not called from user action in some cases
            // This is expected behavior, just log it
            console.log('[Background] Auto-open triggered but sidepanel opening restricted:', error.message);
          }
        }, autoPopupDelay);
      } else if (!enableAutoPopup) {
        console.log('[Background] Auto-popup disabled in settings, skipping sidepanel');
      }
    } else {
      // API error, show neutral badge
      console.error('[Background] First fetch failed:', response.status, response.statusText);
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

// Migration: Clean spaces from Application Passwords in stored settings
async function migratePasswordSpaces() {
  const result = await chrome.storage.local.get(['settings']);
  if (result.settings && result.settings.wpAppPassword) {
    const currentPassword = result.settings.wpAppPassword;
    const cleanedPassword = currentPassword.replace(/\s+/g, '');

    // Only update if there were spaces to remove
    if (currentPassword !== cleanedPassword) {
      result.settings.wpAppPassword = cleanedPassword;
      await chrome.storage.local.set({ settings: result.settings });
      console.log('[Background] Migrated Application Password: removed spaces from stored credential');
    }
  }
}

// Function to ensure API host permissions are granted
async function ensureAPIPermissions() {
  return new Promise((resolve) => {
    chrome.permissions.contains(
      { origins: ['https://admin.hotelnumberfour.com/*', 'https://n4admindev.pterois.co.uk/*'] },
      (hasPermissions) => {
        if (!hasPermissions) {
          console.log('[Background] API host permissions missing, requesting...');
          chrome.permissions.request(
            { origins: ['https://admin.hotelnumberfour.com/*', 'https://n4admindev.pterois.co.uk/*'] },
            (granted) => {
              if (granted) {
                console.log('[Background] API host permissions granted');
                resolve(true);
              } else {
                console.error('[Background] API host permissions denied - extension will not work properly');
                resolve(false);
              }
            }
          );
        } else {
          console.log('[Background] API host permissions already granted');
          resolve(true);
        }
      }
    );
  });
}

// Check permissions on every extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension startup - checking permissions...');
  ensureAPIPermissions();
});

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
          wpAppPassword: '',
          // Behavior settings
          enableDialogInjection: true,
          enablePlannerHover: true,
          enableAutoPopup: true,
          autoPopupDelay: 2500,
          hoverDelay: 500
        }
      });
      console.log('[Background] Default settings initialized');
    } else {
      console.log('[Background] Existing settings preserved');
    }
  });

  // Run password migration
  migratePasswordSpaces();

  // Request optional host permissions for API endpoints
  ensureAPIPermissions();
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
