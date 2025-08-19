# Construction Management System - Handoff Documentation

## 1. Executive Overview

### What the App Does & Who Uses It

The Construction Management System is a sophisticated platform designed for construction project coordination and workforce management. It serves construction companies who need to:

- Track project budgets and cost codes across multiple locations
- Schedule and assign employees to tasks with specific dates and hours
- Monitor project progress with real-time remaining hours calculations
- Manage crew assignments and foreman hierarchies
- Import budget data from Excel files with formula preservation
- Export reports for daily schedules and project status

**Primary Users:**
- **Project Managers**: Monitor overall project health and resource allocation
- **Superintendents**: Coordinate daily operations and crew assignments  
- **Foremen**: Manage task assignments and crew productivity
- **Admins**: System configuration and user management

### Current State

**What's Working:**
- ✅ Complete task management with drag-and-drop scheduling
- ✅ Employee assignment system with automatic foreman selection
- ✅ Budget tracking with color-coded remaining hours (green/yellow/red)
- ✅ Excel import with formula preservation and automatic calculations
- ✅ Real-time WebSocket updates across all connected clients
- ✅ Role-based authentication with session management
- ✅ Dashboard with three-day task overview (yesterday/today/tomorrow)
- ✅ Location-based cost code progress bars with budget markers
- ✅ Recently optimized performance (bootstrap endpoint reduces load time by 75%)

**Work in Progress:**
- 🔄 Database indexing for faster task date-range queries (700ms+ → target <50ms)
- 🔄 Enhanced ETag caching for 304 responses
- 🔄 Assignment page task dropdown now shows "Task Name - Project Name - Location Name"

**Known Issues:**
- ⚠️ Task date-range queries still slow (500-800ms) - needs index optimization
- ⚠️ No ability to completely remove all employees from a task
- ⚠️ Location completion percentage needs calculation based on completed tasks vs manual override

### Immediate Priorities (Next 30-60 Days)

1. **Performance Optimization** (Week 1-2)
   - Implement database indexes on task dates
   - Add ETag versioning for fast 304 responses
   - Target sub-50ms response times for all queries

2. **Production Deployment** (Week 2-3)
   - Migrate from Replit to production hosting (Vercel + managed Postgres recommended)
   - Set up proper environment variable management
   - Implement monitoring and error tracking

3. **Feature Enhancements** (Week 3-4)
   - Allow complete employee removal from tasks
   - Implement location completion percentage calculation
   - Add "Add Line Item" button improvements for budget interface

## 2. Tech Summary

### Tech Stack
- **Frontend**: React 18 + TypeScript, Vite build system
- **Backend**: Express.js + TypeScript  
- **Database**: Supabase PostgreSQL via Drizzle ORM
- **Real-time**: WebSocket server for live updates
- **UI**: Tailwind CSS + shadcn/ui component library
- **State Management**: TanStack React Query
- **Routing**: Wouter (lightweight React router)
- **Forms**: React Hook Form + Zod validation
- **Authentication**: Session-based with PostgreSQL storage
- **Icons**: Lucide React
- **Drag & Drop**: @dnd-kit library

### How to Run Locally

```bash
# Clone repository
git clone [REPO_URL]
cd construction-management-system

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in DATABASE_URL and other secrets

# Run development server
npm run dev

# Database operations
npm run db:push    # Push schema changes
npm run db:studio  # Open Drizzle Studio
```

**Required Environment Variables:**
- `DATABASE_URL` - Supabase PostgreSQL connection string (transaction pooler :6543)
- `NODE_ENV` - Set to 'development' for local, 'production' for deploy
- `PORT` - Server port (defaults to 5000)

### Repository & CI/CD
- **Current Location**: Replit workspace (development environment)
- **Main Branch**: All development currently on main branch
- **CI/CD**: None currently implemented - manual deployments
- **Build Command**: `npm run build && npm run start`

### Database Details
- **Provider**: Supabase PostgreSQL (transaction pooler for PgBouncer compatibility)
- **Connection**: Uses postgres-js driver with SSL required
- **Schema Management**: Drizzle ORM with TypeScript schema definitions
- **Migrations**: `npm run db:push` for schema changes (no formal migration files yet)
- **Location**: `shared/schema.ts` contains all table definitions
- **Connection Optimization**: Singleton pattern, max 5 connections, graceful shutdown
- **Performance**: Recent 5,250x improvement in task creation (21+ seconds → 4ms)

## 3. Deployment & Maintenance

### Current Hosting
- **Development**: Replit workspace with live preview
- **Production**: None currently deployed
- **Database**: Supabase hosted PostgreSQL

### Recommended Production Path
1. **Frontend**: Vercel (optimal for React/Vite)
2. **Backend**: Render or Railway (Node.js compatible)
3. **Database**: Keep Supabase or migrate to PlanetScale/Neon
4. **CDN**: Vercel's built-in CDN for static assets

### Monitoring & Logging Needs
**Currently Exists:**
- Console logging with performance timing
- Server-Timing headers for request profiling
- Basic error handling with timeout protection

**Needs Implementation:**
- Error reporting service (Sentry recommended)
- Uptime monitoring (UptimeRobot)
- Performance monitoring (LogRocket or similar)
- Database query monitoring

### Weekly Maintenance Tasks
- **Dependency Updates**: Check for security patches, update non-breaking versions
- **Database Health**: Monitor query performance, check connection pool usage
- **Backup Verification**: Ensure Supabase backups are functioning
- **Uptime Checks**: Review error rates and response times
- **User Support**: Address any reported issues or feature requests

## 4. Security & Access

### Authentication Model
- **Session-based authentication** using PostgreSQL session storage
- **Password hashing**: Uses bcrypt for secure password storage
- **Roles**: Admin, Superintendent, Project Manager, Foreman
- **Session management**: connect-pg-simple for persistent sessions
- **First-login flow**: Forces password change with isPasswordSet flag
- **User-employee sync**: Bidirectional synchronization between users and employees

### Security To-Dos
- ⚠️ **Password reset flow**: Not yet implemented
- ⚠️ **API rate limiting**: Needs implementation
- ⚠️ **HTTPS enforcement**: Required for production
- ⚠️ **CORS configuration**: Currently permissive, needs tightening

### Access & Handoff Checklist
**Repository Access:** 
- [ ] GitHub/GitLab repository access
- [ ] Branch protection rules setup

**Database Access:**
- [ ] Supabase project admin access
- [ ] Backup and restore procedures documented
- [ ] Connection string and credentials transfer

**Environment & Secrets:**
- [ ] Production environment variables documented
- [ ] API keys inventory and transfer
- [ ] SSL certificates and domain access

**Hosting:**
- [ ] Vercel/hosting platform admin access
- [ ] Domain DNS management
- [ ] CDN configuration access

## 5. Features with Tricky Logic

### Budget Import System
- **File Type**: Excel (.xlsx) with formula preservation
- **Location**: `test_excel_import.js` contains import logic
- **Key Features**: 
  - Automatic formula recalculation
  - Unit conversion handling
  - Validation against existing cost codes
  - Real-time progress bars with budget markers
- **Storage**: Files processed in-memory, not permanently stored
- **Limitations**: No size limits currently enforced

### Task Linking & Ordering
- **Complex Logic**: Tasks can be linked with dependencies affecting scheduling
- **Drag & Drop**: Reordering updates dependent task dates automatically
- **Weekend Rules**: Task scheduling respects business day constraints
- **Real-time Updates**: WebSocket broadcasts changes to all connected clients
- **Critical Code**: `shared/taskUtils.ts` and `CreateTaskModal.tsx`

### Foreman Assignment Logic
- **Automatic Assignment**: Single foreman on task → auto-assigned as task foreman
- **Multiple Foremen**: System clears assignment, requires manual selection
- **Hierarchy Display**: Complex display logic based on assigned vs. overall foreman
- **Location**: `reassignTaskForeman()` function in `server/routes.ts`

## 6. Roadmap & Future Expansion

### Near-term Features (3-6 months)
- **Daily Labor Review**: Supervisor approval workflow for daily time sheets
- **Printed Schedules**: PDF generation for field distribution
- **Budget vs Actual Reporting**: Cost tracking with variance analysis
- **Role-based Dashboards**: Customized views per user role

### Integration Priorities
- **Sage Intacct**: Timesheet and payroll data sync
- **Samsara GPS**: Equipment and vehicle tracking integration  
- **Outlook/Teams**: Schedule distribution and notifications
- **Mobile Apps**: Field data entry and schedule access

### Advanced Features (6+ months)
- **RFI Helper**: AI-assisted request for information workflows
- **Audit Logs**: Complete change tracking and compliance reporting
- **Mobile/Offline**: PWA with offline task updates
- **ADA Compliance**: Accessibility improvements and standard plan helpers

## 7. Consultant Brief

### Role Overview
**Commitment**: 5-20 hours/week (flexible based on project needs)
**Reporting**: Direct to company President (non-technical communication required)
**Focus**: Business process optimization, technical maintenance, feature development

### Required Skills
- Full-stack JavaScript/TypeScript development
- React and modern frontend development
- Node.js/Express backend development
- PostgreSQL database management
- Understanding construction/project management workflows
- Clear communication in plain English for business stakeholders

### Initial Deliverables (First 2-4 Weeks)
1. **Performance Optimization**: Complete database indexing and query optimization
2. **Production Deployment**: Set up hosting, monitoring, and deployment pipeline  
3. **Documentation**: API documentation and development workflow documentation
4. **Security Audit**: Implement password reset flow and security hardening

### Ongoing Cadence
- **Weekly Check-ins**: 30-minute status calls with President
- **Monthly Reports**: Progress summary and upcoming priorities
- **Quarterly Planning**: Feature roadmap and technical debt assessment
- **Documentation**: Maintain technical docs and business process documentation

## Open Questions & Clarifications

### Hosting & Links
- **Current Replit Project**: [Provide Replit workspace URL]
- **Deployment URL**: None currently - needs production deployment
- **Recommended Hosting**: Vercel (frontend) + Render/Railway (backend) + Supabase (database)

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://[user]:[pass]@[host]:6543/[db]?sslmode=require

# Server
NODE_ENV=production
PORT=5000

# Session (generate secure random string)
SESSION_SECRET=your-secure-session-secret-here
```

### Database Details
- **Provider**: Supabase (current) - credentials handoff needed
- **Migration Process**: Drizzle schema push (`npm run db:push`)
- **Backup Strategy**: Supabase automatic backups (verify schedule)
- **Seed Data**: Sample data generation in `server/storage.ts`

### Authentication Status
- **Password Hashing**: ✅ bcrypt implementation
- **Reset Flow**: ❌ Not implemented - priority to-do
- **Libraries**: connect-pg-simple for sessions, passport-local for authentication
- **Known Gaps**: Password reset, rate limiting, HTTPS enforcement

### Excel Import
- **Sample Files**: Available in `/attached_assets/` directory
- **Field Mapping**: Automatic based on column headers and cost code matching
- **Size Limits**: None currently enforced - recommend 10MB limit
- **Library**: xlsx package for parsing
- **Storage**: In-memory processing, no permanent file storage

### Testing & Code Quality
- **Test Coverage**: ❌ No tests currently - needs implementation
- **Linting**: ESLint configuration in place
- **Code Style**: TypeScript strict mode, Prettier formatting
- **Quality Tools**: Recommend adding Jest, Cypress for testing

### Top 5 Technical Debt Items

1. **Database Indexing** (High Priority)
   - Add indexes on task dates for sub-50ms query performance
   - Estimated effort: 1-2 days

2. **Password Reset Flow** (High Priority)  
   - Implement secure password reset with email verification
   - Estimated effort: 3-4 days

3. **Test Coverage** (Medium Priority)
   - Add unit tests for critical business logic
   - Estimated effort: 1-2 weeks

4. **API Documentation** (Medium Priority)
   - Generate OpenAPI/Swagger documentation
   - Estimated effort: 2-3 days

5. **Error Monitoring** (Medium Priority)
   - Implement Sentry or similar error tracking
   - Estimated effort: 1-2 days

### Contact & Next Steps

For immediate questions or to begin the handoff process, the project is ready for:
1. Repository transfer and access setup
2. Database credentials handoff  
3. Production deployment planning
4. Consultant onboarding and technical review

The system is stable and functional with strong performance optimizations recently implemented. The primary focus should be completing the production deployment and implementing the remaining security features.