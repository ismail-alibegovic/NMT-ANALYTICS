-- Create document_templates table
CREATE TABLE IF NOT EXISTS document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    html_template TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, key)
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- e.g., 'reservation', 'customer'
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL, -- merged data for the document
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policies for document_templates
CREATE POLICY "Users can read templates for their org" ON document_templates
    FOR SELECT USING (org_id = get_my_org_id());

CREATE POLICY "Admins can manage templates for their org" ON document_templates
    FOR ALL USING (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK (org_id = get_my_org_id() AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Policies for documents
CREATE POLICY "Users can read documents for their org" ON documents
    FOR SELECT USING (org_id = get_my_org_id());

CREATE POLICY "Users can create documents for their org" ON documents
    FOR INSERT WITH CHECK (org_id = get_my_org_id());

-- Insert default templates
INSERT INTO document_templates (org_id, key, name, html_template)
SELECT
    o.id as org_id,
    'offer' as key,
    'Travel Offer' as name,
    '<h1>Travel Offer</h1>
<p>Dear {{customerName}},</p>
<p>We are pleased to offer you the following travel package:</p>
<h2>{{packageName}}</h2>
<p>Destination: {{destination}}</p>
<p>Departure: {{departureDate}} - {{returnDate}}</p>
<p>Party Size: {{partySize}}</p>
<p>Total Amount: ${{totalAmount}} {{currency}}</p>
<p>Please contact us to confirm this offer.</p>
<p>Best regards,<br>{{orgName}}</p>' as html_template
FROM organizations o
ON CONFLICT (org_id, key) DO NOTHING;

INSERT INTO document_templates (org_id, key, name, html_template)
SELECT
    o.id as org_id,
    'invoice' as key,
    'Invoice' as name,
    '<h1>Invoice</h1>
<p>Customer: {{customerName}}</p>
<p>Package: {{packageName}}</p>
<p>Amount: ${{totalAmount}} {{currency}}</p>
<p>Date: {{date}}</p>
<p>Thank you for your business!</p>' as html_template
FROM organizations o
ON CONFLICT (org_id, key) DO NOTHING;

INSERT INTO document_templates (org_id, key, name, html_template)
SELECT
    o.id as org_id,
    'voucher' as key,
    'Travel Voucher' as name,
    '<!DOCTYPE html>
<html>
<head>
    <title>Travel Voucher - {{orgName}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .agency { font-size: 24px; font-weight: bold; color: #333; }
        .voucher-title { font-size: 18px; color: #666; margin-top: 10px; }
        .passenger-info { background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .package-info { background: #e8f4f8; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .dates-info { background: #f0f8e8; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
        .voucher-number { font-weight: bold; color: #d9534f; }
    </style>
</head>
<body>
    <div class="header">
        <div class="agency">{{orgName}}</div>
        <div class="voucher-title">Travel Voucher</div>
        <div class="voucher-number">Voucher #{{reservationId}}</div>
    </div>

    <div class="passenger-info">
        <h3>Passenger Information</h3>
        <p><strong>Name:</strong> {{customerName}}</p>
        <p><strong>Phone:</strong> {{customerPhone}}</p>
        <p><strong>Email:</strong> {{customerEmail}}</p>
        <p><strong>Party Size:</strong> {{partySize}}</p>
    </div>

    <div class="package-info">
        <h3>Package Information</h3>
        <p><strong>Package:</strong> {{packageName}}</p>
        <p><strong>Destination:</strong> {{destination}}</p>
        <p><strong>Total Amount:</strong> {{totalAmount}} {{currency}}</p>
    </div>

    <div class="dates-info">
        <h3>Travel Dates</h3>
        <p><strong>Departure:</strong> {{departureDate}}</p>
        <p><strong>Return:</strong> {{returnDate}}</p>
        <p><strong>Status:</strong> {{status}}</p>
    </div>

    <div class="footer">
        <p>This voucher confirms your reservation. Please present this document when checking in.</p>
        <p>Generated on {{date}}</p>
    </div>
</body>
</html>' as html_template
FROM organizations o
ON CONFLICT (org_id, key) DO NOTHING;
