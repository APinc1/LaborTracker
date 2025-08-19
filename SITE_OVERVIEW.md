# Construction Management System - Site Overview

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Dashboard & Performance](#dashboard--performance)
3. [Projects Management](#projects-management)
4. [Budget Management](#budget-management)
5. [Location Details](#location-details)
6. [Task Management System](#task-management-system)
7. [Employee & Assignment System](#employee--assignment-system)
8. [Authentication & Security](#authentication--security)
9. [Data Models](#data-models)
10. [API Endpoints](#api-endpoints)
11. [Performance Metrics](#performance-metrics)
12. [Deployment Status](#deployment-status)

---

## System Architecture

### Technology Stack
- **Frontend**: React 18 with TypeScript, Vite build system
- **Backend**: Express.js with TypeScript
- **Database**: Supabase PostgreSQL with Drizzle ORM
- **Real-time**: WebSocket server for live updates
- **Styling**: Tailwind CSS with shadcn/ui components  
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod validation
- **Authentication**: Session-based with PostgreSQL storage
- **Icons**: Lucide React library
- **Drag & Drop**: @dnd-kit for task reordering

### Core Design Principles
- **Type Safety**: Full TypeScript coverage with shared schemas between frontend/backend
- **Real-time Updates**: WebSocket broadcasting for multi-user collaboration
- **Modular Architecture**: Clear separation between frontend and backend with shared types
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Data Integrity**: Comprehensive validation at multiple layers (client, server, database)
- **Performance First**: Optimized queries with bootstrap endpoints and strategic caching
- **Production Ready**: Deployment-optimized with timeouts, health checks, and graceful shutdown

### Recent Performance Achievements (August 2025)
- **75% Dashboard Load Time Improvement**: Bootstrap endpoint reduces initial load from 1.5+ seconds to ~400ms
- **5,250x Task Creation Improvement**: Optimized from 21+ seconds to ~4ms
- **Singleton Connection Pattern**: Database connection pooling with PgBouncer compatibility
- **Strategic Caching**: ETag headers and 304 responses for unchanged data

---

## Dashboard & Performance

### Overview
The Dashboard serves as the central command center, providing real-time insights into project status, task assignments, and cost code progress across all active projects. Recent performance optimizations have transformed it from a slow-loading interface to a responsive, real-time dashboard.

### Key Features

#### Bootstrap Endpoint Performance Breakthrough
- **Single API Call**: `/api/dashboard/bootstrap` consolidates 5+ individual queries
- **Performance Gain**: 75% improvement (1.5+ seconds → ~400ms)
- **Data Consolidation**: Employees, assignments, locations, projects, and tasks in one request
- **Strategic Caching**: ETag headers for 304 responses on unchanged data

#### Three-Day Task Overview
- **Yesterday Tasks**: Completed work review and validation
- **Today Tasks**: Current active assignments with real-time updates
- **Tomorrow Tasks**: Upcoming work preparation and resource allocation
- **Dynamic Date Range**: Automatically updates based on current date

#### Cost Code Progress Tracking
```typescript
// Real-time remaining hours calculation
const calculateRemainingHours = (budgetHours: number, actualHours: number, scheduledHours: number) => {
  const totalUsed = actualHours + scheduledHours;
  return Math.max(0, budgetHours - totalUsed);
};

// Color-coded progress indicators
const getProgressColor = (remaining: number, budget: number) => {
  if (remaining <= 0) return "text-red-600";
  if (remaining <= budget * 0.15) return "text-yellow-600";
  return "text-green-600";
};
```

#### Location Progress Visualization
- **Progress Bars**: Visual representation of cost code completion
- **Budget Markers**: Clear indicators of budget targets vs actual usage
- **Clickable Navigation**: Direct links to location detail pages
- **Filtered Display**: Shows only locations with tasks on selected day

### Performance Monitoring
- **Server-Timing Headers**: Detailed performance metrics for each request
- **Queue Time Tracking**: Database connection wait times
- **Validation Timing**: Input processing performance
- **Serialization Metrics**: Response preparation timing

---

## Projects Management

### Overview
The Projects management system provides comprehensive project oversight with hierarchical organization, role-based access control, and integrated location management. Projects serve as the top-level organizational unit containing multiple locations and associated tasks.

### Key Features

#### Project List & Organization
- **Alphabetical Sorting**: Projects automatically sorted by name for easy navigation
- **Project Metrics**: Real-time display of active tasks, budget status, and completion progress
- **Quick Navigation**: Direct links to project locations and detailed views
- **Search & Filter**: Dynamic filtering by project status, date range, and assigned personnel

#### Project Creation & Management
- **Form-based Setup**: Comprehensive project creation with validation
- **Role Assignment**: Default superintendent and project manager assignment
- **Date Management**: Start/end date tracking with automatic validation
- **Location Association**: Hierarchical relationship with multiple project locations

#### Integration Points
- **Budget Rollup**: Aggregate budget data from all project locations
- **Task Overview**: Cross-location task visibility and management
- **Employee Assignment**: Project-level employee allocation and tracking
- **Progress Tracking**: Overall project completion based on location and task status

### Project Schema
```typescript
projects = {
  id: serial("id").primaryKey(),
  projectId: text("project_id").notNull().unique(),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  defaultSuperintendent: integer("default_superintendent").references(() => users.id),
  defaultProjectManager: integer("default_project_manager").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}
```

### API Endpoints
- `GET /api/projects` - Retrieve all projects with sorting
- `GET /api/projects/:id` - Get specific project details
- `GET /api/projects/:id/locations` - Get all locations for a project
- `POST /api/projects` - Create new project with validation
- `PUT /api/projects/:id` - Update project details
- `DELETE /api/projects/:id` - Remove project (with cascade handling)
```

---

## Budget Management

### Overview
The Budget Management system provides comprehensive financial tracking with real-time updates, Excel import capabilities, and detailed cost breakdowns by category and location.

### Key Components

#### BudgetManagement.tsx
Main component handling all budget operations with sophisticated state management and real-time editing capabilities.

#### Budget Line Item Schema
```typescript
budgetLineItems = {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").references(() => locations.id).notNull(),
  lineItemNumber: text("line_item_number").notNull(),
  lineItemName: text("line_item_name").notNull(),
  unconvertedUnitOfMeasure: text("unconverted_unit_of_measure").notNull(),
  unconvertedQty: decimal("unconverted_qty", { precision: 10, scale: 2 }).notNull(),
  actualQty: decimal("actual_qty", { precision: 10, scale: 2 }).default("0"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  unitTotal: decimal("unit_total", { precision: 10, scale: 2 }).notNull(),
  convertedQty: decimal("converted_qty", { precision: 10, scale: 2 }),
  convertedUnitOfMeasure: text("converted_unit_of_measure"),
  conversionFactor: decimal("conversion_factor", { precision: 10, scale: 6 }).default("1"),
  costCode: text("cost_code").notNull(),
  productionRate: decimal("production_rate", { precision: 10, scale: 2 }),
  hours: decimal("hours", { precision: 10, scale: 2 }),
  budgetTotal: decimal("budget_total", { precision: 10, scale: 2 }).notNull(),
  billing: decimal("billing", { precision: 10, scale: 2 }),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }),
  equipmentCost: decimal("equipment_cost", { precision: 10, scale: 2 }),
  truckingCost: decimal("trucking_cost", { precision: 10, scale: 2 }),
  dumpFeesCost: decimal("dump_fees_cost", { precision: 10, scale: 2 }),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }),
  subcontractorCost: decimal("subcontractor_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
}
```

### Budget Update Logic

#### Real-time Editing System
The budget system implements a sophisticated inline editing mechanism with the following features:

1. **Edit Mode Toggle**
   ```typescript
   const [isEditMode, setIsEditMode] = useState(false);
   const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
   const [originalValues, setOriginalValues] = useState<Map<string, any>>(new Map());
   ```

2. **Input Change Tracking**
   - Each input field tracks changes via `inputValues` state map
   - Changes are debounced using `updateTimeoutRef` to prevent excessive API calls
   - Original values are preserved for cancellation functionality

3. **Validation Layer**
   ```typescript
   const budgetLineItemSchema = z.object({
     lineItemNumber: z.string().min(1),
     lineItemName: z.string().min(1),
     unconvertedUnitOfMeasure: z.string().min(1),
     unconvertedQty: z.string().min(1),
     unitCost: z.string().min(1),
     // ... additional validation rules
   });
   ```

4. **Bulk Save Mechanism**
   ```typescript
   const saveAllChanges = async () => {
     const updates = Array.from(inputValues.entries()).map(([key, value]) => {
       const [itemId, field] = key.split('.');
       return { itemId: parseInt(itemId), field, value };
     });
     
     // Process updates in batches
     const promises = updates.map(update => 
       apiRequest(`/api/budget-items/${update.itemId}`, {
         method: 'PUT',
         body: JSON.stringify({ [update.field]: update.value })
       })
     );
     
     await Promise.all(promises);
   };
   ```

#### API Endpoints for Budget Operations

1. **GET /api/locations/:locationId/budget**
   - Handles both database ID and locationId string formats
   - Returns complete budget line items with calculations
   - Includes error handling for invalid location references

2. **POST /api/budget-items**
   - Creates new budget line items with full validation
   - Auto-calculates derived fields (unitTotal, budgetTotal)
   - Links to location via foreign key relationship

3. **PUT /api/budget-items/:id**
   - Updates individual budget line items
   - Supports partial updates for inline editing
   - Recalculates dependent fields automatically

4. **DELETE /api/budget-items/:id**
   - Removes budget line items with cascade handling
   - Updates location budget totals

#### Advanced Budget Features

1. **Cost Code Filtering**
   ```typescript
   const getUniqueCostCodes = () => {
     const codes = new Set((budgetItems as any[]).map(item => item.costCode));
     return Array.from(codes).sort();
   };
   ```

2. **Expandable Detail View**
   - Each budget item can expand to show detailed cost breakdowns
   - Labor, equipment, trucking, materials, and subcontractor costs
   - Notes and production rate tracking

3. **Currency Formatting**
   ```typescript
   const formatCurrency = (amount: string | number) => {
     return new Intl.NumberFormat('en-US', {
       style: 'currency',
       currency: 'USD',
     }).format(Number(amount) || 0);
   };
   ```

4. **Excel Import Integration**
   - Formula preservation during import
   - Automatic unit conversion calculations
   - Data validation and error reporting

---

## Location Details

### Overview
The Location Details page provides comprehensive project location management with integrated task scheduling, budget summaries, and progress tracking.

### Key Features

#### LocationDetails.tsx Components
1. **Location Information Display**
   - Project metadata and location details
   - Progress indicators and completion status
   - Budget summary integration

2. **Task Management Integration**
   - Embedded DraggableTaskList component
   - Task creation and editing modals
   - Real-time task updates via WebSocket

3. **Budget Summary Section**
   - Cost code breakdown by category
   - Progress indicators for budget utilization
   - Direct links to budget management

### Location Schema
```typescript
locations = {
  id: serial("id").primaryKey(),
  locationId: text("location_id").notNull().unique(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  isComplete: boolean("is_complete").default(false),
}
```

### Task Integration Logic

#### Task Creation Flow
1. **Modal Opening**: CreateTaskModal opens with location context
2. **Form Validation**: Uses `createTaskFormSchema` with conditional validation
3. **Position Calculation**: Determines task insertion position in sequence
4. **Date Assignment**: Calculates dates based on dependencies and weekday logic
5. **API Creation**: Creates task via POST with full validation

#### Task Editing Flow
1. **Modal Opening**: EditTaskModal opens with pre-populated task data
2. **Advanced Linking Logic**: Sophisticated task linking and unlinking
3. **Date Recalculation**: Complex date shifting for dependent tasks
4. **Validation**: Multi-layer validation before submission

---

## Task Management System

### Overview
The task management system is the most sophisticated component, handling complex scheduling logic, task dependencies, and real-time collaboration features.

### Core Components

#### Task Schema
```typescript
tasks = {
  id: serial("id").primaryKey(),
  taskId: text("task_id").notNull().unique(),
  locationId: text("location_id").notNull(),
  taskType: text("task_type").notNull(),
  name: text("name").notNull(),
  taskDate: date("task_date").notNull(),
  startDate: date("start_date").notNull(),
  finishDate: date("finish_date").notNull(),
  costCode: text("cost_code").notNull(),
  superintendentId: integer("superintendent_id").references(() => users.id),
  foremanId: integer("foreman_id").references(() => employees.id),
  scheduledHours: decimal("scheduled_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  startTime: text("start_time"),
  finishTime: text("finish_time"),
  workDescription: text("work_description"),
  notes: text("notes"),
  order: integer("order").notNull().default(0),
  dependentOnPrevious: boolean("dependent_on_previous").notNull().default(true),
  linkedTaskGroup: text("linked_task_group"),
}
```

### Task Creation Logic

#### CreateTaskModal.tsx
The task creation system implements sophisticated logic for task positioning and linking:

1. **Task Type to Cost Code Mapping**
   ```typescript
   const TASK_TYPE_TO_COST_CODE = {
     "Traffic Control": "TRAFFIC",
     "Demo/Ex": "Demo/Ex + Base/Grading",
     "Base/Grading": "Demo/Ex + Base/Grading", 
     "Demo/Ex + Base/Grading": "Demo/Ex + Base/Grading",
     "Form": "CONCRETE",
     "Pour": "CONCRETE",
     "Form + Pour": "CONCRETE",
     "Asphalt": "AC",
     "General Labor": "GENERAL",
     // ... additional mappings
   };
   ```

2. **Position-Based Insertion**
   - Users select positions in task list rather than dates
   - System calculates appropriate dates based on dependencies
   - Handles weekend skipping and working day calculations

3. **Advanced Linking System**
   - Tasks can be linked to occur on the same date
   - Linked task groups maintain synchronized dates
   - Complex unlinking logic with date recalculation

4. **Conditional Validation Schema**
   ```typescript
   const createTaskFormSchema = z.object({
     insertPosition: z.string().optional(),
     taskDate: z.string().optional(),
     name: z.string().min(1, "Task name is required"),
     taskType: z.string().min(1, "Task type is required"),
     dependentOnPrevious: z.boolean().default(true),
     linkToExistingTask: z.boolean().default(false),
     linkedTaskIds: z.array(z.string()).default([])
   }).refine((data) => {
     // Complex validation logic for different scenarios
     if (!data.linkToExistingTask && !data.insertPosition) {
       return false;
     }
     if (!data.dependentOnPrevious && !data.linkToExistingTask && !data.taskDate) {
       return false;
     }
     if (data.linkToExistingTask && data.linkedTaskIds.length === 0) {
       return false;
     }
     return true;
   });
   ```

### Task Update Logic

#### EditTaskModal.tsx
The task editing system handles complex scenarios including:

1. **Task Linking and Unlinking**
   - Advanced position dialog for selecting link targets
   - Sophisticated date synchronization for linked tasks
   - Complex unlinking logic with different rules based on sequential status

2. **Unlinking Rules**
   ```typescript
   // CORRECTED RULE:
   // - If ANY linked task was sequential → ALL unlinked tasks become sequential (including first)
   // - If ALL linked tasks were unsequential → ALL unlinked tasks become sequential (except first)
   const shouldBeSequential = anyTaskSequential ? true : !isFirstTask;
   ```

3. **Date Recalculation Logic**
   - Working day calculations (skipping weekends)
   - Chain effect updates for dependent tasks
   - Proper handling of task order changes

4. **Advanced Position Detection**
   ```typescript
   // Position dialog filtering to show only relevant tasks
   const availablePositions = existingTasks
     .filter(t => !linkedTaskIds.includes(t.taskId || t.id.toString()))
     .sort((a, b) => (a.order || 0) - (b.order || 0))
     .map((task, index) => ({
       value: `after-${task.taskId || task.id}`,
       label: `After "${task.name}" (Position ${index + 1})`,
       order: task.order || 0
     }));
   ```

### DraggableTaskList.tsx
Implements sophisticated drag-and-drop task reordering with:

1. **Real-time Updates**
   - WebSocket integration for multi-user collaboration
   - Optimistic updates with rollback on failure

2. **Dependency Management**
   - Automatic date recalculation on reorder
   - Linked task group handling
   - Sequential task chain updates

3. **Visual Indicators**
   - Status badges (Upcoming, In Progress, Complete)
   - Sequential indicators
   - Linked task group highlighting

### Task Utilities (taskUtils.ts)

#### Advanced Date Calculations
```typescript
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday-Friday
}

export function getNextWeekday(date: Date): Date {
  const nextDay = new Date(date);
  do {
    nextDay.setDate(nextDay.getDate() + 1);
  } while (!isWeekday(nextDay));
  return nextDay;
}

export function addWeekdays(date: Date, days: number): Date {
  let result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result = getNextWeekday(result);
    addedDays++;
  }
  
  return result;
}
```

#### Linked Task Group Management
```typescript
export function findLinkedTaskGroups(tasks: any[]): Map<string, any[]> {
  const linkedGroups = new Map<string, any[]>();
  const linkedTasks = tasks.filter((task: any) => task.linked || task.linkedTaskGroup);
  
  linkedTasks.forEach((task: any) => {
    const groupKey = task.linkedTaskGroup || (task.taskDate || task.date);
    if (!linkedGroups.has(groupKey)) {
      linkedGroups.set(groupKey, []);
    }
    linkedGroups.get(groupKey)!.push(task);
  });
  
  // Only return groups with more than 1 task
  const filteredGroups = new Map<string, any[]>();
  for (const [groupKey, group] of linkedGroups) {
    if (group.length > 1) {
      filteredGroups.set(groupKey, group);
    }
  }
  
  return filteredGroups;
}
```

---

## Employee & Assignment System

### Overview
The Employee & Assignment system manages workforce allocation with sophisticated foreman hierarchy logic, role-based capabilities, and real-time assignment tracking across all projects and locations.

### Employee Management

#### Employee Schema
```typescript
employees = {
  id: serial("id").primaryKey(),
  teamMemberId: text("team_member_id").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  primaryTrade: text("primary_trade"),
  secondaryTrade: text("secondary_trade"),
  tertiaryTrade: text("tertiary_trade"),
  unionStatus: text("union_status"),
  apprenticeLevel: text("apprentice_level"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  userId: integer("user_id").references(() => users.id),
}
```

#### Key Features
- **Unique Team Member IDs**: Validation prevents duplicate employee identifiers
- **Trade Specialization**: Primary, secondary, and tertiary trade tracking
- **Union Integration**: Union status and apprentice level management
- **Role-based Capabilities**: Employee roles determine task assignment permissions
- **User Account Sync**: Bidirectional synchronization between employees and user accounts

### Assignment System

#### Assignment Schema & Logic
```typescript
assignments = {
  id: serial("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().unique(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  scheduledHours: decimal("scheduled_hours", { precision: 10, scale: 2 }).notNull(),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }).default("0"),
  assignmentDate: date("assignment_date").notNull(),
  notes: text("notes"),
}
```

#### Advanced Assignment Features
- **Multi-Employee Tasks**: Tasks support multiple employee assignments with individual hour tracking
- **Date-based Filtering**: Efficient querying by assignment date for daily schedules
- **Actual vs Scheduled Hours**: Real-time tracking of planned vs actual work time
- **Automatic Assignment IDs**: Generated using format `{taskId}_{employeeId}`

### Foreman Assignment Logic

#### Complex Foreman Hierarchy
The system implements sophisticated foreman assignment rules:

1. **Single Foreman Auto-Assignment**
   ```typescript
   // If only one foreman assigned to task → automatically becomes task foreman
   const foremAnOnTask = assignedEmployees.filter(emp => emp.role === 'Foreman');
   if (foremAnOnTask.length === 1) {
     task.foremanId = foremAnOnTask[0].id;
   }
   ```

2. **Multiple Foremen Resolution**
   ```typescript
   // Multiple foremen → requires manual selection
   if (foremAnOnTask.length > 1) {
     task.foremanId = null; // Clear assignment, requires manual selection
   }
   ```

3. **Foreman Display Logic**
   ```typescript
   // Complex display logic in AssignmentManagement component
   const getDisplayedForeman = (task, assignments) => {
     const assignedForemen = assignments
       .filter(a => a.taskId === task.id && a.employee.role === 'Foreman')
       .map(a => a.employee);
     
     if (assignedForemen.length === 1) {
       return assignedForemen[0]; // Show assigned foreman
     } else if (task.foremanId) {
       return employees.find(e => e.id === task.foremanId); // Show selected foreman
     }
     return null; // Show selection required
   };
   ```

#### Foreman Selection Popup
Advanced foreman selection interface with:
- **Available Foremen Filtering**: Shows only foremen assigned to the task
- **Current Selection Display**: Highlights currently selected task foreman
- **Validation Logic**: Prevents invalid foreman assignments
- **Real-time Updates**: WebSocket broadcasting of foreman changes

### Assignment Management Interface

#### Enhanced Task Dropdown
Recent improvement to AssignmentManagement showing:
```
Task Name - Project Name - Location Name
```
This format provides complete context for task identification across projects.

#### Bulk Assignment Operations
- **Multi-Employee Assignment**: Assign multiple employees to tasks simultaneously
- **Hour Allocation**: Distribute scheduled hours across team members
- **Date Range Assignment**: Assign employees across multiple task dates
- **Template-based Assignment**: Save and reuse common assignment patterns

---

## Authentication & Security

### Overview
The authentication system implements session-based security with role-based access control, supporting multiple user types with different permission levels across the construction management workflow.

### Authentication Model

#### Session-Based Authentication
```typescript
// Session configuration with PostgreSQL storage
app.use(session({
  store: new (require('connect-pg-simple')(session))({
    pool: db, // PostgreSQL connection pool
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

#### User Schema & Roles
```typescript
users = {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(),
  isPasswordSet: boolean("is_password_set").default(false),
  employeeId: integer("employee_id").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}

// Role hierarchy
enum UserRole {
  ADMIN = "Admin",
  SUPERINTENDENT = "Superintendent", 
  PROJECT_MANAGER = "Project Manager",
  FOREMAN = "Foreman"
}
```

### Security Features

#### Password Management
- **bcrypt Hashing**: Secure password storage with salt rounds
- **First Login Flow**: Forces password change with `isPasswordSet` flag
- **Session Security**: HttpOnly cookies with secure flag in production

#### Role-Based Access Control
```typescript
// Middleware for role-based route protection
const requireRole = (roles: string[]) => (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (!roles.includes(req.session.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  next();
};

// Example usage
app.get('/api/admin/users', requireRole(['Admin']), getUsersHandler);
app.get('/api/projects', requireRole(['Admin', 'Superintendent', 'Project Manager']), getProjectsHandler);
```

#### User-Employee Synchronization
Bidirectional sync between user accounts and employee records:
```typescript
// Create user account for employee
const createUserForEmployee = async (employee) => {
  const user = await db.insert(users).values({
    username: employee.teamMemberId,
    password: await bcrypt.hash(defaultPassword, 10),
    role: employee.role,
    employeeId: employee.id,
    isPasswordSet: false
  });
  
  // Update employee with user reference
  await db.update(employees)
    .set({ userId: user.id })
    .where(eq(employees.id, employee.id));
};
```

### Security To-Dos
- **Password Reset Flow**: Email-based password reset (not yet implemented)
- **API Rate Limiting**: Request throttling for brute force protection
- **HTTPS Enforcement**: SSL/TLS certificate configuration for production
- **CORS Configuration**: Tighten cross-origin resource sharing policies
- **Audit Logging**: Track user actions and data changes
- **Multi-Factor Authentication**: Optional 2FA for admin accounts

---

## Data Models

### Core Entities & Relationships

#### Complete Schema Overview
The system manages construction projects through a hierarchical data model:

```typescript
// Complete entity relationship structure
projects (19 records) → locations (81 records) → tasks → assignments (2,301 records)
                    ↓
                budget_line_items → cost_codes
                    ↓
employees (73 records) → users → roles → permissions
```

#### Current Data Volume (Production)
- **Projects**: 19 active construction projects
- **Locations**: 81 project locations across all projects  
- **Employees**: 73 active workforce members
- **Assignments**: 2,301 task assignments with hour tracking
- **Tasks**: Hundreds of scheduled and completed tasks
- **Budget Items**: Thousands of budget line items across locations

#### Key Relationships
- **Projects** → **Locations** (one-to-many with foreign key)
- **Locations** → **Tasks** (one-to-many via locationId string)
- **Locations** → **Budget Line Items** (one-to-many with cost code grouping)
- **Tasks** → **Assignments** (one-to-many for multi-employee tasks)
- **Employees** → **Assignments** (one-to-many for employee schedules)
- **Users** ↔ **Employees** (bidirectional sync for account management)

---

## API Endpoints

### Performance-Optimized Endpoints

#### Dashboard Bootstrap (Primary)
- `GET /api/dashboard/bootstrap` - **Performance Breakthrough Endpoint**
  - Consolidates 5+ individual queries into single request
  - Returns: employees, assignments, locations, projects, tasks for selected date
  - Response time: ~400ms (75% improvement from sequential queries)
  - Strategic caching with ETag headers for 304 responses

#### Legacy Individual Endpoints (Still Available)
- `GET /api/dashboard` - Budget summary calculations for all locations
- `GET /api/tasks/date-range/:start/:end` - Date-filtered task queries (~500-800ms)

### Project Management
- `GET /api/projects` - List all projects (alphabetically sorted)
- `GET /api/projects/:id` - Get project details with user resolution
- `GET /api/projects/:id/locations` - Get all locations for project
- `POST /api/projects` - Create new project with validation
- `PUT /api/projects/:id` - Update project details
- `DELETE /api/projects/:id` - Delete project with cascade handling

### Location Management  
- `GET /api/locations/:locationId` - Get location details (supports both DB ID and locationId string)
- `GET /api/locations/:locationId/tasks` - Get all tasks for location
- `GET /api/locations/:locationId/budget` - Get budget line items for location
- `POST /api/locations` - Create new location
- `PUT /api/locations/:id` - Update location details
- `DELETE /api/locations/:id` - Delete location with cascade

### Task Management
- `POST /api/locations/:locationId/tasks` - Create new task with positioning logic
- `PUT /api/tasks/:id` - Update task with dependency recalculation
- `DELETE /api/tasks/:id` - Delete task with dependency chain updates
- `PUT /api/tasks/:id/foreman` - Assign task foreman with validation

### Assignment Management
- `GET /api/assignments` - Get all assignments with employee details
- `GET /api/assignments/date/:date` - Get assignments for specific date
- `POST /api/assignments` - Create employee assignment to task
- `PUT /api/assignments/:id` - Update assignment hours and details
- `DELETE /api/assignments/:id` - Remove employee from task

### Employee & User Management
- `GET /api/employees` - List all employees with trade information
- `GET /api/users` - List all user accounts with roles
- `GET /api/crews` - List all crew assignments
- `POST /api/employees` - Create employee with user account sync
- `PUT /api/employees/:id` - Update employee details

### Budget Management
- `POST /api/budget-items` - Create budget line item with calculations
- `PUT /api/budget-items/:id` - Update budget item (supports partial updates)
- `DELETE /api/budget-items/:id` - Remove budget line item

### Real-time WebSocket
- `WebSocket /ws` - Real-time collaboration endpoint
  - Broadcasts task updates, assignment changes, budget modifications
  - Multi-user coordination with conflict resolution
  - Optimistic updates with rollback capability

---

## Performance Metrics

### Current Performance Status (August 2025)

#### Major Performance Achievements
1. **Dashboard Load Time**: 1.5+ seconds → ~400ms (75% improvement)
2. **Task Creation**: 21+ seconds → ~4ms (5,250x improvement) 
3. **Database Connections**: Singleton pattern with PgBouncer compatibility
4. **Response Optimization**: ETag headers for 304 responses on unchanged data

#### Remaining Performance Targets
- **Task Date Range Queries**: Currently 500-800ms → Target <50ms
- **Database Indexing**: Need indexes on task dates for faster filtering
- **Connection Pool Warming**: Implemented to eliminate cold start delays

#### Server-Timing Metrics
The system implements comprehensive performance monitoring:
```typescript
// Performance timing breakdown in response headers
Server-Timing: queue=12ms, validation=3ms, database=387ms, serialization=8ms
```

#### Real-world Performance Data
- **Bootstrap Endpoint**: ~400ms with 73 employees, 2,301 assignments
- **Individual Task Queries**: 500-800ms (optimization target)
- **Assignment Updates**: ~50ms with WebSocket broadcasting
- **Budget Calculations**: <100ms for location-level cost code summaries

---

## Deployment Status

### Current Environment
- **Development**: Replit workspace with live preview capability
- **Database**: Supabase PostgreSQL (transaction pooler :6543)
- **Real-time**: WebSocket server on same port as HTTP
- **Assets**: Vite development server with hot module replacement

### Production Readiness Features
- **Health Check**: `/healthz` endpoint for deployment verification
- **Timeout Protection**: 25-second request timeouts prevent platform timeouts
- **Graceful Shutdown**: Proper connection cleanup and resource management
- **Environment Variables**: DATABASE_URL, NODE_ENV, PORT configuration
- **Session Storage**: PostgreSQL-backed sessions for scalability
- **Compression**: Strategic response compression (skips small POST responses)

### Deployment Commands
```bash
# Production build and start
npm run build && npm run start

# Development with hot reload
npm run dev

# Database schema updates
npm run db:push
```

### Recommended Production Stack
1. **Frontend Hosting**: Vercel (optimal for React/Vite builds)
2. **Backend Hosting**: Render, Railway, or Fly.io (Node.js compatible)
3. **Database**: Supabase (current) or migrate to PlanetScale/Neon
4. **Monitoring**: Sentry for error tracking, UptimeRobot for availability
5. **CDN**: Vercel's built-in CDN for static asset delivery

### Security & Infrastructure
- **SSL/TLS**: Required for production authentication
- **CORS**: Currently permissive, needs production configuration
- **Rate Limiting**: Not implemented - required for production
- **Backup Strategy**: Supabase automated backups (verify retention schedule)

This comprehensive site overview documents the complete construction management system with detailed technical specifications, performance metrics, and deployment guidelines for successful project handoff and ongoing maintenance.