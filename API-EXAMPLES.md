# API Examples for Admin System

This document shows example API responses for the admin system to implement.

## API Endpoint

```
GET https://admin.hotelnumberfour.com/api/check-booking?booking_id={id}
```

## Example PHP Implementation

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$booking_id = $_GET['booking_id'] ?? null;

if (!$booking_id) {
    echo json_encode(['error' => 'No booking_id provided']);
    exit;
}

// Your logic to check for restaurant bookings
$matches = checkRestaurantBookings($booking_id);

if (count($matches) > 0) {
    // Build HTML for matches
    $html = buildMatchesHtml($matches);
    echo json_encode([
        'hasMatches' => true,
        'html' => $html
    ]);
} else {
    echo json_encode([
        'hasMatches' => false,
        'matches' => 0
    ]);
}

function buildMatchesHtml($matches) {
    $html = '';
    foreach ($matches as $match) {
        $html .= '<div class="match-card">';
        $html .= '<h3>Restaurant Booking Match</h3>';
        $html .= '<div class="match-info"><strong>Guest:</strong> ' . htmlspecialchars($match['guest_name']) . '</div>';
        $html .= '<div class="match-info"><strong>Table:</strong> ' . htmlspecialchars($match['table_number']) . '</div>';
        $html .= '<div class="match-info"><strong>Date/Time:</strong> ' . htmlspecialchars($match['booking_time']) . '</div>';
        $html .= '<div class="match-info"><strong>Covers:</strong> ' . htmlspecialchars($match['covers']) . '</div>';
        $html .= '<div class="match-info"><strong>Match Type:</strong> ' . htmlspecialchars($match['match_type']) . '</div>';
        $html .= '<a href="https://admin.hotelnumberfour.com/booking/' . $match['booking_id'] . '" class="btn-link" target="_blank">View Details →</a>';
        $html .= '</div>';
    }
    return $html;
}
?>
```

## Response Examples

### Example 1: Direct Match Found

```json
{
  "hasMatches": true,
  "html": "<div class=\"match-card\"><h3>✓ Direct Match Found</h3><div class=\"match-info\"><strong>Guest:</strong> John Smith</div><div class=\"match-info\"><strong>Email:</strong> john@example.com</div><div class=\"match-info\"><strong>Table:</strong> 12</div><div class=\"match-info\"><strong>Date/Time:</strong> 2024-01-15 19:00</div><div class=\"match-info\"><strong>Covers:</strong> 4</div><div class=\"match-info\"><strong>Match Type:</strong> Booking ID</div><a href=\"https://admin.hotelnumberfour.com/booking/32792\" class=\"btn-link\" target=\"_blank\">View in Admin →</a></div>"
}
```

### Example 2: Possible Matches (Name/Email)

```json
{
  "hasMatches": true,
  "html": "<div class=\"match-card\"><h3>⚠️ Possible Match (Email)</h3><div class=\"match-info\"><strong>Guest:</strong> Jane Doe</div><div class=\"match-info\"><strong>Email:</strong> jane@example.com</div><div class=\"match-info\"><strong>Table:</strong> 8</div><div class=\"match-info\"><strong>Date/Time:</strong> 2024-01-15 20:30</div><div class=\"match-info\"><strong>Covers:</strong> 2</div><div class=\"match-info\"><strong>Match Type:</strong> Email Address</div><a href=\"https://admin.hotelnumberfour.com/booking/32792\" class=\"btn-link\" target=\"_blank\">Link Booking →</a></div>"
}
```

### Example 3: Multiple Matches

```json
{
  "hasMatches": true,
  "html": "<h2 style=\"padding: 10px; margin-bottom: 10px;\">2 Possible Matches Found</h2><div class=\"match-card\"><h3>Match 1: Direct (Booking ID)</h3><div class=\"match-info\"><strong>Table:</strong> 12</div><div class=\"match-info\"><strong>Time:</strong> 19:00</div><a href=\"https://admin.hotelnumberfour.com/booking/32792\" class=\"btn-link\" target=\"_blank\">View →</a></div><div class=\"match-card\"><h3>Match 2: Name Match</h3><div class=\"match-info\"><strong>Table:</strong> 15</div><div class=\"match-info\"><strong>Time:</strong> 20:30</div><a href=\"https://admin.hotelnumberfour.com/booking/32792\" class=\"btn-link\" target=\"_blank\">View →</a></div>"
}
```

### Example 4: No Matches

```json
{
  "hasMatches": false,
  "matches": 0
}
```

This will trigger the extension to show the "No Matches Found" screen with a link to the admin system.

### Example 5: Error Response

```json
{
  "error": "Database connection failed"
}
```

or

```json
{
  "error": "Booking not found in NewBook system"
}
```

## Match Types to Consider

Your API logic should check for matches in this priority order:

1. **Direct Booking ID Match** (Primary)
   - Resos custom field contains NewBook booking ID
   - Highest confidence

2. **Email Address Match**
   - Guest email matches between systems
   - High confidence

3. **Phone Number Match**
   - Guest phone matches between systems
   - High confidence

4. **Name + Date Match**
   - Guest name and reservation date match
   - Medium confidence (could be coincidence)

5. **Name Only Match**
   - Guest name matches
   - Low confidence (show as suggestion)

## HTML Styling Tips

The popup.css provides these pre-styled elements:

- `<h2>`, `<h3>` - Headings (pre-styled)
- `.match-card` - Card container with border and padding
- `.match-info` - Row with label and value
- `.btn-link` - Blue button link
- `<strong>` - Bold labels

### Color Suggestions

Use emoji or colored indicators:
- ✓ Green checkmark - Direct match
- ⚠️ Yellow warning - Possible match
- ℹ️ Info - Informational

### Match Confidence Visual

```html
<div class="match-card" style="border-left-color: #10b981;">
  <h3>✓ High Confidence Match</h3>
  <!-- Green border for high confidence -->
</div>

<div class="match-card" style="border-left-color: #f59e0b;">
  <h3>⚠️ Possible Match</h3>
  <!-- Orange border for medium confidence -->
</div>
```

## Testing Your API

Use curl to test:

```bash
curl "https://admin.hotelnumberfour.com/api/check-booking?booking_id=32792"
```

Or test in browser:
```
https://admin.hotelnumberfour.com/api/check-booking?booking_id=32792
```

## CORS Configuration

Your server MUST allow CORS requests from Chrome extensions:

```php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
```

For production, you could restrict to specific origins if needed.
