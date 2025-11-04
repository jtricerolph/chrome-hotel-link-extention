// Content script for page analysis

// Analyze the current page
function analyzePage() {
  const analysis = {
    // Basic page information
    title: document.title,
    url: window.location.href,

    // Meta information
    description: getMetaContent('description'),
    keywords: getMetaContent('keywords'),

    // Page structure
    headings: extractHeadings(),
    images: extractImages(),
    links: extractLinks(),

    // Text content
    mainText: extractMainText(),

    // Specific data extraction based on page type
    structuredData: extractStructuredData(),

    // User interaction context
    scrollDepth: calculateScrollDepth(),
    timeOnPage: Date.now()
  };

  return analysis;
}

// Get meta tag content
function getMetaContent(name) {
  const meta = document.querySelector(`meta[name="${name}"]`) ||
                document.querySelector(`meta[property="og:${name}"]`);
  return meta ? meta.getAttribute('content') : '';
}

// Extract headings
function extractHeadings() {
  const headings = [];
  document.querySelectorAll('h1, h2, h3').forEach((heading, index) => {
    if (index < 10) { // Limit to first 10 headings
      headings.push({
        level: heading.tagName,
        text: heading.textContent.trim().slice(0, 100)
      });
    }
  });
  return headings;
}

// Extract main images
function extractImages() {
  const images = [];
  document.querySelectorAll('img').forEach((img, index) => {
    if (index < 5 && img.width > 100 && img.height > 100) {
      images.push({
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height
      });
    }
  });
  return images;
}

// Extract important links
function extractLinks() {
  const links = [];
  document.querySelectorAll('a[href]').forEach((link, index) => {
    if (index < 20) { // Limit to first 20 links
      const href = link.href;
      const text = link.textContent.trim();
      if (text && href && !href.startsWith('javascript:')) {
        links.push({
          url: href,
          text: text.slice(0, 100)
        });
      }
    }
  });
  return links;
}

// Extract main text content
function extractMainText() {
  // Try to find main content area
  const mainElements = document.querySelectorAll('main, article, [role="main"], .main-content, #content');
  let text = '';

  if (mainElements.length > 0) {
    text = mainElements[0].textContent;
  } else {
    text = document.body.textContent;
  }

  // Clean and limit text
  return text.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

// Extract structured data (JSON-LD, microdata)
function extractStructuredData() {
  const structuredData = [];

  // Extract JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      structuredData.push(data);
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  return structuredData;
}

// Calculate scroll depth
function calculateScrollDepth() {
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;

  const scrollPercent = (scrollTop / (documentHeight - windowHeight)) * 100;
  return Math.min(Math.round(scrollPercent), 100);
}

// Detect specific page types and extract relevant data
function detectPageType() {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body.textContent.toLowerCase();

  // Hotel/Travel page detection
  if (url.includes('hotel') || url.includes('booking') ||
      bodyText.includes('check-in') || bodyText.includes('room')) {
    return {
      type: 'hotel',
      data: extractHotelData()
    };
  }

  // Shopping page detection
  if (url.includes('shop') || url.includes('product') ||
      bodyText.includes('add to cart') || bodyText.includes('price')) {
    return {
      type: 'shopping',
      data: extractProductData()
    };
  }

  return { type: 'general', data: {} };
}

// Extract hotel-specific data
function extractHotelData() {
  return {
    hotelName: document.querySelector('h1')?.textContent.trim() || '',
    price: document.querySelector('[class*="price"]')?.textContent.trim() || '',
    rating: document.querySelector('[class*="rating"]')?.textContent.trim() || '',
    location: document.querySelector('[class*="location"]')?.textContent.trim() || ''
  };
}

// Extract product-specific data
function extractProductData() {
  return {
    productName: document.querySelector('h1')?.textContent.trim() || '',
    price: document.querySelector('[class*="price"]')?.textContent.trim() || '',
    description: getMetaContent('description'),
    availability: document.body.textContent.includes('in stock') ? 'In Stock' : 'Unknown'
  };
}

// Send analysis to background script
function sendAnalysis() {
  const analysis = analyzePage();
  const pageType = detectPageType();

  chrome.runtime.sendMessage({
    action: 'analyzeContent',
    data: {
      analysis: analysis,
      pageType: pageType,
      timestamp: new Date().toISOString()
    }
  });
}

// Run analysis when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sendAnalysis);
} else {
  sendAnalysis();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'requestAnalysis') {
    const analysis = analyzePage();
    const pageType = detectPageType();
    sendResponse({
      analysis: analysis,
      pageType: pageType
    });
  }
  return true;
});
