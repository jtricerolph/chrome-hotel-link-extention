// Content script for NewBook pages
// This script runs on all NewBook pages and enables future features like right-click menus

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getBookingIdFromElement') {
    // Try to find booking_id from the clicked element or nearby context
    const bookingId = findBookingIdFromContext();
    sendResponse({ bookingId: bookingId });
  }
  return true;
});

// Function to find booking_id from page context
function findBookingIdFromContext() {
  // Method 1: Check if we're on a booking_view page (from URL)
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Method 2: Look for elements with booking_id attribute
  // This is for the booking chart view where divs have booking_id
  const bookingElements = document.querySelectorAll('[booking_id]');
  if (bookingElements.length > 0) {
    // For now, return the first one found
    // In future, we could track which element was right-clicked
    return bookingElements[0].getAttribute('booking_id');
  }

  // Method 3: Check for any data-booking-id attributes
  const dataBookingElements = document.querySelectorAll('[data-booking-id]');
  if (dataBookingElements.length > 0) {
    return dataBookingElements[0].getAttribute('data-booking-id');
  }

  return null;
}

// Store last right-clicked element for context menu
let lastRightClickedElement = null;

// Override right-click blocking - run in capture phase with highest priority
document.addEventListener('contextmenu', (event) => {
  lastRightClickedElement = event.target;

  // Try to find booking_id from the clicked element or its parents
  let element = event.target;
  let bookingId = null;

  // Traverse up the DOM tree to find a booking_id
  while (element && element !== document.body) {
    bookingId = element.getAttribute('booking_id') || element.getAttribute('data-booking-id');

    if (bookingId) {
      // Store this booking ID for the context menu action
      chrome.storage.local.set({ lastClickedBookingId: bookingId });
      break;
    }

    element = element.parentElement;
  }

  // IMPORTANT: Allow the context menu to show by stopping any page scripts from blocking it
  event.stopPropagation();
  event.stopImmediatePropagation();
}, true);

// Additional protection: Remove any existing contextmenu event listeners that block right-click
// This runs early to prevent the page from blocking our menu
(function() {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    // Don't let the page block contextmenu events
    if (type === 'contextmenu') {
      // Still add it, but our listener (above) runs first in capture phase
      return originalAddEventListener.call(this, type, listener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
})();

// Force re-enable right-click if the page tries to disable it with oncontextmenu
document.addEventListener('DOMContentLoaded', () => {
  document.oncontextmenu = null;
  document.body.oncontextmenu = null;

  // Remove any inline oncontextmenu attributes
  document.querySelectorAll('[oncontextmenu]').forEach(el => {
    el.removeAttribute('oncontextmenu');
  });
});

// Optional: Add visual indicator when hovering over booking elements
// This can help staff know which bookings are clickable
function addBookingHighlighting() {
  const style = document.createElement('style');
  style.textContent = `
    [booking_id]:hover,
    [data-booking-id]:hover {
      outline: 2px solid #4a90e2 !important;
      cursor: pointer !important;
    }
  `;
  document.head.appendChild(style);
}

// Enable highlighting on booking chart pages
if (window.location.href.includes('newbook.cloud')) {
  addBookingHighlighting();
}

// ============================================================================
// BOOKING POPUP DETECTION
// ============================================================================
// Detect when NewBook opens a booking popup and inject restaurant booking info

function detectAndHandleBookingPopup() {
  // Watch for jQuery UI dialogs being added to the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if this is a booking dialog
          if (node.classList && node.classList.contains('ui-dialog')) {
            handleBookingDialog(node);
          }
          // Also check children in case dialog is nested
          const dialogs = node.querySelectorAll && node.querySelectorAll('.ui-dialog');
          if (dialogs) {
            dialogs.forEach(dialog => handleBookingDialog(dialog));
          }
        }
      });
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function handleBookingDialog(dialogElement) {
  // Check if this is a booking dialog by looking for the title pattern
  const titleElement = dialogElement.querySelector('.ui-dialog-title');
  if (!titleElement) return;

  const titleText = titleElement.textContent;
  const bookingMatch = titleText.match(/Booking #(\d+)/);

  if (!bookingMatch) return;

  const bookingId = bookingMatch[1];
  console.log('Detected booking popup for booking ID:', bookingId);

  // Find the dialog content area
  const contentArea = dialogElement.querySelector('.ui-dialog-content');
  if (!contentArea) return;

  // Get the first fieldset to inject our info after the title
  const firstFieldset = contentArea.querySelector('fieldset');
  if (!firstFieldset) return;

  // Fetch restaurant booking data from admin API
  try {
    const restaurantData = await fetchRestaurantBookingData(bookingId);

    if (restaurantData) {
      // Inject the restaurant booking info into the dialog
      injectRestaurantInfoIntoDialog(firstFieldset, restaurantData, bookingId);
    }
  } catch (error) {
    console.error('Error fetching restaurant data:', error);
  }
}

async function fetchRestaurantBookingData(bookingId) {
  try {
    // Get settings
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://admin.hotelnumberfour.com/api/check-booking';

    const response = await fetch(`${apiEndpoint}?booking_id=${bookingId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/html'
      }
    });

    if (!response.ok) {
      console.warn('API returned error:', response.status);
      return null;
    }

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType && contentType.includes('text/html')) {
      const html = await response.text();
      return { html: html };
    }

    return null;
  } catch (error) {
    console.error('Error fetching from API:', error);
    return null;
  }
}

function injectRestaurantInfoIntoDialog(firstFieldset, data, bookingId) {
  // Create a container for our restaurant booking info
  const container = document.createElement('fieldset');
  container.className = 'pretty_fieldset';
  container.style.cssText = 'margin: 10px 0; border: 2px solid #4a90e2; background: #f8f9fa;';

  const legend = document.createElement('legend');
  legend.style.cssText = 'color: #4a90e2; font-weight: bold; padding: 0 10px;';
  legend.innerHTML = '🍽️ Restaurant Bookings';
  container.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = 'padding: 15px;';

  if (data.html) {
    // API returned HTML to display
    contentDiv.innerHTML = data.html;
  } else if (data.hasMatches === false || data.matches === 0) {
    // No matches found
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <p style="color: #666; margin-bottom: 10px;">No restaurant bookings found for this guest.</p>
        <a href="https://admin.hotelnumberfour.com/booking/${bookingId}"
           target="_blank"
           style="display: inline-block; padding: 8px 16px; background: #4a90e2; color: white; text-decoration: none; border-radius: 4px;">
          Open in Admin System →
        </a>
      </div>
    `;
  } else if (data.error) {
    // Error from API
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 10px; color: #d32f2f;">
        <p>⚠️ Error: ${escapeHtml(data.error)}</p>
      </div>
    `;
  } else {
    // Unexpected format
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <a href="https://admin.hotelnumberfour.com/booking/${bookingId}"
           target="_blank"
           style="display: inline-block; padding: 8px 16px; background: #4a90e2; color: white; text-decoration: none; border-radius: 4px;">
          Check Admin System →
        </a>
      </div>
    `;
  }

  container.appendChild(contentDiv);

  // Insert after the first fieldset (after mandatory information)
  firstFieldset.parentNode.insertBefore(container, firstFieldset.nextSibling);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start watching for booking popups
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectAndHandleBookingPopup);
} else {
  detectAndHandleBookingPopup();
}

// Log for debugging
console.log('Hotel Number Four - Booking Assistant extension loaded');
