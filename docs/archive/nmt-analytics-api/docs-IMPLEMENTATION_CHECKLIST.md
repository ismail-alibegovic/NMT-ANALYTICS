# Revenue Analytics Refactor - Implementation Checklist

## 📋 Pre-Implementation

### Review Phase
- [ ] Read `docs/REVENUE_REFACTOR_SUMMARY.md`
- [ ] Review `docs/revenue_analytics_refactor.md` for detailed rationale
- [ ] Examine `docs/sql/revenue_queries.sql` for query examples
- [ ] Review `docs/examples/revenue_analytics_routes.example.ts` for code patterns
- [ ] Understand the architecture diagram

### Database Audit
- [ ] Verify `transactions` table exists
- [ ] Check if `status` column exists on `transactions`
- [ ] Check if `reservation_id` column exists on `transactions`
- [ ] Check if `currency` column exists on `transactions`
- [ ] Review existing indexes on `transactions` table
- [ ] Count existing transaction records: `SELECT COUNT(*) FROM transactions WHERE type = 'payment'`

### Backup
- [ ] Backup production database
- [ ] Test restore procedure
- [ ] Document rollback plan

## 🗄️ Database Migration

### Run Migration Script
- [ ] Review `supabase/sql/013_revenue_analytics_refactor.sql`
- [ ] Test migration in development environment
- [ ] Verify no errors in development
- [ ] Run migration in staging (if available)
- [ ] Run migration in production

### Verify Migration
- [ ] Check `transactions.status` column exists
- [ ] Check `transactions.reservation_id` column exists
- [ ] Check `transactions.currency` column exists
- [ ] Verify indexes created:
  - [ ] `idx_transactions_type_org_id`
  - [ ] `idx_transactions_status`
  - [ ] `idx_transactions_reservation_id`
  - [ ] `idx_transactions_analytics`
- [ ] Verify RPC functions created:
  - [ ] `get_revenue_analytics()`
  - [ ] `get_total_revenue()`
  - [ ] `get_revenue_by_day()`

### Test Queries
```sql
-- Test 1: Simple revenue query
SELECT get_total_revenue(
  'your-org-id'::uuid,
  NOW() - INTERVAL '30 days',
  NOW()
);

-- Test 2: Comprehensive analytics
SELECT get_revenue_analytics(
  'your-org-id'::uuid,
  NOW() - INTERVAL '30 days',
  NOW()
);

-- Test 3: Daily breakdown
SELECT * FROM get_revenue_by_day(
  'your-org-id'::uuid,
  NOW() - INTERVAL '30 days',
  NOW()
);
```

- [ ] Test 1 returns expected revenue
- [ ] Test 2 returns valid JSON with all fields
- [ ] Test 3 returns daily data
- [ ] No SQL errors in logs
- [ ] Query performance is acceptable (<200ms)

## 🔧 Backend Updates

### Update Analytics Routes
File: `src/routes/analytics.ts`

- [ ] Update `/analytics/overview` to use `get_revenue_analytics()`
- [ ] Update `/analytics/trends` to use payment-based queries
- [ ] Update `/analytics/dashboard` to use payment-based queries
- [ ] Update `/dashboard` to use payment-based queries
- [ ] Remove or update any reservation-based revenue calculations
- [ ] Add error handling for RPC function calls
- [ ] Add fallback for missing RPC functions

### Update Reports Routes
File: `src/routes/reports.ts` (if exists)

- [ ] Update summary endpoint to use payments
- [ ] Update revenue breakdown to use payments
- [ ] Update time series to use payments
- [ ] Ensure all queries filter by `type = 'payment'` and `status = 'succeeded'`
- [ ] Ensure all queries filter by `org_id`

### Update Metrics
File: `src/analytics/metrics.ts` (if exists)

- [ ] Update revenue metric definitions
- [ ] Update documentation/comments
- [ ] Remove deprecated metrics

### Code Review Checklist
For each revenue query, verify:
- [ ] Filters by `org_id` (multi-tenant safety)
- [ ] Filters by `type = 'payment'`
- [ ] Filters by `status = 'succeeded'`
- [ ] Uses `occurred_at` for date filtering
- [ ] Uses `COALESCE(SUM(amount), 0)` to handle NULL
- [ ] Returns proper error responses
- [ ] Logs errors appropriately

### Testing
- [ ] Unit tests for new analytics functions
- [ ] Integration tests for API endpoints
- [ ] Test with no payments (should return 0)
- [ ] Test with partial payments
- [ ] Test with unlinked payments
- [ ] Test multi-tenant isolation
- [ ] Test date range edge cases
- [ ] Test performance with large datasets

## 🎨 Frontend Updates

### Update API Client
File: `src/api/reports.ts`

- [ ] Update `ReportSummary` interface to match new response
- [ ] Add `paidRevenue` field
- [ ] Add `unpaidAmount` field (derived from bookings)
- [ ] Update `getReportSummary()` to handle new response structure
- [ ] Add TypeScript types for new metrics

### Update Dashboard Components
Files: `src/pages/Dashboard.tsx`, `src/components/AnalyticsChart.tsx`, etc.

- [ ] Update to display `paidRevenue` (from payments)
- [ ] Update to display `unpaidAmount` (context metric)
- [ ] Add labels/tooltips explaining metrics
- [ ] Update charts to use `revenueByDay` from new API
- [ ] Update package breakdown to use new data structure
- [ ] Update customer breakdown to use new data structure

### Update Reports Page
File: `src/pages/Reports.tsx` (if exists)

- [ ] Update revenue displays
- [ ] Update filters to use `occurred_at` semantics
- [ ] Add explanatory text about revenue vs bookings
- [ ] Update export functionality

### UI/UX Improvements
- [ ] Add tooltip: "Revenue = Actual payments received"
- [ ] Add tooltip: "Unpaid = Booked amount - Paid revenue"
- [ ] Distinguish between "Paid Revenue" and "Booked Amount"
- [ ] Add visual indicators (icons, colors) for clarity
- [ ] Update help text/documentation

### Testing
- [ ] Test dashboard loads without errors
- [ ] Test revenue displays correctly
- [ ] Test charts render correctly
- [ ] Test date range filtering works
- [ ] Test with no data (should show 0, not crash)
- [ ] Test with partial data
- [ ] Cross-browser testing
- [ ] Mobile responsive testing

## 📊 Data Validation

### Compare Old vs New
- [ ] Run old revenue query (from reservations)
- [ ] Run new revenue query (from payments)
- [ ] Document any differences
- [ ] Explain discrepancies to stakeholders
- [ ] Verify new approach is more accurate

### Reconciliation
- [ ] Compare total revenue with accounting records
- [ ] Verify payment counts match transaction logs
- [ ] Check for missing payments
- [ ] Check for duplicate payments
- [ ] Verify multi-tenant data isolation

### Edge Cases
- [ ] Payments without reservations (walk-ins, deposits)
- [ ] Reservations without payments (unpaid bookings)
- [ ] Partial payments (multiple payments per reservation)
- [ ] Refunds (negative revenue)
- [ ] Failed/pending payments (should be excluded)
- [ ] Cancelled reservations with payments (should count)

## 🚀 Deployment

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Stakeholders informed
- [ ] Rollback plan documented

### Deployment Steps
- [ ] Deploy database migration
- [ ] Verify migration success
- [ ] Deploy backend changes
- [ ] Verify backend health
- [ ] Deploy frontend changes
- [ ] Verify frontend loads

### Post-Deployment
- [ ] Monitor error logs
- [ ] Monitor query performance
- [ ] Check dashboard loads correctly
- [ ] Verify revenue numbers make sense
- [ ] Get user feedback
- [ ] Document any issues

## 📈 Monitoring

### Performance Metrics
- [ ] Set up query performance monitoring
- [ ] Track `get_revenue_analytics()` execution time
- [ ] Track API endpoint response times
- [ ] Set up alerts for slow queries (>500ms)
- [ ] Monitor database CPU/memory usage

### Business Metrics
- [ ] Track total revenue trends
- [ ] Track payment count trends
- [ ] Track unpaid amount trends
- [ ] Compare to previous period
- [ ] Set up automated reports

### Alerts
- [ ] Alert on query errors
- [ ] Alert on slow queries
- [ ] Alert on unusual revenue patterns
- [ ] Alert on data anomalies

## 📚 Documentation

### Update Documentation
- [ ] Update API documentation
- [ ] Update developer guide
- [ ] Update user guide
- [ ] Update FAQ
- [ ] Add migration notes to changelog

### Team Training
- [ ] Share refactor summary with team
- [ ] Explain new revenue logic
- [ ] Demonstrate new dashboard
- [ ] Answer questions
- [ ] Document common issues

### Knowledge Base
- [ ] Add "Revenue vs Bookings" article
- [ ] Add "Understanding Unpaid Amount" article
- [ ] Add troubleshooting guide
- [ ] Add query examples

## ✅ Sign-Off

### Technical Sign-Off
- [ ] Database migration verified
- [ ] Backend changes verified
- [ ] Frontend changes verified
- [ ] Tests passing
- [ ] Performance acceptable
- [ ] No critical bugs

### Business Sign-Off
- [ ] Revenue numbers validated
- [ ] Stakeholders approve
- [ ] Users trained
- [ ] Documentation complete

### Final Checklist
- [ ] All previous items completed
- [ ] Rollback plan documented
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Ready for production

## 🔄 Rollback Plan

If issues arise:

### Immediate Actions
1. [ ] Identify the issue
2. [ ] Assess impact
3. [ ] Decide: fix forward or rollback

### Rollback Steps
1. [ ] Revert frontend changes
2. [ ] Revert backend changes
3. [ ] Keep database migration (safe to keep)
4. [ ] Verify old system works
5. [ ] Notify stakeholders

### Post-Rollback
1. [ ] Document what went wrong
2. [ ] Fix the issue
3. [ ] Test thoroughly
4. [ ] Plan re-deployment

## 📞 Support

### Resources
- **Documentation**: `docs/REVENUE_REFACTOR_SUMMARY.md`
- **SQL Queries**: `docs/sql/revenue_queries.sql`
- **Code Examples**: `docs/examples/revenue_analytics_routes.example.ts`
- **Architecture**: See diagram in summary

### Common Issues

**Issue**: Revenue is 0
- **Check**: Are there payments with `type = 'payment'` and `status = 'succeeded'`?
- **Check**: Is date range correct?
- **Check**: Is org_id correct?

**Issue**: Revenue doesn't match expectations
- **Check**: Are you comparing to old reservation-based numbers?
- **Explain**: New numbers reflect actual payments, not bookings

**Issue**: Slow queries
- **Check**: Are indexes created?
- **Check**: Is date range too large?
- **Solution**: Use materialized views for large datasets

**Issue**: RPC function not found
- **Check**: Did migration run successfully?
- **Solution**: Re-run migration script

---

## 🎯 Success Criteria

The refactor is successful when:

✅ All revenue metrics come from `transactions` table  
✅ All queries filter by `type = 'payment'` and `status = 'succeeded'`  
✅ All queries filter by `org_id` (multi-tenant safe)  
✅ Dashboard displays accurate revenue  
✅ Query performance is acceptable (<200ms)  
✅ No errors in production  
✅ Stakeholders approve  
✅ Team understands new approach  

---

**Last Updated**: 2026-01-11  
**Version**: 1.0  
**Status**: Ready for Implementation
