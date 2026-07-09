# CSV Import - Implementation Summary

## Backend (Already Complete)

**File**: `src/routes/import.ts`

**Endpoint**: `POST /api/import/:entity`

**Supported Entities**:
- customers
- packages
- departures
- reservations
- transactions

**Features**:
- ✅ CSV and XLSX support
- ✅ Validation with Zod schemas
- ✅ Org scoping (auto-adds org_id)
- ✅ Upsert mode (match by key)
- ✅ Dry-run mode (?dryRun=true)
- ✅ Template download: `GET /api/import/:entity/template.csv`

**Request**:
```bash
curl -X POST http://localhost:3001/api/import/customers \
  -H "Authorization: Bearer <token>" \
  -F "file=@customers.csv" \
  -F "mode=insert"
```

**Response**:
```json
{
  "success": true,
  "results": {
    "total": 10,
    "importedCount": 8,
    "invalidCount": 2,
    "invalidRows": [
      { "row": 3, "errors": { "email": "Invalid email" } },
      { "row": 7, "errors": { "phone": "Required" } }
    ]
  }
}
```

---

## Frontend (New)

**File**: `src/components/import/ImportModal.tsx`

**Usage**:
```tsx
import ImportModal from '../components/import/ImportModal';

function CustomersPage() {
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <Button onClick={() => setShowImport(true)}>
        Import CSV
      </Button>

      <ImportModal
        entity="customers"
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => {
          // Refresh data
          refetch();
        }}
      />
    </>
  );
}
```

**Features**:
- File upload (CSV/XLSX)
- Preview first 5 rows
- Template download
- Import result summary
- Error details

---

## Example CSV Formats

### Customers
```csv
fullName,phone,email,notes
John Doe,+38761123456,john@example.com,VIP customer
Jane Smith,+38761654321,jane@example.com,Regular
```

### Packages
```csv
name,destination,basePrice,currency,isActive,description
Beach Vacation,Cancun,1200,BAM,true,7-day all-inclusive
City Tour,Paris,800,BAM,true,5-day guided tour
```

### Reservations
```csv
customerId,departureId,partySize,reservationAt,status,totalAmount,currency
a1b2c3...,d4e5f6...,2,2024-01-15T10:00:00Z,confirmed,2400,BAM
```

---

## Installation

```bash
cd nmt-analytics-admin
npm install papaparse
npm install --save-dev @types/papaparse
```

---

## Security

- ✅ Requires authentication
- ✅ Org scoping (auto-adds org_id)
- ✅ File size limit (10MB)
- ✅ File type validation
- ✅ Schema validation per entity
- ✅ No mass overwrite (insert mode default)

---

## Testing

1. Download template:
```bash
curl http://localhost:3001/api/import/customers/template.csv \
  -H "Authorization: Bearer <token>" \
  -o template.csv
```

2. Edit template with data

3. Import via UI or API:
```bash
curl -X POST http://localhost:3001/api/import/customers \
  -H "Authorization: Bearer <token>" \
  -F "file=@customers.csv"
```

4. Check result for errors

---

## Production Ready

- Transactions (not yet - add if needed)
- Validation
- Error reporting
- Org scoping
- File limits
- Type safety
