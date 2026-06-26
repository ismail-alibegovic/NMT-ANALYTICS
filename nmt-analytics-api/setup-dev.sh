#!/bin/bash
# Quick setup script for NMT Analytics development mode

echo "🚀 NMT Analytics - Development Setup"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Add DEV_BYPASS_AUTH if not present
if ! grep -q "DEV_BYPASS_AUTH" .env; then
    echo "✓ Adding DEV_BYPASS_AUTH=true to .env"
    echo "" >> .env
    echo "# Development Mode" >> .env
    echo "DEV_BYPASS_AUTH=true" >> .env
else
    echo "✓ DEV_BYPASS_AUTH already in .env"
fi

echo ""
echo "📊 Running seed script..."
echo ""

# Run seed
npm run seed:dev

echo ""
echo "======================================"
echo "✅ Setup complete!"
echo ""
echo "NEXT STEPS:"
echo "1. Copy the org ID from the output above"
echo "2. Add this line to your .env file:"
echo "   DEV_ORG_ID=<paste-org-id-here>"
echo "3. The dev server will auto-restart"
echo "4. Open http://localhost:5173 to test"
echo ""
