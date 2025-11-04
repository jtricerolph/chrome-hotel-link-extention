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

// Log for debugging
console.log('Hotel Number Four - Booking Assistant extension loaded');
