import { pgTable, text, serial, integer, boolean, timestamp, decimal, date } from "drizzle-orm/pg-core";
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
  startDate: date("start_date"),
  endDate: date("end_date"),
  defaultSuperintendent: integer("default_superintendent").references(() => users.id),
  defaultProjectManager: integer("default_project_manager").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const budgetLineItems = pgTable("budget_line_items", {
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
});

export const tasks = pgTable("tasks", {
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
  status: text("status").notNull().default("upcoming"), // upcoming, in_progress, complete
  order: decimal("order", { precision: 10, scale: 2 }).notNull().default("0"),
  dependentOnPrevious: boolean("dependent_on_previous").notNull().default(true),
  linkedTaskGroup: text("linked_task_group"), // Tasks with same group ID occur on same date
});

export const employeeAssignments = pgTable("employee_assignments", {
  id: serial("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().unique(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  assignmentDate: date("assignment_date").notNull(),
  assignedHours: decimal("assigned_hours", { precision: 10, scale: 2 }).default("8"),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true }).extend({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable()
});
export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true }).extend({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable()
});
export const insertLocationBudgetSchema = createInsertSchema(locationBudgets).omit({ id: true });
export const insertCrewSchema = createInsertSchema(crews).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true }).extend({
  phone: z.string().optional().nullable(),
});
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true }).extend({
  locationId: z.union([z.string(), z.number()]).transform(val => String(val)),
  order: z.union([z.string(), z.number()]).transform(val => String(val))
});
export const insertEmployeeAssignmentSchema = createInsertSchema(employeeAssignments).omit({ id: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
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
