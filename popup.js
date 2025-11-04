// Popup logic for Hotel Booking Assistant

// DOM Elements
let loadingState, notOnBookingPage, errorState, errorMessage;
let apiResponse, noMatchesState, bookingIdDisplay, adminLink, retryBtn;

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

  // Setup retry button
  retryBtn.addEventListener('click', loadBookingData);

  // Load booking data
  await loadBookingData();
});

// Main function to load and display booking data
async function loadBookingData() {
  try {
    showState('loading');

    // Get current booking ID from storage
    const result = await chrome.storage.local.get(['currentBookingId', 'settings']);

    if (!result.currentBookingId) {
      showState('notOnBookingPage');
      return;
    }

    const bookingId = result.currentBookingId;
    const settings = result.settings || {};
    const apiEndpoint = settings.apiEndpoint || 'https://admin.hotelnumberfour.com/api/check-booking';
    const adminBaseUrl = settings.adminBaseUrl || 'https://admin.hotelnumberfour.com/booking';

    // Fetch data from admin API
    const data = await fetchBookingData(apiEndpoint, bookingId);

    // Display the response
    if (typeof data === 'string') {
      // API returned HTML directly (chrome-extension context)
      displayApiHtml(data);
    } else if (data.html) {
      // API returned HTML in JSON
      displayApiHtml(data.html);
    } else if (data.code && data.message) {
      // WordPress API error response
      showError(data.message);
    } else if (data.success === false || data.error) {
      // API returned an error
      showError(data.error || data.message || 'API Error');
    } else if (data.bookings_found === 0) {
      // No bookings found
      showNoMatches(bookingId, adminBaseUrl);
    } else {
      // Unexpected response format
      showError('Unexpected response format from API');
    }

  } catch (error) {
    console.error('Error loading booking data:', error);
    showError(error.message || 'Failed to connect to admin system');
  }
}

// Fetch booking data from admin API
async function fetchBookingData(apiEndpoint, bookingId) {
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/html'
    },
    body: JSON.stringify({
      booking_id: parseInt(bookingId),
      context: 'chrome-extension'
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  } else if (contentType && contentType.includes('text/html')) {
    const html = await response.text();
    return { html: html };
  } else {
    throw new Error('Unsupported response format from API');
  }
}

// Display HTML from API
function displayApiHtml(html) {
  apiResponse.innerHTML = html;
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
