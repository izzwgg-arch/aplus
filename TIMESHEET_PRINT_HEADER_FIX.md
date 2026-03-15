# Timesheet Print Header Fix

## Problem
The timesheet print output needed to display the company name "Smart steps ABA" at the very top of the printed page.

## Solution
Added a prominent company header above the existing "TIMESHEETS" title that appears in both print preview and actual print output.

## Files Changed

### 1. `components/timesheets/TimesheetPrintPreview.tsx`
**Location:** Added company header at line 91-94, above the "TIMESHEETS" title

**Changes:**
- Added a new `<div>` with class `print-company-header` containing "Smart steps ABA"
- Positioned above the existing "TIMESHEETS" header
- Styled with `text-3xl font-bold text-center` for prominence
- Added `mb-4` margin for proper spacing

**Code Added:**
```tsx
{/* Company Name Header */}
<div className="mb-4 print-company-header">
  <h1 className="text-3xl font-bold text-center">Smart steps ABA</h1>
</div>
```

### 2. `app/globals.css`
**Location:** Added print-specific styles at lines 112-122

**Changes:**
- Added `@media print` rules for `.print-company-header`
- Ensured header is visible in print (display: block !important)
- Set font size to 28px for print output
- Added `page-break-after: avoid` to keep header with content
- Centered text alignment
- Black color for print

**Code Added:**
```css
/* Company Header - Prominent at top of print */
.print-company-header {
  display: block !important;
  margin-bottom: 1rem;
  page-break-after: avoid;
}

.print-company-header h1 {
  font-size: 28px !important;
  font-weight: 700 !important;
  text-align: center !important;
  color: #000 !important;
  margin: 0 !important;
  padding: 0 !important;
}
```

## Print Output Structure

The printed page now shows:
1. **"Smart steps ABA"** (Company name - NEW, centered, bold, 28px)
2. **"TIMESHEETS"** (Existing title)
3. Client/Provider information
4. Timesheet table
5. Totals and signatures

## Testing Checklist

### Print Preview Modal
- [ ] Open timesheet print preview
- [ ] Verify "Smart steps ABA" appears at the top
- [ ] Verify it's centered and bold
- [ ] Verify spacing between company name and "TIMESHEETS"

### Actual Print Output
- [ ] Click "Print" button
- [ ] Open print preview (Ctrl+P / Cmd+P)
- [ ] Verify "Smart steps ABA" appears at the very top of the page
- [ ] Print to PDF
- [ ] Verify company name is visible in PDF at the top
- [ ] Verify layout is not broken (table widths, spacing)

### Multi-page Printing
- [ ] If timesheet spans multiple pages, verify header appears on first page
- [ ] Verify page breaks don't occur between company name and "TIMESHEETS"

## Technical Details

### Screen Display
- Font size: `text-3xl` (30px in Tailwind)
- Font weight: `font-bold` (700)
- Alignment: `text-center`
- Margin: `mb-4` (1rem bottom margin)

### Print Display
- Font size: 28px (optimized for print)
- Font weight: 700 (bold)
- Color: Black (#000)
- Alignment: Center
- Page break: Avoids breaking after header

### CSS Specificity
- Uses `!important` flags to ensure print styles override any conflicting styles
- Print styles are scoped within `@media print` block
- Header is part of `.print-preview-content` which is visible in print

## Browser Compatibility
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (when printing)

## Notes
- The header only appears in the print preview content area
- The modal UI elements (close button, "Print" button) are hidden during print via `.no-print` class
- The company name uses exact text: "Smart steps ABA" (case-sensitive)
- Layout and table widths remain unchanged
