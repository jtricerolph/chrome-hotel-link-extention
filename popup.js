// Popup logic for Hotel Booking Assistant

// DOM Elements
let loadingState, notOnBookingPage, errorState, errorMessage;
let apiResponse, noMatchesState, bookingIdDisplay, adminLink, retryBtn;
let resosLinkContainer, resosLink, apiResponseContent;

// Initialize popup
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
  resosLinkContainer = document.getElementById('resosLinkContainer');
  resosLink = document.getElementById('resosLink');
  apiResponseContent = document.getElementById('apiResponseContent');

  // Setup retry button
  retryBtn.addEventListener('click', loadBookingData);

  // Load booking data
  await loadBookingData();
});

// Main function to load and display booking data
async function loadBookingData() {
  try {
    showState('loading');

    // Get current booking ID and cached data from storage
    const result = await chrome.storage.local.get([
      'currentBookingId',
      'settings',
      'cachedBookingHtml',
      'cachedBookingData',
      'cachedBookingId',
      'cachedTimestamp'
    ]);

    console.log('Popup - Storage result:', {
      hasCurrentBookingId: !!result.currentBookingId,
      currentBookingId: result.currentBookingId,
      hasSettings: !!result.settings,
      hasCachedHtml: !!result.cachedBookingHtml,
      cachedBookingId: result.cachedBookingId,
      cachedTimestamp: result.cachedTimestamp,
      cacheAge: result.cachedTimestamp ? (Date.now() - result.cachedTimestamp) : null
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
    let jsonData;

    // Check if we have cached data for this booking
    const cacheMaxAge = 60000; // 60 seconds
    const isCacheValid = result.cachedBookingHtml &&
                        result.cachedBookingData &&
                        result.cachedBookingId === bookingId &&
                        result.cachedTimestamp &&
                        (Date.now() - result.cachedTimestamp) < cacheMaxAge;

    if (isCacheValid) {
      console.log('Using cached booking data');
      htmlData = result.cachedBookingHtml;
      jsonData = result.cachedBookingData;
    } else {
      console.log('Fetching fresh booking data from:', apiEndpoint);
      console.log('For booking ID:', bookingId);
      // Fetch fresh HTML and JSON from API
      htmlData = await fetchBookingData(apiEndpoint, bookingId, 'chrome-extension');
      jsonData = await fetchBookingData(apiEndpoint, bookingId, 'json');
      console.log('Received HTML data:', htmlData);
      console.log('Received JSON data:', jsonData);
    }

    // Check for primary matches in JSON data
    let primaryMatch = null;
    if (jsonData && jsonData.success && jsonData.bookings && jsonData.bookings.length > 0) {
      const booking = jsonData.bookings[0];
      for (const night of booking.nights) {
        if (night.match_count > 0 && night.resos_bookings) {
          const match = night.resos_bookings[0];
          if (match.is_primary) {
            primaryMatch = {
              resos_booking_id: match.resos_booking_id,
              restaurant_id: match.restaurant_id,
              booking_date: night.date
            };
            break;
          }
        }
      }
    }

    // Display the response
    if (htmlData && htmlData.html) {
      // Display HTML with ResOS link if available
      displayApiHtml(htmlData.html, primaryMatch);
    } else if (jsonData && jsonData.success && jsonData.bookings && jsonData.bookings.length > 0) {
      // Fallback for JSON response
      displayApiHtml('<div class="bma-result"><p>Booking found</p></div>', primaryMatch);
    } else if (htmlData && htmlData.error) {
      // API returned an error
      showError(htmlData.error);
    } else if (jsonData && jsonData.error) {
      // API returned an error
      showError(jsonData.error);
    } else {
      // No matches or unexpected response
      showNoMatches(bookingId, adminBaseUrl);
    }

  } catch (error) {
    console.error('Error loading booking data:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      type: typeof error
    });
    showError(error.message || 'Failed to connect to admin system');
  }
}

// Fetch booking data from API (for fresh data when cache is stale)
async function fetchBookingData(apiEndpoint, bookingId, context = 'chrome-extension') {
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      booking_id: parseInt(bookingId),
      context: context  // 'chrome-extension' for HTML, 'json' for match data
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Display HTML from API
function displayApiHtml(html, primaryMatch = null) {
  apiResponseContent.innerHTML = html;

  // Show/hide ResOS link based on primary match
  if (primaryMatch && primaryMatch.resos_booking_id && primaryMatch.restaurant_id && primaryMatch.booking_date) {
    const resosUrl = `https://app.resos.com/${primaryMatch.restaurant_id}/bookings/timetable/${primaryMatch.booking_date}/${primaryMatch.resos_booking_id}`;
    resosLink.href = resosUrl;
    resosLinkContainer.style.display = 'block';
  } else {
    resosLinkContainer.style.display = 'none';
  }

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
