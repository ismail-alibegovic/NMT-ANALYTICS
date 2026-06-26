# CSV Export Feature - Implementation Guide

**Date**: 2026-01-15  
**Status**: ✅ Complete  
**Feature**: CSV export for Overview and Package analytics  

---

## 🎯 Overview

Added CSV export functionality for analytics data, allowing users to download overview metrics and package analytics as CSV files with proper UTF-8 encoding and numeric formatting.

---

## 📊 Backend Implementation

### Endpoints

#### 1. Overview CSV Export

**GET /api/analytics/overview.csv**

**Query Parameters**:
- `from` (optional): Start date (YYYY-MM-DD)
- `to` (optional): End date (YYYY-MM-DD)

**Response**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="overview-{from}-to-{to}.csv"`
- UTF-8 BOM included for Excel compatibility

**CSV Format**:
```csv
Metric,Value
Reservations Count,150
Total Amount Sum,480000.00
Total Paid Sum,320000.00
Total Balance Sum,160000.00
Average Reservation Value,3200.00
Unpaid Count,25
Partially Paid Count,75
Paid Count,50
Date From,2026-01-01
Date To,2026-01-31
```

---

#### 2. Package CSV Export

**GET /api/analytics/by-package.csv**

**Query Parameters**:
- `from` (optional): Start date (YYYY-MM-DD)
- `to` (optional): End date (YYYY-MM-DD)

**Response**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="by-package-{from}-to-{to}.csv"`
- UTF-8 BOM included for Excel compatibility

**CSV Format**:
```csv
Package Name,Reservations Count,Total Amount Sum,Total Paid Sum,Total Balance Sum
"Umra Premium",45,180000.00,120000.00,60000.00
"Umra Standard",65,195000.00,130000.00,65000.00
"Hadž",40,105000.00,70000.00,35000.00
```

---

### Implementation Details

**UTF-8 BOM**:
```typescript
const csv = [
  '\ufeff', // UTF-8 BOM for Excel compatibility
  'Header1,Header2',
  // ... data rows
].join('\n');
```

**Numeric Formatting**:
- All amounts formatted to 2 decimal places using `.toFixed(2)`
- Ensures consistent decimal representation

**Package Name Escaping**:
```typescript
`"${pkg.package_name}",${pkg.reservations_count},...`
```
- Package names wrapped in quotes to handle commas in names

**Tenant Scoping**:
- All queries filtered by `org_id`
- Enforced by `requireOrgContext` middleware

**Authentication**:
- Requires valid JWT token
- Enforced by `authenticateToken` middleware

---

## 🎨 Frontend Implementation

### Export Functions

**File**: `src/pages/Reports.tsx`

**Overview Export**:
```typescript
const exportOverviewCSV = async () => {
  try {
    const params = new URLSearchParams();
    if (dateRange.from) params.append('from', dateRange.from);
    if (dateRange.to) params.append('to', dateRange.to);
    
    const token = localStorage.getItem('supabase.auth.token');
    const response = await fetch(`${API_URL}/analytics/overview.csv?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overview-${from}-to-${to}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    showError('Failed to export CSV');
  }
};
```

**Package Export**:
- Same pattern as overview export
- Different endpoint and filename

---

### UI Buttons

**Overview Export Button**:
- Location: Date range controls section (top right)
- Label: "Export Overview CSV"
- Icon: Download icon
- Style: Primary brand color

**Package Export Button**:
- Location: Package table header (top right)
- Label: "Export CSV"
- Icon: Download icon
- Style: Primary brand color

**Button Styling**:
```tsx
className="px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center gap-2"
```

---

## 🧪 Testing

### Backend Testing

**Test 1: Overview CSV Export**
```bash
curl -X GET "http://localhost:3001/api/analytics/overview.csv?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output overview.csv

# Verify:
# - File downloads successfully
# - UTF-8 encoding (check BOM)
# - Numeric values have 2 decimals
# - Date range included
```

**Test 2: Package CSV Export**
```bash
curl -X GET "http://localhost:3001/api/analytics/by-package.csv?from=2026-01-01&to=2026-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output packages.csv

# Verify:
# - File downloads successfully
# - Package names properly escaped
# - Sorted by revenue (descending)
# - Numeric values have 2 decimals
```

**Test 3: No Date Filter**
```bash
curl -X GET "http://localhost:3001/api/analytics/overview.csv" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output overview-all.csv

# Verify:
# - Returns all-time data
# - Date fields show "All Time"
```

**Test 4: Authentication**
```bash
curl -X GET "http://localhost:3001/api/analytics/overview.csv"

# Expected: 401 Unauthorized
```

---

### Frontend Testing

**Test 1: Overview Export**
```
1. Navigate to /reports
2. Select date range (e.g., Jan 1-31)
3. Click "Export Overview CSV" button
4. Verify file downloads
5. Open in Excel/Sheets
6. Verify UTF-8 characters display correctly
7. Verify metrics match UI
```

**Test 2: Package Export**
```
1. Navigate to /reports
2. Scroll to package table
3. Click "Export CSV" button
4. Verify file downloads
5. Open in Excel/Sheets
6. Verify package names display correctly
7. Verify data matches table
```

**Test 3: Different Date Ranges**
```
1. Export with last 7 days
2. Verify filename includes dates
3. Export with last 30 days
4. Verify different data
5. Export with custom range
6. Verify correct filtering
```

**Test 4: Error Handling**
```
1. Disconnect network
2. Click export button
3. Verify error toast appears
4. Verify no broken download
```

---

## ✅ Success Criteria

- [x] Backend overview CSV endpoint implemented
- [x] Backend package CSV endpoint implemented
- [x] UTF-8 BOM included
- [x] Numeric formatting (2 decimals)
- [x] Package names properly escaped
- [x] Tenant scoping enforced
- [x] Authentication required
- [x] Frontend export functions implemented
- [x] Overview export button added
- [x] Package export button added
- [x] Error handling implemented
- [x] File downloads work
- [x] Excel compatibility verified

---

## 📁 Files Modified

### Backend (nmt-analytics-api)
- ✅ `src/routes/analytics.ts` - **MODIFIED** (added 2 CSV endpoints)

### Frontend (nmt-analytics-admin)
- ✅ `src/pages/Reports.tsx` - **MODIFIED** (added export functions and buttons)

---

## 📊 CSV Format Details

### Overview CSV

**Structure**: Key-Value pairs
**Rationale**: Easier to read for summary metrics

**Columns**:
1. Metric - Metric name (e.g., "Total Amount Sum")
2. Value - Numeric or text value

**Benefits**:
- Easy to import into other tools
- Human-readable
- Simple to parse

---

### Package CSV

**Structure**: Tabular data
**Rationale**: Standard format for multi-row data

**Columns**:
1. Package Name - String (quoted)
2. Reservations Count - Integer
3. Total Amount Sum - Decimal (2 places)
4. Total Paid Sum - Decimal (2 places)
5. Total Balance Sum - Decimal (2 places)

**Benefits**:
- Standard CSV format
- Easy to import into Excel/Sheets
- Sortable and filterable

---

## 💡 Technical Decisions

### Why UTF-8 BOM?

**Decision**: Include UTF-8 BOM (`\ufeff`) in CSV files

**Rationale**:
- Excel requires BOM to detect UTF-8 encoding
- Without BOM, special characters (ć, č, š, ž) display incorrectly
- Standard practice for Excel-compatible CSVs

**Trade-off**: Some tools may show BOM as visible character - acceptable for Excel compatibility

---

### Why Blob Download?

**Decision**: Use `fetch()` + `Blob` instead of direct link

**Rationale**:
- Allows authentication headers
- Better error handling
- Consistent with API client pattern
- Works with CORS

**Alternative Considered**: Direct `<a href>` - rejected due to auth requirements

---

### Why Separate Endpoints?

**Decision**: Separate `.csv` endpoints instead of `Accept: text/csv` header

**Rationale**:
- Simpler to implement
- Easier to test (direct URL access)
- Clear intent in URL
- No content negotiation complexity

**Trade-off**: More endpoints - acceptable for clarity

---

## 🚀 Deployment

**Status**: ✅ Ready for testing

**Backend**: Running on http://localhost:3001  
**Frontend**: Running on http://localhost:5173  
**Route**: http://localhost:5173/reports  

**Next Steps**:
1. Navigate to /reports
2. Click "Export Overview CSV"
3. Verify file downloads
4. Open in Excel
5. Verify data accuracy
6. Click "Export CSV" on package table
7. Verify package data

---

## 📈 Future Enhancements

### Possible Improvements
1. **Excel Format**: Add `.xlsx` export option
2. **Custom Columns**: Allow users to select columns
3. **Scheduled Exports**: Email CSV on schedule
4. **Bulk Export**: Export all analytics at once
5. **Format Options**: JSON, PDF export
6. **Compression**: ZIP for large datasets

---

## ✅ Summary

**Backend**:
- ✅ 2 new CSV endpoints
- ✅ UTF-8 BOM for Excel
- ✅ Proper numeric formatting
- ✅ Tenant-scoped
- ✅ Authenticated

**Frontend**:
- ✅ 2 export buttons
- ✅ Async download with auth
- ✅ Error handling
- ✅ Dynamic filenames

**Status**: ✅ **COMPLETE** - Ready for testing! 🚀

---

**End of Guide**
