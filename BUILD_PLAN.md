# LuxApts Build Plan
## The Bloomberg Terminal + OpenAI + Zillow of Rentals

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Backend/DB | Supabase (Postgres + Auth + Storage + Edge Functions) |
| AI | xAI (Grok) with RAG + pgvector embeddings |
| Voice | LiveKit Telephony (Phase 3) |
| Email | Resend |
| Hosting | Vercel |

---

## Phase 1: Foundation (Core Infrastructure)
**Goal:** Database, auth, basic API structure

### 1.1 Project Setup
- [ ] Initialize Next.js 15 with TypeScript
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Setup project structure:
  ```
  luxapts-platform/
  ├── src/
  │   ├── app/                 # Next.js App Router
  │   │   ├── (public)/        # Public pages (search, browse)
  │   │   ├── (auth)/          # Auth pages
  │   │   ├── admin/           # Admin dashboard
  │   │   └── api/             # API routes
  │   ├── components/          # React components
  │   ├── lib/                 # Utilities, configs
  │   │   ├── supabase/        # Supabase clients
  │   │   ├── xai/             # xAI integration
  │   │   └── resend/          # Email service
  │   ├── db/                  # Database types & queries
  │   └── types/               # TypeScript types
  ├── supabase/
  │   ├── migrations/          # SQL migrations
  │   └── functions/           # Edge functions
  └── public/
  ```

### 1.2 Supabase Setup
- [ ] Create Supabase project
- [ ] Apply database schema:
  - `cities` & `neighborhoods`
  - `buildings` & `amenities` & `building_amenities`
  - `floorplans` & `units`
  - `unit_price_snapshots`
  - `listing_sources`
  - `profiles` (extends auth.users)
  - `leads` & `lead_targets` & `lead_events`
  - `agents` & `agent_assignments`
  - `building_facts` & `building_documents`
  - `embeddings` (pgvector)
- [ ] Enable pgvector extension
- [ ] Apply RLS policies (admin, agent, partner, public)
- [ ] Create helper functions (`is_admin()`, etc.)

### 1.3 Auth System
- [ ] Supabase Auth configuration
- [ ] Role-based profiles (admin, agent, partner, renter)
- [ ] Middleware for protected routes
- [ ] Admin-only route protection

---

## Phase 2: Public Experience (Search & Browse)
**Goal:** Public-facing search, building pages, AI-powered discovery

### 2.1 Public Pages
- [ ] Home page with city selector + search bar
- [ ] City landing pages (`/[city]`) - SEO optimized
- [ ] Building listing page (`/[city]/buildings`)
- [ ] Building detail page (`/buildings/[id]`)
- [ ] Unit/floorplan views
- [ ] Neighborhood pages

### 2.2 Search System
- [ ] `/api/search_listings` - structured filters
  - City, neighborhoods, beds, baths, budget, amenities
  - Move-in date, pet-friendly, parking
  - Sort options (price, sqft, newest)
- [ ] Search results UI with map integration
- [ ] Filter sidebar component
- [ ] Pagination + infinite scroll

### 2.3 Building Comparison
- [ ] `/api/compare_buildings` - side-by-side comparison
- [ ] Compare UI (amenities, prices, policies)
- [ ] Price statistics by bed count
- [ ] "What's different" highlights

### 2.4 Data Display
- [ ] Latest pricing from snapshots (with "as of" timestamp)
- [ ] Amenity badges
- [ ] Photo galleries
- [ ] Floorplan viewer
- [ ] Contact/inquiry forms

---

## Phase 3: AI Layer (The "Building Brain")
**Goal:** AI-powered search, chat, recommendations

### 3.1 xAI Integration
- [ ] xAI client setup (OpenAI-compatible)
- [ ] Tool definitions for AI:
  - `search_listings` - structured search
  - `compare_buildings` - A vs B comparison
  - `get_comparable_buildings` - similar buildings
  - `create_lead` - capture lead from conversation
  - `get_building_details` - fetch facts/policies

### 3.2 Embeddings & Vector Search
- [ ] Embedding generation for buildings/units/docs
- [ ] pgvector similarity search
- [ ] RAG pipeline:
  1. Parse user intent
  2. Hard filter (SQL)
  3. Vector rank (similarity)
  4. Merge scores
  5. Generate explainable results

### 3.3 AI Chat Widget
- [ ] `/api/chat` - RAG-powered chat
- [ ] Chat UI component (floating widget)
- [ ] Building-aware context (on building pages)
- [ ] Intent detection (tour request, question, comparison)
- [ ] Lead capture triggers

### 3.4 AI Features
- [ ] Natural language search ("2bed under $4k with gym near subway")
- [ ] Personalized shortlists ("Your Top 5")
- [ ] "Best Value" / "Best Amenities" rankings
- [ ] Building recommendations

---

## Phase 4: Lead Management
**Goal:** Capture, route, and manage leads

### 4.1 Lead Capture
- [ ] `/api/create_lead` - unified lead creation
- [ ] Tour request forms
- [ ] Chat-to-lead conversion
- [ ] Session tracking (pre-signup behavior)

### 4.2 Lead Routing
- [ ] `/api/assign_lead` - manual + auto routing
- [ ] Round-robin assignment
- [ ] Territory-based routing
- [ ] Performance-based routing (later)

### 4.3 Notifications
- [ ] Resend email integration
- [ ] New lead notifications
- [ ] Tour confirmations
- [ ] Agent intro emails
- [ ] Price drop alerts (later)

---

## Phase 5: Admin Dashboard
**Goal:** Full control for admins

### 5.1 Admin Pages
- [ ] `/admin` - overview dashboard
- [ ] `/admin/leads` - lead list + filters
- [ ] `/admin/leads/[id]` - lead detail + assign
- [ ] `/admin/buildings` - inventory management
- [ ] `/admin/agents` - agent management
- [ ] `/admin/analytics` - metrics

### 5.2 Admin Features
- [ ] Lead status management
- [ ] Agent assignment UI
- [ ] Building CRUD operations
- [ ] Bulk pricing updates
- [ ] User role management

---

## Phase 6: Agent Portal
**Goal:** Tools for agents to manage leads

### 6.1 Agent Dashboard
- [ ] `/agent` - assigned leads overview
- [ ] Lead detail view
- [ ] Status updates
- [ ] Notes/activity log
- [ ] Conversion tracking

### 6.2 Agent Features
- [ ] Accept/decline assignments
- [ ] Schedule tours
- [ ] Client communication log
- [ ] Performance metrics

---

## Phase 7: Partner Portal
**Goal:** Building owners/brokerages manage inventory

### 7.1 Partner Dashboard
- [ ] `/partner` - portfolio overview
- [ ] Building management
- [ ] Pricing updates
- [ ] Availability management
- [ ] Lead statistics

### 7.2 Partner Features
- [ ] Unit CRUD operations
- [ ] Bulk CSV upload
- [ ] Photo management
- [ ] Performance analytics

---

## Phase 8: Voice Agent (LiveKit Telephony)
**Goal:** AI voice operator for phone inquiries

### 8.1 LiveKit Setup
- [ ] LiveKit account + SIP trunk configuration
- [ ] Inbound call handling
- [ ] Voice agent service

### 8.2 Voice AI
- [ ] Speech-to-text integration
- [ ] Same AI tools as chat (search, compare, lead)
- [ ] Real-time pricing lookups
- [ ] Lead capture via voice
- [ ] Handoff to human agent

---

## Phase 9: Data Ingestion
**Goal:** Keep inventory fresh

### 9.1 Ingestion Pipeline
- [ ] `listing_sources` management
- [ ] `ingestion_runs` tracking
- [ ] CSV upload processing
- [ ] API integrations (building feeds)

### 9.2 Scheduled Jobs
- [ ] Supabase Edge Functions for refresh
- [ ] pg_cron for scheduling
- [ ] Price snapshot capture
- [ ] Availability sync
- [ ] Stale listing cleanup

---

## Phase 10: Analytics & Optimization
**Goal:** Track everything, optimize performance

### 10.1 Analytics
- [ ] Search events tracking
- [ ] Chat session metrics
- [ ] Lead funnel analysis
- [ ] Agent performance
- [ ] Building performance

### 10.2 Optimization
- [ ] Database indexes
- [ ] Query optimization
- [ ] Caching strategy
- [ ] CDN for assets
- [ ] Edge rendering

---

## Database Schema Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   cities    │────▶│  neighborhoods   │     │  amenities  │
└─────────────┘     └──────────────────┘     └─────────────┘
       │                    │                       │
       ▼                    ▼                       │
┌─────────────────────────────────────┐            │
│            buildings                │◀───────────┘
│  (partner_user_id → profiles)       │     building_amenities
└─────────────────────────────────────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌─────────────────┐
│ floorplans │ │   units    │ │ building_facts  │
└────────────┘ └────────────┘ │ building_docs   │
                    │         └─────────────────┘
                    ▼
         ┌─────────────────────┐
         │ unit_price_snapshots│
         └─────────────────────┘

┌──────────────────────────────────────────────────┐
│                    LEADS                          │
├──────────────┬──────────────┬────────────────────┤
│    leads     │ lead_targets │    lead_events     │
└──────────────┴──────────────┴────────────────────┘
                      │
                      ▼
         ┌─────────────────────┐
         │  agent_assignments  │
         └─────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│                   USERS                           │
├──────────────┬──────────────┬────────────────────┤
│   profiles   │    agents    │     partners       │
│ (role-based) │              │                    │
└──────────────┴──────────────┴────────────────────┘
```

---

## API Endpoints Summary

### Public APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search_listings` | POST | Search available units with filters |
| `/api/compare_buildings` | POST | Compare two buildings side-by-side |
| `/api/get_comparable` | POST | Find similar buildings |
| `/api/building/[id]` | GET | Building details |
| `/api/chat` | POST | AI chat with RAG |

### Lead APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/create_lead` | POST | Create new lead |
| `/api/assign_lead` | POST | Assign lead to agent |

### Admin APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/leads` | GET | List all leads |
| `/api/admin/buildings` | CRUD | Manage buildings |
| `/api/admin/agents` | CRUD | Manage agents |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# xAI
XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1

# Resend
RESEND_API_KEY=
FROM_EMAIL="LuxApts <hello@luxapts.co>"

# LiveKit (Phase 8)
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=
```

---

## Recommended Build Order

### MVP (Ship Fast)
1. **Phase 1** - Foundation (database, auth, project structure)
2. **Phase 2** - Public pages (search, browse, building pages)
3. **Phase 4.1** - Lead capture (forms, basic lead creation)
4. **Phase 5.1-5.2** - Basic admin dashboard

### AI Enhancement
5. **Phase 3** - AI layer (xAI, embeddings, chat)

### Full Platform
6. **Phase 4.2-4.3** - Lead routing + notifications
7. **Phase 6** - Agent portal
8. **Phase 7** - Partner portal

### Advanced
9. **Phase 8** - Voice agent (LiveKit)
10. **Phase 9** - Data ingestion pipelines
11. **Phase 10** - Analytics

---

## Ready to Start?

Once you approve this plan, I'll begin with **Phase 1: Foundation**:
1. Initialize Next.js 15 project with TypeScript
2. Setup Tailwind + shadcn/ui
3. Create the database schema SQL
4. Setup Supabase clients
5. Implement basic auth flow

Let me know if you want to:
- Adjust the phases or priorities
- Add/remove features
- Start building immediately
