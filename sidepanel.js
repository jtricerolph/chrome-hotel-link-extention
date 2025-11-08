// Sidepanel Logic for Hotel Booking Assistant
// 3-Tab Interface: Summary | Restaurant | Checks

// ============================================
// STATE MANAGEMENT
// ============================================

const STATE = {
  currentTab: 'summary',
  currentBookingId: null,
  settings: {},

  // Refresh intervals
  summaryRefreshInterval: null,
  inactivityTimeout: null,

  // Badge counts
  badges: {
    summary: 0,
    restaurant: 0,
    checks: 0
  }
};

// ============================================
// DOM ELEMENTS
// ============================================

let tabButtons = {};
let tabContents = {};
let tabBadges = {};

// Summary Tab Elements
let summaryLoading, summaryError, summaryErrorMessage, summaryRetryBtn, summaryContent;

// Restaurant Tab Elements
let restaurantLoading, restaurantNotOnBooking, restaurantError, restaurantErrorMessage;
let restaurantRetryBtn, restaurantContent, restaurantNoMatches;
let restaurantBookingIdDisplay, restaurantAdminLink;

// Checks Tab Elements
let checksLoading, checksNoBooking, checksError, checksErrorMessage;
let checksRetryBtn, checksContent;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Sidepanel] Initializing 3-tab interface...');

  // Get DOM elements for tabs
  tabButtons = {
    summary: document.getElementById('summaryTab'),
    restaurant: document.getElementById('restaurantTab'),
    checks: document.getElementById('checksTab')
  };

  tabContents = {
    summary: document.getElementById('summaryTabContent'),
    restaurant: document.getElementById('restaurantTabContent'),
    checks: document.getElementById('checksTabContent')
  };

  tabBadges = {
    summary: document.getElementById('summaryBadge'),
    restaurant: document.getElementById('restaurantBadge'),
    checks: document.getElementById('checksBadge')
  };

  // Summary tab elements
  summaryLoading = document.getElementById('summaryLoading');
  summaryError = document.getElementById('summaryError');
  summaryErrorMessage = document.getElementById('summaryErrorMessage');
  summaryRetryBtn = document.getElementById('summaryRetryBtn');
  summaryContent = document.getElementById('summaryContent');

  // Restaurant tab elements
  restaurantLoading = document.getElementById('restaurantLoading');
  restaurantNotOnBooking = document.getElementById('restaurantNotOnBooking');
  restaurantError = document.getElementById('restaurantError');
  restaurantErrorMessage = document.getElementById('restaurantErrorMessage');
  restaurantRetryBtn = document.getElementById('restaurantRetryBtn');
  restaurantContent = document.getElementById('restaurantContent');
  restaurantNoMatches = document.getElementById('restaurantNoMatches');
  restaurantBookingIdDisplay = document.getElementById('restaurantBookingIdDisplay');
  restaurantAdminLink = document.getElementById('restaurantAdminLink');

  // Checks tab elements
  checksLoading = document.getElementById('checksLoading');
  checksNoBooking = document.getElementById('checksNoBooking');
  checksError = document.getElementById('checksError');
  checksErrorMessage = document.getElementById('checksErrorMessage');
  checksRetryBtn = document.getElementById('checksRetryBtn');
  checksContent = document.getElementById('checksContent');

  // Setup tab click handlers
  Object.keys(tabButtons).forEach(tabName => {
    tabButtons[tabName].addEventListener('click', () => switchTab(tabName));
  });

  // Setup retry buttons
  summaryRetryBtn.addEventListener('click', () => loadSummaryTab());
  restaurantRetryBtn.addEventListener('click', () => loadRestaurantTab());
  checksRetryBtn.addEventListener('click', () => loadChecksTab());

  // Load settings
  const result = await chrome.storage.local.get(['settings', 'currentBookingId']);
  STATE.settings = result.settings || {};
  STATE.currentBookingId = result.currentBookingId || null;

  console.log('[Sidepanel] Initial state:', {
    currentBookingId: STATE.currentBookingId,
    hasSettings: !!STATE.settings.apiEndpoint
  });

  // Start with Summary tab
  switchTab('summary');
  loadSummaryTab();

  // Setup auto-refresh for Summary tab (every 60 seconds)
  STATE.summaryRefreshInterval = setInterval(() => {
    if (STATE.currentTab === 'summary') {
      console.log('[Sidepanel] Auto-refreshing Summary tab...');
      loadSummaryTab();
    }
  }, 60000); // 60 seconds

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Sidepanel] Received message:', request);

    if (request.action === 'bookingUpdated') {
      // Booking detected - switch to Restaurant tab and load data
      console.log('[Sidepanel] Booking detected:', request.bookingId);
      STATE.currentBookingId = request.bookingId;
      switchTab('restaurant');
      loadRestaurantTab();
      resetInactivityTimeout();
    } else if (request.action === 'bookingCleared') {
      // Booking cleared - return to Summary tab
      console.log('[Sidepanel] Booking cleared');
      STATE.currentBookingId = null;
      switchTab('summary');
    } else if (request.action === 'tooltipDetected') {
      // Tooltip detected (double-click on booking block)
      console.log('[Sidepanel] Tooltip detected for booking:', request.bookingId);
      STATE.currentBookingId = request.bookingId;
      switchTab('restaurant');
      loadRestaurantTab();
      resetInactivityTimeout();
    } else if (request.action === 'refreshSummary') {
      // Manual refresh request for Summary tab
      loadSummaryTab();
    }
  });
});

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabName) {
  console.log('[Sidepanel] Switching to tab:', tabName);

  // Update state
  STATE.currentTab = tabName;

  // Update tab buttons
  Object.keys(tabButtons).forEach(name => {
    if (name === tabName) {
      tabButtons[name].classList.add('active');
      tabContents[name].classList.add('active');
      tabContents[name].style.display = 'block';
    } else {
      tabButtons[name].classList.remove('active');
      tabContents[name].classList.remove('active');
      tabContents[name].style.display = 'none';
    }
  });

  // Load tab content if needed
  if (tabName === 'restaurant') {
    loadRestaurantTab();
  } else if (tabName === 'checks') {
    loadChecksTab();
  }

  // Reset inactivity timeout when manually switching tabs
  if (tabName !== 'summary') {
    resetInactivityTimeout();
  } else {
    clearInactivityTimeout();
  }
}

// ============================================
// INACTIVITY TIMEOUT (60s)
// ============================================

function resetInactivityTimeout() {
  clearInactivityTimeout();

  STATE.inactivityTimeout = setTimeout(() => {
    console.log('[Sidepanel] 60s inactivity timeout - returning to Summary tab');
    switchTab('summary');
  }, 60000); // 60 seconds
}

function clearInactivityTimeout() {
  if (STATE.inactivityTimeout) {
    clearTimeout(STATE.inactivityTimeout);
    STATE.inactivityTimeout = null;
  }
}

// ============================================
// BADGE MANAGEMENT
// ============================================

function updateBadge(tabName, count) {
  STATE.badges[tabName] = count;
  const badge = tabBadges[tabName];

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  console.log(`[Sidepanel] Updated ${tabName} badge:`, count);
}

// ============================================
// SUMMARY TAB
// ============================================

async function loadSummaryTab() {
  try {
    showSummaryState('loading');

    const apiEndpoint = STATE.settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1';
    const summaryUrl = `${apiEndpoint}/summary`;

    console.log('[Sidepanel] Fetching summary from:', summaryUrl);

    const data = await fetchWithAuth(summaryUrl, {
      method: 'GET'
    }, 'chrome-summary');

    console.log('[Sidepanel] Summary data received:', data);

    if (data && data.html) {
      summaryContent.innerHTML = data.html;
      showSummaryState('content');

      // Update badge
      updateBadge('summary', data.badge_count || 0);
    } else if (data && data.bookings) {
      // Fallback for JSON response
      summaryContent.innerHTML = '<div class="bma-summary-tab"><p>Summary data loaded (JSON format)</p></div>';
      showSummaryState('content');
      updateBadge('summary', data.badge_count || 0);
    } else {
      throw new Error('Invalid response format');
    }

  } catch (error) {
    console.error('[Sidepanel] Summary error:', error);
    summaryErrorMessage.textContent = error.message || 'Failed to load summary';
    showSummaryState('error');
  }
}

function showSummaryState(state) {
  summaryLoading.style.display = 'none';
  summaryError.style.display = 'none';
  summaryContent.style.display = 'none';

  switch (state) {
    case 'loading':
      summaryLoading.style.display = 'block';
      break;
    case 'error':
      summaryError.style.display = 'block';
      break;
    case 'content':
      summaryContent.style.display = 'block';
      break;
  }
}

// ============================================
// RESTAURANT TAB
// ============================================

async function loadRestaurantTab() {
  try {
    if (!STATE.currentBookingId) {
      showRestaurantState('notOnBooking');
      updateBadge('restaurant', 0);
      return;
    }

    showRestaurantState('loading');

    const apiEndpoint = STATE.settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1';
    const matchUrl = `${apiEndpoint}/bookings/match`;

    console.log('[Sidepanel] Fetching restaurant data for booking:', STATE.currentBookingId);

    const data = await fetchWithAuth(matchUrl, {
      method: 'POST',
      body: JSON.stringify({
        booking_id: parseInt(STATE.currentBookingId),
        context: 'chrome-sidepanel'
      })
    }, 'chrome-sidepanel');

    console.log('[Sidepanel] Restaurant data received:', data);

    if (data && data.html) {
      restaurantContent.innerHTML = data.html;
      showRestaurantState('content');

      // Update badge
      updateBadge('restaurant', data.badge_count || 0);
    } else if (data && data.bookings && data.bookings.length > 0) {
      // Fallback for JSON response
      restaurantContent.innerHTML = '<div class="bma-sidepanel-result"><p>Restaurant data loaded (JSON format)</p></div>';
      showRestaurantState('content');
      updateBadge('restaurant', data.badge_count || 0);
    } else {
      // No matches found
      restaurantBookingIdDisplay.textContent = STATE.currentBookingId;
      const adminBaseUrl = STATE.settings.adminBaseUrl || 'https://n4admindev.pterois.co.uk';
      restaurantAdminLink.href = `${adminBaseUrl}/bookings/?booking_id=${STATE.currentBookingId}`;
      showRestaurantState('noMatches');
      updateBadge('restaurant', 0);
    }

  } catch (error) {
    console.error('[Sidepanel] Restaurant error:', error);
    restaurantErrorMessage.textContent = error.message || 'Failed to load restaurant data';
    showRestaurantState('error');
  }
}

function showRestaurantState(state) {
  restaurantLoading.style.display = 'none';
  restaurantNotOnBooking.style.display = 'none';
  restaurantError.style.display = 'none';
  restaurantContent.style.display = 'none';
  restaurantNoMatches.style.display = 'none';

  switch (state) {
    case 'loading':
      restaurantLoading.style.display = 'block';
      break;
    case 'notOnBooking':
      restaurantNotOnBooking.style.display = 'block';
      break;
    case 'error':
      restaurantError.style.display = 'block';
      break;
    case 'content':
      restaurantContent.style.display = 'block';
      break;
    case 'noMatches':
      restaurantNoMatches.style.display = 'block';
      break;
  }
}

// ============================================
// CHECKS TAB
// ============================================

async function loadChecksTab() {
  try {
    if (!STATE.currentBookingId) {
      showChecksState('noBooking');
      updateBadge('checks', 0);
      return;
    }

    showChecksState('loading');

    const apiEndpoint = STATE.settings.apiEndpoint || 'https://n4admindev.pterois.co.uk/wp-json/bma/v1';
    const checksUrl = `${apiEndpoint}/checks/${STATE.currentBookingId}`;

    console.log('[Sidepanel] Fetching checks for booking:', STATE.currentBookingId);

    const data = await fetchWithAuth(checksUrl, {
      method: 'GET'
    }, 'chrome-checks');

    console.log('[Sidepanel] Checks data received:', data);

    if (data && data.html) {
      checksContent.innerHTML = data.html;
      showChecksState('content');

      // Update badge
      updateBadge('checks', data.badge_count || 0);
    } else if (data && data.checks) {
      // Fallback for JSON response
      checksContent.innerHTML = '<div class="bma-checks-tab"><p>Checks data loaded (JSON format)</p></div>';
      showChecksState('content');
      updateBadge('checks', data.badge_count || 0);
    } else {
      throw new Error('Invalid response format');
    }

  } catch (error) {
    console.error('[Sidepanel] Checks error:', error);
    checksErrorMessage.textContent = error.message || 'Failed to load checks';
    showChecksState('error');
  }
}

function showChecksState(state) {
  checksLoading.style.display = 'none';
  checksNoBooking.style.display = 'none';
  checksError.style.display = 'none';
  checksContent.style.display = 'none';

  switch (state) {
    case 'loading':
      checksLoading.style.display = 'block';
      break;
    case 'noBooking':
      checksNoBooking.style.display = 'block';
      break;
    case 'error':
      checksError.style.display = 'block';
      break;
    case 'content':
      checksContent.style.display = 'block';
      break;
  }
}

// ============================================
// API HELPER FUNCTIONS
// ============================================

async function fetchWithAuth(url, options = {}, context = 'json') {
  // Prepare headers
  const headers = {
    'Content-Type': 'application/json'
  };

  // Add authentication if configured
  if (STATE.settings.wpUsername && STATE.settings.wpAppPassword) {
    const password = STATE.settings.wpAppPassword.replace(/\s+/g, '');
    const credentials = btoa(`${STATE.settings.wpUsername}:${password}`);
    headers['Authorization'] = `Basic ${credentials}`;
    console.log('[Sidepanel] Using Basic Authentication');
  }

  // Add context parameter to URL if GET request
  let finalUrl = url;
  if (options.method === 'GET' || !options.method) {
    const separator = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${separator}context=${context}`;
  }

  // Merge headers
  options.headers = { ...headers, ...options.headers };

  // Make request
  const response = await fetch(finalUrl, options);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
