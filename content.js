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
  } else if (request.action === 'getCurrentBookingId') {
    // Check if there's a booking dialog currently visible
    const bookingId = getCurrentVisibleBookingId();
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

// Function to get booking ID from currently visible booking dialog/popup
function getCurrentVisibleBookingId() {
  // Check for visible jQuery UI dialogs with booking information
  const visibleDialogs = document.querySelectorAll('.ui-dialog');

  for (const dialog of visibleDialogs) {
    // Skip hidden dialogs
    if (dialog.style.display === 'none' || dialog.offsetParent === null) {
      continue;
    }

    // Look for the booking title in the dialog header
    const titleElement = dialog.querySelector('.ui-dialog-title');
    if (titleElement) {
      const titleText = titleElement.textContent;
      const bookingMatch = titleText.match(/Booking #(\d+)/);

      if (bookingMatch) {
        console.log('[Hotel Extension] getCurrentVisibleBookingId found:', bookingMatch[1]);
        return bookingMatch[1];
      }
    }
  }

  // If not found in dialogs, fall back to checking URL
  const urlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);
  if (urlMatch) {
    console.log('[Hotel Extension] getCurrentVisibleBookingId from URL:', urlMatch[1]);
    return urlMatch[1];
  }

  console.log('[Hotel Extension] getCurrentVisibleBookingId found nothing');
  return null;
}

// Note: Right-click context menu injection code was removed as it was unused dead code.
// The Chrome extension uses its own context menu system via chrome.contextMenus API
// which is configured in background.js.

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

// Enable highlighting on booking chart pages and setup click listeners
if (window.location.href.includes('newbook.cloud')) {
  addBookingHighlighting();
  setupPlannerClickListeners();
}

// ============================================================================
// PLANNER SINGLE-CLICK DETECTION
// ============================================================================

let clickTimer = null;
let clickCount = 0;

function setupPlannerClickListeners() {
  console.log('[Hotel Extension] Setting up planner click listeners...');

  // Watch for booking blocks being added to DOM
  const setupClicksForExistingBlocks = () => {
    const bookingBlocks = document.querySelectorAll('[booking_id]');
    console.log('[Hotel Extension] Found', bookingBlocks.length, 'booking blocks');

    bookingBlocks.forEach(block => {
      // Skip if already has listener
      if (block.dataset.hotelExtensionClickListenerAttached) return;

      block.addEventListener('click', handlePlannerBlockClick);
      block.dataset.hotelExtensionClickListenerAttached = 'true';
    });
  };

  // Setup listeners for existing blocks
  setupClicksForExistingBlocks();

  // Watch for new blocks being added (planner navigation, date changes, etc.)
  const clickListenerObserver = new MutationObserver(() => {
    setupClicksForExistingBlocks();
  });

  if (document.body) {
    clickListenerObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

function handlePlannerBlockClick(event) {
  const bookingBlock = event.currentTarget;
  const bookingId = bookingBlock.getAttribute('booking_id');

  if (!bookingId) return;

  clickCount++;

  if (clickCount === 1) {
    // Wait to see if this is a double-click
    clickTimer = setTimeout(() => {
      // Single click confirmed - trigger sidepanel refresh
      console.log('[Hotel Extension] Single-click detected on booking block:', bookingId);

      // Send message to background to notify sidepanel
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({
          action: 'plannerBlockClicked',
          bookingId: bookingId,
          source: 'planner-single-click'
        }).catch(err => {
          console.log('[Hotel Extension] Could not notify sidepanel (may not be open):', err.message);
        });
      }

      // Reset click count
      clickCount = 0;
    }, 250); // 250ms delay to detect double-click
  } else {
    // Double-click detected - cancel single-click action
    console.log('[Hotel Extension] Double-click detected on booking block:', bookingId, '(letting NewBook handle it)');
    clearTimeout(clickTimer);
    clickCount = 0;
  }
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

  // Get behavior settings
  const settingsResult = await chrome.storage.local.get(['settings']);
  const settings = settingsResult.settings || {};
  const enableDialogInjection = settings.enableDialogInjection !== undefined ? settings.enableDialogInjection : true;
  const autoPopupDelay = settings.autoPopupDelay || 2500;

  // Inject a Restaurant row into the dialog's table for quick access (if enabled)
  if (enableDialogInjection) {
    await injectRestaurantRowIntoDialog(dialogElement, bookingId);
  } else {
    console.log('[Hotel Extension] Dialog injection disabled in settings, skipping');
  }

  // Trigger the extension popup for alerts/warnings after configured delay
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

    console.log(`[Hotel Extension] Dialog remained visible for ${autoPopupDelay}ms, triggering popup check...`);
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
  }, autoPopupDelay);
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

  // Get behavior settings
  const settingsResult = await chrome.storage.local.get(['settings']);
  const settings = settingsResult.settings || {};
  const enablePlannerHoverPopup = settings.enablePlannerHover !== undefined ? settings.enablePlannerHover : true;
  const hoverDelay = settings.hoverDelay || 500;
  const autoPopupDelay = settings.autoPopupDelay || 2500;

  // Add configured delay before processing API call - only process if tooltip is still visible
  // This prevents API bombardment when quickly moving mouse across the planner
  // Button injection always happens; the setting only controls whether popup triggers
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

    console.log(`[Hotel Extension] Tooltip remained visible for ${hoverDelay}ms, processing booking:`, bookingId);

    // Store the current booking ID for the extension popup and notify sidepanel
    if (chrome.runtime?.id) {
      try {
        // Get the previous booking ID to check if it changed
        const previousResult = await chrome.storage.local.get(['currentBookingId']);
        const previousBookingId = previousResult.currentBookingId;

        // Store the new booking ID
        chrome.storage.local.set({ currentBookingId: bookingId });
        console.log('[Hotel Extension] Stored currentBookingId from tooltip:', bookingId);

        // Notify sidepanel about tooltip detection
        console.log('[Hotel Extension] Tooltip detected for booking:', bookingId);
        chrome.runtime.sendMessage({
          action: 'tooltipDetected',
          bookingId: bookingId,
          source: 'easyTooltip'
        }).catch(err => {
          console.log('[Hotel Extension] Could not notify sidepanel (may not be open):', err.message);
        });

        // If booking changed, also send bookingUpdated for other listeners
        if (previousBookingId !== bookingId) {
          console.log('[Hotel Extension] Booking changed from', previousBookingId, 'to', bookingId);
          chrome.runtime.sendMessage({
            action: 'bookingUpdated',
            bookingId: bookingId,
            previousBookingId: previousBookingId
          }).catch(err => {
            console.log('[Hotel Extension] Could not notify sidepanel (may not be open):', err.message);
          });
        }
      } catch (error) {
        console.log('[Hotel Extension] Failed to store booking ID from tooltip:', error.message);
      }
    }

    // Watch for tooltip removal to notify sidepanel
    watchTooltipRemoval(tooltipElement, bookingId);

    // Inject a Restaurant row into the table for quick access
    await injectRestaurantRowIntoTooltip(tooltipElement, bookingId);

    // Trigger the extension popup for alerts/warnings with configured delay (if enabled)
    // This prevents popup spam when quickly scanning bookings
    if (enablePlannerHoverPopup) {
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

        console.log(`[Hotel Extension] Tooltip remained visible for ${autoPopupDelay}ms, triggering popup check...`);
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
      }, autoPopupDelay - hoverDelay); // Additional delay (autoPopupDelay total from initial hover)
    } else {
      console.log('[Hotel Extension] Planner hover auto-popup disabled in settings, skipping popup trigger');
    }
  }, hoverDelay); // Configured hover delay for API call
}

// Watch for tooltip removal and notify sidepanel to refresh
function watchTooltipRemoval(tooltipElement, bookingId) {
  console.log('[Hotel Extension] Watching tooltip for removal:', bookingId);

  // Create an observer to watch for the tooltip being removed from DOM
  const observer = new MutationObserver((mutations) => {
    // Check if tooltip still exists in DOM
    if (!document.body.contains(tooltipElement)) {
      console.log('[Hotel Extension] Tooltip removed from DOM, notifying sidepanel');

      // Notify sidepanel that tooltip was closed
      if (chrome.runtime?.id) {
        try {
          chrome.runtime.sendMessage({
            action: 'tooltipClosed',
            bookingId: bookingId
          });

          // Clear the stored booking ID since tooltip is gone
          chrome.storage.local.remove('currentBookingId');
          console.log('[Hotel Extension] Cleared currentBookingId and notified sidepanel');
        } catch (error) {
          console.error('[Hotel Extension] Failed to send tooltipClosed message:', error);
        }
      }

      // Stop observing
      observer.disconnect();
    }
  });

  // Observe the tooltip's parent for child removals
  if (tooltipElement.parentElement) {
    observer.observe(tooltipElement.parentElement, {
      childList: true,
      subtree: false
    });
  }

  // Also observe document.body for tooltip removal
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
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
    const apiBase = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1';
    const apiEndpoint = `${apiBase}/bookings/match`;

    // Prepare authentication header
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.wpUsername && settings.wpAppPassword) {
      // Create Basic Auth header (remove spaces from Application Password)
      const password = settings.wpAppPassword.replace(/\s+/g, '');
      const credentials = btoa(`${settings.wpUsername}:${password}`);
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
    const apiBase = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1';
    const apiEndpoint = `${apiBase}/bookings/match`;

    // Prepare authentication header
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.wpUsername && settings.wpAppPassword) {
      // Create Basic Auth header (remove spaces from Application Password)
      const password = settings.wpAppPassword.replace(/\s+/g, '');
      const credentials = btoa(`${settings.wpUsername}:${password}`);
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
// DETECT CURRENT PAGE AND UPDATE STORAGE
// ============================================================================
// Detect if we're on a booking page and store the booking ID for the popup

async function updateCurrentBookingId() {
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

    // Get behavior settings for auto-popup delay
    const settingsResult = await chrome.storage.local.get(['settings']);
    const settings = settingsResult.settings || {};
    const autoPopupDelay = settings.autoPopupDelay || 2500;

    // Trigger the extension popup for alerts/warnings after configured delay
    setTimeout(() => {
      // Verify we're still on the same booking page
      const currentUrlMatch = window.location.href.match(/\/bookings_view\/(\d+)/);
      if (!currentUrlMatch || currentUrlMatch[1] !== bookingId) {
        console.log('[Hotel Extension] Booking page changed, skipping popup');
        return;
      }

      console.log(`[Hotel Extension] Still on booking page after ${autoPopupDelay}ms, triggering popup check...`);
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
    }, autoPopupDelay);
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
