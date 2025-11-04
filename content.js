// Content script for NewBook pages
// This script runs on all NewBook pages and enables future features like right-click menus

console.log('===============================================');
console.log('🏨 Hotel Number Four Extension LOADED');
console.log('===============================================');
console.log('[Hotel Extension] Version: 1.0');
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
    console.log('[Hotel Extension] Checking for existing dialogs...');

    // Check for jQuery UI dialogs
    const existingDialogs = document.querySelectorAll('.ui-dialog');
    console.log('[Hotel Extension] Found', existingDialogs.length, 'existing ui-dialog elements');
    existingDialogs.forEach(dialog => {
      // Only handle visible dialogs
      if (dialog.style.display !== 'none') {
        console.log('[Hotel Extension] Found visible ui-dialog, processing...');
        handleBookingDialog(dialog);
      }
    });

    // Check for easyToolTip popups
    const existingTooltips = document.querySelectorAll('.easyToolTip');
    console.log('[Hotel Extension] Found', existingTooltips.length, 'existing easyToolTip elements');
    existingTooltips.forEach(tooltip => {
      if (tooltip.style.display !== 'none') {
        console.log('[Hotel Extension] Found visible easyToolTip, processing...');
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
          console.log('[Hotel Extension] Node added:', node.className);

          // Format 1: Full jQuery UI dialog
          if (node.classList && node.classList.contains('ui-dialog')) {
            console.log('[Hotel Extension] Found ui-dialog via mutation');
            handleBookingDialog(node);
          }

          // Format 2: EasyToolTip compact popup
          if (node.classList && node.classList.contains('easyToolTip')) {
            console.log('[Hotel Extension] Found easyToolTip via mutation');
            handleEasyToolTipBooking(node);
          }

          // Also check children in case elements are nested
          if (node.querySelectorAll) {
            const dialogs = node.querySelectorAll('.ui-dialog');
            if (dialogs.length > 0) {
              console.log('[Hotel Extension] Found', dialogs.length, 'ui-dialog children');
            }
            dialogs.forEach(dialog => handleBookingDialog(dialog));

            const tooltips = node.querySelectorAll('.easyToolTip');
            if (tooltips.length > 0) {
              console.log('[Hotel Extension] Found', tooltips.length, 'easyToolTip children');
            }
            tooltips.forEach(tooltip => handleEasyToolTipBooking(tooltip));
          }
        }
      });

      // Also watch for attribute changes (e.g., style changes that show/hide dialogs)
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.classList && target.classList.contains('ui-dialog')) {
          if (target.style.display !== 'none') {
            console.log('[Hotel Extension] ui-dialog became visible');
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
  console.log('[Hotel Extension] ✓ Detected booking popup for booking ID:', bookingId);

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

  // Also inject a Restaurant button into the dialog's button pane for quick access
  await injectRestaurantButtonIntoDialog(dialogElement, bookingId);
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

async function fetchRestaurantBookingData(bookingId) {
  try {
    // Get settings
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
        context: 'chrome-extension'
      })
    });

    if (!response.ok) {
      console.warn('API returned error:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching from API:', error);
    return null;
  }
}

async function injectRestaurantRowIntoTooltip(tooltipElement, bookingId) {
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
    console.log('[Hotel Extension] No table found in tooltip, waiting for content...');

    // Table hasn't loaded yet - watch for it
    const tableObserver = new MutationObserver((mutations) => {
      table = tooltipElement.querySelector('table');
      if (table) {
        console.log('[Hotel Extension] Table found, injecting restaurant row...');
        tableObserver.disconnect();
        injectRowIntoTable(table, bookingId);
      }
    });

    tableObserver.observe(tooltipElement, {
      childList: true,
      subtree: true
    });

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

  if (!data) {
    console.log('[Hotel Extension] No data returned from API for row injection');
    return;
  }

  // Get settings for admin URL
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  // Determine button text and URL based on booking status
  let buttonText = 'View Restaurant Bookings';
  let buttonUrl = `${adminBaseUrl}/booking/${bookingId}`;
  let buttonClass = '';

  // Check if there are matches
  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    let hasMatch = false;
    let hasSuggestedMatch = false;
    let hasNoMatch = false;

    for (const night of booking.nights) {
      const matchCount = night.match_count || 0;

      if (matchCount > 0 && night.resos_bookings) {
        const match = night.resos_bookings[0];
        if (match.is_primary) {
          hasMatch = true;
        } else {
          hasSuggestedMatch = true;
        }
      } else {
        hasNoMatch = true;
      }
    }

    // Priority: no match > suggested > matched
    if (hasNoMatch) {
      buttonText = 'Create Booking';
      buttonClass = 'create';
    } else if (hasSuggestedMatch) {
      buttonText = 'Check/Update Booking';
      buttonClass = 'update';
    } else if (hasMatch) {
      buttonText = 'View Restaurant Bookings';
      buttonClass = 'view';
    }
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
      <a href="${buttonUrl}" class="hotel-extension-restaurant-button ${buttonClass}" target="_blank" style="display: inline-block; padding: 6px 12px; background: #4a90e2; color: white; text-decoration: none; border-radius: 4px; font-size: 13px;">
        <i class="far fa-utensils fa-fw" style="vertical-align: middle; font-size: 14px; margin-right: 4px;"></i>
        ${buttonText}
      </a>
    </td>
  `;

  // Insert the row at the end of the table
  tbody.appendChild(newRow);
  console.log('[Hotel Extension] Restaurant row injected into tooltip table');
}

async function injectRestaurantButtonIntoDialog(dialogElement, bookingId) {
  // Find the button pane in the dialog
  let buttonPane = dialogElement.querySelector('.ui-dialog-buttonpane .ui-dialog-buttonset');

  if (!buttonPane) {
    console.log('[Hotel Extension] No button pane found yet, waiting for it to load...');

    // Button pane hasn't loaded yet - watch for it
    const buttonPaneObserver = new MutationObserver((mutations) => {
      buttonPane = dialogElement.querySelector('.ui-dialog-buttonpane .ui-dialog-buttonset');
      if (buttonPane) {
        console.log('[Hotel Extension] Button pane loaded, injecting restaurant button...');
        buttonPaneObserver.disconnect();

        // Now inject the button
        injectButtonIntoPane(buttonPane, bookingId);
      }
    });

    buttonPaneObserver.observe(dialogElement, {
      childList: true,
      subtree: true
    });

    return;
  }

  console.log('[Hotel Extension] Button pane already loaded, injecting restaurant button...');
  await injectButtonIntoPane(buttonPane, bookingId);
}

async function injectButtonIntoPane(buttonPane, bookingId) {
  // Fetch restaurant booking data from API
  const data = await fetchRestaurantBookingData(bookingId);

  if (!data) {
    console.log('[Hotel Extension] No data returned from API');
    return;
  }

  // Get settings for admin URL
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  // Determine button text based on booking status
  let buttonText = 'Restaurant';
  let buttonIcon = 'fa-utensils';
  let buttonUrl = `${adminBaseUrl}/booking/${bookingId}`;

  // Check if there are matches
  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    let hasMatch = false;
    let hasSuggestedMatch = false;
    let hasNoMatch = false;

    for (const night of booking.nights) {
      const matchCount = night.match_count || 0;

      if (matchCount > 0 && night.resos_bookings) {
        const match = night.resos_bookings[0];
        if (match.is_primary) {
          hasMatch = true;
        } else {
          hasSuggestedMatch = true;
        }
      } else {
        hasNoMatch = true;
      }
    }

    // Set button text based on priority
    if (hasNoMatch) {
      buttonText = 'Create Booking';
    } else if (hasSuggestedMatch) {
      buttonText = 'Check Booking';
    } else if (hasMatch) {
      buttonText = 'View Booking';
    }
  }

  // Create the button (matching NewBook's button style)
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-button ui-corner-all ui-widget hotel-extension-restaurant-btn';
  button.innerHTML = `
    <span class="ui-button-icon ui-icon ${buttonIcon}"></span>
    <span class="ui-button-icon-space"> </span>
    ${buttonText}
  `;

  // Add click handler to open URL in new tab
  button.addEventListener('click', () => {
    window.open(buttonUrl, '_blank');
  });

  // Insert button before the Close button (which is typically last)
  const closeButton = buttonPane.querySelector('button:last-child');
  if (closeButton) {
    buttonPane.insertBefore(button, closeButton);
  } else {
    buttonPane.appendChild(button);
  }

  console.log('[Hotel Extension] Restaurant button injected into dialog');
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

// ============================================================================
// FULL BOOKING VIEW PAGE - INJECT BUTTONS INTO CONTEXT MENUS
// ============================================================================

async function injectRestaurantButtonsIntoContextMenus(bookingId) {
  console.log('[Hotel Extension] Injecting Restaurant buttons into context menus for booking:', bookingId);

  // Check if we've already processed this page
  if (document.body.dataset.hotelExtensionContextMenusProcessed === bookingId) {
    console.log('[Hotel Extension] Context menus already processed for this booking, skipping');
    return;
  }

  // Mark as processed for this booking ID
  document.body.dataset.hotelExtensionContextMenusProcessed = bookingId;

  // Try to find the context menus
  let headerMenu = document.getElementById('context-menu-header');
  let footerMenu = document.getElementById('context-menu-footer');

  if (!headerMenu && !footerMenu) {
    console.log('[Hotel Extension] Context menus not found yet, waiting for them to load...');

    // Watch for context menus to appear
    const menuObserver = new MutationObserver((mutations) => {
      headerMenu = document.getElementById('context-menu-header');
      footerMenu = document.getElementById('context-menu-footer');

      if (headerMenu || footerMenu) {
        console.log('[Hotel Extension] Context menu(s) found, injecting buttons...');
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
    }, 10000);

    return;
  }

  // Context menus found immediately, inject buttons
  if (headerMenu) {
    await injectButtonIntoContextMenu(headerMenu, bookingId, 'header');
  }
  if (footerMenu) {
    await injectButtonIntoContextMenu(footerMenu, bookingId, 'footer');
  }
}

async function injectButtonIntoContextMenu(contextMenu, bookingId, position) {
  console.log('[Hotel Extension] Injecting button into', position, 'context menu');

  // Check if we've already injected a button here
  if (contextMenu.querySelector('.hotel-extension-restaurant-menu-item')) {
    console.log('[Hotel Extension] Button already exists in', position, 'context menu');
    return;
  }

  // Fetch restaurant booking data from API
  const data = await fetchRestaurantBookingData(bookingId);

  if (!data) {
    console.log('[Hotel Extension] No data returned from API for context menu');
    return;
  }

  // Get settings for admin URL
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

  // Determine button text based on booking status
  let buttonText = 'Restaurant';
  let buttonIcon = 'fa-utensils';
  let buttonUrl = `${adminBaseUrl}/booking/${bookingId}`;

  // Check if there are matches
  if (data.success && data.bookings && data.bookings.length > 0) {
    const booking = data.bookings[0];
    let hasMatch = false;
    let hasSuggestedMatch = false;
    let hasNoMatch = false;

    for (const night of booking.nights) {
      const matchCount = night.match_count || 0;

      if (matchCount > 0 && night.resos_bookings) {
        const match = night.resos_bookings[0];
        if (match.is_primary) {
          hasMatch = true;
        } else {
          hasSuggestedMatch = true;
        }
      } else {
        hasNoMatch = true;
      }
    }

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

  // Create the menu item (matching NewBook's style)
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

  // Insert before Options, or at the end if Options not found
  if (optionsItem) {
    contextMenu.insertBefore(menuItem, optionsItem);
    console.log('[Hotel Extension] Inserted Restaurant button before Options in', position, 'context menu');
  } else {
    contextMenu.appendChild(menuItem);
    console.log('[Hotel Extension] Appended Restaurant button to', position, 'context menu');
  }
}

// ============================================================================
// DETECT CURRENT PAGE AND UPDATE STORAGE
// ============================================================================
// Detect if we're on a booking page and store the booking ID for the popup

function updateCurrentBookingId() {
  console.log('[Hotel Extension] Checking current page URL:', window.location.href);

  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    console.log('[Hotel Extension] Extension context invalidated, skipping update');
    return;
  }

  // Check if we're on a booking_view page
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);

  if (urlMatch) {
    const bookingId = urlMatch[1];
    console.log('[Hotel Extension] ✓ On booking page, ID:', bookingId);

    // Store the current booking ID for the extension popup
    try {
      chrome.storage.local.set({ currentBookingId: bookingId });
      console.log('[Hotel Extension] Stored currentBookingId:', bookingId);
    } catch (error) {
      console.log('[Hotel Extension] Failed to store booking ID (extension may have been reloaded):', error.message);
    }

    // Also inject Restaurant buttons into context menus on the full booking view page
    injectRestaurantButtonsIntoContextMenus(bookingId);
  } else {
    // Not on a booking page, clear the stored ID
    console.log('[Hotel Extension] Not on a booking page');
    try {
      chrome.storage.local.remove('currentBookingId');
      console.log('[Hotel Extension] Cleared currentBookingId');
    } catch (error) {
      console.log('[Hotel Extension] Failed to clear booking ID (extension may have been reloaded):', error.message);
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
      console.log('[Hotel Extension] URL changed to:', currentUrl);
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
        console.log('[Hotel Extension] URL changed to:', currentUrl);
        updateCurrentBookingId();
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

// Log for debugging
console.log('Hotel Number Four - Booking Assistant extension loaded');
