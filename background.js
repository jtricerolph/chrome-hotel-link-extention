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

// Check if the current page is a booking page
function checkBookingPage(url, tabId) {
  const match = url.match(BOOKING_URL_PATTERN);

  if (match) {
    const bookingId = match[1];

    // Store the current booking ID
    chrome.storage.local.set({
      currentBookingId: bookingId,
      currentBookingUrl: url
    });

    // Update badge to indicate extension is active on this page
    chrome.action.setBadgeText({ text: '✓', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tabId });
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

  // Set default settings
  chrome.storage.local.set({
    settings: {
      apiEndpoint: 'https://admin.hotelnumberfour.com/api/check-booking',
      adminBaseUrl: 'https://admin.hotelnumberfour.com/booking'
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
});
