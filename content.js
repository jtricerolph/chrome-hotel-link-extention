// Content script for NewBook pages
// This script runs on all NewBook pages and enables future features like right-click menus

console.log('===============================================');
console.log('Hotel Number Four Extension LOADED');
console.log('===============================================');
console.log('[Hotel Extension] Version: 1.2.0');
console.log('[Hotel Extension] URL:', window.location.href);
console.log('===============================================');

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
      if (chrome.runtime?.id) {
        try {
          chrome.storage.local.set({ lastClickedBookingId: bookingId });
        } catch (error) {
          console.log('[Hotel Extension] Failed to store clicked booking ID:', error.message);
        }
      }
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
  // Wait for document.head to be available
  if (!document.head) {
    console.log('[Hotel Extension] document.head not ready, waiting...');
    setTimeout(addBookingHighlighting, 100);
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    [booking_id]:hover,
    [data-booking-id]:hover {
      outline: 2px solid #4a90e2 !important;
      cursor: pointer !important;
    }
  `;
  document.head.appendChild(style);
  console.log('[Hotel Extension] Added booking highlighting styles');
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
  console.log('[Hotel Extension] Starting popup detection...');

  // Check for existing dialogs that might already be on the page
  const checkExistingDialogs = () => {
    // Check for jQuery UI dialogs
    const existingDialogs = document.querySelectorAll('.ui-dialog');
    existingDialogs.forEach(dialog => {
      // Only handle visible dialogs
      if (dialog.style.display !== 'none') {
        handleBookingDialog(dialog);
      }
    });

    // Check for easyToolTip popups
    const existingTooltips = document.querySelectorAll('.easyToolTip');
    existingTooltips.forEach(tooltip => {
      if (tooltip.style.display !== 'none') {
        handleEasyToolTipBooking(tooltip);
      }
    });
  };

  // Check immediately for any existing dialogs
  checkExistingDialogs();

  // Watch for both jQuery UI dialogs and easyToolTip popups being added to the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // console.log('[Hotel Extension] Node added:', node.className); // Disabled - too noisy

          // Format 1: Full jQuery UI dialog
          if (node.classList && node.classList.contains('ui-dialog')) {
            handleBookingDialog(node);
          }

          // Format 2: EasyToolTip compact popup
          if (node.classList && node.classList.contains('easyToolTip')) {
            handleEasyToolTipBooking(node);
          }

          // Also check children in case elements are nested
          if (node.querySelectorAll) {
            const dialogs = node.querySelectorAll('.ui-dialog');
            dialogs.forEach(dialog => handleBookingDialog(dialog));

            const tooltips = node.querySelectorAll('.easyToolTip');
            tooltips.forEach(tooltip => handleEasyToolTipBooking(tooltip));
          }
        }
      });

      // Also watch for attribute changes (e.g., style changes that show/hide dialogs)
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.classList && target.classList.contains('ui-dialog')) {
          if (target.style.display !== 'none') {
            handleBookingDialog(target);
          }
        }
      }
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style']
  });

  // Also check periodically for new dialogs (backup detection)
  setInterval(checkExistingDialogs, 2000);
}

async function handleBookingDialog(dialogElement) {
  console.log('[Hotel Extension] handleBookingDialog called');

  // Check if we've already processed this dialog
  if (dialogElement.dataset.hotelExtensionProcessed) {
    console.log('[Hotel Extension] Dialog already processed, skipping');
    return;
  }

  // Check if this is a booking dialog by looking for the title pattern
  const titleElement = dialogElement.querySelector('.ui-dialog-title');
  console.log('[Hotel Extension] Title element:', titleElement);

  if (!titleElement) {
    console.log('[Hotel Extension] No title element found');
    return;
  }

  const titleText = titleElement.textContent;
  console.log('[Hotel Extension] Title text:', titleText);

  const bookingMatch = titleText.match(/Booking #(\d+)/);

  if (!bookingMatch) {
    console.log('[Hotel Extension] Title does not match booking pattern');
    return;
  }

  const bookingId = bookingMatch[1];
  console.log('[Hotel Extension] Detected booking popup for booking ID:', bookingId);

  // Mark as processed
  dialogElement.dataset.hotelExtensionProcessed = 'true';

  // Store the current booking ID for the extension popup
  if (chrome.runtime?.id) {
    try {
      chrome.storage.local.set({ currentBookingId: bookingId });
      console.log('[Hotel Extension] Stored currentBookingId from dialog:', bookingId);
    } catch (error) {
      console.log('[Hotel Extension] Failed to store booking ID from dialog:', error.message);
    }
  }

  // Inject a Restaurant row into the dialog's table for quick access
  await injectRestaurantRowIntoDialog(dialogElement, bookingId);

  // Trigger the extension popup for alerts/warnings after 2500ms delay
  setTimeout(() => {
    // Check if dialog is still visible before triggering popup
    if (!document.body.contains(dialogElement)) {
      console.log('[Hotel Extension] Dialog removed before popup trigger, skipping popup');
      return;
    }

    const isVisible = dialogElement.style.display !== 'none' &&
                     dialogElement.offsetParent !== null;

    if (!isVisible) {
      console.log('[Hotel Extension] Dialog no longer visible, skipping popup');
      return;
    }

    console.log('[Hotel Extension] Dialog remained visible for 2.5s, triggering popup check...');
    if (chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({
          action: 'checkBookingFromDialog',
          bookingId: bookingId
        });
        console.log('[Hotel Extension] Message sent to background script');
      } catch (error) {
        console.error('[Hotel Extension] Failed to send message to background:', error);
      }
    }
  }, 2500);
}

async function handleEasyToolTipBooking(tooltipElement) {
  // Extract booking ID from the element ID (format: easyTooltip_booking_32792)
  const idMatch = tooltipElement.id.match(/easyTooltip_booking_(\d+)/);

  if (!idMatch) {
    // Try to find booking ID from a link in the content
    const bookingLink = tooltipElement.querySelector('a[href*="bookings_view/"]');
    if (bookingLink) {
      const linkMatch = bookingLink.href.match(/bookings_view\/(\d+)/);
      if (!linkMatch) return;
      var bookingId = linkMatch[1];
    } else {
      return;
    }
  } else {
    var bookingId = idMatch[1];
  }

  console.log('[Hotel Extension] Detected easyToolTip booking popup for booking ID:', bookingId);

  // Check if we've already processed or are currently processing this tooltip
  if (tooltipElement.dataset.hotelExtensionProcessed) {
    console.log('[Hotel Extension] Tooltip already processed, skipping');
    return;
  }

  if (tooltipElement.dataset.hotelExtensionPending) {
    console.log('[Hotel Extension] Tooltip processing already pending, skipping');
    return;
  }

  // Mark as "pending" to prevent duplicate processing
  tooltipElement.dataset.hotelExtensionPending = 'true';

  // Add a 1000ms delay before processing API call - only process if tooltip is still visible
  // This prevents API bombardment when quickly moving mouse across the planner
  setTimeout(async () => {
    // Check if tooltip still exists and is visible
    if (!document.body.contains(tooltipElement)) {
      console.log('[Hotel Extension] Tooltip was removed before delay completed, skipping');
      return;
    }

    const isVisible = tooltipElement.style.display !== 'none' &&
                     tooltipElement.offsetParent !== null;

    if (!isVisible) {
      console.log('[Hotel Extension] Tooltip is no longer visible, skipping');
      return;
    }

    // Now mark as fully processed
    tooltipElement.dataset.hotelExtensionProcessed = 'true';
    delete tooltipElement.dataset.hotelExtensionPending;

    console.log('[Hotel Extension] Tooltip remained visible for 1s, processing booking:', bookingId);

    // Store the current booking ID for the extension popup
    if (chrome.runtime?.id) {
      try {
        chrome.storage.local.set({ currentBookingId: bookingId });
        console.log('[Hotel Extension] Stored currentBookingId from tooltip:', bookingId);
      } catch (error) {
        console.log('[Hotel Extension] Failed to store booking ID from tooltip:', error.message);
      }
    }

    // Inject a Restaurant row into the table for quick access (at 1000ms)
    await injectRestaurantRowIntoTooltip(tooltipElement, bookingId);

    // Trigger the extension popup for alerts/warnings with additional delay (2500ms total)
    // This prevents popup spam when quickly scanning bookings
    setTimeout(() => {
      // Check again if tooltip is still visible before triggering popup
      if (!document.body.contains(tooltipElement)) {
        console.log('[Hotel Extension] Tooltip removed before popup trigger, skipping popup');
        return;
      }

      const stillVisible = tooltipElement.style.display !== 'none' &&
                          tooltipElement.offsetParent !== null;

      if (!stillVisible) {
        console.log('[Hotel Extension] Tooltip no longer visible, skipping popup');
        return;
      }

      console.log('[Hotel Extension] Tooltip remained visible for 2.5s, triggering popup check...');
      if (chrome.runtime?.id) {
        try {
          chrome.runtime.sendMessage({
            action: 'checkBookingFromDialog',
            bookingId: bookingId
          });
          console.log('[Hotel Extension] Message sent to background script');
        } catch (error) {
          console.error('[Hotel Extension] Failed to send message to background:', error);
        }
      }
    }, 1500); // Additional 1500ms delay (2500ms total from initial hover)
  }, 1000); // 1000ms delay for API call
}

async function injectRestaurantInfoAsTab(tabContent, bookingId) {
  // Get the tab navigation
  const tabNav = tabContent.querySelector('.ui-tabs-nav');
  if (!tabNav) return;

  // Fetch restaurant data
  const restaurantData = await fetchRestaurantBookingData(bookingId);
  if (!restaurantData) return;

  // Add a new tab to the navigation
  const newTabLi = document.createElement('li');
  newTabLi.setAttribute('role', 'tab');
  newTabLi.setAttribute('tabindex', '-1');
  newTabLi.className = 'ui-tabs-tab ui-corner-top ui-state-default ui-tab';
  newTabLi.setAttribute('aria-controls', 'restaurant_info_' + bookingId);
  newTabLi.setAttribute('aria-selected', 'false');
  newTabLi.setAttribute('aria-expanded', 'false');

  const newTabLink = document.createElement('a');
  newTabLink.href = '#restaurant_info_' + bookingId;
  newTabLink.tabIndex = -1;
  newTabLink.className = 'ui-tabs-anchor';
  newTabLink.innerHTML = '🍽️ Restaurant';

  newTabLi.appendChild(newTabLink);
  tabNav.appendChild(newTabLi);

  // Create the tab content panel
  const newPanel = document.createElement('fieldset');
  newPanel.id = 'restaurant_info_' + bookingId;
  newPanel.className = 'pretty_fieldset make_popup_tab_' + bookingId + ' ui-tabs-panel ui-corner-bottom ui-widget-content';
  newPanel.setAttribute('role', 'tabpanel');
  newPanel.setAttribute('aria-hidden', 'true');
  newPanel.style.display = 'none';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'pretty_table_wrapper';
  contentDiv.style.cssText = 'padding: 10px;';

  if (restaurantData.html) {
    contentDiv.innerHTML = restaurantData.html;
  } else if (restaurantData.hasMatches === false || restaurantData.matches === 0) {
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p style="color: #666; margin-bottom: 15px;">No restaurant bookings found for this guest.</p>
        <a href="https://admin.hotelnumberfour.com/booking/${bookingId}"
           target="_blank"
           style="display: inline-block; padding: 10px 20px; background: #4a90e2; color: white; text-decoration: none; border-radius: 4px;">
          Open in Admin System →
        </a>
      </div>
    `;
  } else if (restaurantData.error) {
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #d32f2f;">
        <p>⚠️ Error: ${escapeHtml(restaurantData.error)}</p>
      </div>
    `;
  } else {
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <a href="https://admin.hotelnumberfour.com/booking/${bookingId}"
           target="_blank"
           style="display: inline-block; padding: 10px 20px; background: #4a90e2; color: white; text-decoration: none; border-radius: 4px;">
          Check Admin System →
        </a>
      </div>
    `;
  }

  newPanel.appendChild(contentDiv);
  tabContent.appendChild(newPanel);

  // Make the tab clickable
  newTabLink.addEventListener('click', function(e) {
    e.preventDefault();

    // Hide all panels and deactivate all tabs
    const allPanels = tabContent.querySelectorAll('.ui-tabs-panel');
    allPanels.forEach(panel => {
      panel.style.display = 'none';
      panel.setAttribute('aria-hidden', 'true');
    });

    const allTabs = tabNav.querySelectorAll('li');
    allTabs.forEach(tab => {
      tab.classList.remove('ui-tabs-active', 'ui-state-active');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-expanded', 'false');
    });

    // Show this panel and activate this tab
    newPanel.style.display = 'block';
    newPanel.setAttribute('aria-hidden', 'false');
    newTabLi.classList.add('ui-tabs-active', 'ui-state-active');
    newTabLi.setAttribute('aria-selected', 'true');
    newTabLi.setAttribute('aria-expanded', 'true');
  });
}

function injectRestaurantInfoIntoTooltip(firstFieldset, data, bookingId) {
  // Create a simpler container for tooltips without tabs
  const container = document.createElement('fieldset');
  container.className = 'pretty_fieldset';
  container.style.cssText = 'margin: 10px 0; border: 2px solid #4a90e2; background: #f8f9fa;';

  const legend = document.createElement('legend');
  legend.style.cssText = 'color: #4a90e2; font-weight: bold;';
  legend.textContent = '🍽️ Restaurant Bookings';
  container.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = 'padding: 10px;';

  if (data.html) {
    contentDiv.innerHTML = data.html;
  } else if (data.hasMatches === false || data.matches === 0) {
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <p style="color: #666; margin-bottom: 10px; font-size: 13px;">No restaurant bookings found.</p>
        <a href="https://admin.hotelnumberfour.com/booking/${bookingId}"
           target="_blank"
           style="display: inline-block; padding: 6px 12px; background: #4a90e2; color: white; text-decoration: none; border-radius: 3px; font-size: 13px;">
          Open Admin →
        </a>
      </div>
    `;
  } else if (data.error) {
    contentDiv.innerHTML = `
      <div style="text-align: center; padding: 10px; color: #d32f2f; font-size: 13px;">
        <p>⚠️ ${escapeHtml(data.error)}</p>
      </div>
    `;
  }

  container.appendChild(contentDiv);

  // Insert after the first fieldset
  firstFieldset.parentNode.insertBefore(container, firstFieldset.nextSibling);
}

// Fetch HTML response for popup display
async function fetchRestaurantBookingData(bookingId) {
  try {
    // Get settings
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';

    // Prepare authentication header
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.wpUsername && settings.wpAppPassword) {
      // Create Basic Auth header
      const credentials = btoa(`${settings.wpUsername}:${settings.wpAppPassword}`);
      headers['Authorization'] = `Basic ${credentials}`;
      console.log('[Hotel Extension] Using Basic Authentication with username:', settings.wpUsername);
    } else {
      console.warn('[Hotel Extension] No authentication credentials configured');
    }

    console.log('[Hotel Extension] === API REQUEST DEBUG (HTML) ===');
    console.log('[Hotel Extension] API Endpoint:', apiEndpoint);
    console.log('[Hotel Extension] Booking ID:', bookingId);
    console.log('[Hotel Extension] Request body:', JSON.stringify({
      booking_id: parseInt(bookingId),
      context: 'chrome-extension'
    }));

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'chrome-extension'
      })
    });

    console.log('[Hotel Extension] Response status:', response.status);
    console.log('[Hotel Extension] Response headers:', Array.from(response.headers.entries()));

    if (!response.ok) {
      console.warn('[Hotel Extension] API returned error:', response.status);
      const errorText = await response.text();
      console.warn('[Hotel Extension] Error response body:', errorText);
      return null;
    }

    // Get raw response text first
    const responseText = await response.text();
    console.log('[Hotel Extension] RAW API Response (first 500 chars):', responseText.substring(0, 500));
    console.log('[Hotel Extension] RAW API Response length:', responseText.length);

    // Parse JSON
    const data = JSON.parse(responseText);
    console.log('[Hotel Extension] Parsed API Response:', data);
    console.log('[Hotel Extension] === END API REQUEST DEBUG ===');

    return data;
  } catch (error) {
    console.error('[Hotel Extension] Error fetching from API:', error);
    console.error('[Hotel Extension] Error stack:', error.stack);
    return null;
  }
}

// Fetch JSON response with structured bookings data for table injection
async function fetchRestaurantBookingDataJSON(bookingId) {
  try {
    // Check if extension is still valid
    if (!isExtensionValid()) {
      console.warn('[Hotel Extension] Extension invalidated, skipping API call');
      return null;
    }

    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';

    // Prepare authentication header
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.wpUsername && settings.wpAppPassword) {
      // Create Basic Auth header
      const credentials = btoa(`${settings.wpUsername}:${settings.wpAppPassword}`);
      headers['Authorization'] = `Basic ${credentials}`;
      console.log('[Hotel Extension] Using Basic Authentication with username:', settings.wpUsername);
    } else {
      console.warn('[Hotel Extension] No authentication credentials configured');
    }

    console.log('[Hotel Extension] Calling API with:', { booking_id: parseInt(bookingId), context: 'json' });

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'json'  // Request JSON format with bookings array
      })
    });

    console.log('[Hotel Extension] API response status:', response.status, response.statusText);

    if (!response.ok) {
      console.log('[Hotel Extension] API response not ok, returning null');
      return null;
    }

    const data = await response.json();
    console.log('[Hotel Extension] Parsed API response:', data);
    return data;
  } catch (error) {
    // Check for extension context invalidation
    if (error.message && error.message.includes('Extension context invalidated')) {
      extensionInvalidated = true;
      console.warn('[Hotel Extension] Extension context invalidated - page refresh required');
    } else {
      console.error('[Hotel Extension] Error fetching JSON from API:', error);
    }
    return null;
  }
}

async function injectRestaurantRowIntoTooltip(tooltipElement, bookingId) {
  console.log('[Hotel Extension] Looking for table in tooltip, innerHTML length:', tooltipElement.innerHTML.length);

  // Find the table in the tooltip - try multiple selectors
  let table = tooltipElement.querySelector('.pretty_table.fieldset_table');

  if (!table) {
    // Try without the compound class
    table = tooltipElement.querySelector('.pretty_table');
  }

  if (!table) {
    // Try just looking for any table
    table = tooltipElement.querySelector('table');
  }

  if (!table) {
    console.log('[Hotel Extension] No table found in tooltip immediately. Tooltip has', tooltipElement.children.length, 'children. Waiting for content...');

    // Use a flag to prevent both observer and timeout from injecting
    let injectionStarted = false;

    // Table hasn't loaded yet - watch for it
    const tableObserver = new MutationObserver((mutations) => {
      table = tooltipElement.querySelector('table');
      if (table && !injectionStarted) {
        console.log('[Hotel Extension] Table found via MutationObserver, injecting restaurant row...');
        injectionStarted = true;
        tableObserver.disconnect();
        injectRowIntoTable(table, bookingId);
      }
    });

    tableObserver.observe(tooltipElement, {
      childList: true,
      subtree: true
    });

    // Also try again after a short delay
    setTimeout(() => {
      if (injectionStarted) {
        console.log('[Hotel Extension] Timeout: Injection already started by observer, skipping');
        return;
      }

      table = tooltipElement.querySelector('table');
      if (table) {
        const tbody = table.querySelector('tbody');
        const existingRow = tbody?.querySelector('tr[data-hotel-extension="restaurant"]');
        if (!existingRow) {
          console.log('[Hotel Extension] Table found via timeout, injecting restaurant row...');
          injectionStarted = true;
          tableObserver.disconnect();
          injectRowIntoTable(table, bookingId);
        } else {
          console.log('[Hotel Extension] Timeout: Restaurant row already exists');
        }
      }
    }, 500);

    return;
  }

  console.log('[Hotel Extension] Table found immediately, injecting restaurant row...');
  await injectRowIntoTable(table, bookingId);
}

async function injectRowIntoTable(table, bookingId) {
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    console.log('[Hotel Extension] No tbody found in table');
    return;
  }

  // Check if restaurant row already exists to prevent duplicates
  const existingRow = tbody.querySelector('tr[data-hotel-extension="restaurant"]');
  if (existingRow) {
    console.log('[Hotel Extension] Restaurant row already exists, skipping injection');
    return;
  }

  // Fetch restaurant booking data from API - use JSON format for structured data
  const data = await fetchRestaurantBookingDataJSON(bookingId);

  console.log('[Hotel Extension] Row injection - API data received:', !!data);

  if (!data) {
    console.log('[Hotel Extension] No data returned from API for row injection');
    return;
  }

  console.log('[Hotel Extension] Row - Checking data structure:', {
    success: data.success,
    hasBookings: !!(data.bookings && data.bookings.length > 0),
    bookingsCount: data.bookings?.length || 0
  });

  // Build buttons - may have multiple buttons per night for multiple matches
  let buttonsHtml = '';

  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    console.log('[Hotel Extension] Row - Processing', booking.nights?.length || 0, 'nights');

    for (const night of booking.nights || []) {
      const dateShort = formatDateShort(night.date);
      const matchCount = night.match_count || 0;
      const hasPackage = night.has_package || false;
      const nightButtons = [];

      // Build button properties for this night (may be multiple buttons for multiple matches)
      if (hasPackage && matchCount === 0) {
        // Package without booking - RED (most critical)
        // Use server-provided deep link URL
        nightButtons.push({
          color: '#ef4444',
          icon: 'add',
          text: dateShort,
          time: 'Create',
          tooltip: 'URGENT: Package booking - Create restaurant reservation',
          url: night.deep_link
        });
      } else if (matchCount > 1) {
        // Multiple matches - show all of them
        night.resos_bookings.forEach((match, index) => {
          if (match.is_primary) {
            // Primary match - BLUE with ResOS link (direct to ResOS if available)
            nightButtons.push({
              color: '#60a5fa',
              icon: 'visibility',
              text: `${dateShort}`,
              time: match.time || null,
              tooltip: 'Primary match - View in ResOS',
              url: match.restaurant_id && match.resos_booking_id
                ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
                : match.deep_link
            });
          } else {
            // Suggested match - AMBER
            // Use server-provided deep link URL
            nightButtons.push({
              color: '#f59e0b',
              icon: 'search',
              text: `${dateShort}`,
              time: match.time || null,
              tooltip: 'Suggested match - Review booking',
              url: match.deep_link
            });
          }
        });
      } else if (matchCount === 1 && night.resos_bookings && night.resos_bookings[0]) {
        const match = night.resos_bookings[0];
        if (match.is_primary) {
          // Single primary match - BLUE with ResOS link (direct to ResOS if available)
          nightButtons.push({
            color: '#60a5fa',
            icon: 'visibility',
            text: dateShort,
            time: match.time || null,
            tooltip: 'Primary match - View in ResOS',
            url: match.restaurant_id && match.resos_booking_id
              ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
              : match.deep_link
          });
        } else {
          // Single suggested match - AMBER
          // Use server-provided deep link URL
          nightButtons.push({
            color: '#f59e0b',
            icon: 'search',
            text: dateShort,
            time: match.time || null,
            tooltip: 'Suggested match - Review booking',
            url: match.deep_link
          });
        }
      } else {
        // No matches - GREEN (create new)
        // Use server-provided deep link URL
        nightButtons.push({
          color: '#10b981',
          icon: 'add',
          text: dateShort,
          time: 'Create',
          tooltip: 'No match - Create new reservation',
          url: night.deep_link
        });
      }

      // Generate HTML for all buttons for this night
      nightButtons.forEach(btn => {
        console.log('[Hotel Extension] Row - Night', night.date, '- Color:', btn.color, '- Title:', btn.tooltip);

        buttonsHtml += `
          <a href="${btn.url}"
             class="hotel-extension-night-button"
             target="_blank"
             title="${btn.tooltip}"
             style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; margin: 2px; background-color: ${btn.color}; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; transition: opacity 0.2s;"
             onmouseover="this.style.opacity='0.8'"
             onmouseout="this.style.opacity='1'">
            <span class="material-symbols-outlined" style="font-size: 16px;">${btn.icon}</span>
            <span style="display: flex; flex-direction: column; line-height: 1.1;">
              <span style="white-space: nowrap;">${btn.text}</span>
              ${btn.time ? `<span style="font-size: 10px; opacity: 0.9; white-space: nowrap;">${btn.time}</span>` : ''}
            </span>
          </a>
        `;
      });
    }
  }

  if (!buttonsHtml) {
    console.log('[Hotel Extension] No buttons to show');
    return;
  }

  // Create the new row with 5-column format matching NewBook table structure
  const newRow = document.createElement('tr');
  const rowCount = tbody.querySelectorAll('tr').length;
  newRow.className = rowCount % 2 === 0 ? 'odd' : 'even';
  newRow.setAttribute('data-hotel-extension', 'restaurant');
  newRow.setAttribute('data-booking-id', bookingId);

  // Use 5-column format: labeler (15%) | view_value (34.5%) | spacer | labeler (15%) | view_value (34.5%)
  newRow.innerHTML = `
    <td class="labeler" style="width: 15%;">
      <label class="fieldset_label">Restaurant</label>
    </td>
    <td class="view_value" style="width: 34.5%;" colspan="4">
      ${buttonsHtml}
    </td>
  `;

  // Insert the row at the end of the table
  tbody.appendChild(newRow);
  console.log('[Hotel Extension] Restaurant row with night buttons injected');
}

// Helper function to format date as short string (e.g., "Mon 30")
function formatDateShort(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  return `${dayName} ${dayNum}`;
}

async function injectRestaurantRowIntoDialog(dialogElement, bookingId) {
  console.log('[Hotel Extension] Looking for table in dialog...');
  console.log('[Hotel Extension] Dialog element classes:', dialogElement.className);

  // Find the content area within the dialog
  const dialogContent = dialogElement.querySelector('.ui-dialog-content');

  if (!dialogContent) {
    console.log('[Hotel Extension] No dialog content found');
    return;
  }

  // Find the table in the dialog content
  let table = dialogContent.querySelector('.pretty_table.fieldset_table');

  if (!table) {
    // Try without compound class
    table = dialogContent.querySelector('.pretty_table');
  }

  if (!table) {
    // Try any table
    table = dialogContent.querySelector('table');
  }

  if (!table) {
    console.log('[Hotel Extension] No table found in dialog immediately, waiting...');

    // Use a flag to prevent both observer and timeout from injecting
    let injectionStarted = false;

    // Watch for table to appear
    const tableObserver = new MutationObserver((mutations) => {
      table = dialogContent.querySelector('table');
      if (table && !injectionStarted) {
        console.log('[Hotel Extension] Table found in dialog via observer');
        injectionStarted = true;
        tableObserver.disconnect();
        injectRowIntoTable(table, bookingId);
      }
    });

    tableObserver.observe(dialogContent, {
      childList: true,
      subtree: true
    });

    // Timeout fallback
    setTimeout(() => {
      if (injectionStarted) {
        console.log('[Hotel Extension] Timeout: Injection already started by observer, skipping');
        return;
      }

      table = dialogContent.querySelector('table');
      if (table) {
        const tbody = table.querySelector('tbody');
        const existingRow = tbody?.querySelector('tr[data-hotel-extension="restaurant"]');
        if (!existingRow) {
          console.log('[Hotel Extension] Table found in dialog via timeout');
          injectionStarted = true;
          tableObserver.disconnect();
          injectRowIntoTable(table, bookingId);
        } else {
          console.log('[Hotel Extension] Timeout: Restaurant row already exists');
        }
      } else {
        console.log('[Hotel Extension] Timeout: No table found in dialog');
      }
    }, 1000);

    return;
  }

  console.log('[Hotel Extension] Table found in dialog, injecting restaurant row...');
  await injectRowIntoTable(table, bookingId);
}

// Old button pane injection functions removed - now using table row injection instead

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

// ============================================================================
// FULL BOOKING VIEW PAGE - INJECT RESTAURANT ROW INTO TABLE
// ============================================================================

async function injectRestaurantRowIntoFullBookingView(bookingId) {
  console.log('[Hotel Extension] injectRestaurantRowIntoFullBookingView called for booking:', bookingId);

  // Check if document.body exists
  if (!document.body) {
    console.log('[Hotel Extension] document.body not available, will retry');
    // Wait for DOMContentLoaded and try again
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectRestaurantRowIntoFullBookingView(bookingId);
      });
    } else {
      // ReadyState is not 'loading' but body still doesn't exist
      // Wait a short time and try again
      setTimeout(() => {
        injectRestaurantRowIntoFullBookingView(bookingId);
      }, 100);
    }
    return;
  }

  // Don't use body dataset for processed flag - check the table directly instead
  // (NewBook is a single-page app, body persists across navigation)

  // Try to find the booking details table
  const allTables = document.querySelectorAll('.pretty_table.fieldset_table');
  console.log('[Hotel Extension] Found', allTables.length, 'matching tables');

  // Find the first visible table (or the last one if none are visible)
  let table = null;
  for (let i = 0; i < allTables.length; i++) {
    const rect = allTables[i].getBoundingClientRect();
    console.log(`[Hotel Extension] Table ${i}:`, {
      width: rect.width,
      height: rect.height,
      isVisible: rect.width > 0 && rect.height > 0
    });

    if (rect.width > 0 && rect.height > 0) {
      table = allTables[i];
      console.log(`[Hotel Extension] Using visible table ${i}`);
      break;
    }
  }

  // If no visible table found, use the last one (most recently added)
  if (!table && allTables.length > 0) {
    table = allTables[allTables.length - 1];
    console.log('[Hotel Extension] No visible table found, using last table');
  }

  console.log('[Hotel Extension] Table search result:', table ? 'FOUND' : 'NOT FOUND');

  if (!table) {
    console.log('[Hotel Extension] Table not found, setting up observer...');

    // Set up observer to wait for table to load
    const tableObserver = new MutationObserver((mutations) => {
      const foundTable = document.querySelector('.pretty_table.fieldset_table');
      if (foundTable) {
        console.log('[Hotel Extension] Table found via observer!');
        tableObserver.disconnect();
        waitForTableToBeVisible(foundTable, bookingId);
      }
    });

    tableObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout after 3 seconds
    setTimeout(() => {
      const foundTable = document.querySelector('.pretty_table.fieldset_table');
      if (foundTable) {
        tableObserver.disconnect();
        waitForTableToBeVisible(foundTable, bookingId);
      } else {
        tableObserver.disconnect();
      }
    }, 3000);

    return;
  }

  // Table found, but wait for it to be visible before injecting
  await waitForTableToBeVisible(table, bookingId);
}

// Wait for table to have non-zero dimensions (be visible) before injecting row
async function waitForTableToBeVisible(table, bookingId) {
  console.log('[Hotel Extension] Waiting for table to be visible...');

  // Check if table is already visible
  const tableRect = table.getBoundingClientRect();
  if (tableRect.width > 0 && tableRect.height > 0) {
    console.log('[Hotel Extension] Table is already visible, injecting row immediately');
    await injectRowIntoFullBookingTable(table, bookingId);
    return;
  }

  // Table exists but not visible yet - wait for it to become visible
  console.log('[Hotel Extension] Table has 0 dimensions, waiting for it to become visible...');

  let attempts = 0;
  const maxAttempts = 50; // 50 * 200ms = 10 seconds max wait

  const checkInterval = setInterval(() => {
    // Check if a NEW visible table has appeared (NewBook may create a new one)
    const allTables = document.querySelectorAll('.pretty_table.fieldset_table');
    let visibleTable = null;

    for (let i = 0; i < allTables.length; i++) {
      const rect = allTables[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        visibleTable = allTables[i];
        break;
      }
    }

    attempts++;

    if (visibleTable) {
      console.log('[Hotel Extension] Found visible table after', attempts * 200, 'ms');
      clearInterval(checkInterval);
      injectRowIntoFullBookingTable(visibleTable, bookingId);
    } else if (attempts >= maxAttempts) {
      console.log('[Hotel Extension] Timeout after', maxAttempts * 200, 'ms - no visible table found');
      console.log('[Hotel Extension] Total tables in DOM:', allTables.length);
      // Still try to inject into the original table
      clearInterval(checkInterval);
      injectRowIntoFullBookingTable(table, bookingId);
    } else if (attempts % 5 === 0) {
      // Log every second
      console.log(`[Hotel Extension] Still waiting... (${attempts * 200}ms / ${maxAttempts * 200}ms)`);
    }
  }, 200); // Check every 200ms
}

// Helper function to inject row into full booking view table (5-column format)
async function injectRowIntoFullBookingTable(table, bookingId) {
  console.log('[Hotel Extension] injectRowIntoFullBookingTable called for booking:', bookingId);

  try {

  // Ensure Material Symbols font is loaded
  if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
    document.head.appendChild(fontLink);
  }

  // Find tbody
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    console.log('[Hotel Extension] No tbody found in table');
    return;
  }

  // Check if row already exists
  const existingRow = tbody.querySelector('tr[data-hotel-extension="restaurant"]');
  if (existingRow) {
    const existingBookingId = existingRow.getAttribute('data-booking-id');
    if (existingBookingId === String(bookingId)) {
      console.log('[Hotel Extension] Restaurant row already exists for this booking, skipping');
      return;
    } else {
      console.log(`[Hotel Extension] Restaurant row exists but for different booking (${existingBookingId} vs ${bookingId}), removing old row...`);
      existingRow.remove();
    }
  }

  console.log('[Hotel Extension] Fetching booking data from API...');
  // Fetch booking data from API - use JSON context for structured data
  const data = await fetchRestaurantBookingDataJSON(bookingId);

  console.log('[Hotel Extension] API response:', data ? 'SUCCESS' : 'FAILED');
  console.log('[Hotel Extension] API data:', {
    hasData: !!data,
    success: data?.success,
    hasBookings: !!data?.bookings,
    bookingsLength: data?.bookings?.length,
    dataKeys: data ? Object.keys(data) : []
  });

  if (!data || !data.success || !data.bookings || data.bookings.length === 0) {
    console.log('[Hotel Extension] Data validation failed - No valid booking data received');
    return;
  }

  console.log('[Hotel Extension] Data validation passed, processing booking...');

  try {
    console.log('[Hotel Extension] Full data object:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('[Hotel Extension] Error stringifying data:', e.message);
    console.log('[Hotel Extension] Data object (direct):', data);
  }

  try {
    console.log('[Hotel Extension] Bookings array:', data.bookings);
  } catch (e) {
    console.log('[Hotel Extension] Error accessing bookings array:', e.message);
  }

  try {
    console.log('[Hotel Extension] First booking:', data.bookings[0]);
  } catch (e) {
    console.log('[Hotel Extension] Error accessing first booking:', e.message);
  }

  let booking;
  try {
    booking = data.bookings[0];
    console.log('[Hotel Extension] Successfully accessed booking:', booking);

    if (booking) {
      console.log('[Hotel Extension] Booking object structure:', {
        hasNights: !!booking.nights,
        nightsLength: booking.nights?.length,
        bookingKeys: Object.keys(booking)
      });
    }
  } catch (e) {
    console.log('[Hotel Extension] Error accessing booking:', e.message, e.stack);
    return;
  }

  if (!booking.nights || booking.nights.length === 0) {
    console.log('[Hotel Extension] No nights found in booking - STOPPING');
    return;
  }

  console.log('[Hotel Extension] Nights check passed, building buttons...');

  // Build buttons HTML for each night - may have multiple buttons per night
  const buttonsHtml = booking.nights.map(night => {
    const dateShort = formatDateShort(night.date);
    const matchCount = night.match_count || 0;
    const hasPackage = night.has_package || false;
    const nightButtons = [];

    if (hasPackage && matchCount === 0) {
      // Package without booking - RED (most critical)
      // Use server-provided deep link URL
      nightButtons.push({
        color: '#ef4444',
        icon: 'add',
        text: dateShort,
        time: 'Create',
        tooltip: 'URGENT: Package booking - Create restaurant reservation',
        url: night.deep_link
      });
    } else if (matchCount > 1) {
      // Multiple matches - show all of them
      night.resos_bookings.forEach((match, index) => {
        if (match.is_primary) {
          // Primary match - BLUE with ResOS link (direct to ResOS if available)
          nightButtons.push({
            color: '#60a5fa',
            icon: 'visibility',
            text: `${dateShort}`,
            time: match.time || null,
            tooltip: 'Primary match - View in ResOS',
            url: match.restaurant_id && match.resos_booking_id
              ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
              : match.deep_link
          });
        } else {
          // Suggested match - AMBER
          // Use server-provided deep link URL
          nightButtons.push({
            color: '#f59e0b',
            icon: 'search',
            text: `${dateShort}`,
            time: match.time || null,
            tooltip: 'Suggested match - Review booking',
            url: match.deep_link
          });
        }
      });
    } else if (matchCount === 1 && night.resos_bookings && night.resos_bookings[0]) {
      const match = night.resos_bookings[0];
      if (match.is_primary) {
        // Single primary match - BLUE with ResOS link (direct to ResOS if available)
        nightButtons.push({
          color: '#60a5fa',
          icon: 'visibility',
          text: dateShort,
          time: match.time || null,
          tooltip: 'Primary match - View in ResOS',
          url: match.restaurant_id && match.resos_booking_id
            ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
            : match.deep_link
        });
      } else {
        // Single suggested match - AMBER
        // Use server-provided deep link URL
        nightButtons.push({
          color: '#f59e0b',
          icon: 'search',
          text: dateShort,
          time: match.time || null,
          tooltip: 'Suggested match - Review booking',
          url: match.deep_link
        });
      }
    } else {
      // No matches - GREEN (create new)
      // Use server-provided deep link URL
      nightButtons.push({
        color: '#10b981',
        icon: 'add',
        text: dateShort,
        time: 'Create',
        tooltip: 'No match - Create new reservation',
        url: night.deep_link
      });
    }

    // Generate HTML for all buttons for this night
    return nightButtons.map(btn => `
      <a href="${btn.url}"
         target="_blank"
         title="${btn.tooltip}"
         style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; margin: 2px; background-color: ${btn.color}; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; transition: opacity 0.2s;"
         onmouseover="this.style.opacity='0.8'"
         onmouseout="this.style.opacity='1'">
        <span class="material-symbols-outlined" style="font-size: 16px;">${btn.icon}</span>
        <span style="display: flex; flex-direction: column; line-height: 1.1;">
          <span style="white-space: nowrap;">${btn.text}</span>
          ${btn.time ? `<span style="font-size: 10px; opacity: 0.9; white-space: nowrap;">${btn.time}</span>` : ''}
        </span>
      </a>
    `).join('');
  }).join('');

  if (!buttonsHtml) {
    return;
  }

  // Create the new row with 5-column format matching the table structure
  const newRow = document.createElement('tr');
  const rowCount = tbody.querySelectorAll('tr').length;
  newRow.className = rowCount % 2 === 0 ? 'odd' : 'even';
  newRow.setAttribute('data-hotel-extension', 'restaurant');
  newRow.setAttribute('data-booking-id', bookingId); // Store booking ID to detect stale rows

  // Force visibility with inline styles
  newRow.style.display = 'table-row';
  newRow.style.visibility = 'visible';
  newRow.style.height = 'auto';
  newRow.style.minHeight = '30px';

  // Use 5-column format: labeler (15%) | view_value (34.5%) | spacer | labeler (15%) | view_value (34.5%)
  newRow.innerHTML = `
    <td class="labeler" style="width: 15%;">
      <label class="fieldset_label">Restaurant</label>
    </td>
    <td class="view_value" style="width: 34.5%;">
      ${buttonsHtml}
    </td>
    <td class="spacer">&nbsp;</td>
    <td class="labeler" style="width: 15%;"></td>
    <td class="view_value" style="width: 34.5%;"></td>
  `;

  // Insert the row at the end of the table
  tbody.appendChild(newRow);
  console.log('[Hotel Extension] Restaurant row successfully inserted!');

  // Verify insertion and check parent visibility
  setTimeout(() => {
    const checkRow = tbody.querySelector('tr[data-hotel-extension="restaurant"]');
    if (checkRow) {
      console.log('[Hotel Extension] Verification: Row still exists in DOM after 1 second');
      console.log('[Hotel Extension] Row HTML:', checkRow.outerHTML.substring(0, 200));
      console.log('[Hotel Extension] Row is visible:', checkRow.offsetHeight > 0);
      console.log('[Hotel Extension] Row parent:', checkRow.parentElement);
      console.log('[Hotel Extension] Total rows in tbody:', tbody.querySelectorAll('tr').length);

      // Check which table is NOW visible (may have changed!)
      const allTablesNow = document.querySelectorAll('.pretty_table.fieldset_table');
      console.log('[Hotel Extension] Tables after injection:', allTablesNow.length, 'total');
      allTablesNow.forEach((t, idx) => {
        const tRect = t.getBoundingClientRect();
        const hasOurRow = t.querySelector('tr[data-hotel-extension="restaurant"]');
        console.log(`[Hotel Extension] Table ${idx} after injection:`, {
          width: tRect.width,
          height: tRect.height,
          isVisible: tRect.width > 0 && tRect.height > 0,
          hasOurRow: !!hasOurRow
        });
      });

      // Check all parent elements for display:none
      let parent = checkRow.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        const parentStyle = window.getComputedStyle(parent);
        const parentRect = parent.getBoundingClientRect();
        console.log(`[Hotel Extension] Parent ${depth} (${parent.tagName}):`, {
          display: parentStyle.display,
          visibility: parentStyle.visibility,
          width: parentRect.width,
          height: parentRect.height,
          className: parent.className
        });
        parent = parent.parentElement;
        depth++;
      }

      // Check computed styles
      const computedStyle = window.getComputedStyle(checkRow);
      console.log('[Hotel Extension] Row computed styles:', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        height: computedStyle.height,
        maxHeight: computedStyle.maxHeight,
        overflow: computedStyle.overflow,
        opacity: computedStyle.opacity,
        minHeight: computedStyle.minHeight
      });

      // Check bounding box
      const rect = checkRow.getBoundingClientRect();
      console.log('[Hotel Extension] Row bounding box:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      });

      // Check first cell
      const firstCell = checkRow.querySelector('td');
      if (firstCell) {
        const cellStyle = window.getComputedStyle(firstCell);
        const cellRect = firstCell.getBoundingClientRect();
        console.log('[Hotel Extension] First cell computed styles:', {
          display: cellStyle.display,
          height: cellStyle.height,
          padding: cellStyle.padding
        });
        console.log('[Hotel Extension] First cell bounding box:', {
          width: cellRect.width,
          height: cellRect.height
        });
      }

      // Check table styles
      const tableStyle = window.getComputedStyle(table);
      console.log('[Hotel Extension] Table computed styles:', {
        display: tableStyle.display,
        visibility: tableStyle.visibility,
        height: tableStyle.height,
        maxHeight: tableStyle.maxHeight,
        overflow: tableStyle.overflow
      });
    } else {
      console.log('[Hotel Extension] WARNING: Row was removed from DOM within 1 second!');
    }
  }, 1000);

  } catch (error) {
    console.error('[Hotel Extension] Fatal error in injectRowIntoFullBookingTable:', error.message);
    console.error('[Hotel Extension] Stack trace:', error.stack);
    console.error('[Hotel Extension] Full error:', error);
  }
}

// ============================================================================
// FULL BOOKING VIEW PAGE - INJECT BUTTONS INTO CONTEXT MENUS
// ============================================================================

async function injectRestaurantButtonsIntoContextMenus(bookingId) {
  console.log('[Hotel Extension] ===== CONTEXT MENU INJECTION START =====');
  console.log('[Hotel Extension] Booking ID:', bookingId);

  // Check if document.body exists
  if (!document.body) {
    console.log('[Hotel Extension] document.body not available yet, skipping context menu injection');
    return;
  }

  console.log('[Hotel Extension] Current processed ID:', document.body.dataset.hotelExtensionContextMenusProcessed);

  // Check if we've already processed context menus for this exact booking
  const alreadyProcessed = document.body.dataset.hotelExtensionContextMenusProcessed === bookingId;

  if (alreadyProcessed) {
    console.log('[Hotel Extension] Context menus already processed for this booking, skipping');
    return;
  }

  // Mark as processed for this booking ID
  document.body.dataset.hotelExtensionContextMenusProcessed = bookingId;
  console.log('[Hotel Extension] Marked as processed for booking:', bookingId);

  // Try to find the context menus
  console.log('[Hotel Extension] Looking for context menus...');

  // Find all UL elements and LI elements with context-menu in class name
  const allULs = document.querySelectorAll('ul');
  console.log('[Hotel Extension] Found', allULs.length, 'total UL elements on page');

  const allContextMenuLIs = document.querySelectorAll('li[class*="context-menu"]');
  console.log('[Hotel Extension] Found', allContextMenuLIs.length, 'LI elements with context-menu in class');

  // NewBook uses LI elements with classes like "context context-menu-header-*"
  // We need to find their parent UL elements
  let headerMenu = null;
  let footerMenu = null;

  // Look for LI with context-menu-header class and get its parent UL
  const headerLI = document.querySelector('li[class*="context-menu-header"]');
  if (headerLI) {
    headerMenu = headerLI.closest('ul');
    console.log('[Hotel Extension] Found header menu via LI parent:', headerMenu);
  }

  // Look for LI with context-menu-footer class and get its parent UL
  const footerLI = document.querySelector('li[class*="context-menu-footer"]');
  if (footerLI) {
    footerMenu = footerLI.closest('ul');
    console.log('[Hotel Extension] Found footer menu via LI parent:', footerMenu);
  }

  console.log('[Hotel Extension] Header menu found:', !!headerMenu);
  console.log('[Hotel Extension] Footer menu found:', !!footerMenu);

  if (!headerMenu && !footerMenu) {
    console.log('[Hotel Extension] Context menus not found yet, waiting for them to load...');

    // Watch for context menus to appear
    const menuObserver = new MutationObserver((mutations) => {
      // Look for LI elements with context-menu classes
      const headerLI = document.querySelector('li[class*="context-menu-header"]');
      const footerLI = document.querySelector('li[class*="context-menu-footer"]');

      if (headerLI) {
        headerMenu = headerLI.closest('ul');
      }
      if (footerLI) {
        footerMenu = footerLI.closest('ul');
      }

      if (headerMenu || footerMenu) {
        console.log('[Hotel Extension] Context menu(s) found via observer, injecting buttons...');
        menuObserver.disconnect();

        // Inject into whichever menus were found
        if (headerMenu) injectButtonIntoContextMenu(headerMenu, bookingId, 'header');
        if (footerMenu) injectButtonIntoContextMenu(footerMenu, bookingId, 'footer');
      }
    });

    menuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Set timeout to stop observing after 10 seconds if menus don't appear
    setTimeout(() => {
      menuObserver.disconnect();
      console.log('[Hotel Extension] Stopped waiting for context menus (timeout)');

      // One last check
      const finalHeaderLI = document.querySelector('li[class*="context-menu-header"]');
      const finalFooterLI = document.querySelector('li[class*="context-menu-footer"]');

      let finalHeaderMenu = null;
      let finalFooterMenu = null;

      if (finalHeaderLI) {
        finalHeaderMenu = finalHeaderLI.closest('ul');
      }
      if (finalFooterLI) {
        finalFooterMenu = finalFooterLI.closest('ul');
      }

      if (finalHeaderMenu || finalFooterMenu) {
        console.log('[Hotel Extension] Found context menus on final check!');
        if (finalHeaderMenu) injectButtonIntoContextMenu(finalHeaderMenu, bookingId, 'header');
        if (finalFooterMenu) injectButtonIntoContextMenu(finalFooterMenu, bookingId, 'footer');
      } else {
        console.log('[Hotel Extension] Still no context menus found after timeout');
      }
    }, 10000);

    return;
  }

  // Context menus found immediately, inject buttons
  console.log('[Hotel Extension] Context menus found immediately, injecting buttons...');
  if (headerMenu) {
    await injectButtonIntoContextMenu(headerMenu, bookingId, 'header');
  }
  if (footerMenu) {
    await injectButtonIntoContextMenu(footerMenu, bookingId, 'footer');
  }
}

async function injectButtonIntoContextMenu(contextMenu, bookingId, position) {
  console.log('[Hotel Extension] ===== CONTEXT MENU BUTTON INJECTION =====');
  console.log('[Hotel Extension] Position:', position, '- Booking ID:', bookingId);

  // Check if we've already injected a button here
  if (contextMenu.querySelector('.hotel-extension-restaurant-menu-item')) {
    console.log('[Hotel Extension] Button already exists in', position, 'context menu');
    return;
  }

  // Fetch restaurant booking data from API
  const data = await fetchRestaurantBookingData(bookingId);

  console.log('[Hotel Extension] Context menu - API data received:', !!data);

  if (!data) {
    console.log('[Hotel Extension] No data returned from API for context menu');
    return;
  }

  // Get settings for admin URL
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  // Determine button text based on booking status
  let buttonText = 'View Restaurant';  // Default text if no specific status
  let buttonIcon = 'fa-utensils';
  let buttonUrl = `${adminBaseUrl}/booking/${bookingId}`;
  let primaryMatch = null;

  console.log('[Hotel Extension] Context menu - Checking data structure:', {
    success: data.success,
    hasBookings: !!(data.bookings && data.bookings.length > 0),
    bookingsCount: data.bookings?.length || 0
  });

  // Check if there are matches
  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    let hasMatch = false;
    let hasSuggestedMatch = false;
    let hasNoMatch = false;

    console.log('[Hotel Extension] Context menu - Processing', booking.nights?.length || 0, 'nights');

    for (const night of booking.nights || []) {
      const matchCount = night.match_count || 0;

      console.log('[Hotel Extension] Context menu - Night', night.date, '- match_count:', matchCount);

      if (matchCount > 0 && night.resos_bookings && night.resos_bookings.length > 0) {
        const match = night.resos_bookings[0];
        console.log('[Hotel Extension] Context menu - Match found, is_primary:', match.is_primary);

        if (match.is_primary) {
          hasMatch = true;
          // Store the first primary match for ResOS link
          if (!primaryMatch) {
            primaryMatch = {
              resos_booking_id: match.resos_booking_id,
              restaurant_id: match.restaurant_id,
              booking_date: night.date
            };
            console.log('[Hotel Extension] Context menu - Primary match stored:', primaryMatch);
          }
        } else {
          hasSuggestedMatch = true;
        }
      } else {
        hasNoMatch = true;
      }
    }

    console.log('[Hotel Extension] Context menu - Match summary:', { hasMatch, hasSuggestedMatch, hasNoMatch });

    // Set button text based on priority
    if (hasNoMatch) {
      buttonText = 'Create Booking';
      buttonIcon = 'fa-plus-circle';
    } else if (hasSuggestedMatch) {
      buttonText = 'Check Booking';
      buttonIcon = 'fa-check-circle';
    } else if (hasMatch) {
      buttonText = 'View Booking';
      buttonIcon = 'fa-eye';
    }
  }

  console.log('[Hotel Extension] Context menu - Final button text:', buttonText);
  console.log('[Hotel Extension] Context menu - Will show ResOS button:', !!primaryMatch);

  // Find the "Options" menu item to insert before it
  const menuItems = contextMenu.querySelectorAll('li');
  let optionsItem = null;

  for (const item of menuItems) {
    const linkText = item.textContent.trim();
    if (linkText.includes('Options') || linkText.includes('options')) {
      optionsItem = item;
      break;
    }
  }

  // Create the admin menu item (matching NewBook's style)
  const menuItem = document.createElement('li');
  menuItem.className = 'hotel-extension-restaurant-menu-item';

  const link = document.createElement('a');
  link.href = buttonUrl;
  link.target = '_blank';
  link.innerHTML = `
    <i class="far ${buttonIcon} fa-fw" style="margin-right: 8px;"></i>
    ${buttonText}
  `;

  // Add click handler
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(buttonUrl, '_blank');
  });

  menuItem.appendChild(link);

  // Insert before Options, or at the end if Options not found
  if (optionsItem) {
    contextMenu.insertBefore(menuItem, optionsItem);
    console.log('[Hotel Extension] Inserted Restaurant button before Options in', position, 'context menu');
  } else {
    contextMenu.appendChild(menuItem);
    console.log('[Hotel Extension] Appended Restaurant button to', position, 'context menu');
  }

  // Add ResOS menu item if there's a primary match
  if (primaryMatch && primaryMatch.resos_booking_id && primaryMatch.restaurant_id && primaryMatch.booking_date) {
    const resosUrl = `https://app.resos.com/${primaryMatch.restaurant_id}/bookings/timetable/${primaryMatch.booking_date}/${primaryMatch.resos_booking_id}`;

    const resosMenuItem = document.createElement('li');
    resosMenuItem.className = 'hotel-extension-resos-menu-item';

    const resosLink = document.createElement('a');
    resosLink.href = resosUrl;
    resosLink.target = '_blank';
    resosLink.innerHTML = `
      <i class="far fa-external-link fa-fw" style="margin-right: 8px;"></i>
      View in ResOS
    `;

    resosLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(resosUrl, '_blank');
    });

    resosMenuItem.appendChild(resosLink);

    // Insert ResOS menu item after the admin menu item
    if (optionsItem) {
      contextMenu.insertBefore(resosMenuItem, optionsItem);
      console.log('[Hotel Extension] Inserted ResOS button before Options in', position, 'context menu');
    } else {
      contextMenu.appendChild(resosMenuItem);
      console.log('[Hotel Extension] Appended ResOS button to', position, 'context menu');
    }
  }
}

// ============================================================================
// DETECT CURRENT PAGE AND UPDATE STORAGE
// ============================================================================
// Detect if we're on a booking page and store the booking ID for the popup

function updateCurrentBookingId() {
  console.log('[Hotel Extension] updateCurrentBookingId called, URL:', window.location.href);

  // Check if we're on a booking_view page
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);

  if (urlMatch) {
    const bookingId = urlMatch[1];
    console.log('[Hotel Extension] Matched booking ID:', bookingId);

    // Store the current booking ID for the extension popup
    try {
      chrome.storage.local.set({ currentBookingId: bookingId });
    } catch (error) {
      // Extension may have been reloaded, ignore
    }

    // Inject Restaurant row into the booking details table
    console.log('[Hotel Extension] Calling injectRestaurantRowIntoFullBookingView...');
    injectRestaurantRowIntoFullBookingView(bookingId);

    // Trigger the extension popup for alerts/warnings after 2500ms delay
    setTimeout(() => {
      // Verify we're still on the same booking page
      const currentUrlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);
      if (!currentUrlMatch || currentUrlMatch[1] !== bookingId) {
        console.log('[Hotel Extension] Booking page changed, skipping popup');
        return;
      }

      console.log('[Hotel Extension] Still on booking page after 2.5s, triggering popup check...');
      if (chrome.runtime?.id) {
        try {
          chrome.runtime.sendMessage({
            action: 'checkBookingFromDialog',
            bookingId: bookingId
          });
          console.log('[Hotel Extension] Message sent to background script');
        } catch (error) {
          console.error('[Hotel Extension] Failed to send message to background:', error);
        }
      }
    }, 2500);
  } else {
    console.log('[Hotel Extension] Not on a booking page');
    // Not on a booking page, clear the stored ID
    try {
      chrome.storage.local.remove('currentBookingId');
    } catch (error) {
      // Extension may have been reloaded, ignore
    }
  }
}

// Update on page load
updateCurrentBookingId();

// Watch for URL changes (for single-page app navigation)
// Use setInterval polling instead of MutationObserver because NewBook uses
// history.pushState which doesn't trigger DOM mutations
let lastUrl = window.location.href;
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('[Hotel Extension] URL changed detected:', lastUrl, '->', currentUrl);
    lastUrl = currentUrl;
    updateCurrentBookingId();
  }
}, 500); // Check every 500ms

// Track if extension context is invalidated (happens when extension reloads)
let extensionInvalidated = false;

// Check if extension context is still valid
function isExtensionValid() {
  if (extensionInvalidated) return false;

  // Check if chrome.runtime is accessible
  if (!chrome.runtime?.id) {
    extensionInvalidated = true;
    console.warn('[Hotel Extension] Extension context invalidated - stopping all operations. Please refresh the page.');
    return false;
  }

  return true;
}

// Preload Material Symbols font early to prevent icons showing as text
function preloadMaterialSymbolsFont() {
  if (!document.head) {
    // Wait for document.head to be available
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', preloadMaterialSymbolsFont);
    } else {
      setTimeout(preloadMaterialSymbolsFont, 10);
    }
    return;
  }

  if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
    document.head.appendChild(fontLink);
    console.log('[Hotel Extension] Material Symbols font preloaded');
  }
}

// Call immediately
preloadMaterialSymbolsFont();

// Log for debugging
console.log('Hotel Number Four - Booking Assistant extension loaded');

// ============================================================================
// GLOBAL TABLE REPLACEMENT OBSERVER
// ============================================================================
// Single observer to watch for NewBook replacing tables after injection
// Uses current URL to determine which booking to re-inject

let reinjectionInProgress = false; // Prevent concurrent re-injections

const globalTableObserver = new MutationObserver((mutations) => {
  // Check if extension is still valid
  if (!isExtensionValid()) {
    globalTableObserver.disconnect();
    return;
  }

  // Only run if we're on a booking view page
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);
  if (!urlMatch) return;

  const currentBookingId = urlMatch[1];

  // Debounce - don't check on every single mutation
  if (reinjectionInProgress) return;

  // Check if there's a visible table WITHOUT our row (or with wrong booking ID)
  const allTables = document.querySelectorAll('.pretty_table.fieldset_table');
  let visibleTableWithoutRow = null;
  let hasCorrectRowInVisibleTable = false;

  for (const tbl of allTables) {
    const rect = tbl.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const tbody = tbl.querySelector('tbody');
    const existingRow = tbody ? tbody.querySelector('tr[data-hotel-extension="restaurant"]') : null;

    if (isVisible) {
      if (existingRow) {
        const existingBookingId = existingRow.getAttribute('data-booking-id');
        if (existingBookingId === currentBookingId) {
          hasCorrectRowInVisibleTable = true;
          break; // We have the right row in a visible table, all good!
        } else {
          // Wrong booking ID in visible table
          visibleTableWithoutRow = tbl;
        }
      } else {
        // No row in visible table
        visibleTableWithoutRow = tbl;
      }
    }
  }

  // Re-inject if we found a visible table without the correct row
  if (visibleTableWithoutRow && !hasCorrectRowInVisibleTable) {
    console.log('[Hotel Extension] Table replacement detected - re-injecting into visible table...');
    reinjectionInProgress = true;

    // Re-inject after a short delay to let NewBook finish rendering
    setTimeout(() => {
      injectRowIntoFullBookingTable(visibleTableWithoutRow, currentBookingId).finally(() => {
        reinjectionInProgress = false;
      });
    }, 100);
  }
});

// Start observing once document.body is available
function startGlobalObserver() {
  if (document.body) {
    globalTableObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('[Hotel Extension] Global table replacement observer started');
  } else {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        globalTableObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
        console.log('[Hotel Extension] Global table replacement observer started');
      });
    } else {
      // ReadyState not loading but body still doesn't exist - retry shortly
      setTimeout(startGlobalObserver, 50);
    }
  }
}

startGlobalObserver();
