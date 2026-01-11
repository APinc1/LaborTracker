# Construction Management System

## Overview

This full-stack construction project management system provides comprehensive capabilities including budget tracking, location management, employee scheduling, and task assignment. It aims to streamline operations and enhance efficiency for construction projects, with a vision to become a leading solution in the construction management software market.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18 and TypeScript, styled using Tailwind CSS with shadcn/ui components for a responsive and modern design. It features a sidebar navigation and a real-time dashboard. Key UI/UX decisions include:
- **Responsive Design**: Mobile-first approach using Tailwind CSS.
- **Component Library**: Utilizing Radix UI primitives via shadcn/ui for consistent and accessible UI elements.
- **Iconography**: Lucide React for a unified icon set.
- **Data Display**: Sticky table headers and columns for improved readability in large tables.
- **Interaction**: Intuitive drag-and-drop for task reordering and clear dialogs for user actions.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Vite for builds, TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form validation.
- **Backend**: Express.js with TypeScript, utilizing a RESTful API design with CRUD operations.
- **Database**: Supabase PostgreSQL via Drizzle ORM for type-safe operations. Successfully migrated from in-memory to persistent storage using postgres-js driver with SSL connection. Completed major migration (August 2025) from string-based locationId to foreign key relationships for improved data integrity. **Deployment optimized** (August 2025) with singleton connection pattern, PgBouncer transaction pooling compatibility (prepare: false), connection limits (max: 5), and graceful shutdown handling. **Performance breakthrough** (August 2025): Task creation optimized from 21+ seconds to ~4ms (5,250x improvement) by eliminating expensive getTasks() calls and implementing constant-time helper functions for order calculation and sequential date handling. **Production-ready optimizations** (August 2025): Auto-increment sequence management, single round-trip CTE operations achieving sub-50ms performance, connection pool warming to eliminate cold start delays, and relaxed order validation for seamless task linking.
- **Real-time**: WebSocket server for live updates and notifications across clients.
- **Authentication**: Session-based authentication with PostgreSQL session storage, supporting user roles (Admin, Superintendent, Project Manager, Foreman) and role-based access control. Includes first-login password change and bidirectional employee-user synchronization. Fixed frontend login API request format issue.
- **Data Flow**: Client requests via React Query, processed by Express routes, interacting with the database via Drizzle ORM, with WebSocket broadcasting changes.
- **Deployment**: Production-ready with `/healthz` endpoint, server timeouts (20s headers, 15s requests), request timeout protection (25s), deferred initialization, and environment variable configuration. **Server-Timing headers** (August 2025) implemented with on-headers package for reliable performance monitoring showing queue, validation, database, and serialization timings. **Compression optimized** to skip small POST responses while maintaining performance for GET requests.

### Feature Specifications
- **Core Entities**: Manages Projects, Budget Line Items, Locations, Employees, Tasks, and Crews.
- **Budget Management**: Two-tier budget system with project-level master budgets and location-level derived budgets. Master budgets support SW62 Excel format import (21 columns). Location budgets can derive line items from the project master with parent-child auto-selection logic (selecting parent auto-selects all children; selecting child auto-selects parent). Master budget changes to unit cost, description, unit, conv UM, and cost code automatically propagate to linked location items. QTY and PX remain independent at the location level. Budget items support inline editing with an explicit save mechanism.
- **Employee Management**: Comprehensive employee profiles with roles, trade specializations (Primary, Secondary, Tertiary), union status, and apprentice levels. Includes validation for unique Team Member IDs.
- **Task Management**: Scheduling, assignment, and real-time status updates. Features include drag-and-drop reordering with dependency management, dynamic cost code date ranges, and intelligent date shifting based on task relationships. Supports both individual and bulk task creation with specific rules for sequential dependencies. **Driver Hours Separation** (August 2025): Assignments for drivers are automatically tagged with `isDriverHours` flag and excluded from task progress calculations, ensuring transportation hours don't skew project completion metrics.
- **Daily Job Reports (DJR)**: Comprehensive daily reporting system (December 2025) with Supabase persistence. Tracks task date, submission date, weather conditions at 7am/noon/4pm (auto-fetched from Open-Meteo API using project address), quantities for each task in linked groups, and notes. Features JSON-based edit history tracking for audit trail. Weather auto-populates for new reports when project has a validated address via Shippo. Reports are tied to linkedTaskGroup and taskDate for proper grouping.
- **Dashboard Features**: Real-time project overview with day-based task filtering (yesterday/today/tomorrow), employee assignment tracking with accurate project name resolution, and location progress monitoring with cost code budget tracking. Location names are clickable for navigation to detailed location pages. Location Progress section filters to show only locations with tasks scheduled on the selected day.
- **Location Management**: Includes location status tracking with three states: Active (default), Completed, and Suspended. Suspended locations require a reason. When a location is marked as Completed or Suspended, users are prompted to enter actual quantities for budget line items. The Actuals Modal displays all budget items with bidirectional calculation between Actual Qty and Actual Conv Qty using the conversion factor. Locations with missing actuals show a warning indicator. Also includes isComplete boolean field for legacy compatibility.
- **Task Assignment Enhancement**: Future improvement needed: Allow complete removal of all employees from a task. Currently the system requires at least one employee assignment, but there should be an option to unassign everyone from a task entirely.
- **Export Functionality**: PDF and Excel export capabilities for various reports.

### System Design Choices
- **Monorepo Structure**: Shared schema definitions between frontend and backend for consistency.
- **Type Safety**: Full TypeScript coverage and Drizzle ORM type generation for robust development.
- **Modular Design**: Separation of concerns with distinct management interfaces for different aspects of project management.
- **Resilient Storage**: Dual-mode storage with automatic fallback for reliability.
- **Data Validation**: Zod schemas for comprehensive runtime validation.

## Deployment Configuration

**Database**: Configured for Supabase transaction pooler (port 6543) with SSL required, optimized for PgBouncer compatibility.
**Healthcheck**: `/healthz` endpoint for fast deployment verification.
**Environment**: Supports PORT variable with 5000 fallback, DATABASE_URL required.
**Timeouts**: 25-second request protection prevents platform timeouts.
**Build**: `npm run build && npm run start` for production deployment.

## External Dependencies

### Frontend
- **UI Components**: Radix UI (via shadcn/ui)
- **Date Handling**: `date-fns`
- **Form Validation**: `Zod`
- **Icons**: `Lucide React`
- **Styling**: `Tailwind CSS`
- **Drag and Drop**: `@dnd-kit`

### Backend
- **Database Connection**: `postgres-js` (for Supabase PostgreSQL)
- **Database Fallback**: `@neondatabase/serverless` (legacy support)
- **WebSocket**: `ws`
- **Session Storage**: `connect-pg-simple`
- **Development Utility**: `tsx` (for TypeScript execution)