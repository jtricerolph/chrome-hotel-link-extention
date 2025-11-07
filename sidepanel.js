// Sidepanel logic for Hotel Booking Assistant

// DOM Elements
let loadingState, notOnBookingPage, errorState, errorMessage;
let apiResponse, noMatchesState, bookingIdDisplay, adminLink, retryBtn;
let apiResponseContent;

// Initialize sidepanel
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  loadingState = document.getElementById('loadingState');
  notOnBookingPage = document.getElementById('notOnBookingPage');
  errorState = document.getElementById('errorState');
  errorMessage = document.getElementById('errorMessage');
  apiResponse = document.getElementById('apiResponse');
  noMatchesState = document.getElementById('noMatchesState');
  bookingIdDisplay = document.getElementById('bookingIdDisplay');
  adminLink = document.getElementById('adminLink');
  retryBtn = document.getElementById('retryBtn');
  apiResponseContent = document.getElementById('apiResponseContent');

  // Setup retry button
  retryBtn.addEventListener('click', loadBookingData);

  // Load booking data
  await loadBookingData();

  // Listen for booking updates from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'bookingUpdated') {
      console.log('[Sidepanel] Booking updated, reloading data...');
      loadBookingData();
    }
  });
});

// Main function to load and display booking data
async function loadBookingData() {
  try {
    showState('loading');

    // Get current booking ID and cached data from storage
    const result = await chrome.storage.local.get([
      'currentBookingId',
      'settings',
      'cachedSidepanelHtml',
      'cachedSidepanelData',
      'cachedSidepanelBookingId',
      'cachedSidepanelTimestamp'
    ]);

    console.log('[Sidepanel] Storage result:', {
      hasCurrentBookingId: !!result.currentBookingId,
      currentBookingId: result.currentBookingId,
      hasSettings: !!result.settings,
      hasCachedHtml: !!result.cachedSidepanelHtml,
      cachedBookingId: result.cachedSidepanelBookingId,
      cachedTimestamp: result.cachedSidepanelTimestamp,
      cacheAge: result.cachedSidepanelTimestamp ? (Date.now() - result.cachedSidepanelTimestamp) : null
    });

    if (!result.currentBookingId) {
      showState('notOnBookingPage');
      return;
    }

    const bookingId = result.currentBookingId;
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match';
    const adminBaseUrl = settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';

    let htmlData;

    // Check if we have cached HTML data for this booking
    const cacheMaxAge = 60000; // 60 seconds
    const isCacheValid = result.cachedSidepanelHtml &&
                        result.cachedSidepanelBookingId === bookingId &&
                        result.cachedSidepanelTimestamp &&
                        (Date.now() - result.cachedSidepanelTimestamp) < cacheMaxAge;

    if (isCacheValid) {
      console.log('[Sidepanel] Using cached booking data');
      htmlData = result.cachedSidepanelHtml;
    } else {
      console.log('[Sidepanel] Fetching fresh booking data from:', apiEndpoint);
      console.log('[Sidepanel] For booking ID:', bookingId);
      // Fetch fresh HTML from API (uses chrome-sidepanel context)
      htmlData = await fetchBookingData(apiEndpoint, bookingId, 'chrome-sidepanel');
      console.log('[Sidepanel] Received HTML data:', htmlData);

      // Cache the response
      if (htmlData) {
        await chrome.storage.local.set({
          cachedSidepanelHtml: htmlData,
          cachedSidepanelBookingId: bookingId,
          cachedSidepanelTimestamp: Date.now()
        });
      }
    }

    // Display the response (HTML with sidepanel-optimized layout)
    if (htmlData && htmlData.html) {
      displayApiHtml(htmlData.html);
    } else if (htmlData && htmlData.success) {
      // Fallback for successful JSON response without HTML
      displayApiHtml('<div class="bma-sidepanel-result"><p>Booking found</p></div>');
    } else if (htmlData && htmlData.error) {
      // API returned an error
      showError(htmlData.error);
    } else {
      // No matches or unexpected response
      showNoMatches(bookingId, adminBaseUrl);
    }

  } catch (error) {
    console.error('[Sidepanel] Error loading booking data:', error);
    console.error('[Sidepanel] Error stack:', error.stack);
    console.error('[Sidepanel] Error details:', {
      message: error.message,
      name: error.name,
      type: typeof error
    });
    showError(error.message || 'Failed to connect to admin system');
  }
}

// Fetch booking data from API (with chrome-sidepanel context)
async function fetchBookingData(apiEndpoint, bookingId, context = 'chrome-sidepanel') {
  // Get settings for authentication
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  // Prepare authentication header
  const headers = {
    'Content-Type': 'application/json'
  };

  if (settings.wpUsername && settings.wpAppPassword) {
    // Create Basic Auth header (remove spaces from Application Password)
    const password = settings.wpAppPassword.replace(/\s+/g, '');
    const credentials = btoa(`${settings.wpUsername}:${password}`);
    headers['Authorization'] = `Basic ${credentials}`;
    console.log('[Sidepanel] Using Basic Authentication with username:', settings.wpUsername);
  } else {
    console.warn('[Sidepanel] No authentication credentials configured');
  }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      booking_id: parseInt(bookingId),
      context: context  // 'chrome-sidepanel' for sidepanel HTML layout
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Display HTML from API (sidepanel-optimized layout)
function displayApiHtml(html) {
  apiResponseContent.innerHTML = html;
  showState('apiResponse');
}

// Show no matches state
function showNoMatches(bookingId, adminBaseUrl) {
  bookingIdDisplay.textContent = bookingId;
  adminLink.href = `${adminBaseUrl}/${bookingId}`;
  showState('noMatches');
}

// Show error state
function showError(message) {
  errorMessage.textContent = message;
  showState('error');
}

// Show specific state panel
function showState(state) {
  // Hide all states
  loadingState.style.display = 'none';
  notOnBookingPage.style.display = 'none';
  errorState.style.display = 'none';
  apiResponse.style.display = 'none';
  noMatchesState.style.display = 'none';

  // Show requested state
  switch (state) {
    case 'loading':
      loadingState.style.display = 'block';
      break;
    case 'notOnBookingPage':
      notOnBookingPage.style.display = 'block';
      break;
    case 'error':
      errorState.style.display = 'block';
      break;
    case 'apiResponse':
      apiResponse.style.display = 'block';
      break;
    case 'noMatches':
      noMatchesState.style.display = 'block';
      break;
  }
}
