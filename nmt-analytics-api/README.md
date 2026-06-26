# NMT Analytics API

A comprehensive REST API for travel and tourism business management, built with Node.js, Express, and Supabase.

## Features

- **Multi-tenant Architecture**: Organization-scoped data with RLS policies
- **Authentication**: JWT-based auth with Supabase
- **CRUD Operations**: Full CRUD for customers, packages, reservations, transactions
- **Metrics & Analytics**: Revenue tracking, booking analytics
- **Document Generation**: PDF generation from templates
- **File Uploads**: Support for images and documents
- **Real-time**: WebSocket support for live updates

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Validation**: Zod
- **PDF Generation**: PDFKit
- **Deployment**: Railway

## Quick Start

### Prerequisites

- Node.js 18.x or later
- Supabase project

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd nmt-analytics-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Run database migrations:
   ```bash
   # Apply migrations in order
   # 001_init.sql, 002_org_modules.sql, 003_documents.sql
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Node Environment
NODE_ENV=development

# Server Port (defaults to 3001 in development)
PORT=3001

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
# Required: Service role key for server-side operations
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
# Optional: Anon key for client-side operations
SUPABASE_ANON_KEY=your-supabase-anon-key

# Admin Frontend URL for CORS (defaults to http://localhost:5173 in development)
ADMIN_URL=http://localhost:5173
```

## API Endpoints

### Health Check
- `GET /health` - Health check endpoint

### Authentication
- `GET /me` - Get current user profile
- `GET /me/context` - Get user context with modules

### Dashboard
- `GET /api/metrics/overview` - Dashboard metrics
- `GET /api/metrics/revenue-series` - Revenue chart data

### Customers
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer
- `PATCH /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Packages
- `GET /api/packages` - List packages
- `POST /api/packages` - Create package
- `PATCH /api/packages/:id` - Update package

### Reservations
- `GET /api/reservations` - List reservations
- `POST /api/reservations` - Create reservation
- `PATCH /api/reservations/:id` - Update reservation
- `PATCH /api/reservations/:id/status` - Update status
- `DELETE /api/reservations/:id` - Delete reservation
- `GET /api/reservations/:id/voucher.pdf` - Download voucher

### Documents
- `POST /api/documents/generate` - Generate PDF from template

## Deployment

### Railway (API)

1. **Connect Repository**:
   - Go to [Railway.app](https://railway.app)
   - Create new project → Deploy from GitHub
   - Connect your repository

2. **Environment Variables**:
   - Add all variables from `.env.example`
   - Set `NODE_ENV=production`

3. **Database Setup**:
   - Railway provides PostgreSQL automatically
   - Or connect to external Supabase instance
   - Run migrations in order

4. **Build Settings**:
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Node.js version: 18+

5. **Domain**:
   - Railway provides a domain automatically
   - Note the URL for admin app configuration

### Vercel (Admin App)

1. **Connect Repository**:
   - Go to [Vercel.com](https://vercel.com)
   - Import project from GitHub
   - Select the `nmt-analytics-admin` directory

2. **Environment Variables**:
   - Add variables from `nmt-analytics-admin/.env.example`
   - Set `VITE_API_URL` to your Railway API URL

3. **Build Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Deployment**:
   - Vercel will auto-deploy on pushes
   - Get the deployment URL

### Post-Deployment Setup

1. **Update CORS**:
   - In Railway, set `ADMIN_URL` to your Vercel domain

2. **Database Migrations**:
   - Run SQL migrations in Supabase:
     - `supabase/sql/001_init.sql`
     - `supabase/sql/002_org_modules.sql`
     - `supabase/sql/003_documents.sql`

3. **Test Deployment**:
   - Visit Railway API health endpoint
   - Visit Vercel admin app
   - Test login and basic functionality

## Testing

### Manual Testing with curl

1. **Get JWT Token**:
   - Open the admin app in your browser (http://localhost:5173)
   - Log in with your credentials
   - Open browser Developer Tools (F12)
   - Go to Application/Storage > Local Storage
   - Find the `supabase.auth.token` key
   - Copy the `access_token` value

2. **Test Endpoints**:

   ```bash
   # Replace YOUR_JWT_TOKEN with the token from step 1

   # Test /me/context endpoint
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/me/context

   # Test /api/customers endpoint (with pageSize)
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" "http://localhost:3001/api/customers?page=1&pageSize=10"

   # Test /api/customers endpoint (with limit)
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" "http://localhost:3001/api/customers?page=1&limit=10"

   # Test search with "undefined" (should be treated as no search)
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" "http://localhost:3001/api/customers?page=1&pageSize=10&search=undefined"
   ```

### Expected Responses

- **/me/context**: Returns user and profile info
  ```json
  {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com"
    },
    "profile": {
      "role": "admin",
      "org_id": "org-uuid"
    }
  }
  ```

- **/api/customers**: Returns paginated customer list
  ```json
  {
    "data": [...],
    "total": 25,
    "page": 1,
    "pageSize": 10,
    "totalPages": 3
  }
  ```

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run test:smoke` - Run smoke tests

### Project Structure

```
src/
├── routes/          # API route handlers
├── middleware/      # Express middleware
├── lib/            # Utilities and helpers
├── config.ts       # Environment configuration
├── app.ts          # Express app setup
└── index.ts        # Server entry point

supabase/
└── sql/           # Database migrations
```

## License

MIT License
