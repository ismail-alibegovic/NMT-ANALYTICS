# Travline — Financial Analysis & Valuation

**Date:** 2026-08-19
**Status:** Production-ready, pre-revenue

---

## 1. Project Summary

| Metric | Value |
|---|---|
| Codebase | ~48,000 lines TypeScript/TSX |
| API routes | 44 files, ~20,100 lines |
| Admin pages | 13 pages + components, ~27,900 lines |
| DB migrations | 34 live migrations (Supabase) |
| Git commits | 95 (Jun 26 – Aug 17, 2026) |
| Architecture | Express + Supabase backend / React + Vite + Tailwind frontend |
| Deployment | Docker Compose, hosted on Zo (travline-sprypine.zocomputer.io) |
| Languages | Bilingual (Bosnian/English) |
| Multi-tenant | Yes — org-scoped RLS, role hierarchy (5 roles) |

### Core Feature Modules

| Module | Details |
|---|---|
| **Sales (Prodaja)** | Dashboard, Customers, Packages, Reservations, Departures, 5-step Sale Wizard |
| **Operations (Operacije)** | Calendar, Contracts (auto-numbered PDF), Receipts (FR-YYYY-XXXX), Sub-agents (atomic Generate Sale), Excursions (passenger tracking, bus lists, bulk import), Hotels (room allocation matrix) |
| **Finance (Finansije)** | Payments, Installments, Invoicing, Reports, Integrations |
| **System (Sistem)** | Audit logs, Documents, Role management, Organization settings |
| **Compliance** | Fiscal layer (RS eTurista, HR Fiskalizacija 2.0 stub, BA-ready), government CIS submission |
| **Public** | Embeddable booking widget, hotel room booking endpoint |
| **Infrastructure** | Sentry monitoring, rate limiting, Helmet security, Zod validation, JWT auth |

---

## 2. Development Cost Analysis (Replacement Value)

### 2.1 Effort Estimate (Traditional Team)

A traditional development team without AI acceleration would require:

| Role | FTE | Duration | Total Hours |
|---|---|---|---|
| Senior Full-Stack (lead) | 1.0 | 5 months | ~800 |
| Frontend Developer | 1.0 | 4 months | ~640 |
| Backend Developer | 0.5 | 5 months | ~400 |
| UI/UX Designer | 0.3 | 3 months | ~144 |
| DevOps / QA | 0.3 | 3 months | ~144 |
| **Total** | **3.1 FTE** | **5 months** | **~2,128 hours** |

### 2.2 Cost by Market

| Market | Rate (blended) | Total Replacement Cost |
|---|---|---|
| Balkan (Bosnia, Serbia, Croatia) | €35–50/hr | **€74,500 – €106,400** |
| Eastern Europe (Poland, Romania) | €45–65/hr | **€95,800 – €138,300** |
| Western Europe (Germany, Netherlands) | €80–120/hr | **€170,200 – €255,400** |
| US / UK | €100–150/hr | **€212,800 – €319,200** |

**Realistic replacement cost:** **€90,000 – €150,000** using regional Balkan/Eastern European talent.

### 2.3 What AI Acceleration Saved

This project was built in ~7 weeks with heavy AI assistance (Zo). The AI acceleration factor is approximately **4–6×** on development velocity. The actual cost incurred was:

| Item | Cost |
|---|---|
| Developer time (Ismail, part-time over 7 weeks) | ~€8,000 – €12,000 (opportunity cost) |
| Zo subscription + AI credits | ~€200–500/month × 2 months = ~€400–1,000 |
| Supabase (free tier) | €0 |
| Domain | ~€15 |
| **Total actual cost to build** | **~€8,500 – €13,500** |

---

## 3. Infrastructure & Operating Costs

### 3.1 Current (Pre-Revenue)

| Service | Tier | Monthly Cost |
|---|---|---|
| Zo hosting (service slot) | Basic plan (1 of 5 slots) | Included in plan |
| Supabase | Free tier (2 projects, 500MB DB) | €0 |
| Sentry | Free tier (5K errors/month) | €0 |
| Domain (travline.io or similar) | Annual | ~€1.25/mo |
| **Current total** | | **~€1.25/mo** |

### 3.2 At Scale (Per 10 Tenants)

| Service | Tier | Monthly Cost |
|---|---|---|
| Supabase | Pro ($25/mo, 8GB DB, daily backups) | ~€23 |
| Zo hosting | Stays on Basic plan (5 service slots) | €0 incremental |
| Sentry | Team ($26/mo at 50K+ errors) | ~€24 |
| Email (transactional) | Resend/SendGrid free tier (3K/mo) → 50K tier | €0 → €35 |
| DB backups / PITR | Supabase addon | €8 |
| **Total at scale (per 10 tenants)** | | **~€55–90/mo** |

### 3.3 Annual Run-Rate Projection

| Tenant Count | Annual Infrastructure |
|---|---|
| 1–10 | €15 – €300 |
| 10–50 | €660 – €1,080 |
| 50–100 | €1,080 – €2,500 |
| 100+ | €2,500 – €5,000+ |

Infrastructure is negligible relative to revenue — gross margins stay above 90% even at small scale.

---

## 4. SaaS Pricing Structure

### 4.1 Tiered Pricing (Per Organization / Per Month)

#### Small Agency (1–5 employees)
- **€99/month** (or €990/year — 2 months free)
- 3 user seats included
- Up to 500 reservations/year
- Core modules: Sales, Operations, Calendar
- Email support

#### Medium Agency (5–20 employees)
- **€249/month** (or €2,490/year)
- 10 user seats included
- Up to 2,000 reservations/year
- All modules including Finance, Sub-agents, Hotel management
- eTurista / fiscal compliance
- Priority email support
- Public booking widget

#### Large Agency (20–50 employees)
- **€499/month** (or €4,990/year)
- 25 user seats included
- Unlimited reservations
- All modules + multi-branch support
- API access
- Dedicated account manager
- Custom integrations

#### Enterprise / Chain (50+ employees, multiple offices)
- **€899–1,499/month** (custom quote)
- Unlimited seats
- White-label option
- On-premise deployment option
- SLA with 99.9% uptime guarantee
- Custom feature development
- Training & onboarding program

### 4.2 Add-Ons

| Add-on | Price |
|---|---|
| Extra user seat (above tier limit) | €15/user/month |
| Additional branch/office | €99/branch/month |
| Custom PDF template design | €500 one-time |
| Data migration from legacy system | €1,500–5,000 one-time |
| API access (Medium tier) | €99/month |
| White-label (Large tier) | €199/month |

### 4.3 Market Comparison

| Competitor | Target Market | Approximate Pricing |
|---|---|---|
| TuristAgent (RS) | Serbia, Bosnia | ~€100–300/mo (license-based, on-premise) |
| Program Agencija (HR) | Croatia | ~€150–400/mo |
| Sintesys (HR) | Croatia | ~€200–500/mo |
| Auroraturist (RS) | Serbia, region | ~€80–250/mo |
| AG TravelSoft (BA) | Bosnia | ~€50–150/mo |
| **Travline** | **Bosnia, Serbia, Croatia** | **€99–899/mo (cloud SaaS)** |

Travline's key differentiator: **cloud-native, multi-tenant, no on-premise server needed, modern UI, built-in fiscal compliance.**

---

## 5. Revenue Projections

### 5.1 Conservative Scenario (Year 1)

| Month | Customers | Mix | MRR | Cumulative ARR |
|---|---|---|---|---|
| 1–3 | 0–3 | 3 Small | €0 → €297 | — |
| 4–6 | 3–8 | 6S + 2M | €297 → €1,096 | ~€13,100 |
| 7–9 | 8–15 | 10S + 4M + 1L | €1,096 → €2,485 | ~€29,800 |
| 10–12 | 15–22 | 14S + 6M + 2L | €2,485 → €3,872 | ~€46,500 |

**Year 1 ARR:** **~€46,500**
**Year 1 Revenue:** **~€28,000** (ramp-adjusted)

### 5.2 Moderate Scenario (Year 1)

| Month | Customers | MRR |
|---|---|---|
| 1–3 | 2–6 | €198 → €694 |
| 4–6 | 6–15 | €694 → €2,100 |
| 7–9 | 15–28 | €2,100 → €4,600 |
| 10–12 | 28–40 | €4,600 → €7,200 |

**Year 1 ARR:** **~€86,400**
**Year 1 Revenue:** **~€48,000**

### 5.3 Optimistic Scenario (Year 1)

Requires active sales outreach, partnership with tourism associations, and presence at regional travel fairs.

| Month | Customers | MRR |
|---|---|---|
| 1–3 | 5–12 | €495 → €1,400 |
| 4–6 | 12–25 | €1,400 → €3,800 |
| 7–9 | 25–45 | €3,800 → €8,200 |
| 10–12 | 45–65 | €8,200 → €12,500 |

**Year 1 ARR:** **~€150,000**
**Year 1 Revenue:** **~€80,000**

### 5.4 3-Year Projection (Moderate Scenario)

| Year | Customers | ARR | Annual Revenue | Cumulative Revenue |
|---|---|---|---|---|
| 1 | 40 | €86,400 | €48,000 | €48,000 |
| 2 | 90 | €220,000 | €165,000 | €213,000 |
| 3 | 160 | €420,000 | €340,000 | €553,000 |

Churn assumption: 5–8% annual (low — ERP stickiness in travel is high once workflows are embedded).

---

## 6. Valuation Estimate

### 6.1 Current State (Pre-Revenue, Production-Ready)

SaaS valuation multiples for pre-revenue companies are typically based on:
- **Cost-to-build** discounted for lack of traction: 0.5–0.8× replacement cost
- **Comparable transactions** in regional B2B SaaS

| Method | Valuation Range |
|---|---|
| Replacement cost (Balkan rates): €90K–150K × 0.6–0.8 | **€54,000 – €120,000** |
| Replacement cost (Western rates): €170K–320K × 0.5–0.7 | **€85,000 – €224,000** |
| Comparable SaaS acquisitions (pre-revenue, full product) | **€50,000 – €200,000** |

**Realistic current valuation (no customers, product complete): €60,000 – €120,000**

Factors depressing valuation:
- Zero revenue, zero customers
- Single developer / no team
- No Stripe billing integration (must be built before charging)
- No proven product-market fit
- No company entity behind it

Factors increasing valuation:
- Production-grade code quality (0 `tsc` errors, 0 `npm audit` vulnerabilities)
- Multi-tenant architecture from day 1
- Built-in fiscal compliance (rare — most competitors charge extra)
- Modern stack, clean separation of concerns
- Government integration already working (eTurista)
- Bilingual — opens 3 markets simultaneously

### 6.2 Post-Traction Valuation

| Milestone | ARR Multiple | Implied Valuation |
|---|---|---|
| 5 paying customers, €15K ARR | 3–5× | **€45,000 – €75,000** |
| 20 paying customers, €60K ARR | 4–7× | **€240,000 – €420,000** |
| 50 paying customers, €180K ARR | 5–8× | **€900,000 – €1,440,000** |
| 100 paying customers, €400K ARR | 6–10× | **€2,400,000 – €4,000,000** |

SaaS multiples are currently compressed (2025–2026 macro environment), so these use conservative multipliers compared to 2021 ZIRP-era 20–30× ARR.

### 6.3 Sale Structure Options

#### Option A: Full Asset Sale (Code + IP + Domain + Supabase Project)
- **Price:** €80,000 – €150,000 (no customers)
- **Price:** €250,000 – €500,000 (with 20+ customers, €60K+ ARR)
- Includes: all source code, database schema, migrations, brand assets, Supabase project transfer, domain, documentation
- Seller delivers: full codebase, DB export, deployment scripts, 30-day transition support

#### Option B: Source Code License (Non-Exclusive)
- **Price:** €25,000 – €50,000 per license
- Buyer gets: full source code, right to deploy for their own operation, documentation
- Seller retains: full ownership, right to sell to other buyers, right to operate SaaS

#### Option C: SaaS Business Sale (Ongoing Operation)
- **Price:** 3–7× ARR depending on growth rate + asset value
- Includes: customer contracts, recurring revenue, codebase, brand, domain
- Standard 12–24 month transition period for founder

---

## 7. Monthly Earnings Potential (Post-Launch)

### 7.1 By Customer Segment

| Segment | Price/Month | Customers at Scale | Monthly Revenue |
|---|---|---|---|
| Small agencies | €99 | 100 | €9,900 |
| Medium agencies | €249 | 40 | €9,960 |
| Large agencies | €499 | 15 | €7,485 |
| Enterprise | €1,199 | 5 | €5,995 |
| Add-ons (seats, branches, API) | ~€15–99 avg | 60% attach rate | ~€3,000 |
| **Total at scale (160 customers)** | | | **~€36,340/mo** |
| **Annual run-rate** | | | **~€436,000** |

### 7.2 Net Income (At Scale)

| Line Item | Monthly | Annual |
|---|---|---|
| Revenue (160 customers) | €36,340 | €436,080 |
| Infrastructure | –€350 | –€4,200 |
| Support staff (1 FTE) | –€2,500 | –€30,000 |
| Sales/marketing (1 FTE) | –€3,000 | –€36,000 |
| Developer maintenance (0.5 FTE) | –€1,800 | –€21,600 |
| Accounting, legal, misc | –€500 | –€6,000 |
| **Net monthly profit** | **€28,190** | |
| **Net annual profit** | | **€338,280** |
| **Profit margin** | | **77.6%** |

### 7.3 Solo Operator Scenario (No Hires, 40 Customers)

| Line Item | Monthly | Annual |
|---|---|---|
| Revenue (mix of S/M) | €7,200 | €86,400 |
| Infrastructure | –€90 | –€1,080 |
| **Personal take-home** | **€7,110** | **€85,320** |

This is the realistic "lifestyle business" path: 40 agencies paying an average of €180/month, with infrastructure under €100/month and no staff costs.

---

## 8. What Needs to Be Built Before Revenue Generation

| Item | Priority | Est. Effort |
|---|---|---|
| **Stripe billing integration** (subscription management, invoicing, dunning) | Critical | 2–3 weeks |
| **Pricing page / signup flow** (trial → subscription) | Critical | 1–2 weeks |
| **Onboarding automation** (QuickStart is partially built) | High | 1 week |
| **Tenant resource limits** (enforce tier-based caps) | High | 1 week |
| **Legal entity** (d.o.o. or obrt for contracting) | Critical | Administrative |
| **Terms of service / SLA / DPA** | Critical | 1 week + legal review |
| **Automated backups & disaster recovery** | High | 3 days |
| **Monitoring & alerting** (Sentry is done, add uptime) | Medium | 2 days |
| **Marketing site / landing page** | High | 1–2 weeks |

**Total effort to revenue-readiness:** ~6–8 weeks of focused work.

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| TuristAgent dominates — agencies won't switch | High | High | Target new agencies first; offer migration tooling; modern UX is the wedge |
| Slow sales cycle in travel industry | High | Medium | Offer free 30-day trial; attend travel fairs; partner with tourism associations |
| Fiscal regulation changes break compliance | Medium | High | Fiscal layer is abstracted (provider interface); add markets one at a time |
| Supabase dependency lock-in | Low | Medium | Standard PostgreSQL underneath; migration scripts are portable |
| Single developer bus factor | High | High | Code is well-structured and documented; hire or partner before scaling |
| Billing/invoicing complexity (EU VAT, regional tax) | Medium | Medium | Stripe handles most; local invoicing may need a regional provider (e.g., Fiskalizacija) |

---

## 10. Recommendations

1. **Finish billing first** — the product is complete but can't make money without Stripe. This is the single blocking item.

2. **Get 3–5 design partners** — offer 6 months free to 3–5 agencies in exchange for feedback, testimonials, and case studies. This de-risks the product before charging.

3. **Target new agencies, not incumbents** — established agencies running TuristAgent for 10 years won't switch overnight. Newly registered agencies, agencies expanding to new markets, and digital-first agencies are the beachhead.

4. **Position as "modern, cloud, compliant"** — the pitch: no server to maintain, automatic fiscal updates, access from anywhere, interface your staff will actually use.

5. **Consider a "TuristAgent migration" premium service** — charge €2,000–5,000 for data migration from legacy systems. This is high-margin consulting revenue that also locks in the customer.

6. **Solo bootstrap first** — the €85K/year solo operator path is viable without external funding. Take the first 20–30 customers yourself, prove the model, then decide whether to raise or stay independent.

7. **If selling now (pre-revenue)**: expect €60,000–120,000 for the full asset. The buyer would likely be a regional IT company looking to enter travel SaaS, or a competitor wanting the codebase/IP. A non-exclusive license sale (€25K–50K/copy) could generate comparable returns while retaining ownership.

---

*Analysis prepared based on full codebase inspection, project documentation, and regional market knowledge. All figures in EUR. Pricing calibrated against Balkan travel agency software market (TuristAgent, Program Agencija, AG TravelSoft, Sintesys, Auroraturist).*
