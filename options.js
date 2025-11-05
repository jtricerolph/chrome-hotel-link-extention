// Options page script for managing extension settings

// Default settings
const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://n4admindev.pterois.co.uk/wp-json/bma/v1/bookings/match',
  adminBaseUrl: 'https://n4admindev.pterois.co.uk',
  wpUsername: '',
  wpAppPassword: '',
  // Behavior settings
  enableDialogInjection: true,
  enablePlannerHover: true,
  enableAutoPopup: true,
  autoPopupDelay: 2500,  // milliseconds
  hoverDelay: 500  // milliseconds
};

// Load saved settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  await checkPermissions();
});

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || DEFAULT_SETTINGS;

    document.getElementById('apiEndpoint').value = settings.apiEndpoint || DEFAULT_SETTINGS.apiEndpoint;
    document.getElementById('adminBaseUrl').value = settings.adminBaseUrl || DEFAULT_SETTINGS.adminBaseUrl;
    document.getElementById('wpUsername').value = settings.wpUsername || DEFAULT_SETTINGS.wpUsername;
    document.getElementById('wpAppPassword').value = settings.wpAppPassword || DEFAULT_SETTINGS.wpAppPassword;

    // Load behavior settings
    document.getElementById('enableDialogInjection').checked = settings.enableDialogInjection !== undefined ? settings.enableDialogInjection : DEFAULT_SETTINGS.enableDialogInjection;
    document.getElementById('enablePlannerHover').checked = settings.enablePlannerHover !== undefined ? settings.enablePlannerHover : DEFAULT_SETTINGS.enablePlannerHover;
    document.getElementById('enableAutoPopup').checked = settings.enableAutoPopup !== undefined ? settings.enableAutoPopup : DEFAULT_SETTINGS.enableAutoPopup;
    document.getElementById('autoPopupDelay').value = settings.autoPopupDelay || DEFAULT_SETTINGS.autoPopupDelay;
    document.getElementById('hoverDelay').value = settings.hoverDelay || DEFAULT_SETTINGS.hoverDelay;

    console.log('Settings loaded (credentials hidden)');
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const adminBaseUrl = document.getElementById('adminBaseUrl').value.trim();
    const wpUsername = document.getElementById('wpUsername').value.trim();
    const wpAppPassword = document.getElementById('wpAppPassword').value.trim();

    // Validate URLs
    if (!apiEndpoint) {
      showStatus('API Endpoint is required', 'error');
      return;
    }

    try {
      new URL(apiEndpoint);
      if (adminBaseUrl) {
        new URL(adminBaseUrl);
      }
    } catch (e) {
      showStatus('Invalid URL format', 'error');
      return;
    }

    // Validate authentication credentials
    if (!wpUsername || !wpAppPassword) {
      showStatus('WordPress username and application password are required for authentication', 'error');
      return;
    }

    // Strip spaces from Application Password before storing
    // WordPress generates them with spaces for readability, but HTTP Basic Auth needs them without spaces
    const cleanedPassword = wpAppPassword.replace(/\s+/g, '');

    // Get behavior settings
    const enableDialogInjection = document.getElementById('enableDialogInjection').checked;
    const enablePlannerHover = document.getElementById('enablePlannerHover').checked;
    const enableAutoPopup = document.getElementById('enableAutoPopup').checked;
    const autoPopupDelay = parseInt(document.getElementById('autoPopupDelay').value) || DEFAULT_SETTINGS.autoPopupDelay;
    const hoverDelay = parseInt(document.getElementById('hoverDelay').value) || DEFAULT_SETTINGS.hoverDelay;

    const settings = {
      apiEndpoint: apiEndpoint,
      adminBaseUrl: adminBaseUrl,
      wpUsername: wpUsername,
      wpAppPassword: cleanedPassword,
      enableDialogInjection: enableDialogInjection,
      enablePlannerHover: enablePlannerHover,
      enableAutoPopup: enableAutoPopup,
      autoPopupDelay: autoPopupDelay,
      hoverDelay: hoverDelay
    };

    await chrome.storage.local.set({ settings: settings });

    console.log('Settings saved (credentials secured)');
    showStatus('Settings saved successfully!', 'success');

    // Clear any cached data so new settings take effect immediately
    await chrome.storage.local.remove(['cachedBookingData', 'cachedBookingHtml', 'cachedBookingId', 'cachedTimestamp']);

  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

// Reset to default settings
async function resetSettings() {
  try {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });

    document.getElementById('apiEndpoint').value = DEFAULT_SETTINGS.apiEndpoint;
    document.getElementById('adminBaseUrl').value = DEFAULT_SETTINGS.adminBaseUrl;
    document.getElementById('wpUsername').value = DEFAULT_SETTINGS.wpUsername;
    document.getElementById('wpAppPassword').value = DEFAULT_SETTINGS.wpAppPassword;

    // Reset behavior settings
    document.getElementById('enableDialogInjection').checked = DEFAULT_SETTINGS.enableDialogInjection;
    document.getElementById('enablePlannerHover').checked = DEFAULT_SETTINGS.enablePlannerHover;
    document.getElementById('enableAutoPopup').checked = DEFAULT_SETTINGS.enableAutoPopup;
    document.getElementById('autoPopupDelay').value = DEFAULT_SETTINGS.autoPopupDelay;
    document.getElementById('hoverDelay').value = DEFAULT_SETTINGS.hoverDelay;

    console.log('Settings reset to defaults');
    showStatus('Settings reset to defaults', 'success');

    // Clear cached data
    await chrome.storage.local.remove(['cachedBookingData', 'cachedBookingHtml', 'cachedBookingId', 'cachedTimestamp']);

  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('Failed to reset settings', 'error');
  }
}

// Show status message
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-message ${type}`;
  statusDiv.style.display = 'block';

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// Setup event listeners
function setupEventListeners() {
  // Save button
  document.getElementById('saveButton').addEventListener('click', saveSettings);

  // Reset button
  document.getElementById('resetButton').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults? This will clear any cached data.')) {
      resetSettings();
    }
  });

  // Preset buttons
  document.querySelectorAll('.preset-button').forEach(button => {
    button.addEventListener('click', () => {
      const url = button.getAttribute('data-url');
      const target = button.getAttribute('data-target');

      if (target) {
        // Specific target field
        document.getElementById(target).value = url;
      } else {
        // Default to apiEndpoint
        document.getElementById('apiEndpoint').value = url;
      }

      showStatus('Preset loaded. Click "Save Settings" to apply.', 'success');
    });
  });

  // Save on Enter key
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveSettings();
      }
    });
  });

  // Grant permissions button
  document.getElementById('grantPermissionsBtn').addEventListener('click', grantPermissions);
}

// Check if API permissions are granted
async function checkPermissions() {
  const statusDiv = document.getElementById('permissionStatus');
  const button = document.getElementById('grantPermissionsBtn');

  try {
    const hasPermissions = await new Promise((resolve) => {
      chrome.permissions.contains(
        { origins: ['https://admin.hotelnumberfour.com/*', 'https://n4admindev.pterois.co.uk/*'] },
        (result) => resolve(result)
      );
    });

    if (hasPermissions) {
      statusDiv.style.background = '#d4edda';
      statusDiv.style.color = '#155724';
      statusDiv.textContent = '✓ API permissions granted';
      button.style.display = 'none';
    } else {
      statusDiv.style.background = '#fff3cd';
      statusDiv.style.color = '#856404';
      statusDiv.textContent = '⚠ API permissions required - Click button below to grant';
      button.style.display = 'inline-block';
    }
  } catch (error) {
    statusDiv.style.background = '#f8d7da';
    statusDiv.style.color = '#721c24';
    statusDiv.textContent = '✗ Error checking permissions: ' + error.message;
  }
}

// Request API permissions (must be called from user gesture)
async function grantPermissions() {
  try {
    const granted = await new Promise((resolve) => {
      chrome.permissions.request(
        { origins: ['https://admin.hotelnumberfour.com/*', 'https://n4admindev.pterois.co.uk/*'] },
        (result) => resolve(result)
      );
    });

    if (granted) {
      showStatus('Permissions granted successfully!', 'success');
      await checkPermissions();
    } else {
      showStatus('Permissions denied. Extension will not work properly.', 'error');
    }
  } catch (error) {
    showStatus('Error requesting permissions: ' + error.message, 'error');
  }
}
