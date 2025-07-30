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
- ✅ Added Cancel button with confirmation dialogs for Save/Cancel actions
- ✅ Warn users about unsaved changes when navigating away or refreshing
- ✅ Changes now only save when Save button is clicked, not on every keystroke
- ✅ Implemented global navigation protection system with NavigationProtectionContext
- ✅ Added sticky table headers and first two columns (Line Item, Description) to budget table
- ✅ Enhanced table UX with proper sticky styling and background colors for child rows
- ✅ Actions column remains sticky on the right side with proper background matching
- ✅ Converted table to native HTML elements for better sticky positioning
- ✅ Delete column only appears when in edit mode
- ✅ Removed confirmation dialogs and toast notifications for cleaner UX
- ✅ Removed automatic saving when typing in hours field

### July 18, 2025
- ✅ Enhanced employee management system with comprehensive field validation
- ✅ Updated employee types to Core, Freelancer, and Apprentice only
- ✅ Added apprentice level selection (1, 2, 3) when Apprentice type is selected
- ✅ Restricted "Is Foreman" checkbox to Core employees only
- ✅ Added "Is Union" checkbox for all employee types
- ✅ Implemented three trade dropdown fields: Primary, Secondary, and Tertiary
- ✅ Trade options: Mason, Formsetter, Laborer, Operator, Driver
- ✅ Updated employee table to display trades, union status, and apprentice level
- ✅ Enhanced form validation with conditional field visibility
- ✅ Added sample employee data with new fields for testing
- ✅ Expanded dialog size for better form layout with additional fields
- ✅ Made Tertiary Trade optional (removed asterisk and added "None" option)
- ✅ Implemented unique Team Member ID validation across all employees
- ✅ Required fields: Team Member ID, Name, Email, Phone, Employee Type, Crew, Primary Trade
- ✅ Optional fields: Secondary Trade, Tertiary Trade, Is Foreman, Is Union checkboxes
- ✅ Added comprehensive form validation with dynamic schema based on existing employees
- ✅ Fixed sample data to ensure all Team Member IDs are unique (EMP-001 through EMP-005)
- ✅ Implemented authentication system with login page and session management
- ✅ Added default password system using "AccessPacific2835" for all new users
- ✅ Created first-login password change requirement with dedicated change password component
- ✅ Updated username format to "first_last" for employee-to-user conversion
- ✅ Removed password fields from user creation forms in both User and Employee Management
- ✅ Added login support for both username and email authentication
- ✅ Implemented logout functionality with session cleanup
- ✅ Added password change API endpoints with proper validation
- ✅ Implemented bidirectional synchronization between employees and users
- ✅ Added automatic data sync when employee or user records are updated
- ✅ Implemented cascading deletions to maintain data integrity
- ✅ Protected employee-specific and user-specific fields during sync
- ✅ Synchronized fields: name, email, phone number between linked records
- ✅ Fixed critical parseInt bug affecting location ID filtering and navigation
- ✅ Removed automatic date assignment for location creation - dates now optional
- ✅ Fixed location navigation using string locationId instead of numeric database ID
- ✅ Updated storage interface to handle both string and numeric location lookups
- ✅ Resolved "Location not found" errors when clicking on location links
- ✅ Updated location schema to make startDate and endDate optional fields
- ✅ Fixed "Invalid time value" error in LocationDetails component when dates are null/undefined
- ✅ Updated date formatting to safely handle optional start/end dates in location display
- ✅ Location pages now open properly without React errors when clicking location links

### July 23, 2025
- ✅ Fixed task generation errors by correcting getCostCodeDateRange function parameters
- ✅ Enhanced cost code mapping: Demo/Ex, Base/Grading, and Demo/Ex + Base/Grading tasks all use "Demo/Ex + Base/Grading"
- ✅ Implemented dynamic cost code date range calculation based on actual first and last task dates for each cost code
- ✅ Fixed task status changes: users can now freely change between upcoming, in progress, and complete
- ✅ Updated EditTaskModal to properly handle actualHours when status changes (clears when not complete, sets when complete)
- ✅ Cost code start/finish dates now show accurate ranges based on tasks with that specific cost code at the location
- ✅ Resolved task edit functionality issues with bidirectional status changes
- ✅ Location duration now dynamically reflects the first and last task dates rather than static location dates
- ✅ Added "Based on scheduled tasks" indicator to show duration is calculated from actual task scheduling
- ✅ Implemented comprehensive drag-and-drop task reordering with @dnd-kit library
- ✅ Added intelligent dependency management for task reordering
- ✅ Enhanced task cards with delete buttons and "Day x of y" cost code indicators
- ✅ Improved drag animations with smooth transitions and visual feedback
- ✅ Fixed dependency preservation during reordering (non-dependent tasks stay non-dependent)
- ✅ Implemented smart date handling for same-day task reordering
- ✅ Enhanced date-first sorting with order as secondary sort criteria

### July 29, 2025
- ✅ Fixed critical first task generation bug: first tasks are now always non-sequential regardless of form defaults
- ✅ Enhanced date change dialog to appear immediately for ANY date change with only 2 options
- ✅ Updated date change options to "Make Unsequential & Shift Others" and "Make Unsequential & Move It"
- ✅ Improved linked task synchronization to maintain same dates during all drag operations
- ✅ Fixed drag-to-beginning logic: task takes original first task's date, becomes non-sequential, original first becomes sequential
- ✅ Enhanced linked task positioning to prevent sequential tasks appearing below non-sequential linked tasks
- ✅ Added comprehensive linked task date synchronization after all positioning operations
- ✅ Implemented proper task dependency ordering within linked groups
- ✅ Fixed "unsequential and shift others" functionality to keep task in same position and shift subsequent tasks
- ✅ Fixed bulk task generation to ensure first task is always non-sequential (dependentOnPrevious: false)
- ✅ Added dependentOnPrevious field to all four bulk task creation locations in LocationDetails.tsx
- ✅ Ensured both individual and bulk task creation follow same first-task-non-sequential rule
- ✅ Completely redesigned date change popup system with proper option ordering
- ✅ Reordered popup options: "Make Unsequential & Shift Others", "Make Unsequential & Move It", "Keep Sequential & Move to Nearest Date"
- ✅ Added separate popup for non-sequential tasks when changing dates on save with "Move & Shift Others" and "Just Move It" options
- ✅ Fixed "Unsequential & Shift Others" logic to use task order instead of chronological sorting for proper sequential task shifting
- ✅ Implemented comprehensive debugging for date change actions to troubleshoot shifting issues
- ✅ Enhanced cascading logic to handle both sequential and non-sequential task date changes with proper subsequent task shifting
- ✅ Fixed task name auto-fill in CreateTaskModal to track manual edits and only auto-fill when task type changes if name hasn't been manually edited
- ✅ Normalized button styling in both date change popups to remove blue/green backgrounds for consistent appearance
- ✅ Enhanced popup functionality with proper cancel/close handling that reverts date changes
- ✅ Implemented immediate popup triggering for both sequential and non-sequential task date changes
- ✅ Added consistent language across both popup types with "Keep Unsequential" terminology
- ✅ Fixed sequential task shifting logic to stop at unsequential "break points" instead of shifting all subsequent tasks
- ✅ Implemented linked task deletion handling: partner tasks become unlinked and sequential if either original task was sequential
- ✅ Enhanced task deletion to properly cascade sequential task date adjustments after removal

### July 30, 2025
- ✅ Fixed critical first task sequential status display issue: first tasks created with wrong dependentOnPrevious value in sample data
- ✅ Implemented multi-layer first task rule enforcement across EditTaskModal, CreateTaskModal, API routes, and batch operations
- ✅ Enhanced drag-to-beginning logic: displaced task ALWAYS becomes sequential regardless of previous status
- ✅ Added comprehensive logging for first task enforcement decisions and drag operations
- ✅ Fixed "Link to existing task" required field validation with proper FormMessage display
- ✅ Server-side protection: task creation and update routes now enforce first task rule automatically
- ✅ Improved drag-and-drop sequential status transitions with detailed console logging for debugging
- ✅ Added linked task partner information in task selection dropdowns (shows "Task Name → Linked to: Partner")
- ✅ Enhanced positioning logic for linking to earlier tasks to ensure proper adjacent placement
- ✅ Fixed order calculation bugs when moving current task to linked task position
- ✅ Resolved server-side interference with drag operation sequential status changes

### Budget Calculation Rules (User Specification)
**For line items without children:**
- By default Hours = Conv Qty × PX
- If Qty changes: Hours = new Conv Qty × PX
- If PX changes: Hours = Conv Qty × new PX
- If Hours changes: PX = Hours ÷ Conv Qty
- If PX or Qty change after Hours edit: reverts to Hours = Conv Qty × PX

**For line items with children:**
- Parent Qty = Conv Qty = sum of children Conv Qty
- Parent Hours = sum of children Hours
- If child Qty changes: updates child Conv Qty → parent Qty changes → child Hours change → parent Hours change
- If parent PX changes: updates all children PX → children Hours change → parent Hours change
- If parent Hours changes: updates parent PX → updates children PX → children Hours change → parent Hours = sum of children Hours
- After parent Hours edit, if parent PX or child Qty changes: reverts to parent Hours = sum of children Hours