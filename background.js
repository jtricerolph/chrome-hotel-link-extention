// Background service worker for activity tracking

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    detectActivity(tab);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  detectActivity(tab);
});

// Function to detect and categorize activity
async function detectActivity(tab) {
  try {
    const url = new URL(tab.url);
    const activity = {
      url: tab.url,
      title: tab.title,
      domain: url.hostname,
      timestamp: new Date().toISOString(),
      category: categorizeActivity(url, tab.title)
    };

    // Store the activity
    await chrome.storage.local.set({ currentActivity: activity });

    // Update badge to show extension is active
    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: tab.id });

  } catch (error) {
    console.error('Error detecting activity:', error);
  }
}

// Categorize the activity based on URL and title
function categorizeActivity(url, title) {
  const hostname = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const fullUrl = url.href.toLowerCase();

  // Shopping
  if (hostname.includes('amazon') || hostname.includes('ebay') ||
      hostname.includes('shop') || hostname.includes('store')) {
    return 'shopping';
  }

  // Social Media
  if (hostname.includes('facebook') || hostname.includes('twitter') ||
      hostname.includes('instagram') || hostname.includes('linkedin') ||
      hostname.includes('reddit')) {
    return 'social';
  }

  // Video/Entertainment
  if (hostname.includes('youtube') || hostname.includes('netflix') ||
      hostname.includes('twitch') || hostname.includes('vimeo')) {
    return 'entertainment';
  }

  // News
  if (hostname.includes('news') || hostname.includes('bbc') ||
      hostname.includes('cnn') || hostname.includes('nytimes')) {
    return 'news';
  }

  // Development/Coding
  if (hostname.includes('github') || hostname.includes('stackoverflow') ||
      hostname.includes('gitlab') || hostname.includes('developer')) {
    return 'development';
  }

  // Travel/Hotels
  if (hostname.includes('hotel') || hostname.includes('booking') ||
      hostname.includes('airbnb') || hostname.includes('expedia') ||
      hostname.includes('travel')) {
    return 'travel';
  }

  // Email
  if (hostname.includes('mail') || hostname.includes('gmail') ||
      hostname.includes('outlook')) {
    return 'email';
  }

  // Default
  return 'general';
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getActivity') {
    chrome.storage.local.get(['currentActivity'], (result) => {
      sendResponse({ activity: result.currentActivity });
    });
    return true; // Keep the message channel open for async response
  }

  if (request.action === 'analyzeContent') {
    // Forward content analysis to storage
    chrome.storage.local.set({ contentAnalysis: request.data });
    sendResponse({ success: true });
    return true;
  }
});

// Initialize on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Activity Tracker Extension installed');
  chrome.storage.local.set({
    settings: {
      apiEndpoint: 'https://api.example.com/activity',
      enableTracking: true
    }
  });
});
