// Popup UI and API integration logic

// Configuration
const CONFIG = {
  apiEndpoint: 'https://api.example.com/activity', // Change this to your backend API
  timeout: 10000
};

// DOM Elements
let statusDot, statusText, activityInfo, infoSection, infoContent;
let linksSection, linksContainer, errorSection, errorMessage;
let refreshBtn, settingsBtn;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  statusDot = document.getElementById('statusDot');
  statusText = document.getElementById('statusText');
  activityInfo = document.getElementById('activityInfo');
  infoSection = document.getElementById('infoSection');
  infoContent = document.getElementById('infoContent');
  linksSection = document.getElementById('linksSection');
  linksContainer = document.getElementById('linksContainer');
  errorSection = document.getElementById('errorSection');
  errorMessage = document.getElementById('errorMessage');
  refreshBtn = document.getElementById('refreshBtn');
  settingsBtn = document.getElementById('settingsBtn');

  // Set up event listeners
  refreshBtn.addEventListener('click', loadActivityData);
  settingsBtn.addEventListener('click', openSettings);

  // Load initial data
  await loadActivityData();
});

// Load and display activity data
async function loadActivityData() {
  try {
    updateStatus('loading', 'Analyzing activity...');
    hideError();

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get stored activity from background
    const activity = await getStoredActivity();

    // Get content analysis from current page
    const contentData = await getContentAnalysis(tab.id);

    // Display basic activity info
    displayActivityInfo(activity, tab);

    // Fetch enhanced data from API
    await fetchAndDisplayApiData(activity, contentData);

    updateStatus('active', 'Ready');

  } catch (error) {
    console.error('Error loading activity data:', error);
    showError('Failed to load activity data: ' + error.message);
    updateStatus('error', 'Error');
  }
}

// Get stored activity from background script
function getStoredActivity() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getActivity' }, (response) => {
      resolve(response?.activity || null);
    });
  });
}

// Get content analysis from current page
async function getContentAnalysis(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'requestAnalysis' });
    return response;
  } catch (error) {
    console.warn('Could not get content analysis:', error);
    return null;
  }
}

// Display basic activity information
function displayActivityInfo(activity, tab) {
  if (!activity && !tab) {
    activityInfo.innerHTML = '<div class="loading">No activity detected</div>';
    return;
  }

  const url = activity?.url || tab.url;
  const title = activity?.title || tab.title;
  const category = activity?.category || 'unknown';
  const domain = activity?.domain || new URL(url).hostname;

  activityInfo.innerHTML = `
    <div class="activity-detail">
      <strong>Page:</strong> ${escapeHtml(title)}
    </div>
    <div class="activity-detail">
      <strong>Domain:</strong> ${escapeHtml(domain)}
    </div>
    <div class="activity-detail">
      <strong>Category:</strong> ${escapeHtml(category)}
    </div>
    <div class="activity-detail">
      <strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank" style="color: #667eea; text-decoration: none;">${truncate(url, 50)}</a>
    </div>
  `;
}

// Fetch data from API and display
async function fetchAndDisplayApiData(activity, contentData) {
  try {
    // Get settings
    const settings = await getSettings();
    const apiEndpoint = settings.apiEndpoint || CONFIG.apiEndpoint;

    // Prepare payload
    const payload = {
      activity: activity,
      content: contentData,
      timestamp: new Date().toISOString()
    };

    // Make API request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Display API data
    displayApiData(data);

  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('API request timed out');
      showWarning('API request timed out. Showing cached data.');
    } else {
      console.warn('API request failed:', error);
      // Show mock data for demonstration
      displayMockData(activity);
    }
  }
}

// Display data from API
function displayApiData(data) {
  // Display information section
  if (data.information && data.information.length > 0) {
    infoSection.style.display = 'block';
    infoContent.innerHTML = data.information.map(info => `
      <div class="info-card">
        <h3>${escapeHtml(info.title)}</h3>
        <p>${escapeHtml(info.description)}</p>
      </div>
    `).join('');
  }

  // Display links section
  if (data.links && data.links.length > 0) {
    linksSection.style.display = 'block';
    linksContainer.innerHTML = data.links.map(link => `
      <a href="${escapeHtml(link.url)}" target="_blank" class="link-item">
        <span class="link-title">${escapeHtml(link.title)}</span>
        ${link.description ? `<span class="link-description">${escapeHtml(link.description)}</span>` : ''}
      </a>
    `).join('');
  }
}

// Display mock data for demonstration
function displayMockData(activity) {
  const category = activity?.category || 'general';

  // Mock information based on category
  const mockInfo = getMockInfo(category);
  const mockLinks = getMockLinks(category);

  displayApiData({
    information: mockInfo,
    links: mockLinks
  });

  showWarning('API not configured. Showing demo data.');
}

// Get mock information based on category
function getMockInfo(category) {
  const infoMap = {
    shopping: [
      { title: 'Price Alert', description: 'This item is currently at a good price compared to recent trends.' },
      { title: 'Similar Products', description: 'Found 5 similar products with better ratings.' }
    ],
    travel: [
      { title: 'Best Time to Book', description: 'Prices are typically lower on Tuesdays and Wednesdays.' },
      { title: 'Local Weather', description: 'Destination weather is sunny, 72°F.' }
    ],
    development: [
      { title: 'Documentation', description: 'Official docs and tutorials available.' },
      { title: 'Related Topics', description: 'Found related discussions and solutions.' }
    ],
    social: [
      { title: 'Activity Summary', description: 'You\'ve been on this site for 15 minutes today.' }
    ]
  };

  return infoMap[category] || [
    { title: 'Page Analysis', description: 'This page contains useful information related to ' + category + '.' }
  ];
}

// Get mock links based on category
function getMockLinks(category) {
  const linksMap = {
    shopping: [
      { title: 'Price Comparison', url: 'https://example.com/compare', description: 'Compare prices across stores' },
      { title: 'Reviews', url: 'https://example.com/reviews', description: 'Read user reviews' }
    ],
    travel: [
      { title: 'Travel Tips', url: 'https://example.com/tips', description: 'Essential travel advice' },
      { title: 'Book Now', url: 'https://example.com/book', description: 'Get the best deals' }
    ],
    development: [
      { title: 'Documentation', url: 'https://example.com/docs', description: 'Official documentation' },
      { title: 'Tutorials', url: 'https://example.com/tutorials', description: 'Learn more' }
    ]
  };

  return linksMap[category] || [
    { title: 'Learn More', url: 'https://example.com', description: 'Additional resources' }
  ];
}

// Get settings from storage
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      resolve(result.settings || {});
    });
  });
}

// Update status indicator
function updateStatus(status, text) {
  statusDot.className = 'status-dot ' + status;
  statusText.textContent = text;
}

// Show error message
function showError(message) {
  errorSection.style.display = 'block';
  errorMessage.textContent = message;
}

// Show warning message
function showWarning(message) {
  errorSection.style.display = 'block';
  errorSection.style.background = '#fef3c7';
  errorSection.style.borderColor = '#f59e0b';
  errorMessage.style.color = '#92400e';
  errorMessage.textContent = message;
}

// Hide error message
function hideError() {
  errorSection.style.display = 'none';
}

// Open settings (placeholder)
function openSettings() {
  alert('Settings panel coming soon!\n\nYou can configure:\n- API endpoint URL\n- Tracking preferences\n- Display options');
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Truncate text
function truncate(text, length) {
  return text.length > length ? text.substring(0, length) + '...' : text;
}
