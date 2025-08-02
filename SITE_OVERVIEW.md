# SITE OVERVIEW

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Projects Page](#projects-page)
3. [Budget Management](#budget-management)
4. [Location Details](#location-details)
5. [Task Management System](#task-management-system)
6. [Data Models](#data-models)
7. [API Endpoints](#api-endpoints)

---

## System Architecture

### Technology Stack
- **Frontend**: React 18 with TypeScript, Vite build system
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: WebSocket server for live updates
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack React Query
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod validation

### Core Design Principles
- **Type Safety**: Full TypeScript coverage with shared schemas
- **Real-time Updates**: WebSocket broadcasting for multi-user collaboration
- **Modular Architecture**: Clear separation between frontend and backend
- **Responsive Design**: Mobile-first approach
- **Data Integrity**: Comprehensive validation at multiple layers

---

## Projects Page

### Overview
The Projects page serves as the main dashboard and entry point for construction project management. It provides high-level project overviews, navigation to detailed views, and project creation capabilities.

### Key Features
- **Project List View**: Display all active projects with key metrics
- **Project Creation**: Form-based project setup with validation
- **Budget Overview**: High-level budget summaries across projects
- **Location Access**: Quick navigation to project locations
- **User Management**: Role-based access control

### Data Flow
1. **Project Retrieval**: `GET /api/projects` fetches all projects
2. **Project Creation**: `POST /api/projects` with validation via `insertProjectSchema`
3. **Location Association**: Projects link to multiple locations via foreign keys
4. **User Assignment**: Default superintendent and project manager assignment

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

## Data Models

### Core Entities

#### Users
```typescript
users = {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull(), // Admin, Superintendent, Project Manager, Foreman
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  isPasswordSet: boolean("is_password_set").default(false),
}
```

#### Employees
```typescript
employees = {
  id: serial("id").primaryKey(),
  teamMemberId: text("team_member_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  crewId: integer("crew_id").references(() => crews.id),
  employeeType: text("employee_type").notNull(), // Core, Freelancer, Apprentice
  apprenticeLevel: integer("apprentice_level"), // 1, 2, or 3
  isForeman: boolean("is_foreman").default(false),
  isUnion: boolean("is_union").default(false),
  primaryTrade: text("primary_trade"), // Mason, Formsetter, Laborer, Operator, Driver
  secondaryTrade: text("secondary_trade"),
  tertiaryTrade: text("tertiary_trade"),
  userId: integer("user_id").references(() => users.id),
}
```

#### Employee Assignments
```typescript
employeeAssignments = {
  id: serial("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().unique(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  assignedHours: decimal("assigned_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  notes: text("notes"),
}
```

### Relationships
- **Projects** have many **Locations**
- **Locations** have many **Tasks** and **Budget Line Items**
- **Tasks** can be assigned to **Employees** via **Employee Assignments**
- **Users** can be **Superintendents** or **Project Managers** on **Projects**
- **Employees** can have linked **User** accounts

---

## API Endpoints

### Project Management
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get project details with resolved user names
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Location Management
- `GET /api/projects/:id/locations` - Get locations for project
- `GET /api/locations/:locationId` - Get location details
- `POST /api/locations` - Create new location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location

### Budget Management
- `GET /api/locations/:locationId/budget` - Get budget items for location
- `POST /api/budget-items` - Create budget line item
- `PUT /api/budget-items/:id` - Update budget line item
- `DELETE /api/budget-items/:id` - Delete budget line item

### Task Management
- `GET /api/locations/:locationId/tasks` - Get tasks for location
- `POST /api/locations/:locationId/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task with dependency handling
- `GET /api/tasks/date-range/:start/:end` - Get tasks in date range

### Employee Management
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Assignment Management
- `GET /api/assignments` - Get all assignments
- `POST /api/assignments` - Create assignment
- `PUT /api/assignments/:id` - Update assignment
- `DELETE /api/assignments/:id` - Delete assignment

### Real-time Updates
- WebSocket endpoint at `/ws` for real-time collaboration
- Broadcasts changes to all connected clients
- Supports task updates, budget changes, and assignment modifications

---

## Advanced Features

### Real-time Collaboration
- WebSocket server handles multiple concurrent users
- Changes broadcast immediately to all connected clients
- Optimistic updates with conflict resolution

### Data Validation
- Multi-layer validation (client-side Zod schemas, server-side validation)
- Type safety throughout the application
- Comprehensive error handling and user feedback

### Excel Integration
- Import budget data from Excel files
- Formula preservation and calculation
- Data mapping and validation

### Mobile Responsiveness
- Mobile-first design approach
- Touch-friendly interfaces
- Responsive layouts for all screen sizes

### Performance Optimization
- Efficient data fetching with React Query
- Debounced input handling
- Optimized re-rendering with proper key management

This comprehensive overview covers all major aspects of the construction management system, focusing on the intricate budget and task management logic that drives the application's core functionality.