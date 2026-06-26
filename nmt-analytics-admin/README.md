# NMT Analytics Admin Dashboard

NMT Analytics Admin is a comprehensive admin dashboard for travel and tourism business management, built on **React and Tailwind CSS**. It provides a complete solution for managing customers, packages, reservations, departures, transactions, and generating reports.

![NMT Analytics Admin Dashboard Preview](./banner.png)

## Overview

NMT Analytics Admin provides essential UI components and layouts for building feature-rich, data-driven admin dashboards for travel businesses. It's built on:

- React 19
- TypeScript
- Tailwind CSS v4
- Axios for API communication
- React Hot Toast for notifications
- Zod for form validation



## Installation

### Prerequisites

To get started with NMT Analytics Admin, ensure you have the following prerequisites installed and set up:

- Node.js 18.x or later (recommended to use Node.js 20.x or later)



1. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```


2. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Features

NMT Analytics Admin includes the following features:

### Dashboard
- Revenue metrics and KPIs
- Interactive revenue trend charts
- Date range filtering

### Customer Management
- Customer list with search and pagination
- Create, edit, and delete customers
- Customer profile management

### Package Management
- Travel package list with search
- Create and edit packages
- Package status management

### Reservation Management
- Reservation list with filtering
- Status updates and management
- Customer and departure tracking

### Transaction Management
- Transaction list with filtering
- Payment method tracking
- Transaction status management

### Reports
- Date-filtered analytics
- CSV export functionality
- Top destinations analysis

### Technical Features
- TypeScript for type safety
- Responsive design with dark mode
- Form validation with Zod
- Toast notifications
- API integration with error handling
- Pagination and search functionality

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3001
```

## API Endpoints

The application expects the following API endpoints:

### Authentication
- `GET /me` - Get current user profile

### Dashboard
- `GET /metrics/overview` - Get dashboard metrics
- `GET /metrics/revenue-series` - Get revenue chart data

### Customers
- `GET /customers` - List customers (with search/pagination)
- `POST /customers` - Create customer
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

### Packages
- `GET /packages` - List packages
- `POST /packages` - Create package
- `PUT /packages/:id` - Update package
- `DELETE /packages/:id` - Delete package

### Departures
- `GET /departures` - List departures
- `POST /departures` - Create departure
- `PUT /departures/:id` - Update departure
- `DELETE /departures/:id` - Delete departure

### Reservations
- `GET /reservations` - List reservations
- `POST /reservations` - Create reservation
- `PUT /reservations/:id` - Update reservation
- `PUT /reservations/:id/status` - Update reservation status
- `DELETE /reservations/:id` - Delete reservation

### Transactions
- `GET /transactions` - List transactions
- `POST /transactions` - Create transaction
- `PUT /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Delete transaction

### Reports
- `GET /reports/summary` - Get report summary
- `GET /reports/transactions/csv` - Download transactions CSV
- `GET /reports/reservations/csv` - Download reservations CSV

## License

NMT Analytics Admin is released under the MIT License.

## Smoke Test Checklist

Before deploying to production, verify these core functionalities:

### Authentication
- [ ] Login with valid credentials redirects to dashboard
- [ ] Invalid login shows error message
- [ ] Logout redirects to login page
- [ ] Protected routes redirect to login when not authenticated

### Dashboard
- [ ] Dashboard loads without errors
- [ ] Metrics display (revenue, bookings, etc.)
- [ ] Chart renders with data
- [ ] Date range picker works

### Customer Management
- [ ] Customer list loads with pagination
- [ ] Create new customer works
- [ ] Edit existing customer works
- [ ] Delete customer works
- [ ] Search functionality works

### Package Management
- [ ] Package list loads
- [ ] Create new package works
- [ ] Edit existing package works
- [ ] Package status updates work

### Reservation Management
- [ ] Reservation list loads with filtering
- [ ] Create new reservation works
- [ ] Status change (pending → confirmed → completed) works
- [ ] Capacity validation prevents overbooking
- [ ] Voucher PDF download works
- [ ] Offer PDF generation works

### Reports
- [ ] Reports page loads
- [ ] CSV export functionality works
- [ ] Date filtering works

### Error Handling
- [ ] 401 errors trigger logout and redirect
- [ ] API errors show user-friendly messages
- [ ] Network errors are handled gracefully
- [ ] Form validation works correctly

### UI/UX
- [ ] Responsive design works on mobile/tablet
- [ ] Dark mode toggle works
- [ ] Loading states display properly
- [ ] Error boundary prevents blank screens

## Support

If you find this project helpful, please consider giving it a star on GitHub. Your support helps us continue developing
and maintaining this template.
