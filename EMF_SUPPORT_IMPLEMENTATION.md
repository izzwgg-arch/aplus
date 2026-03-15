# EMF Support for Signature Import - Implementation Summary

## ✅ Implementation Complete

EMF → PNG conversion support has been successfully added to the signature import tool using LibreOffice on Ubuntu.

## 📁 Files Created/Modified

### New Files Created:
1. **`lib/signatures/emfConvert.ts`** - EMF conversion utility with LibreOffice integration

### Modified Files:
1. **`app/api/admin/signatures/dry-run/route.ts`** - Added EMF conversion, ZIP validation, Zip Slip protection
2. **`app/api/admin/signatures/import/route.ts`** - Added EMF conversion, ZIP validation, Zip Slip protection

## 🎯 Features Implemented

### 1. LibreOffice Integration
- ✅ Runtime check for LibreOffice availability (`soffice` command)
- ✅ Returns HTTP 500 with clear error if not installed
- ✅ EMF → PNG conversion using `soffice --headless --convert-to png`
- ✅ 10-second timeout per file conversion
- ✅ Error handling for failed conversions

### 2. ZIP Processing & Security
- ✅ ZIP size limit: 200MB maximum
- ✅ File count limit: 500 files maximum
- ✅ Per-file size limit: 5MB maximum
- ✅ Zip Slip protection: All extracted paths sanitized
- ✅ Temp directory isolation: `/tmp/signature-import/{requestId}/`

### 3. EMF Conversion Workflow
- ✅ Extract ZIP to temp directory with Zip Slip protection
- ✅ Identify EMF files automatically
- ✅ Convert EMF → PNG using LibreOffice
- ✅ Build image map including converted PNGs
- ✅ Match by normalized name (supports EMF base name → converted PNG)
- ✅ Clean up temp directories after processing

### 4. Image Matching Logic
- ✅ Supports explicit `signature_filename` column
- ✅ Falls back to normalized name matching
- ✅ If filename is `.emf` and exists, converts and uses `.png`
- ✅ If expected filename not found but `.emf` with same base name exists, converts and uses it
- ✅ Example: "Sarah Brach.png" expected, "Sarah Brach.emf" found → converts to PNG

### 5. File Storage
- ✅ Stores converted PNG files (not EMF)
- ✅ Original PNG/JPG/JPEG files stored as-is
- ✅ File extension determined from final filename (always PNG for converted EMF)

## 🔒 Security Features

- **Zip Slip Protection**: All extracted file paths validated to stay within temp directory
- **File Size Limits**: Prevents resource exhaustion attacks
- **Timeout Protection**: 10-second limit per EMF conversion
- **Temp Directory Cleanup**: Automatic cleanup after request completion (success or error)

## 🚀 Server Requirements

### Installation (Ubuntu):
```bash
sudo apt-get update
sudo apt-get install -y libreoffice
```

### Runtime Check:
- API endpoints check for LibreOffice availability on startup
- Returns HTTP 500 with `LIBREOFFICE_NOT_INSTALLED` error if missing
- Logs clearly indicate LibreOffice status

## 📊 Behavior Changes

### Before:
- EMF files marked as `MISSING_IMAGE`
- Only PNG/JPG/JPEG supported

### After:
- EMF files automatically converted to PNG
- Converted PNGs treated as "found" images
- Status becomes `READY` (if profile matches)
- PNG files stored (not EMF)

## 🔄 Workflow

1. **Dry-Run**:
   - Check LibreOffice
   - Validate ZIP (size, file count, per-file size)
   - Extract ZIP with Zip Slip protection
   - Convert EMF → PNG
   - Build image map (original + converted)
   - Match Excel rows to images
   - Return preview with status
   - Clean up temp directory

2. **Import**:
   - Check LibreOffice
   - Validate ZIP
   - Extract ZIP with Zip Slip protection
   - Convert EMF → PNG
   - Build image map
   - For each selected row:
     - Find image (original or converted PNG)
     - Validate profile match
     - Read image buffer from file path
     - Save PNG to final storage location
     - Update database
   - Clean up temp directory

## ✅ Verification Checklist

After deployment:
- [ ] LibreOffice installed: `which soffice` returns path
- [ ] LibreOffice version check: `soffice --version` works
- [ ] Dry-run with EMF ZIP shows converted images as "found"
- [ ] Import with EMF ZIP successfully stores PNG files
- [ ] Temp directories cleaned up after requests
- [ ] Existing PNG/JPG imports still work
- [ ] Zip Slip protection blocks malicious paths
- [ ] File size limits enforced

## 📝 Notes

- EMF files are converted server-side only
- Converted PNGs are stored, not the original EMF
- If conversion fails for a specific file, that row shows `MISSING_IMAGE`
- All other existing functionality remains unchanged
- No changes to timesheets, invoices, payroll, or other modules
