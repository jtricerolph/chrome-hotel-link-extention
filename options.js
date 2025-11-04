// Options page logic for Hotel Booking Assistant

// Default settings
const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match',
  adminBaseUrl: 'https://n4admindev.pterois.co.uk/bookings'
};

// DOM elements
const form = document.getElementById('settingsForm');
const apiEndpointInput = document.getElementById('apiEndpoint');
const adminBaseUrlInput = document.getElementById('adminBaseUrl');
const resetBtn = document.getElementById('resetBtn');
const statusMessage = document.getElementById('statusMessage');

// Load saved settings
document.addEventListener('DOMContentLoaded', loadSettings);

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const settings = {
    apiEndpoint: apiEndpointInput.value.trim(),
    adminBaseUrl: adminBaseUrlInput.value.trim()
  };

  // Validate URLs
  if (!isValidUrl(settings.apiEndpoint)) {
    showStatus('Invalid API endpoint URL', 'error');
    return;
  }

  if (!isValidUrl(settings.adminBaseUrl)) {
    showStatus('Invalid admin base URL', 'error');
    return;
  }

  // Save to storage
  await chrome.storage.local.set({ settings });

  showStatus('Settings saved successfully!', 'success');
});

// Reset to defaults
resetBtn.addEventListener('click', async () => {
  if (confirm('Reset all settings to default values?')) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    loadSettings();
    showStatus('Settings reset to default', 'success');
  }
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || DEFAULT_SETTINGS;

  apiEndpointInput.value = settings.apiEndpoint;
  adminBaseUrlInput.value = settings.adminBaseUrl;
}

// Validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';

  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 3000);
}
