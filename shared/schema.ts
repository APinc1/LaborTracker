import { pgTable, text, serial, integer, boolean, timestamp, decimal, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
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
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectId: text("project_id").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  defaultSuperintendent: integer("default_superintendent").references(() => users.id),
  defaultProjectManager: integer("default_project_manager").references(() => users.id),
  isInactive: boolean("is_inactive").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectBudgetLineItems = pgTable("project_budget_line_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  lineItemNumber: text("line_item_number").notNull(),
  lineItemName: text("line_item_name").notNull(),
  unconvertedUnitOfMeasure: text("unconverted_unit_of_measure"),
  unconvertedQty: decimal("unconverted_qty", { precision: 10, scale: 2 }).default("0"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).default("0"),
  unitTotal: decimal("unit_total", { precision: 10, scale: 2 }).default("0"),
  conversionFactor: decimal("conversion_factor", { precision: 10, scale: 6 }).default("1"),
  convertedQty: decimal("converted_qty", { precision: 10, scale: 2 }).default("0"),
  convertedUnitOfMeasure: text("converted_unit_of_measure"),
  costCode: text("cost_code"),
  productionRate: decimal("production_rate", { precision: 10, scale: 2 }).default("0"),
  hours: decimal("hours", { precision: 10, scale: 2 }).default("0"),
  budgetTotal: decimal("budget_total", { precision: 10, scale: 2 }).default("0"),
  billing: decimal("billing", { precision: 10, scale: 2 }).default("0"),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).default("0"),
  equipmentCost: decimal("equipment_cost", { precision: 10, scale: 2 }).default("0"),
  truckingCost: decimal("trucking_cost", { precision: 10, scale: 2 }).default("0"),
  dumpFeesCost: decimal("dump_fees_cost", { precision: 10, scale: 2 }).default("0"),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }).default("0"),
  subcontractorCost: decimal("subcontractor_cost", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
  isGroup: boolean("is_group").default(false),
});

export const budgetLineItems = pgTable("budget_line_items", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").references(() => locations.id).notNull(),
  projectBudgetItemId: integer("project_budget_item_id").references(() => projectBudgetLineItems.id),
  lineItemNumber: text("line_item_number").notNull(),
  lineItemName: text("line_item_name").notNull(),
  unconvertedUnitOfMeasure: text("unconverted_unit_of_measure").notNull(),
  unconvertedQty: decimal("unconverted_qty", { precision: 10, scale: 2 }).notNull(),
  actualQty: decimal("actual_qty", { precision: 10, scale: 2 }).default("0"),
  actualConvQty: decimal("actual_conv_qty", { precision: 10, scale: 2 }).default("0"),
  actualsEntered: boolean("actuals_entered").default(false),
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
});

export const locations = pgTable("locations", {
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
  status: text("status").default("active"), // active, completed, suspended
  suspensionReason: text("suspension_reason"),
});

export const locationBudgets = pgTable("location_budgets", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").references(() => locations.id).notNull(),
  budgetLineItemId: integer("budget_line_item_id").references(() => budgetLineItems.id).notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
});

export const crews = pgTable("crews", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  teamMemberId: text("team_member_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  crewId: integer("crew_id").references(() => crews.id),
  employeeType: text("employee_type").notNull(), // Core, Freelancer, Apprentice
  apprenticeLevel: integer("apprentice_level"), // 1, 2, or 3 (only if employeeType is Apprentice)
  isForeman: boolean("is_foreman").default(false), // Only available if employeeType is Core
  isUnion: boolean("is_union").default(false),
  primaryTrade: text("primary_trade"), // Mason, Formsetter, Laborer, Operator, Driver
  secondaryTrade: text("secondary_trade"), // Mason, Formsetter, Laborer, Operator, Driver
  tertiaryTrade: text("tertiary_trade"), // Mason, Formsetter, Laborer, Operator, Driver
  userId: integer("user_id").references(() => users.id), // Optional link to user account
  isInactive: boolean("is_inactive").default(false),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  taskId: text("task_id").notNull().unique(),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
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
  status: text("status").notNull().default("upcoming"), // upcoming, in_progress, complete
  order: decimal("order", { precision: 10, scale: 2 }).notNull().default("0"),
  dependentOnPrevious: boolean("dependent_on_previous").notNull().default(true),
  linkedTaskGroup: text("linked_task_group"), // Tasks with same group ID occur on same date
  qty: decimal("qty", { precision: 10, scale: 2 }), // Quantity for cost code tracking
  unitOfMeasure: text("unit_of_measure"), // CY, Ton, LF, SF, Hours
  useLineItemQuantities: boolean("use_line_item_quantities").default(false), // Toggle for line item qty method
  lineItemQuantities: jsonb("line_item_quantities").default([]), // Array of {budgetLineItemId, qty}
  editHistory: jsonb("edit_history").default([]), // JSON array of edit entries {userId, userName, timestamp, changes}
});

export const employeeAssignments = pgTable("employee_assignments", {
  id: serial("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().unique(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  assignmentDate: date("assignment_date").notNull(),
  assignedHours: decimal("assigned_hours", { precision: 10, scale: 2 }).default("8"),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  isDriverHours: boolean("is_driver_hours").default(false),
});

// Daily Job Reports - tracks reports for linked task groups
export const dailyJobReports = pgTable("daily_job_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  locationId: integer("location_id").references(() => locations.id).notNull(),
  linkedTaskGroup: text("linked_task_group").notNull(), // References tasks.linkedTaskGroup
  taskDate: date("task_date").notNull(), // The date the tasks are for
  submittedAt: timestamp("submitted_at").defaultNow().notNull(), // When the DJR was submitted
  submittedBy: integer("submitted_by").references(() => users.id),
  weather7am: text("weather_7am"), // Weather conditions at 7am
  weatherNoon: text("weather_noon"), // Weather conditions at noon
  weather4pm: text("weather_4pm"), // Weather conditions at 4pm
  notes: text("notes"),
  editHistory: jsonb("edit_history").default([]), // JSON array of edit entries
});

// DJR Task Quantities - stores quantity for each task in a DJR
export const djrTaskQuantities = pgTable("djr_task_quantities", {
  id: serial("id").primaryKey(),
  djrId: integer("djr_id").references(() => dailyJobReports.id, { onDelete: "cascade" }).notNull(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  unitOfMeasure: text("unit_of_measure"),
  notes: text("notes"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true }).extend({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  defaultSuperintendent: z.number().optional().nullable(),
  defaultProjectManager: z.number().optional().nullable(),
  isInactive: z.boolean().optional()
});
const optionalStringField = z.union([
  z.string().transform(val => val === "" ? null : val),
  z.null(),
  z.undefined()
]).optional();

export const insertProjectBudgetLineItemSchema = createInsertSchema(projectBudgetLineItems).omit({ id: true }).extend({
  unconvertedUnitOfMeasure: optionalStringField,
  unconvertedQty: optionalStringField,
  unitCost: optionalStringField,
  unitTotal: optionalStringField,
  convertedQty: optionalStringField,
  convertedUnitOfMeasure: optionalStringField,
  costCode: optionalStringField,
  productionRate: optionalStringField,
  hours: optionalStringField,
  budgetTotal: optionalStringField,
  billing: optionalStringField,
  laborCost: optionalStringField,
  equipmentCost: optionalStringField,
  truckingCost: optionalStringField,
  dumpFeesCost: optionalStringField,
  materialCost: optionalStringField,
  subcontractorCost: optionalStringField,
  notes: optionalStringField,
  isGroup: z.boolean().optional()
});
export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({ id: true }).extend({
  projectBudgetItemId: z.number().optional().nullable(),
  // Transform empty strings to null for optional numeric fields
  actualQty: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  convertedQty: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  conversionFactor: z.union([
    z.string().transform(val => val === "" ? "1" : val),
    z.null(),
    z.undefined()
  ]).optional(),
  productionRate: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  hours: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  billing: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  laborCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  equipmentCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  truckingCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  dumpFeesCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  materialCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  subcontractorCost: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  convertedUnitOfMeasure: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional(),
  notes: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.null(),
    z.undefined()
  ]).optional()
});
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true }).extend({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable()
});
export const insertLocationBudgetSchema = createInsertSchema(locationBudgets).omit({ id: true });
export const insertCrewSchema = createInsertSchema(crews).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true }).extend({
  phone: z.string().optional().nullable(),
  isForeman: z.boolean().optional().default(false),
  isUnion: z.boolean().optional().default(false),
  isInactive: z.boolean().optional().default(false),
});
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true }).extend({
  taskDate: z.string(),
  startDate: z.string().optional(),
  finishDate: z.string().optional(),
  locationId: z.number(),
  superintendentId: z.number().optional().nullable(),
  foremanId: z.number().optional().nullable(),
  order: z
    .union([
      z.number().nonnegative(),
      z.string().transform(val => {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
      }),
      z.null(),
      z.undefined()
    ])
    .optional(),
  taskId: z.string().optional(),
  taskType: z.string().optional(),
  costCode: z.string().optional(),
  qty: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.number().transform(val => val.toString()),
    z.null(),
    z.undefined()
  ]).optional(),
  unitOfMeasure: z.string().optional().nullable(),
  useLineItemQuantities: z.boolean().optional().default(false),
  lineItemQuantities: z.array(z.object({
    budgetLineItemId: z.number(),
    qty: z.string()
  })).optional().default([]),
  editHistory: z.array(z.object({
    userId: z.number().nullable(),
    userName: z.string(),
    timestamp: z.string(),
    changes: z.string()
  })).optional().default([])
});
export const insertEmployeeAssignmentSchema = createInsertSchema(employeeAssignments).omit({ id: true }).extend({
  assignmentId: z.string().optional(),
  assignedHours: z.union([
    z.string(),
    z.number().transform(val => val.toString()),
    z.null(),
    z.undefined()
  ]).optional(),
  actualHours: z.union([
    z.string(),
    z.number().transform(val => val.toString()),
    z.null(),
    z.undefined()
  ]).optional(),
});

// Edit history entry type for DJR
export const djrEditHistoryEntrySchema = z.object({
  userId: z.number().nullable(),
  userName: z.string(),
  timestamp: z.string(),
  changes: z.string(),
});

export const insertDailyJobReportSchema = createInsertSchema(dailyJobReports).omit({ id: true, submittedAt: true }).extend({
  taskDate: z.string(),
  submittedBy: z.number().optional().nullable(),
  weather7am: z.string().optional().nullable(),
  weatherNoon: z.string().optional().nullable(),
  weather4pm: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  editHistory: z.array(djrEditHistoryEntrySchema).optional(),
});

export const insertDjrTaskQuantitySchema = createInsertSchema(djrTaskQuantities).omit({ id: true }).extend({
  quantity: z.union([
    z.string().transform(val => val === "" ? null : val),
    z.number().transform(val => val.toString()),
    z.null(),
    z.undefined()
  ]).optional(),
  unitOfMeasure: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectBudgetLineItem = typeof projectBudgetLineItems.$inferSelect;
export type InsertProjectBudgetLineItem = z.infer<typeof insertProjectBudgetLineItemSchema>;
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;
export type InsertBudgetLineItem = z.infer<typeof insertBudgetLineItemSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type LocationBudget = typeof locationBudgets.$inferSelect;
export type InsertLocationBudget = z.infer<typeof insertLocationBudgetSchema>;
export type Crew = typeof crews.$inferSelect;
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type EmployeeAssignment = typeof employeeAssignments.$inferSelect;
export type InsertEmployeeAssignment = z.infer<typeof insertEmployeeAssignmentSchema>;
export type DailyJobReport = typeof dailyJobReports.$inferSelect;
export type InsertDailyJobReport = z.infer<typeof insertDailyJobReportSchema>;
export type DjrTaskQuantity = typeof djrTaskQuantities.$inferSelect;
export type InsertDjrTaskQuantity = z.infer<typeof insertDjrTaskQuantitySchema>;
export type DjrEditHistoryEntry = z.infer<typeof djrEditHistoryEntrySchema>;
