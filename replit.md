# Construction Management System

## Overview

This full-stack construction project management system provides comprehensive capabilities including budget tracking, location management, employee scheduling, and task assignment. It aims to streamline operations and enhance efficiency for construction projects, with a vision to become a leading solution in the construction management software market.

## Recent Changes (August 2025)
- ✅ **Session Pooler Upgrade**: Successfully upgraded from Transaction pooler to Session pooler for better performance and connection management
- ✅ **API Connectivity Restored**: Users API now loads successfully with 62ms response time, returning all 4 users (admin, mike.johnson, sarah.davis, emilyalameddine)
- ✅ **TypeScript Compilation Fixed**: Resolved all 17+ compilation errors preventing API functionality
- ✅ **Supabase Integration Complete**: Application fully connected to user's external Supabase database (not Replit's managed PostgreSQL)
- ✅ **Database Schema Updates**: Fixed column mismatches and added missing fields for compatibility
- ✅ **Connection Timeout Handling**: Implemented proper timeout and fallback mechanisms for robust API performance
- ✅ **Multiple APIs Functional**: Projects, locations, crews, and assignments APIs all working correctly
- ✅ **External Database Working**: Application successfully uses user's Supabase database
- ✅ **User Management Fixed**: Resolved critical apiRequest function to return JSON data instead of Response objects, enabling real-time user creation/deletion
- 🔄 **Task Generation Issue**: Assignment enhancement causing "order" column errors, investigating schema mismatch

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
- **Database**: Supabase PostgreSQL via Drizzle ORM for type-safe operations. Uses Transaction pooler for optimal connection management with fallback to Replit PostgreSQL if needed.
- **Real-time**: WebSocket server for live updates and notifications across clients.
- **Authentication**: Session-based authentication with PostgreSQL session storage, supporting user roles (Admin, Superintendent, Project Manager, Foreman) and role-based access control. Includes first-login password change and bidirectional employee-user synchronization.
- **Data Flow**: Client requests via React Query, processed by Express routes, interacting with the database via Drizzle ORM, with WebSocket broadcasting changes.

### Feature Specifications
- **Core Entities**: Manages Projects, Budget Line Items, Locations, Employees, Tasks, and Crews.
- **Budget Management**: Detailed budget tracking, location-based budget allocations, Excel import with formula preservation, and editable quantity fields with real-time recalculation. Budget items support inline editing with an explicit save mechanism.
- **Employee Management**: Comprehensive employee profiles with roles, trade specializations (Primary, Secondary, Tertiary), union status, and apprentice levels. Includes validation for unique Team Member IDs.
- **Task Management**: Scheduling, assignment, and real-time status updates. Features include drag-and-drop reordering with dependency management, dynamic cost code date ranges, and intelligent date shifting based on task relationships. Supports both individual and bulk task creation with specific rules for sequential dependencies.
- **Dashboard Features**: Real-time project overview with day-based task filtering (yesterday/today/tomorrow), employee assignment tracking with accurate project name resolution, and location progress monitoring with cost code budget tracking. Location names are clickable for navigation to detailed location pages. Location Progress section filters to show only locations with tasks scheduled on the selected day.
- **Export Functionality**: PDF and Excel export capabilities for various reports.

### System Design Choices
- **Monorepo Structure**: Shared schema definitions between frontend and backend for consistency.
- **Type Safety**: Full TypeScript coverage and Drizzle ORM type generation for robust development.
- **Modular Design**: Separation of concerns with distinct management interfaces for different aspects of project management.
- **Resilient Storage**: Dual-mode storage with automatic fallback for reliability.
- **Data Validation**: Zod schemas for comprehensive runtime validation.

## External Dependencies

### Frontend
- **UI Components**: Radix UI (via shadcn/ui)
- **Date Handling**: `date-fns`
- **Form Validation**: `Zod`
- **Icons**: `Lucide React`
- **Styling**: `Tailwind CSS`
- **Drag and Drop**: `@dnd-kit`

### Backend
- **Database Connection**: `@neondatabase/serverless` (for PostgreSQL)
- **WebSocket**: `ws`
- **Session Storage**: `connect-pg-simple`
- **Development Utility**: `tsx` (for TypeScript execution)