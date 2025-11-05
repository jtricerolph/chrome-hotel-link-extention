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
      console.log('[Hotel Extension] Stored currentBookingId from popup:', bookingId);
    } catch (error) {
      console.log('[Hotel Extension] Failed to store booking ID from popup:', error.message);
    }
  }

  // Trigger the extension popup for alerts/warnings
  console.log('[Hotel Extension] Sending message to background to check booking and trigger popup if needed...');

  // Send message to background script to check this booking and open the extension popup
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

  // Inject a Restaurant row into the dialog's table for quick access
  await injectRestaurantRowIntoDialog(dialogElement, bookingId);
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

  // Check if we've already processed this tooltip
  if (tooltipElement.dataset.hotelExtensionProcessed) {
    console.log('[Hotel Extension] Tooltip already processed, skipping');
    return;
  }
  tooltipElement.dataset.hotelExtensionProcessed = 'true';

  // Store the current booking ID for the extension popup
  if (chrome.runtime?.id) {
    try {
      chrome.storage.local.set({ currentBookingId: bookingId });
      console.log('[Hotel Extension] Stored currentBookingId from tooltip:', bookingId);
    } catch (error) {
      console.log('[Hotel Extension] Failed to store booking ID from tooltip:', error.message);
    }
  }

  // Trigger the extension popup for alerts/warnings
  console.log('[Hotel Extension] Sending message to background to check booking and trigger popup if needed...');
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

  // Also inject a Restaurant row into the table for quick access
  await injectRestaurantRowIntoTooltip(tooltipElement, bookingId);
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

    console.log('[Hotel Extension] === API REQUEST DEBUG (HTML) ===');
    console.log('[Hotel Extension] API Endpoint:', apiEndpoint);
    console.log('[Hotel Extension] Booking ID:', bookingId);
    console.log('[Hotel Extension] Request body:', JSON.stringify({
      booking_id: parseInt(bookingId),
      context: 'chrome-extension'
    }));

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'json'  // Request JSON format with bookings array
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Hotel Extension] Error fetching JSON from API:', error);
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

    // Table hasn't loaded yet - watch for it
    const tableObserver = new MutationObserver((mutations) => {
      table = tooltipElement.querySelector('table');
      if (table) {
        console.log('[Hotel Extension] Table found via MutationObserver, injecting restaurant row...');
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
      table = tooltipElement.querySelector('table');
      if (table && !table.querySelector('.hotel-extension-restaurant-button')) {
        console.log('[Hotel Extension] Table found via timeout, injecting restaurant row...');
        tableObserver.disconnect();
        injectRowIntoTable(table, bookingId);
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

  // Fetch restaurant booking data from API
  const data = await fetchRestaurantBookingData(bookingId);

  console.log('[Hotel Extension] Row injection - API data received:', !!data);

  if (!data) {
    console.log('[Hotel Extension] No data returned from API for row injection');
    return;
  }

  // Get settings for admin URL
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  console.log('[Hotel Extension] Row - Checking data structure:', {
    success: data.success,
    hasBookings: !!(data.bookings && data.bookings.length > 0),
    bookingsCount: data.bookings?.length || 0
  });

  // Build buttons - one per night with color coding
  let buttonsHtml = '';

  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    console.log('[Hotel Extension] Row - Processing', booking.nights?.length || 0, 'nights');

    for (const night of booking.nights || []) {
      const nightDate = night.date;
      const matchCount = night.match_count || 0;
      const hasPackage = night.has_package || false;
      const hasMatches = matchCount > 0 && night.resos_bookings && night.resos_bookings.length > 0;

      let buttonColor, buttonText, buttonTitle, buttonUrl;

      // Determine button properties based on match status
      if (hasPackage && !hasMatches) {
        // Red: Package night without booking (CRITICAL)
        buttonColor = '#ef4444';
        buttonText = formatDateShort(nightDate);
        buttonTitle = 'Package - No Booking';
        buttonUrl = `${adminBaseUrl}/booking/${bookingId}?date=${nightDate}`;
      } else if (hasMatches) {
        const match = night.resos_bookings[0];
        const isPrimary = match.is_primary;

        if (isPrimary) {
          // Blue: Primary match
          buttonColor = '#60a5fa';
          buttonText = formatDateShort(nightDate);
          buttonTitle = 'Primary Match';
          // Link to ResOS for primary matches
          if (match.restaurant_id && match.resos_booking_id) {
            buttonUrl = `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${nightDate}/${match.resos_booking_id}`;
          } else {
            buttonUrl = `${adminBaseUrl}/booking/${bookingId}?date=${nightDate}`;
          }
        } else {
          // Amber: Suggested match
          buttonColor = '#f59e0b';
          buttonText = formatDateShort(nightDate);
          buttonTitle = 'Suggested Match';
          buttonUrl = `${adminBaseUrl}/booking/${bookingId}?date=${nightDate}`;
        }
      } else {
        // Dark green: No match (create new)
        buttonColor = '#10b981';
        buttonText = formatDateShort(nightDate);
        buttonTitle = 'Create Booking';
        buttonUrl = `${adminBaseUrl}/booking/${bookingId}?date=${nightDate}`;
      }

      console.log('[Hotel Extension] Row - Night', nightDate, '- Color:', buttonColor, '- Title:', buttonTitle);

      // Create button HTML
      buttonsHtml += `
        <a href="${buttonUrl}"
           class="hotel-extension-night-button"
           target="_blank"
           title="${buttonTitle}"
           style="display: inline-block; padding: 4px 8px; background: ${buttonColor}; color: white; text-decoration: none; border-radius: 3px; font-size: 11px; margin: 2px; font-weight: 500; white-space: nowrap;">
          ${buttonText}
        </a>
      `;
    }
  }

  if (!buttonsHtml) {
    console.log('[Hotel Extension] No buttons to show');
    return;
  }

  // Create the new row
  const newRow = document.createElement('tr');
  const rowCount = tbody.querySelectorAll('tr').length;
  newRow.className = rowCount % 2 === 0 ? 'odd' : 'even';

  newRow.innerHTML = `
    <td class="labeler" style="width: 35%;">
      <label class="fieldset_label">Restaurant</label>
    </td>
    <td class="view_value" style="width: 65%;">
      ${buttonsHtml}
    </td>
  `;

  // Insert the row at the end of the table
  tbody.appendChild(newRow);
  console.log('[Hotel Extension] Restaurant row with', booking.nights?.length || 0, 'night buttons injected');
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

    // Watch for table to appear
    const tableObserver = new MutationObserver((mutations) => {
      table = dialogContent.querySelector('table');
      if (table) {
        console.log('[Hotel Extension] Table found in dialog via observer');
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
      table = dialogContent.querySelector('table');
      if (table && !table.querySelector('.hotel-extension-night-button')) {
        console.log('[Hotel Extension] Table found in dialog via timeout');
        tableObserver.disconnect();
        injectRowIntoTable(table, bookingId);
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
  // Check if document.body exists
  if (!document.body) {
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
  let table = document.querySelector('.pretty_table.fieldset_table');

  if (!table) {

    // Set up observer to wait for table to load
    const tableObserver = new MutationObserver((mutations) => {
      const foundTable = document.querySelector('.pretty_table.fieldset_table');
      if (foundTable) {
        tableObserver.disconnect();
        injectRowIntoFullBookingTable(foundTable, bookingId);
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
        injectRowIntoFullBookingTable(foundTable, bookingId);
      } else {
        tableObserver.disconnect();
      }
    }, 3000);

    return;
  }

  await injectRowIntoFullBookingTable(table, bookingId);
}

// Helper function to inject row into full booking view table (5-column format)
async function injectRowIntoFullBookingTable(table, bookingId) {
  // Ensure Material Symbols font is loaded
  if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
    document.head.appendChild(fontLink);
  }

  // Find tbody
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    return;
  }

  // Check if row already exists
  const existingRow = tbody.querySelector('tr[data-hotel-extension="restaurant"]');
  if (existingRow) {
    return;
  }

  // Fetch booking data from API - use JSON context for structured data
  const data = await fetchRestaurantBookingDataJSON(bookingId);

  if (!data || !data.success || !data.bookings || data.bookings.length === 0) {
    return;
  }

  const booking = data.bookings[0];

  if (!booking.nights || booking.nights.length === 0) {
    return;
  }

  // Get admin base URL for links
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  // Build buttons HTML for each night - may have multiple buttons per night
  const buttonsHtml = booking.nights.map(night => {
    const dateShort = formatDateShort(night.date);
    const matchCount = night.match_count || 0;
    const hasPackage = night.has_package || false;
    const nightButtons = [];

    if (hasPackage && matchCount === 0) {
      // Package without booking - RED (most critical)
      nightButtons.push({
        color: '#ef4444',
        icon: 'add',
        text: dateShort,
        tooltip: 'URGENT: Package booking - Create restaurant reservation',
        url: `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&auto-action=create`
      });
    } else if (matchCount > 1) {
      // Multiple matches - show all of them
      night.resos_bookings.forEach((match, index) => {
        if (match.is_primary) {
          // Primary match - BLUE with ResOS link
          nightButtons.push({
            color: '#60a5fa',
            icon: 'visibility',
            text: `${dateShort}`,
            tooltip: 'Primary match - View in ResOS',
            url: match.restaurant_id && match.resos_booking_id
              ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
              : `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&resos_id=${match.resos_booking_id}&auto-action=match`
          });
        } else {
          // Suggested match - AMBER
          nightButtons.push({
            color: '#f59e0b',
            icon: 'search',
            text: `${dateShort}`,
            tooltip: 'Suggested match - Review booking',
            url: `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&resos_id=${match.resos_booking_id}&auto-action=match`
          });
        }
      });
    } else if (matchCount === 1 && night.resos_bookings && night.resos_bookings[0]) {
      const match = night.resos_bookings[0];
      if (match.is_primary) {
        // Single primary match - BLUE with ResOS link
        nightButtons.push({
          color: '#60a5fa',
          icon: 'visibility',
          text: dateShort,
          tooltip: 'Primary match - View in ResOS',
          url: match.restaurant_id && match.resos_booking_id
            ? `https://app.resos.com/${match.restaurant_id}/bookings/timetable/${night.date}/${match.resos_booking_id}`
            : `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&resos_id=${match.resos_booking_id}&auto-action=match`
        });
      } else {
        // Single suggested match - AMBER
        nightButtons.push({
          color: '#f59e0b',
          icon: 'search',
          text: dateShort,
          tooltip: 'Suggested match - Review booking',
          url: `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&resos_id=${match.resos_booking_id}&auto-action=match`
        });
      }
    } else {
      // No matches - GREEN (create new)
      nightButtons.push({
        color: '#10b981',
        icon: 'add',
        text: dateShort,
        tooltip: 'No match - Create new reservation',
        url: `${adminBaseUrl}/bookings/?booking_id=${bookingId}&date=${night.date}&auto-action=create`
      });
    }

    // Generate HTML for all buttons for this night
    return nightButtons.map(btn => `
      <a href="${btn.url}"
         target="_blank"
         title="${btn.tooltip}"
         style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; margin: 2px; background-color: ${btn.color}; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; transition: opacity 0.2s;"
         onmouseover="this.style.opacity='0.8'"
         onmouseout="this.style.opacity='1'">
        <span class="material-symbols-outlined" style="font-size: 16px;">${btn.icon}</span>
        <span>${btn.text}</span>
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
  // Check if we're on a booking_view page
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);

  if (urlMatch) {
    const bookingId = urlMatch[1];

    // Store the current booking ID for the extension popup
    try {
      chrome.storage.local.set({ currentBookingId: bookingId });
    } catch (error) {
      // Extension may have been reloaded, ignore
    }

    // Inject Restaurant row into the booking details table
    injectRestaurantRowIntoFullBookingView(bookingId);
  } else {
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
let lastUrl = window.location.href;
if (document.body) {
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      updateCurrentBookingId();
    }
  }).observe(document.body, { childList: true, subtree: true });
} else {
  // Wait for document.body to be available
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        updateCurrentBookingId();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

// Log for debugging
console.log('Hotel Number Four - Booking Assistant extension loaded');
