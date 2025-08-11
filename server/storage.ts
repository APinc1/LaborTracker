import { 
  users, projects, budgetLineItems, locations, locationBudgets, crews, employees, tasks, employeeAssignments,
  type User, type InsertUser, type Project, type InsertProject, type BudgetLineItem, type InsertBudgetLineItem,
  type Location, type InsertLocation, type LocationBudget, type InsertLocationBudget, type Crew, type InsertCrew,
  type Employee, type InsertEmployee, type Task, type InsertTask, type EmployeeAssignment, type InsertEmployeeAssignment
} from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { eq, and, gte, lte, or } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<boolean>;
  setPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void>;
  clearPasswordResetToken(userId: number): Promise<void>;
  
  // Project methods
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  
  // Budget methods
  getBudgetLineItems(locationId: number): Promise<BudgetLineItem[]>;
  createBudgetLineItem(budgetLineItem: InsertBudgetLineItem): Promise<BudgetLineItem>;
  updateBudgetLineItem(id: number, budgetLineItem: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem>;
  deleteBudgetLineItem(id: number): Promise<void>;
  
  // Location methods
  getLocations(projectId: number): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string | number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string | number, location: Partial<InsertLocation>): Promise<Location>;
  deleteLocation(id: string | number): Promise<void>;
  
  // Location budget methods
  getLocationBudgets(locationId: number): Promise<LocationBudget[]>;
  createLocationBudget(locationBudget: InsertLocationBudget): Promise<LocationBudget>;
  updateLocationBudget(id: number, locationBudget: Partial<InsertLocationBudget>): Promise<LocationBudget>;
  
  // Crew methods
  getCrews(): Promise<Crew[]>;
  createCrew(crew: InsertCrew): Promise<Crew>;
  updateCrew(id: number, crew: Partial<InsertCrew>): Promise<Crew>;
  deleteCrew(id: number): Promise<void>;
  
  // Employee methods
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;
  createUserFromEmployee(employeeId: number, username: string, role: string): Promise<{ user: User; employee: Employee }>;
  
  // Task methods
  getTasks(locationId: string | number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]>;
  
  // Employee assignment methods
  getEmployeeAssignments(taskId: number): Promise<EmployeeAssignment[]>;
  getAllEmployeeAssignments(): Promise<EmployeeAssignment[]>;
  createEmployeeAssignment(assignment: InsertEmployeeAssignment): Promise<EmployeeAssignment>;
  updateEmployeeAssignment(id: number, assignment: Partial<InsertEmployeeAssignment>): Promise<EmployeeAssignment>;
  deleteEmployeeAssignment(id: number): Promise<void>;
  getEmployeeAssignmentsByDate(date: string): Promise<EmployeeAssignment[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private projects: Map<number, Project> = new Map();
  private budgetLineItems: Map<number, BudgetLineItem> = new Map();
  private locations: Map<number, Location> = new Map();
  private locationBudgets: Map<number, LocationBudget> = new Map();
  private crews: Map<number, Crew> = new Map();
  private employees: Map<number, Employee> = new Map();
  private tasks: Map<number, Task> = new Map();
  private employeeAssignments: Map<number, EmployeeAssignment> = new Map();
  
  private currentUserId = 1;
  private currentProjectId = 1;
  private currentBudgetLineItemId = 1;
  private currentLocationId = 1;
  private currentLocationBudgetId = 1;
  private currentCrewId = 1;
  private currentEmployeeId = 1;
  private currentTaskId = 1;
  private currentEmployeeAssignmentId = 1;

  constructor() {
    // Initialize with some sample data for demonstration
    this.initializeSampleData();
  }

  private async initializeSampleData() {
    // Create sample users
    const admin = await this.createUser({
      username: "admin",
      password: "AccessPacific2835",
      name: "John Smith",
      email: "admin@buildtracker.com",
      phone: "(555) 123-4567",
      role: "Superintendent",
      isPasswordSet: true // Admin account is pre-configured
    });

    const projectManager = await this.createUser({
      username: "pmgr",
      password: "password",
      name: "Maria Rodriguez",
      email: "maria@buildtracker.com",
      phone: "(555) 234-5678",
      role: "Project Manager"
    });

    const superintendent = await this.createUser({
      username: "super",
      password: "password",
      name: "David Johnson",
      email: "david@buildtracker.com",
      phone: "(555) 345-6789",
      role: "Superintendent"
    });

    const foreman = await this.createUser({
      username: "foreman",
      password: "password",
      name: "Carlos Martinez",
      email: "carlos@buildtracker.com",
      phone: "(555) 456-7890",
      role: "Foreman"
    });

    // Create sample crews
    const concreteCrew = await this.createCrew({ name: "Concrete Crew A" });
    const demoCrew = await this.createCrew({ name: "Demo Crew B" });
    const transportCrew = await this.createCrew({ name: "Transport Crew" });

    // Create sample employees
    const mike = await this.createEmployee({
      teamMemberId: "EMP-001",
      name: "Mike Johnson",
      email: "mike@buildtracker.com",
      phone: "(555) 234-5678",
      crewId: concreteCrew.id,
      employeeType: "Core",
      apprenticeLevel: null,
      isForeman: true,
      isUnion: true,
      primaryTrade: "Formsetter",
      secondaryTrade: "Laborer",
      tertiaryTrade: null
    });

    const sarah = await this.createEmployee({
      teamMemberId: "EMP-002",
      name: "Sarah Martinez",
      email: "sarah@buildtracker.com",
      phone: "(555) 345-6789",
      crewId: demoCrew.id,
      employeeType: "Core",
      apprenticeLevel: null,
      isForeman: true,
      isUnion: false,
      primaryTrade: "Operator",
      secondaryTrade: "Driver",
      tertiaryTrade: null
    });

    const tom = await this.createEmployee({
      teamMemberId: "EMP-003",
      name: "Tom Wilson",
      email: "tom@buildtracker.com",
      phone: "(555) 456-7890",
      crewId: transportCrew.id,
      employeeType: "Freelancer",
      apprenticeLevel: null,
      isForeman: false,
      isUnion: false,
      primaryTrade: "Driver",
      secondaryTrade: null,
      tertiaryTrade: null
    });

    const apprentice = await this.createEmployee({
      teamMemberId: "EMP-004",
      name: "Jake Thompson", 
      email: "jake@buildtracker.com",
      phone: "(555) 567-8901",
      crewId: concreteCrew.id,
      employeeType: "Apprentice",
      apprenticeLevel: 2,
      isForeman: false,
      isUnion: true,
      primaryTrade: "Mason",
      secondaryTrade: "Laborer",
      tertiaryTrade: null
    });

    const freelancer = await this.createEmployee({
      teamMemberId: "EMP-005",
      name: "Alex Rodriguez",
      email: "alex@buildtracker.com", 
      phone: "(555) 678-9012",
      crewId: demoCrew.id,
      employeeType: "Freelancer",
      apprenticeLevel: null,
      isForeman: false,
      isUnion: false,
      primaryTrade: "Operator",
      secondaryTrade: null,
      tertiaryTrade: null
    });

    // Create sample projects
    const bridgeProject = await this.createProject({
      projectId: "PRJ-2024-001",
      name: "Main St Bridge",
      startDate: "2024-03-01",
      endDate: "2024-03-25",
      defaultSuperintendent: admin.id,
      defaultProjectManager: admin.id
    });

    const cityHallProject = await this.createProject({
      projectId: "PRJ-2024-002",
      name: "City Hall Renovation",
      startDate: "2024-03-10",
      endDate: "2024-04-05",
      defaultSuperintendent: admin.id,
      defaultProjectManager: admin.id
    });

    // Create sample locations
    const northSection = await this.createLocation({
      locationId: `${bridgeProject.projectId}_NorthSection`,
      projectId: bridgeProject.id,
      name: "Main St Bridge - North Section",
      startDate: "2024-03-01",
      endDate: "2024-03-25",
      isComplete: false
    });

    const eastWing = await this.createLocation({
      locationId: `${cityHallProject.projectId}_EastWing`,
      projectId: cityHallProject.id,
      name: "City Hall - East Wing",
      startDate: "2024-03-10",
      endDate: "2024-04-05",
      isComplete: false
    });

    // Create sample budget line items
    await this.createBudgetLineItem({
      locationId: northSection.id,
      lineItemNumber: "1.1",
      lineItemName: "Concrete Forms",
      unconvertedUnitOfMeasure: "SF",
      unconvertedQty: "1000",
      actualQty: "0",
      unitCost: "15.50",
      unitTotal: "15500",
      convertedQty: "185",
      convertedUnitOfMeasure: "CY",
      costCode: "CONCRETE",
      productionRate: "5.4",
      hours: "40",
      budgetTotal: "15500",
      billing: "0",
      laborCost: "8000",
      equipmentCost: "2000",
      truckingCost: "1500",
      dumpFeesCost: "500",
      materialCost: "3000",
      subcontractorCost: "500",
      notes: "Concrete forms for bridge deck"
    });

    await this.createBudgetLineItem({
      locationId: northSection.id,
      lineItemNumber: "2.1",
      lineItemName: "Demolition Work",
      unconvertedUnitOfMeasure: "SF",
      unconvertedQty: "500",
      actualQty: "0",
      unitCost: "12.00",
      unitTotal: "6000",
      convertedQty: "500",
      convertedUnitOfMeasure: "SF",
      costCode: "DEMO/EX",
      productionRate: "20",
      hours: "25",
      budgetTotal: "6000",
      billing: "0",
      laborCost: "3000",
      equipmentCost: "1500",
      truckingCost: "500",
      dumpFeesCost: "1000",
      materialCost: "0",
      subcontractorCost: "0",
      notes: "Demolition of existing structures"
    });

    // Create sample tasks
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const formTask = await this.createTask({
      taskId: `${northSection.locationId}_Form_Day1`,
      locationId: northSection.locationId,
      taskType: "Form",
      name: "Form Day 1 of 3",
      taskDate: today,
      startDate: today,
      finishDate: today,
      costCode: "CONCRETE",
      superintendentId: admin.id,
      foremanId: mike.id,
      scheduledHours: "40",
      actualHours: null,
      startTime: "08:00",
      finishTime: "17:00",
      workDescription: "Set up concrete forms for bridge deck section. Ensure proper alignment and elevation.",
      notes: "Weather conditions good, expect normal progress",
      order: 0,
      dependentOnPrevious: true
    });

    const demoTask = await this.createTask({
      taskId: `${eastWing.locationId}_Demo_Day1`,
      locationId: eastWing.locationId,
      taskType: "Demo/Ex",
      name: "Demo/Ex Base Grade",
      taskDate: today,
      startDate: today,
      finishDate: today,
      costCode: "DEMO/EX",
      superintendentId: admin.id,
      foremanId: sarah.id,
      scheduledHours: "24",
      actualHours: null,
      startTime: "09:30",
      finishTime: "16:00",
      workDescription: "Demolish existing concrete and prepare base grade for new foundation.",
      notes: "Coordinate with utilities for underground clearance",
      status: "in_progress",
      order: 0,
      dependentOnPrevious: false  // CRITICAL: First task must always be unsequential
    });

    const pourTask = await this.createTask({
      taskId: `${northSection.locationId}_Pour_Day1`,
      locationId: northSection.locationId,
      taskType: "Pour",
      name: "Pour Concrete",
      taskDate: tomorrow,
      startDate: tomorrow,
      finishDate: tomorrow,
      costCode: "CONCRETE",
      superintendentId: admin.id,
      foremanId: mike.id,
      scheduledHours: "32",
      actualHours: null,
      startTime: "07:00",
      finishTime: "15:00",
      workDescription: "Pour concrete for bridge deck section",
      notes: "Concrete delivery scheduled for 7:00 AM",
      order: 2,
      dependentOnPrevious: true
    });

    // Create sample employee assignments
    await this.createEmployeeAssignment({
      taskId: formTask.id,
      employeeId: mike.id,
      assignmentDate: today,
      assignedHours: "8",
      actualHours: null
    });

    await this.createEmployeeAssignment({
      taskId: demoTask.id,
      employeeId: sarah.id,
      assignmentDate: today,
      assignedHours: "10",
      actualHours: null
    });

    await this.createEmployeeAssignment({
      taskId: formTask.id,
      employeeId: tom.id,
      assignmentDate: today,
      assignedHours: "6",
      actualHours: null
    });
  }

  // User methods
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      phone: insertUser.phone ?? null,
      passwordResetToken: insertUser.passwordResetToken ?? null,
      passwordResetExpires: insertUser.passwordResetExpires ?? null,
      isPasswordSet: insertUser.isPasswordSet ?? null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updateUser: Partial<InsertUser>): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error('User not found');
    
    // Don't update password if it's empty (for edit mode)
    const userData = { ...updateUser };
    if (userData.password === "") {
      delete userData.password;
    }
    
    const updated = { ...existing, ...userData };
    this.users.set(id, updated);
    
    // Sync with linked employee if exists
    const linkedEmployee = Array.from(this.employees.values()).find(emp => emp.userId === id);
    if (linkedEmployee) {
      await this.syncUserToEmployee(updated, linkedEmployee.id);
    }
    
    return updated;
  }

  async deleteUser(id: number): Promise<boolean> {
    // Find and unlink any linked employee before deleting
    const linkedEmployee = Array.from(this.employees.values()).find(emp => emp.userId === id);
    if (linkedEmployee) {
      const updated = { ...linkedEmployee, userId: null };
      this.employees.set(linkedEmployee.id, updated);
    }
    
    return this.users.delete(id);
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => 
      user.passwordResetToken === token && 
      user.passwordResetExpires && 
      user.passwordResetExpires > new Date()
    );
  }

  async setPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updated = { 
        ...user, 
        passwordResetToken: token, 
        passwordResetExpires: expiresAt 
      };
      this.users.set(userId, updated);
    }
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updated = { 
        ...user, 
        passwordResetToken: null, 
        passwordResetExpires: null,
        isPasswordSet: true
      };
      this.users.set(userId, updated);
    }
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = this.currentProjectId++;
    
    const project: Project = { 
      id, 
      projectId: insertProject.projectId,
      name: insertProject.name,
      createdAt: new Date(),
      startDate: insertProject.startDate || null,
      endDate: insertProject.endDate || null,
      defaultSuperintendent: insertProject.defaultSuperintendent || null,
      defaultProjectManager: insertProject.defaultProjectManager || null
    };
    
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: number, updateProject: Partial<InsertProject>): Promise<Project> {
    const existing = this.projects.get(id);
    if (!existing) throw new Error('Project not found');
    const updated = { ...existing, ...updateProject };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    this.projects.delete(id);
  }

  // Budget methods
  async getBudgetLineItems(locationId: number): Promise<BudgetLineItem[]> {
    return Array.from(this.budgetLineItems.values()).filter(item => item.locationId === locationId);
  }

  async createBudgetLineItem(insertBudgetLineItem: InsertBudgetLineItem): Promise<BudgetLineItem> {
    const id = this.currentBudgetLineItemId++;
    const budgetLineItem: BudgetLineItem = { 
      ...insertBudgetLineItem, 
      id,
      actualQty: insertBudgetLineItem.actualQty ?? null,
      convertedQty: insertBudgetLineItem.convertedQty ?? null,
      convertedUnitOfMeasure: insertBudgetLineItem.convertedUnitOfMeasure ?? null,
      productionRate: insertBudgetLineItem.productionRate ?? null,
      hours: insertBudgetLineItem.hours ?? null,
      billing: insertBudgetLineItem.billing ?? null,
      laborCost: insertBudgetLineItem.laborCost ?? null,
      equipmentCost: insertBudgetLineItem.equipmentCost ?? null,
      truckingCost: insertBudgetLineItem.truckingCost ?? null,
      dumpFeesCost: insertBudgetLineItem.dumpFeesCost ?? null,
      materialCost: insertBudgetLineItem.materialCost ?? null,
      subcontractorCost: insertBudgetLineItem.subcontractorCost ?? null,
      notes: insertBudgetLineItem.notes ?? null,
      conversionFactor: insertBudgetLineItem.conversionFactor ?? null
    };
    this.budgetLineItems.set(id, budgetLineItem);
    return budgetLineItem;
  }

  async updateBudgetLineItem(id: number, updateBudgetLineItem: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem> {
    const existing = this.budgetLineItems.get(id);
    if (!existing) throw new Error('Budget line item not found');
    const updated = { ...existing, ...updateBudgetLineItem };
    this.budgetLineItems.set(id, updated);
    return updated;
  }

  async deleteBudgetLineItem(id: number): Promise<void> {
    this.budgetLineItems.delete(id);
  }

  // Location methods
  async getLocations(projectId: number): Promise<Location[]> {
    return Array.from(this.locations.values()).filter(location => location.projectId === projectId);
  }

  async getAllLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }

  async getLocation(id: string | number): Promise<Location | undefined> {
    // For string IDs, find by locationId field; for number IDs, find by id field
    if (typeof id === 'string') {
      return Array.from(this.locations.values()).find(loc => loc.locationId === id);
    }
    return this.locations.get(id);
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const id = this.currentLocationId++;
    const location: Location = { 
      ...insertLocation, 
      id,
      startDate: insertLocation.startDate || new Date().toISOString().split('T')[0],
      endDate: insertLocation.endDate ?? null,
      isComplete: insertLocation.isComplete ?? null,
      description: insertLocation.description ?? null,
      estimatedCost: insertLocation.estimatedCost ?? null,
      actualCost: insertLocation.actualCost ?? null
    };
    this.locations.set(id, location);
    return location;
  }

  async updateLocation(id: string | number, updateLocation: Partial<InsertLocation>): Promise<Location> {
    let existing: Location | undefined;
    let locationKey: number;
    
    if (typeof id === 'string') {
      // Find by locationId field
      for (const [key, loc] of Array.from(this.locations.entries())) {
        if (loc.locationId === id) {
          existing = loc;
          locationKey = key;
          break;
        }
      }
    } else {
      // Find by numeric id
      existing = this.locations.get(id);
      locationKey = id;
    }
    
    if (!existing) throw new Error('Location not found');
    const updated = { ...existing, ...updateLocation, startDate: updateLocation.startDate || existing.startDate };
    this.locations.set(locationKey!, updated);
    return updated;
  }

  async deleteLocation(id: string | number): Promise<void> {
    if (typeof id === 'string') {
      // Find and delete by locationId field
      for (const [key, loc] of Array.from(this.locations.entries())) {
        if (loc.locationId === id) {
          this.locations.delete(key);
          return;
        }
      }
      throw new Error('Location not found');
    } else {
      // Delete by numeric id
      this.locations.delete(id);
    }
  }

  // Location budget methods
  async getLocationBudgets(locationId: number): Promise<LocationBudget[]> {
    return Array.from(this.locationBudgets.values()).filter(budget => budget.locationId === locationId);
  }

  async createLocationBudget(insertLocationBudget: InsertLocationBudget): Promise<LocationBudget> {
    const id = this.currentLocationBudgetId++;
    const locationBudget: LocationBudget = { 
      ...insertLocationBudget, 
      id,
      notes: insertLocationBudget.notes ?? null
    };
    this.locationBudgets.set(id, locationBudget);
    return locationBudget;
  }

  async updateLocationBudget(id: number, updateLocationBudget: Partial<InsertLocationBudget>): Promise<LocationBudget> {
    const existing = this.locationBudgets.get(id);
    if (!existing) throw new Error('Location budget not found');
    const updated = { ...existing, ...updateLocationBudget };
    this.locationBudgets.set(id, updated);
    return updated;
  }

  // Crew methods
  async getCrews(): Promise<Crew[]> {
    return Array.from(this.crews.values());
  }

  async createCrew(insertCrew: InsertCrew): Promise<Crew> {
    const id = this.currentCrewId++;
    const crew: Crew = { ...insertCrew, id };
    this.crews.set(id, crew);
    return crew;
  }

  async updateCrew(id: number, updateCrew: Partial<InsertCrew>): Promise<Crew> {
    const existing = this.crews.get(id);
    if (!existing) throw new Error('Crew not found');
    const updated = { ...existing, ...updateCrew };
    this.crews.set(id, updated);
    return updated;
  }

  async deleteCrew(id: number): Promise<void> {
    this.crews.delete(id);
  }

  // Employee methods
  async getEmployees(): Promise<Employee[]> {
    return Array.from(this.employees.values());
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    const id = this.currentEmployeeId++;
    const employee: Employee = { 
      ...insertEmployee, 
      id,
      email: insertEmployee.email ?? null,
      phone: insertEmployee.phone ?? null,
      crewId: insertEmployee.crewId ?? null,
      isForeman: insertEmployee.isForeman ?? null,
      apprenticeLevel: insertEmployee.apprenticeLevel ?? null,
      primaryTrade: insertEmployee.primaryTrade ?? null,
      secondaryTrade: insertEmployee.secondaryTrade ?? null,
      tertiaryTrade: insertEmployee.tertiaryTrade ?? null,
      userId: insertEmployee.userId ?? null,
      isUnion: insertEmployee.isUnion ?? null
    };
    this.employees.set(id, employee);
    return employee;
  }

  async updateEmployee(id: number, updateEmployee: Partial<InsertEmployee>): Promise<Employee> {
    const existing = this.employees.get(id);
    if (!existing) throw new Error('Employee not found');
    const updated = { ...existing, ...updateEmployee };
    this.employees.set(id, updated);
    
    // Sync with linked user if exists
    if (updated.userId) {
      await this.syncEmployeeToUser(updated, updated.userId);
    }
    
    return updated;
  }

  async deleteEmployee(id: number): Promise<void> {
    const employee = this.employees.get(id);
    
    // Delete linked user account if exists
    if (employee?.userId) {
      this.users.delete(employee.userId);
    }
    
    this.employees.delete(id);
  }

  async createUserFromEmployee(employeeId: number, username: string, role: string): Promise<{ user: User; employee: Employee }> {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    // Create the user account with default password
    const user = await this.createUser({
      username,
      password: 'AccessPacific2835', // Default password
      name: employee.name,
      email: employee.email || '',
      phone: employee.phone,
      role,
      isPasswordSet: false
    });

    // Update the employee to link to the user
    const updatedEmployee = { ...employee, userId: user.id };
    this.employees.set(employeeId, updatedEmployee);

    return { user, employee: updatedEmployee };
  }

  // Sync helper methods for bidirectional updates
  private async syncEmployeeToUser(employee: Employee, userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;

    // Update user with employee data (excluding password and auth-specific fields)
    const updatedUser = {
      ...user,
      name: employee.name,
      email: employee.email || user.email,
      phone: employee.phone || user.phone
    };
    this.users.set(userId, updatedUser);
  }

  private async syncUserToEmployee(user: User, employeeId: number): Promise<void> {
    const employee = this.employees.get(employeeId);
    if (!employee) return;

    // Update employee with user data (excluding employee-specific fields)
    const updatedEmployee = {
      ...employee,
      name: user.name,
      email: user.email || employee.email,
      phone: user.phone || employee.phone
    };
    this.employees.set(employeeId, updatedEmployee);
  }

  // Task methods
  async getTasks(locationId: string | number): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => {
      return String(task.locationId) === String(locationId);
    });
  }

  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const task: Task = { 
      ...insertTask, 
      id,
      superintendentId: insertTask.superintendentId ?? null,
      foremanId: insertTask.foremanId ?? null,
      scheduledHours: insertTask.scheduledHours ?? null,
      actualHours: insertTask.actualHours ?? null,
      startTime: insertTask.startTime ?? null,
      finishTime: insertTask.finishTime ?? null,
      workDescription: insertTask.workDescription ?? null,
      notes: insertTask.notes ?? null,
      status: insertTask.status ?? "upcoming",
      order: insertTask.order ?? 0,
      dependentOnPrevious: insertTask.dependentOnPrevious ?? true,
      linkedTaskGroup: insertTask.linkedTaskGroup ?? null
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: number, updateTask: Partial<InsertTask>): Promise<Task> {
    const existing = this.tasks.get(id);
    if (!existing) throw new Error('Task not found');
    const updated = { ...existing, ...updateTask };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    this.tasks.delete(id);
  }

  async getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => 
      task.taskDate >= startDate && task.taskDate <= endDate
    );
  }

  // Employee assignment methods
  async getEmployeeAssignments(taskId: number): Promise<EmployeeAssignment[]> {
    return Array.from(this.employeeAssignments.values()).filter(assignment => assignment.taskId === taskId);
  }

  async getAllEmployeeAssignments(): Promise<EmployeeAssignment[]> {
    return Array.from(this.employeeAssignments.values());
  }

  async createEmployeeAssignment(insertEmployeeAssignment: InsertEmployeeAssignment): Promise<EmployeeAssignment> {
    const id = this.currentEmployeeAssignmentId++;
    const assignmentId = `${insertEmployeeAssignment.taskId}_${insertEmployeeAssignment.employeeId}_${Date.now()}`;
    const assignment: EmployeeAssignment = { 
      ...insertEmployeeAssignment, 
      id,
      assignmentId,
      assignedHours: insertEmployeeAssignment.assignedHours ?? null,
      actualHours: insertEmployeeAssignment.actualHours ?? null
    };
    this.employeeAssignments.set(id, assignment);
    return assignment;
  }

  async updateEmployeeAssignment(id: number, updateEmployeeAssignment: Partial<InsertEmployeeAssignment>): Promise<EmployeeAssignment> {
    const existing = this.employeeAssignments.get(id);
    if (!existing) throw new Error('Employee assignment not found');
    const updated = { ...existing, ...updateEmployeeAssignment };
    this.employeeAssignments.set(id, updated);
    return updated;
  }

  async deleteEmployeeAssignment(id: number): Promise<void> {
    this.employeeAssignments.delete(id);
  }

  async getEmployeeAssignmentsByDate(date: string): Promise<EmployeeAssignment[]> {
    return Array.from(this.employeeAssignments.values()).filter(assignment => 
      assignment.assignmentDate === date
    );
  }
}

class DatabaseStorage implements IStorage {
  private db: any;

  constructor() {
    console.log("Attempting Supabase connection...");
    
    // Try Supabase first, then fall back to Replit if needed
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
    const replitUrl = process.env.DATABASE_URL;
    
    if (supabaseUrl) {
      console.log("Using Supabase database connection");
      try {
        // For Supabase, use postgres driver with specific SSL configuration
        const sql = postgres(supabaseUrl, {
          ssl: 'require',
          max: 1, // Limit connections for Supabase free tier
          idle_timeout: 10,
          connect_timeout: 3,
          prepare: false // Disable prepared statements for better compatibility
        });
        this.db = drizzlePostgres(sql, {
          schema: {
            users,
            projects,
            budgetLineItems,
            locations,
            locationBudgets,
            crews,
            employees,
            tasks,
            employeeAssignments,
          },
        });
      } catch (error) {
        console.error("Supabase connection failed:", error);
        throw error;
      }
    } else if (replitUrl) {
      console.log("Using Replit database as fallback");
      const sql = neon(replitUrl);
      this.db = drizzle(sql, {
        schema: {
          users,
          projects,
          budgetLineItems,
          locations,
          locationBudgets,
          crews,
          employees,
          tasks,
          employeeAssignments,
        },
      });
    } else {
      throw new Error("No database URL available");
    }
  }

  // User methods
  async getUsers(): Promise<User[]> {
    const result = await this.db.select().from(users);
    return result;
  }

  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: number, updateUser: Partial<InsertUser>): Promise<User> {
    // Don't update password if it's empty (for edit mode)
    const userData = { ...updateUser };
    if (userData.password === "") {
      delete userData.password;
    }
    
    const result = await this.db.update(users).set(userData).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      // First, update projects to remove references to this user
      const projectsToUpdate = await this.db.select()
        .from(projects)
        .where(
          or(
            eq(projects.defaultSuperintendent, id),
            eq(projects.defaultProjectManager, id)
          )
        );
      
      console.log(`🔄 Found ${projectsToUpdate.length} projects referencing user ${id}`);
      
      if (projectsToUpdate.length > 0) {
        for (const project of projectsToUpdate) {
          const updateData: any = {};
          if (project.defaultSuperintendent === id) updateData.defaultSuperintendent = null;
          if (project.defaultProjectManager === id) updateData.defaultProjectManager = null;
          
          await this.db.update(projects)
            .set(updateData)
            .where(eq(projects.id, project.id));
          
          console.log(`✅ Updated project ${project.name} to remove user ${id} references`);
        }
      }
      
      // Now delete the user
      const result = await this.db.delete(users).where(eq(users.id, id));
      console.log(`🗑️ User deletion result: rowCount = ${result.rowCount}, result =`, result);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('❌ Error in deleteUser:', error);
      return false;
    }
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(
      and(
        eq(users.passwordResetToken, token),
        gte(users.passwordResetExpires, new Date())
      )
    );
    return result[0];
  }

  async setPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.db.update(users)
      .set({ 
        passwordResetToken: token, 
        passwordResetExpires: expiresAt 
      })
      .where(eq(users.id, userId));
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    await this.db.update(users)
      .set({ 
        passwordResetToken: null, 
        passwordResetExpires: null,
        isPasswordSet: true 
      })
      .where(eq(users.id, userId));
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    return await this.db.select().from(projects);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const result = await this.db.select().from(projects).where(eq(projects.id, id));
    return result[0];
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const result = await this.db.insert(projects).values(insertProject).returning();
    return result[0];
  }

  async updateProject(id: number, updateProject: Partial<InsertProject>): Promise<Project> {
    const result = await this.db.update(projects).set(updateProject).where(eq(projects.id, id)).returning();
    return result[0];
  }

  async deleteProject(id: number): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id));
  }

  // Budget methods
  async getBudgetLineItems(locationId: number): Promise<BudgetLineItem[]> {
    return await this.db.select().from(budgetLineItems).where(eq(budgetLineItems.locationId, locationId));
  }

  async createBudgetLineItem(insertBudgetLineItem: InsertBudgetLineItem): Promise<BudgetLineItem> {
    const result = await this.db.insert(budgetLineItems).values(insertBudgetLineItem).returning();
    return result[0];
  }

  async updateBudgetLineItem(id: number, updateBudgetLineItem: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem> {
    const result = await this.db.update(budgetLineItems).set(updateBudgetLineItem).where(eq(budgetLineItems.id, id)).returning();
    return result[0];
  }

  async deleteBudgetLineItem(id: number): Promise<void> {
    await this.db.delete(budgetLineItems).where(eq(budgetLineItems.id, id));
  }

  // Location methods
  async getLocations(projectId: number): Promise<Location[]> {
    return await this.db.select().from(locations).where(eq(locations.projectId, projectId));
  }

  async getAllLocations(): Promise<Location[]> {
    return await this.db.select().from(locations);
  }

  async getLocation(id: string | number): Promise<Location | undefined> {
    if (typeof id === 'string') {
      const result = await this.db.select().from(locations).where(eq(locations.locationId, id));
      return result[0];
    } else {
      const result = await this.db.select().from(locations).where(eq(locations.id, id));
      return result[0];
    }
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const result = await this.db.insert(locations).values(insertLocation).returning();
    return result[0];
  }

  async updateLocation(id: string | number, updateLocation: Partial<InsertLocation>): Promise<Location> {
    if (typeof id === 'string') {
      const result = await this.db.update(locations).set(updateLocation).where(eq(locations.locationId, id)).returning();
      return result[0];
    } else {
      const result = await this.db.update(locations).set(updateLocation).where(eq(locations.id, id)).returning();
      return result[0];
    }
  }

  async deleteLocation(id: string | number): Promise<void> {
    if (typeof id === 'string') {
      await this.db.delete(locations).where(eq(locations.locationId, id));
    } else {
      await this.db.delete(locations).where(eq(locations.id, id));
    }
  }

  // Location budget methods
  async getLocationBudgets(locationId: number): Promise<LocationBudget[]> {
    return await this.db.select().from(locationBudgets).where(eq(locationBudgets.locationId, locationId));
  }

  async createLocationBudget(insertLocationBudget: InsertLocationBudget): Promise<LocationBudget> {
    const result = await this.db.insert(locationBudgets).values(insertLocationBudget).returning();
    return result[0];
  }

  async updateLocationBudget(id: number, updateLocationBudget: Partial<InsertLocationBudget>): Promise<LocationBudget> {
    const result = await this.db.update(locationBudgets).set(updateLocationBudget).where(eq(locationBudgets.id, id)).returning();
    return result[0];
  }

  // Crew methods
  async getCrews(): Promise<Crew[]> {
    return await this.db.select().from(crews);
  }

  async createCrew(insertCrew: InsertCrew): Promise<Crew> {
    const result = await this.db.insert(crews).values(insertCrew).returning();
    return result[0];
  }

  async updateCrew(id: number, updateCrew: Partial<InsertCrew>): Promise<Crew> {
    const result = await this.db.update(crews).set(updateCrew).where(eq(crews.id, id)).returning();
    return result[0];
  }

  async deleteCrew(id: number): Promise<void> {
    await this.db.delete(crews).where(eq(crews.id, id));
  }

  // Employee methods
  async getEmployees(): Promise<Employee[]> {
    return await this.db.select().from(employees);
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const result = await this.db.select().from(employees).where(eq(employees.id, id));
    return result[0];
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    const result = await this.db.insert(employees).values(insertEmployee).returning();
    return result[0];
  }

  async updateEmployee(id: number, updateEmployee: Partial<InsertEmployee>): Promise<Employee> {
    const result = await this.db.update(employees).set(updateEmployee).where(eq(employees.id, id)).returning();
    return result[0];
  }

  async deleteEmployee(id: number): Promise<void> {
    await this.db.delete(employees).where(eq(employees.id, id));
  }

  async createUserFromEmployee(employeeId: number, username: string, role: string): Promise<{ user: User; employee: Employee }> {
    const employee = await this.getEmployee(employeeId);
    if (!employee) throw new Error('Employee not found');

    // Create the user account with default password
    const user = await this.createUser({
      username,
      password: 'AccessPacific2835', // Default password
      name: employee.name,
      email: employee.email || '',
      phone: employee.phone,
      role,
      isPasswordSet: false
    });

    // Update the employee to link to the user
    const updatedEmployee = await this.updateEmployee(employeeId, { userId: user.id });

    return { user, employee: updatedEmployee };
  }

  // Task methods
  async getTasks(locationId: string | number): Promise<Task[]> {
    return await this.db.select().from(tasks).where(eq(tasks.locationId, String(locationId)));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return result[0];
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const result = await this.db.insert(tasks).values(insertTask).returning();
    return result[0];
  }

  async updateTask(id: number, updateTask: Partial<InsertTask>): Promise<Task> {
    const result = await this.db.update(tasks).set(updateTask).where(eq(tasks.id, id)).returning();
    return result[0];
  }

  async deleteTask(id: number): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async getTasksByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    return await this.db.select().from(tasks).where(
      and(
        gte(tasks.taskDate, startDate),
        lte(tasks.taskDate, endDate)
      )
    );
  }

  // Employee assignment methods
  async getEmployeeAssignments(taskId: number): Promise<EmployeeAssignment[]> {
    return await this.db.select().from(employeeAssignments).where(eq(employeeAssignments.taskId, taskId));
  }

  async getAllEmployeeAssignments(): Promise<EmployeeAssignment[]> {
    return await this.db.select().from(employeeAssignments);
  }

  async createEmployeeAssignment(insertEmployeeAssignment: InsertEmployeeAssignment): Promise<EmployeeAssignment> {
    const result = await this.db.insert(employeeAssignments).values(insertEmployeeAssignment).returning();
    return result[0];
  }

  async updateEmployeeAssignment(id: number, updateEmployeeAssignment: Partial<InsertEmployeeAssignment>): Promise<EmployeeAssignment> {
    const result = await this.db.update(employeeAssignments).set(updateEmployeeAssignment).where(eq(employeeAssignments.id, id)).returning();
    return result[0];
  }

  async deleteEmployeeAssignment(id: number): Promise<void> {
    await this.db.delete(employeeAssignments).where(eq(employeeAssignments.id, id));
  }

  async getEmployeeAssignmentsByDate(date: string): Promise<EmployeeAssignment[]> {
    return await this.db.select().from(employeeAssignments).where(eq(employeeAssignments.assignmentDate, date));
  }
}

// Initialize storage with priority for Supabase, fallback to Replit/in-memory
async function initializeStorage(): Promise<IStorage> {
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
  const replitUrl = process.env.DATABASE_URL;
  
  // First try Supabase if available
  if (supabaseUrl) {
    try {
      console.log("🔗 Attempting Supabase connection...");
      console.log(`Supabase URL format: ${supabaseUrl.replace(/:\/\/[^:]*:[^@]*@/, '://***:***@')}`);
      const dbStorage = new DatabaseStorage();
      
      // Test the connection with a simpler query
      try {
        await Promise.race([
          dbStorage.getUsers(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        console.log("✅ Successfully connected to Supabase database");
        return dbStorage;
      } catch (testError) {
        throw new Error(`Connection test failed: ${(testError as Error).message}`);
      }
    } catch (error) {
      console.error("❌ Supabase connection failed:");
      console.error("Error details:", (error as Error).message);
      console.error("Full error:", error);
    }
  }
  
  // Fallback to Replit database
  if (replitUrl) {
    try {
      console.log("🔄 Falling back to Replit PostgreSQL...");
      // Create a new instance without Supabase URL set
      process.env.SUPABASE_DATABASE_URL = "";
      const dbStorage = new DatabaseStorage();
      await dbStorage.getUsers();
      console.log("✅ Connected to Replit PostgreSQL");
      return dbStorage;
    } catch (error) {
      console.error("❌ Replit database also failed:", (error as Error).message);
    }
  }
  
  console.log("⚠️ All database connections failed, using in-memory storage");
  return new MemStorage();
}

export const storagePromise = initializeStorage();
export let storage: IStorage;
