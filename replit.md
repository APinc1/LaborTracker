# Construction Management System

## Overview

This is a full-stack construction project management system built with React, Express.js, and PostgreSQL. The application provides comprehensive project management capabilities including budget tracking, location management, employee scheduling, and task assignment for construction projects.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (with in-memory fallback)
- **Real-time**: WebSocket server for live updates
- **Session Management**: connect-pg-simple for PostgreSQL session storage
- **API Design**: RESTful API with CRUD operations

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations
- **Database Provider**: Supabase (PostgreSQL)
- **Schema Management**: Centralized schema definitions in shared directory
- **Migrations**: Drizzle Kit for database migrations
- **Storage**: Dual-mode storage with automatic fallback to in-memory for reliability

## Key Components

### Core Entities
1. **Projects**: Main project entities with dates, managers, and superintendents
2. **Budget Line Items**: Detailed budget tracking with cost codes and categories
3. **Locations**: Project locations with budget allocations
4. **Employees**: Staff management with roles and assignments
5. **Tasks**: Work items with scheduling and assignment capabilities
6. **Crews**: Team organization and management

### Frontend Components
- **Layout System**: Sidebar navigation with responsive design
- **Dashboard**: Real-time project overview with metrics
- **Management Modules**: Dedicated interfaces for projects, budgets, locations, employees
- **Form Components**: Reusable form components with validation
- **Export Functionality**: PDF and Excel export capabilities

### Backend Services
- **Storage Layer**: Abstract storage interface for data operations
- **Route Handlers**: RESTful API endpoints for all entities
- **WebSocket Service**: Real-time updates and notifications
- **Session Management**: User authentication and session handling

## Data Flow

1. **Client Requests**: Frontend makes API calls through React Query
2. **Server Processing**: Express routes handle requests and validate data
3. **Database Operations**: Drizzle ORM executes type-safe database queries
4. **Real-time Updates**: WebSocket broadcasts changes to connected clients
5. **Client Updates**: React Query invalidates and refetches affected data

### Authentication Flow
- Session-based authentication with PostgreSQL session storage
- User roles (Admin, Superintendent, Project Manager, Foreman)
- Protected routes and role-based access control

## External Dependencies

### Frontend Dependencies
- **UI Components**: Radix UI primitives with shadcn/ui
- **Date Handling**: date-fns for date manipulation
- **Form Validation**: Zod for schema validation
- **Icons**: Lucide React for consistent iconography
- **Styling**: Tailwind CSS with custom design tokens

### Backend Dependencies
- **Database**: @neondatabase/serverless for PostgreSQL connection
- **WebSocket**: ws library for real-time communication
- **Session Storage**: connect-pg-simple for PostgreSQL sessions
- **Development**: tsx for TypeScript execution in development

## Deployment Strategy

### Build Process
1. **Frontend Build**: Vite builds React app to `dist/public`
2. **Backend Build**: esbuild bundles server code to `dist/index.js`
3. **Database Setup**: Drizzle Kit pushes schema changes to database

### Production Configuration
- **Environment Variables**: DATABASE_URL for database connection
- **Static Files**: Express serves built frontend from `dist/public`
- **Process Management**: Single Node.js process handles both API and static files

### Development Workflow
- **Hot Reload**: Vite HMR for frontend development
- **TypeScript**: tsx for backend development with auto-restart
- **Database**: Drizzle Kit for schema management and migrations

### Key Architectural Decisions

1. **Monorepo Structure**: Shared schema definitions between frontend and backend
2. **Type Safety**: Full TypeScript coverage with Drizzle ORM type generation
3. **Real-time Features**: WebSocket integration for live project updates
4. **Modular Design**: Separate management interfaces for different aspects
5. **Responsive UI**: Mobile-first design with Tailwind CSS
6. **Data Validation**: Zod schemas for runtime validation and type safety
7. **Resilient Storage**: Dual-mode storage with automatic fallback for reliability

## Recent Changes

### July 15, 2025
- ✅ Fixed TypeScript errors in storage implementation
- ✅ Added database connection with proper error handling and URL encoding
- ✅ Implemented dual-mode storage (Database/In-Memory) with automatic fallback
- ✅ Enhanced error handling in API routes with detailed logging
- ✅ Confirmed all core functionality working: projects, budgets, schedules, employees, assignments
- ✅ Application successfully running on port 5000 with sample data
- ✅ Tested project creation API - working correctly

### Current Status
- Application is fully functional with comprehensive construction management features
- Using in-memory storage for reliable operation (data does not persist between server restarts)
- All major modules implemented and tested
- Budget system restructured to work with locations instead of projects
- Database connection configured but not active due to connection issues
- Ready for production deployment with proper database setup

### July 16, 2025
- ✅ Restructured budget system: budgets now belong to locations instead of projects
- ✅ Created comprehensive Supabase SQL schema (supabase_schema.sql)
- ✅ Updated database schema to support location-based budgets
- ✅ Fixed "Add Task" button - now opens CreateTaskModal with proper functionality
- ✅ Fixed "Add Location Budget" button - now opens budget allocation dialog
- ✅ Added edit/delete functionality for budget line items
- ✅ Fixed all SelectItem errors by replacing empty strings with proper values
- ✅ Updated API routes to handle location-based budget endpoints
- ✅ Added location selector to Budget Management page
- ✅ Created detailed setup instructions for Supabase integration
- ✅ Implemented Excel import with formula preservation and dynamic recalculation
- ✅ Added conversion factor storage and automatic formula calculations
- ✅ Created editable quantity fields with real-time recalculation
- ✅ Added comprehensive Excel import documentation and troubleshooting guide

### July 17, 2025
- ✅ Fixed PX and hours calculation issues for standalone budget items
- ✅ Added proper data validation and error handling for budget updates
- ✅ Implemented edit mode toggle for budget line items table
- ✅ Budget items are now read-only by default with Edit/Save button to unlock editing
- ✅ All inline editing controls (quantity, PX, hours) are disabled when not in edit mode
- ✅ Inline editing action buttons (edit, delete) are disabled when not in edit mode
- ✅ Excel import and Add Line Item buttons remain available without edit mode