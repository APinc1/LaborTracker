import { 
  users, projects, budgetLineItems, locations, locationBudgets, crews, employees, tasks, employeeAssignments,
  type User, type InsertUser, type Project, type InsertProject, type BudgetLineItem, type InsertBudgetLineItem,
  type Location, type InsertLocation, type LocationBudget, type InsertLocationBudget, type Crew, type InsertCrew,
  type Employee, type InsertEmployee, type Task, type InsertTask, type EmployeeAssignment, type InsertEmployeeAssignment
} from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, gte, lte, asc } from "drizzle-orm";

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
  getTasks(locationId: number): Promise<Task[]>;
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
      locationId: northSection.id,
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
      locationId: eastWing.id,
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
      locationId: northSection.id,
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
      assignmentId: `${formTask.id}_${mike.id}`,
      taskId: formTask.id,
      employeeId: mike.id,
      assignmentDate: today,
      assignedHours: "8",
      actualHours: null
    });

    await this.createEmployeeAssignment({
      assignmentId: `${demoTask.id}_${sarah.id}`,
      taskId: demoTask.id,
      employeeId: sarah.id,
      assignmentDate: today,
      assignedHours: "10",
      actualHours: null
    });

    await this.createEmployeeAssignment({
      assignmentId: `${formTask.id}_${tom.id}`,
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
      phone: insertUser.phone ?? null
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
    
    const updated = { 
      ...existing, 
      ...userData,
      passwordResetToken: userData.passwordResetToken ?? existing.passwordResetToken ?? null,
      passwordResetExpires: userData.passwordResetExpires ?? existing.passwordResetExpires ?? null,
      isPasswordSet: userData.isPasswordSet ?? existing.isPasswordSet ?? null
    };
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
      ...insertProject, 
      id, 
      createdAt: new Date(),
      // Ensure null values are preserved for optional fields
      startDate: insertProject.startDate === null ? null : insertProject.startDate || null,
      endDate: insertProject.endDate === null ? null : insertProject.endDate,
      defaultSuperintendent: insertProject.defaultSuperintendent ?? null,
      defaultProjectManager: insertProject.defaultProjectManager ?? null
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
    // Get all locations for this project
    const projectLocations = Array.from(this.locations.values()).filter(loc => loc.projectId === id);
    
    // Delete all related data for each location
    for (const location of projectLocations) {
      // Delete employee assignments for tasks in this location  
      const locationTasks = Array.from(this.tasks.values()).filter(task => task.locationId === location.id);
      for (const task of locationTasks) {
        // Delete assignments for this task
        const taskAssignments = Array.from(this.employeeAssignments.entries()).filter(([_, assignment]) => assignment.taskId === task.id);
        taskAssignments.forEach(([id]) => this.employeeAssignments.delete(id));
      }
      
      // Delete tasks in this location
      const taskIds = Array.from(this.tasks.entries()).filter(([_, task]) => task.locationId === location.id).map(([id]) => id);
      taskIds.forEach(id => this.tasks.delete(id));
      
      // Delete budget line items for this location
      const budgetIds = Array.from(this.budgetLineItems.entries()).filter(([_, budget]) => budget.locationId === location.id).map(([id]) => id);
      budgetIds.forEach(id => this.budgetLineItems.delete(id));
      
      // Delete location budgets for this location
      const locationBudgetIds = Array.from(this.locationBudgets.entries()).filter(([_, budget]) => budget.locationId === location.id).map(([id]) => id);
      locationBudgetIds.forEach(id => this.locationBudgets.delete(id));
      
      // Delete the location itself
      this.locations.delete(location.id);
    }
    
    // Finally delete the project
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
      notes: insertBudgetLineItem.notes ?? null
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
      startDate: insertLocation.startDate ?? '',
      endDate: insertLocation.endDate ?? null,
      description: insertLocation.description ?? null,
      estimatedCost: insertLocation.estimatedCost ?? null,
      actualCost: insertLocation.actualCost ?? null,
      isComplete: insertLocation.isComplete ?? null
    };
    this.locations.set(id, location);
    return location;
  }

  async updateLocation(id: string | number, updateLocation: Partial<InsertLocation>): Promise<Location> {
    let existing: Location | undefined;
    let locationKey: number;
    
    if (typeof id === 'string') {
      // Find by locationId field
      for (const [key, loc] of this.locations.entries()) {
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
    const updated = { 
      ...existing, 
      ...updateLocation,
      startDate: updateLocation.startDate ?? existing.startDate
    };
    this.locations.set(locationKey!, updated);
    return updated;
  }

  async deleteLocation(id: string | number): Promise<void> {
    let locationToDelete: Location | undefined;
    let locationDbId: number;
    
    if (typeof id === 'string') {
      // Find by locationId field
      for (const [key, loc] of this.locations.entries()) {
        if (loc.locationId === id) {
          locationToDelete = loc;
          locationDbId = key;
          break;
        }
      }
      if (!locationToDelete) {
        throw new Error('Location not found');
      }
    } else {
      // Find by numeric id
      locationToDelete = this.locations.get(id);
      locationDbId = id;
      if (!locationToDelete) {
        throw new Error('Location not found');
      }
    }
    
    // Delete employee assignments for tasks in this location
    const locationTasks = Array.from(this.tasks.values()).filter(task => task.locationId === locationToDelete!.id);
    for (const task of locationTasks) {
      // Delete assignments for this task
      const taskAssignments = Array.from(this.employeeAssignments.entries()).filter(([_, assignment]) => assignment.taskId === task.id);
      taskAssignments.forEach(([id]) => this.employeeAssignments.delete(id));
    }
    
    // Delete tasks in this location
    const taskIds = Array.from(this.tasks.entries()).filter(([_, task]) => task.locationId === locationToDelete!.id).map(([id]) => id);
    taskIds.forEach(id => this.tasks.delete(id));
    
    // Delete budget line items for this location
    const budgetIds = Array.from(this.budgetLineItems.entries()).filter(([_, budget]) => budget.locationId === locationToDelete!.id).map(([id]) => id);
    budgetIds.forEach(id => this.budgetLineItems.delete(id));
    
    // Delete location budgets for this location
    const locationBudgetIds = Array.from(this.locationBudgets.entries()).filter(([_, budget]) => budget.locationId === locationToDelete!.id).map(([id]) => id);
    locationBudgetIds.forEach(id => this.locationBudgets.delete(id));
    
    // Finally delete the location
    this.locations.delete(locationDbId);
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
    const updated = { 
      ...existing, 
      ...updateLocationBudget,
      conversionFactor: updateLocationBudget.conversionFactor ?? existing.conversionFactor ?? null
    };
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
      apprenticeLevel: insertEmployee.apprenticeLevel ?? null,
      primaryTrade: insertEmployee.primaryTrade ?? null,
      secondaryTrade: insertEmployee.secondaryTrade ?? null,
      tertiaryTrade: insertEmployee.tertiaryTrade ?? null,
      isForeman: insertEmployee.isForeman ?? null,
      userId: insertEmployee.userId ?? null
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
  async getTasks(locationId: number): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => {
      return task.locationId === locationId;
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
    const assignment: EmployeeAssignment = { 
      ...insertEmployeeAssignment, 
      id,
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

// Global database connection - singleton pattern for deployment
let globalSql: any = null;
let globalDb: any = null;

function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  
  if (globalSql && globalDb) {
    console.log("♻️ Reusing existing database connection");
    return globalDb;
  }
  
  console.log("🔗 Initializing Supabase PostgreSQL connection...");
  
  try {
    // High-performance configuration for Supabase PgBouncer
    globalSql = postgres(process.env.DATABASE_URL, {
      // Required for PgBouncer transaction pooling:
      prepare: false,
      // Ultra-optimized connection pool for maximum speed:
      max: 5,                   // More connections for better performance
      idle_timeout: 30,         // Keep connection alive longer
      connect_timeout: 10,      // 10 second connection timeout
      statement_timeout: 30000, // 30 second query timeout
      query_timeout: 30000,     // 30 second query timeout
      ssl: { rejectUnauthorized: false }, // Better SSL config
      transform: {
        undefined: null // Convert undefined to null
      }
    });
    
    globalDb = drizzlePostgres(globalSql, {
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
    
    console.log("✅ PostgreSQL client initialized successfully");
    return globalDb;
    
  } catch (error) {
    console.error("❌ Failed to initialize PostgreSQL client:", error);
    throw error;
  }
}

// Graceful cleanup function
export function closeDatabase() {
  if (globalSql) {
    return globalSql.end({ timeout: 5 });
  }
}

class DatabaseStorage implements IStorage {
  private db: any;

  constructor() {
    this.db = initializeDatabase();
    
    // Defer sample data initialization to not block startup
    process.nextTick(() => {
      this.initializeSampleData().catch(error => {
        console.warn("⚠️ Sample data initialization failed:", error);
      });
    });
  }

  private async initializeSampleData() {
    try {
      // Check if we already have users in the database
      const existingUsers = await this.db.select().from(users);
      if (existingUsers.length > 0) {
        console.log("Database already has data, skipping sample data initialization");
        return;
      }

      console.log("Initializing database with sample data...");

      // Create sample users
      const adminResult = await this.db.insert(users).values({
        username: "admin",
        password: "AccessPacific2835",
        name: "John Smith",
        email: "admin@buildtracker.com",
        phone: "(555) 123-4567",
        role: "Superintendent",
        isPasswordSet: true
      }).returning();
      const admin = adminResult[0];

      const projectManagerResult = await this.db.insert(users).values({
        username: "pmgr",
        password: "password",
        name: "Maria Rodriguez",
        email: "maria@buildtracker.com",
        phone: "(555) 234-5678",
        role: "Project Manager"
      }).returning();
      const projectManager = projectManagerResult[0];

      const superintendentResult = await this.db.insert(users).values({
        username: "super",
        password: "password",
        name: "David Johnson",
        email: "david@buildtracker.com",
        phone: "(555) 345-6789",
        role: "Superintendent"
      }).returning();
      const superintendent = superintendentResult[0];

      const foremanResult = await this.db.insert(users).values({
        username: "foreman",
        password: "password",
        name: "Carlos Martinez",
        email: "carlos@buildtracker.com",
        phone: "(555) 456-7890",
        role: "Foreman"
      }).returning();
      const foreman = foremanResult[0];

      // Create sample crews
      const concreteCrewResult = await this.db.insert(crews).values({ name: "Concrete Crew A" }).returning();
      const concreteCrew = concreteCrewResult[0];

      const demoCrewResult = await this.db.insert(crews).values({ name: "Demo Crew B" }).returning();
      const demoCrew = demoCrewResult[0];

      const transportCrewResult = await this.db.insert(crews).values({ name: "Transport Crew" }).returning();
      const transportCrew = transportCrewResult[0];

      // Create sample employees
      const mikeResult = await this.db.insert(employees).values({
        teamMemberId: "EMP-001",
        name: "Mike Johnson",
        email: "mike@buildtracker.com",
        phone: "(555) 234-5678",
        crewId: concreteCrew.id,
        employeeType: "Core",
        isForeman: true,
        isUnion: true,
        primaryTrade: "Formsetter",
        secondaryTrade: "Laborer"
      }).returning();
      const mike = mikeResult[0];

      const sarahResult = await this.db.insert(employees).values({
        teamMemberId: "EMP-002",
        name: "Sarah Martinez",
        email: "sarah@buildtracker.com",
        phone: "(555) 345-6789",
        crewId: demoCrew.id,
        employeeType: "Core",
        isForeman: true,
        isUnion: false,
        primaryTrade: "Demo",
        secondaryTrade: "Excavation"
      }).returning();
      const sarah = sarahResult[0];

      const tomResult = await this.db.insert(employees).values({
        teamMemberId: "EMP-003",
        name: "Tom Wilson",
        email: "tom@buildtracker.com",
        phone: "(555) 456-7890",
        crewId: transportCrew.id,
        employeeType: "Freelancer",
        isForeman: false,
        isUnion: false,
        primaryTrade: "Driver"
      }).returning();
      const tom = tomResult[0];

      // Create sample projects
      const mainStreetResult = await this.db.insert(projects).values({
        projectId: "PRJ-2024-001",
        name: "Main St Bridge",
        startDate: "2024-03-01",
        endDate: "2024-03-25",
        defaultSuperintendent: admin.id,
        defaultProjectManager: projectManager.id
      }).returning();
      const mainStreetProject = mainStreetResult[0];

      const cityHallResult = await this.db.insert(projects).values({
        projectId: "PRJ-2024-002",
        name: "City Hall Renovation",
        startDate: "2024-03-10",
        endDate: "2024-04-05",
        defaultSuperintendent: admin.id,
        defaultProjectManager: projectManager.id
      }).returning();
      const cityHallProject = cityHallResult[0];

      // Create sample locations
      const northSectionResult = await this.db.insert(locations).values({
        locationId: "PRJ-2024-001_NorthSection",
        projectId: mainStreetProject.id,
        name: "Main St Bridge - North Section",
        startDate: "2024-03-01",
        endDate: "2024-03-25",
        isComplete: false
      }).returning();
      const northSection = northSectionResult[0];

      const eastWingResult = await this.db.insert(locations).values({
        locationId: "PRJ-2024-002_EastWing",
        projectId: cityHallProject.id,
        name: "City Hall - East Wing",
        startDate: "2024-03-10",
        endDate: "2024-04-05",
        isComplete: false
      }).returning();
      const eastWing = eastWingResult[0];

      // Create sample budget line items
      await this.db.insert(budgetLineItems).values([
        {
          locationId: northSection.id,
          lineItemNumber: "100",
          lineItemName: "Concrete Forms",
          unconvertedUnitOfMeasure: "LF",
          unconvertedQty: "1200.00",
          unitCost: "15.50",
          unitTotal: "18600.00",
          costCode: "CONCRETE",
          hours: "40.00",
          budgetTotal: "18600.00"
        },
        {
          locationId: northSection.id,
          lineItemNumber: "200",
          lineItemName: "Demo and Base Grading",
          unconvertedUnitOfMeasure: "CY",
          unconvertedQty: "500.00",
          unitCost: "12.75",
          unitTotal: "6375.00",
          costCode: "Demo/Ex + Base/Grading",
          hours: "25.00",
          budgetTotal: "6375.00"
        }
      ]);

      // Create sample tasks for today's date (2025-08-11)
      const task1Result = await this.db.insert(tasks).values({
        taskId: "PRJ-2024-001_NorthSection_Form_Day1",
        locationId: "PRJ-2024-001_NorthSection",
        taskType: "Form",
        name: "Form Day 1 of 3",
        taskDate: "2025-08-11",
        startDate: "2025-08-11",
        finishDate: "2025-08-11",
        costCode: "CONCRETE",
        superintendentId: admin.id,
        foremanId: mike.id,
        scheduledHours: "40",
        startTime: "08:00",
        finishTime: "17:00",
        workDescription: "Set up concrete forms for bridge deck section. Ensure proper alignment and elevation.",
        notes: "Weather conditions good, expect normal progress",
        order: 0,
        dependentOnPrevious: true,
        status: "upcoming"
      }).returning();
      const task1 = task1Result[0];

      const task2Result = await this.db.insert(tasks).values({
        taskId: "PRJ-2024-002_EastWing_Demo_Day1",
        locationId: "PRJ-2024-002_EastWing",
        taskType: "Demo/Ex",
        name: "Demo/Ex Base Grade",
        taskDate: "2025-08-11",
        startDate: "2025-08-11",
        finishDate: "2025-08-11",
        costCode: "DEMO/EX",
        superintendentId: admin.id,
        foremanId: sarah.id,
        scheduledHours: "24",
        startTime: "09:30",
        finishTime: "16:00",
        workDescription: "Demolish existing concrete and prepare base grade for new foundation.",
        notes: "Coordinate with utilities for underground clearance",
        status: "in_progress",
        order: 0,
        dependentOnPrevious: false
      }).returning();
      const task2 = task2Result[0];

      const task3Result = await this.db.insert(tasks).values({
        taskId: "PRJ-2024-001_NorthSection_Form_Day2",
        locationId: "PRJ-2024-001_NorthSection",
        taskType: "Form",
        name: "Form Day 2 of 3",
        taskDate: "2025-08-12",
        startDate: "2025-08-12",
        finishDate: "2025-08-12",
        costCode: "CONCRETE",
        superintendentId: admin.id,
        foremanId: mike.id,
        scheduledHours: "32",
        startTime: "08:00",
        finishTime: "16:00",
        workDescription: "Continue concrete form installation and alignment checks.",
        notes: "Focus on tight corners and joints",
        order: 1,
        dependentOnPrevious: true,
        status: "upcoming"
      }).returning();
      const task3 = task3Result[0];

      // Create sample employee assignments
      await this.db.insert(employeeAssignments).values([
        {
          assignmentId: "1_1",
          taskId: task1.id,
          employeeId: mike.id,
          assignmentDate: "2025-08-11",
          assignedHours: "8",
          crew: "Concrete Crew A"
        },
        {
          assignmentId: "2_1",
          taskId: task2.id,
          employeeId: sarah.id,
          assignmentDate: "2025-08-11",
          assignedHours: "10",
          crew: "Demo Crew B"
        },
        {
          assignmentId: "1_2",
          taskId: task1.id,
          employeeId: tom.id,
          assignmentDate: "2025-08-11",
          assignedHours: "6",
          crew: "Transport Crew"
        }
      ]);

      console.log("Sample data initialized successfully!");
    } catch (error) {
      console.error("Error initializing sample data:", error);
      // Don't throw here - let the app continue even if sample data fails
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
    // First, unlink any employees that reference this user
    await this.db.update(employees)
      .set({ userId: null })
      .where(eq(employees.userId, id));
    
    // Unlink any projects that reference this user as superintendent
    await this.db.update(projects)
      .set({ defaultSuperintendent: null })
      .where(eq(projects.defaultSuperintendent, id));
    
    // Unlink any projects that reference this user as project manager
    await this.db.update(projects)
      .set({ defaultProjectManager: null })
      .where(eq(projects.defaultProjectManager, id));
    
    // Unlink any tasks that reference this user as superintendent
    await this.db.update(tasks)
      .set({ superintendentId: null })
      .where(eq(tasks.superintendentId, id));
    
    // Now delete the user
    const result = await this.db.delete(users).where(eq(users.id, id));
    return true;
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
    console.log(`🗑️ CASCADE DELETE: Starting deletion of project ${id}`);
    
    // Get all locations for this project
    const projectLocations = await this.db.select().from(locations).where(eq(locations.projectId, id));
    console.log(`🗑️ CASCADE DELETE: Found ${projectLocations.length} locations to delete`);
    
    // Delete all related data for each location
    for (const location of projectLocations) {
      console.log(`🗑️ CASCADE DELETE: Processing location ${location.locationId} (DB ID: ${location.id})`);
      
      // Delete employee assignments for tasks in this location
      const locationTasks = await this.db.select().from(tasks).where(eq(tasks.locationId, location.locationId));
      console.log(`🗑️ CASCADE DELETE: Found ${locationTasks.length} tasks in location ${location.locationId}`);
      
      for (const task of locationTasks) {
        const deletedAssignments = await this.db.delete(employeeAssignments).where(eq(employeeAssignments.taskId, task.id));
        console.log(`🗑️ CASCADE DELETE: Deleted assignments for task ${task.id}`);
      }
      
      // Delete tasks in this location
      const deletedTasks = await this.db.delete(tasks).where(eq(tasks.locationId, location.locationId));
      console.log(`🗑️ CASCADE DELETE: Deleted tasks for location ${location.locationId}`);
      
      // Delete budget line items for this location
      const deletedBudgets = await this.db.delete(budgetLineItems).where(eq(budgetLineItems.locationId, location.id));
      console.log(`🗑️ CASCADE DELETE: Deleted budget items for location ${location.id}`);
      
      // Delete location budgets for this location
      const deletedLocationBudgets = await this.db.delete(locationBudgets).where(eq(locationBudgets.locationId, location.id));
      console.log(`🗑️ CASCADE DELETE: Deleted location budgets for location ${location.id}`);
    }
    
    // Delete all locations for this project
    const deletedLocations = await this.db.delete(locations).where(eq(locations.projectId, id));
    console.log(`🗑️ CASCADE DELETE: Deleted locations for project ${id}`);
    
    // Finally delete the project
    const deletedProject = await this.db.delete(projects).where(eq(projects.id, id));
    console.log(`🗑️ CASCADE DELETE: Deleted project ${id}`);
  }

  // Budget methods
  async getBudgetLineItems(locationId: number): Promise<BudgetLineItem[]> {
    return await this.db.select().from(budgetLineItems).where(eq(budgetLineItems.locationId, locationId)).orderBy(asc(budgetLineItems.lineItemNumber));
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
    let locationDbId: number;
    
    if (typeof id === 'string') {
      // Find by locationId field first
      const locationResult = await this.db.select().from(locations).where(eq(locations.locationId, id));
      if (locationResult.length === 0) {
        throw new Error('Location not found');
      }
      locationDbId = locationResult[0].id;
    } else {
      locationDbId = id;
    }
    
    const result = await this.db.update(locations).set(updateLocation).where(eq(locations.id, locationDbId)).returning();
    return result[0];
  }

  async deleteLocation(id: string | number): Promise<void> {
    let locationToDelete: Location | undefined;
    let locationDbId: number;
    
    if (typeof id === 'string') {
      // Find by locationId field first
      const locationResult = await this.db.select().from(locations).where(eq(locations.locationId, id));
      if (locationResult.length === 0) {
        throw new Error('Location not found');
      }
      locationToDelete = locationResult[0];
      locationDbId = locationToDelete.id;
    } else {
      // Find by numeric database id
      const locationResult = await this.db.select().from(locations).where(eq(locations.id, id));
      if (locationResult.length === 0) {
        throw new Error('Location not found');
      }
      locationToDelete = locationResult[0];
      locationDbId = id;
    }
    
    // Delete employee assignments for tasks in this location
    const locationTasks = await this.db.select().from(tasks).where(eq(tasks.locationId, locationDbId));
    for (const task of locationTasks) {
      await this.db.delete(employeeAssignments).where(eq(employeeAssignments.taskId, task.id));
    }
    
    // Delete tasks in this location
    await this.db.delete(tasks).where(eq(tasks.locationId, locationDbId));
    
    // Delete budget line items for this location
    await this.db.delete(budgetLineItems).where(eq(budgetLineItems.locationId, locationDbId));
    
    // Delete location budgets for this location
    await this.db.delete(locationBudgets).where(eq(locationBudgets.locationId, locationDbId));
    
    // Finally delete the location
    await this.db.delete(locations).where(eq(locations.id, locationDbId));
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
    // Check if any employees are assigned to this crew
    const employeesInCrew = await this.db.select().from(employees).where(eq(employees.crewId, id));
    
    if (employeesInCrew.length > 0) {
      throw new Error(`Cannot delete crew. ${employeesInCrew.length} employee(s) are still assigned to this crew. Please reassign or remove them first.`);
    }
    
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
    // First, delete any employee assignments that reference this employee
    await this.db.delete(employeeAssignments).where(eq(employeeAssignments.employeeId, id));
    
    // Unlink any tasks that reference this employee as foreman
    await this.db.update(tasks)
      .set({ foremanId: null })
      .where(eq(tasks.foremanId, id));
    
    // Now delete the employee
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
  async getTasks(locationId: number): Promise<Task[]> {
    return await this.db.select().from(tasks).where(eq(tasks.locationId, locationId));
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

// Initialize storage with fallback to in-memory if database fails
async function initializeStorage(): Promise<IStorage> {
  if (!process.env.DATABASE_URL) {
    console.log("No DATABASE_URL found, using in-memory storage");
    return new MemStorage();
  }
  
  try {
    console.log("Attempting to connect to Supabase PostgreSQL database...");
    const dbStorage = new DatabaseStorage();
    
    // Test the connection with a fast query
    console.log("Testing database connection...");
    await dbStorage.db.execute('SELECT 1');
    console.log(`✓ Successfully connected to PostgreSQL database!`);
    return dbStorage;
    
  } catch (error: any) {
    console.error("✗ Failed to connect to Supabase database:", error?.message || error);
    console.log("📦 Falling back to in-memory storage with sample data");
    console.log("🔧 To troubleshoot:");
    console.log("   1. Verify DATABASE_URL is correct");
    console.log("   2. Check network connectivity to Supabase");
    console.log("   3. Ensure Supabase project is active");
    return new MemStorage();
  }
}

// Storage initialization
let storageInstance: IStorage | null = null;

export async function getStorageInstance(): Promise<IStorage> {
  if (!storageInstance) {
    storageInstance = await initializeStorage();
  }
  return storageInstance;
}

// Initialize storage and replace the export
initializeStorage().then(storage => {
  storageInstance = storage;
  console.log("🔄 Storage instance updated to:", storage.constructor.name);
}).catch(err => {
  console.error("Storage initialization error:", err);
  storageInstance = new MemStorage();
});

// Export function to get the current storage instance
export const getStorage = async (): Promise<IStorage> => {
  if (!storageInstance) {
    storageInstance = await initializeStorage();
  }
  return storageInstance;
};

// Temporary storage instance for immediate use (will be replaced by async initialization)
export const storage = new MemStorage();
