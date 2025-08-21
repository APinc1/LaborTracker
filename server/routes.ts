import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { getStorage } from "./storage";
import { 
  insertProjectSchema, insertBudgetLineItemSchema, insertLocationSchema, insertCrewSchema, 
  insertEmployeeSchema, insertTaskSchema, insertEmployeeAssignmentSchema 
} from "@shared/schema";
import { handleLinkedTaskDeletion } from "@shared/taskUtils";
import { timing, validateLimit } from "./middleware/timing";
import { nextWeekday } from "./lib/dates";

// Aggressive timeout for better performance
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Fast timeout for database operations - reasonable timeout for complex queries
function withFastTimeout<T>(promise: Promise<T>): Promise<T> {
  return withTimeout(promise, 20000); // 20 seconds - allow time for complex queries with larger pool
}

// Quick timeout for simple queries
function withQuickTimeout<T>(promise: Promise<T>): Promise<T> {
  return withTimeout(promise, 15000); // 15 second timeout for simple operations
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // User routes
  app.get('/api/users', async (req, res) => {
    try {
      const storage = await getStorage();
      const users = await withFastTimeout(storage.getUsers());
      res.json(users);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const storage = await getStorage();
      const userData = {
        ...req.body,
        password: 'AccessPacific2835', // Default password
        isPasswordSet: false // Force password change on first login
      };
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      // Handle specific database constraint errors
      if (error.code === '23505') { // Unique constraint violation
        if (error.constraint_name === 'users_email_unique') {
          return res.status(400).json({ error: 'A user with this email already exists' });
        }
        if (error.constraint_name === 'users_username_unique') {
          return res.status(400).json({ error: 'A user with this username already exists' });
        }
      }
      
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const userId = parseInt(req.params.id);
      const userData = req.body;
      const user = await storage.updateUser(userId, userData);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error: any) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const userId = parseInt(req.params.id);
      const success = await storage.deleteUser(userId);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      
      // Handle specific database constraint errors
      if (error.code === '23503') { // Foreign key constraint violation
        return res.status(400).json({ error: 'Cannot delete user: user is linked to an employee record' });
      }
      
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Project routes
  app.get('/api/projects', async (req, res) => {
    try {
      const storage = await getStorage();
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const project = await storage.getProject(parseInt(req.params.id));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Resolve superintendent and project manager names
      let superintendentName = null;
      let projectManagerName = null;
      
      if (project.defaultSuperintendent) {
        const superintendent = await storage.getUser(project.defaultSuperintendent);
        superintendentName = superintendent?.name || null;
      }
      
      if (project.defaultProjectManager) {
        const projectManager = await storage.getUser(project.defaultProjectManager);
        projectManagerName = projectManager?.name || null;
      }
      
      res.json({
        ...project,
        defaultSuperintendent: superintendentName,
        defaultProjectManager: projectManagerName
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const storage = await getStorage();
      console.log('Creating project:', req.body.projectId, req.body.name);
      
      // Validate required fields first
      if (!req.body.projectId || !req.body.name) {
        return res.status(400).json({ error: 'Project ID and name are required' });
      }
      
      // Prepare project data with defaults (skip duplicate check for speed - database will handle it)
      const projectData = {
        projectId: req.body.projectId,
        name: req.body.name,
        startDate: req.body.startDate && req.body.startDate.trim() !== '' ? req.body.startDate : null,
        endDate: req.body.endDate && req.body.endDate.trim() !== '' ? req.body.endDate : null,
        defaultSuperintendent: req.body.defaultSuperintendent || null,
        defaultProjectManager: req.body.defaultProjectManager || null
      };
      
      const project = await withTimeout(storage.createProject(projectData), 10000);
      console.log('Project created successfully:', project.id);
      res.status(201).json(project);
    } catch (error: any) {
      console.error('Error creating project:', error);
      
      // Handle database constraint errors for duplicates
      if (error.code === '23505' || error.message?.includes('duplicate key')) {
        return res.status(400).json({ error: `Project ID "${req.body.projectId}" already exists` });
      }
      
      if (error.message?.includes('timeout')) {
        return res.status(408).json({ error: 'Request timeout - please try again' });
      }
      
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid project data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create project' });
      }
    }
  });

  app.put('/api/projects/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      console.log('Project update request body:', req.body);
      const validated = insertProjectSchema.partial().parse(req.body);
      console.log('Validated project data:', validated);
      const project = await storage.updateProject(parseInt(req.params.id), validated);
      res.json(project);
    } catch (error) {
      console.error('Project update error:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: 'Invalid project data' });
      }
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      await storage.deleteProject(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Budget line item routes
  app.get('/api/locations/:locationId/budget', async (req, res) => {
    try {
      const storage = await getStorage();
      let locationDbId: number;
      
      // Handle both locationId string (e.g., "101_test") and pure database ID (e.g., "3")
      const locationParam = req.params.locationId;
      console.log(`🔍 Budget GET: locationParam = "${locationParam}"`);
      
      // Check if it's a pure numeric string (database ID) vs locationId format (contains non-numeric characters)
      if (/^\d+$/.test(locationParam)) {
        // It's a pure numeric database ID
        locationDbId = parseInt(locationParam);
        console.log(`📊 Budget GET: Using database ID ${locationDbId}`);
      } else {
        // It's a locationId string - find the location by locationId
        console.log(`🔍 Budget GET: Looking up location by locationId string: ${locationParam}`);
        const location = await storage.getLocation(locationParam);
        if (!location) {
          console.log(`❌ Budget GET: Location not found for locationId: ${locationParam}`);
          return res.status(404).json({ error: 'Location not found' });
        }
        locationDbId = location.id;
        console.log(`✅ Budget GET: Found location "${location.name}", using database ID ${locationDbId}`);
      }
      
      console.log(`🔎 Budget GET: Calling getBudgetLineItems(${locationDbId})`);
      const budgetItems = await storage.getBudgetLineItems(locationDbId);
      console.log(`📊 Budget GET: Found ${budgetItems.length} budget items`);
      res.json(budgetItems);
    } catch (error) {
      console.error('Budget fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch budget items' });
    }
  });

  app.post('/api/locations/:locationId/budget', async (req, res) => {
    try {
      const storage = await getStorage();
      let locationDbId: number;
      
      // Handle both locationId string (e.g., "101_test") and pure database ID (e.g., "3")
      const locationParam = req.params.locationId;
      // Check if it's a pure numeric string (database ID) vs locationId format (contains non-numeric characters)
      if (/^\d+$/.test(locationParam)) {
        // It's a pure numeric database ID
        locationDbId = parseInt(locationParam);
      } else {
        // It's a locationId string - find the location by locationId
        const location = await storage.getLocation(locationParam);
        if (!location) {
          return res.status(404).json({ error: 'Location not found' });
        }
        locationDbId = location.id;
      }
      
      // Clean up the data before validation - convert empty strings to null/defaults for numeric fields
      const cleanedData = {
        ...req.body,
        locationId: locationDbId,
        // Convert empty strings to defaults for required fields
        unitCost: req.body.unitCost === "" ? "0" : req.body.unitCost,
        unconvertedQty: req.body.unconvertedQty === "" ? "0" : req.body.unconvertedQty,
        unitTotal: req.body.unitTotal === "" ? "0" : req.body.unitTotal,
        budgetTotal: req.body.budgetTotal === "" ? "0" : req.body.budgetTotal,
        // Convert empty strings to null for optional numeric fields
        actualQty: req.body.actualQty === "" ? null : req.body.actualQty,
        convertedQty: req.body.convertedQty === "" ? null : req.body.convertedQty,
        conversionFactor: req.body.conversionFactor === "" ? "1" : req.body.conversionFactor,
        productionRate: req.body.productionRate === "" ? null : req.body.productionRate,
        hours: req.body.hours === "" ? null : req.body.hours,
        billing: req.body.billing === "" ? null : req.body.billing,
        laborCost: req.body.laborCost === "" ? null : req.body.laborCost,
        equipmentCost: req.body.equipmentCost === "" ? null : req.body.equipmentCost,
        truckingCost: req.body.truckingCost === "" ? null : req.body.truckingCost,
        dumpFeesCost: req.body.dumpFeesCost === "" ? null : req.body.dumpFeesCost,
        materialCost: req.body.materialCost === "" ? null : req.body.materialCost,
        subcontractorCost: req.body.subcontractorCost === "" ? null : req.body.subcontractorCost,
        convertedUnitOfMeasure: req.body.convertedUnitOfMeasure === "" ? null : req.body.convertedUnitOfMeasure,
        notes: req.body.notes === "" ? null : req.body.notes,
      };
      
      console.log('Budget create - cleaned data:', JSON.stringify(cleanedData, null, 2));
      
      const validated = insertBudgetLineItemSchema.parse(cleanedData);
      const budgetItem = await storage.createBudgetLineItem(validated);
      res.status(201).json(budgetItem);
    } catch (error) {
      console.error('Budget create error:', error);
      res.status(400).json({ error: 'Invalid budget item data' });
    }
  });

  app.put('/api/budget/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      console.log('Budget update request:', req.params.id, req.body);
      const validated = insertBudgetLineItemSchema.partial().parse(req.body);
      const budgetItem = await storage.updateBudgetLineItem(parseInt(req.params.id), validated);
      res.json(budgetItem);
    } catch (error) {
      console.error('Budget update error:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: 'Invalid budget item data' });
      }
    }
  });

  app.delete('/api/budget/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      await storage.deleteBudgetLineItem(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete budget item' });
    }
  });

  // Location routes
  app.get('/api/projects/:projectId/locations', async (req, res) => {
    try {
      const storage = await getStorage();
      const locations = await storage.getLocations(parseInt(req.params.projectId));
      res.json(locations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  // Add general locations route
  app.get('/api/locations', async (req, res) => {
    try {
      const storage = await getStorage();
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error: any) {
      console.error('Error fetching all locations:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  // Bulk dashboard endpoint - fetch budgets and tasks for multiple locations in one request
  app.get('/api/dashboard', async (req, res) => {
    try {
      const raw = (req.query.locationIds as string | undefined) ?? "";
      const locationIds = raw
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (locationIds.length === 0) {
        return res.status(400).json({ error: "locationIds parameter required" });
      }

      const storage = await getStorage();
      
      // Fetch all locations to get their database IDs
      const allLocations = await storage.getAllLocations();
      const locationMap = new Map(allLocations.map(loc => [loc.locationId, loc.id]));
      
      // Convert locationId strings to database IDs
      const dbIds = locationIds
        .map(locId => locationMap.get(locId))
        .filter(id => id !== undefined) as number[];

      if (dbIds.length === 0) {
        return res.json({ budgets: {}, tasks: {} });
      }

      // Fetch budgets and tasks in parallel for all locations
      const [allBudgets, allTasks] = await Promise.all([
        Promise.all(dbIds.map(async (dbId) => {
          try {
            const budgets = await storage.getBudgetLineItems(dbId);
            return { dbId, budgets };
          } catch (error) {
            console.error(`Error fetching budgets for location ${dbId}:`, error);
            return { dbId, budgets: [] };
          }
        })),
        Promise.all(dbIds.map(async (dbId) => {
          try {
            const tasks = await storage.getTasks(dbId);
            return { dbId, tasks };
          } catch (error) {
            console.error(`Error fetching tasks for location ${dbId}:`, error);
            return { dbId, tasks: [] };
          }
        }))
      ]);

      // Shape response keyed by original locationId for easy frontend consumption
      const budgetsByLocationId: Record<string, any[]> = {};
      const tasksByLocationId: Record<string, any[]> = {};

      // Map back from database IDs to locationIds
      const dbIdToLocationId = new Map(allLocations.map(loc => [loc.id, loc.locationId]));

      allBudgets.forEach(({ dbId, budgets }) => {
        const locationId = dbIdToLocationId.get(dbId);
        if (locationId) {
          budgetsByLocationId[locationId] = budgets;
        }
      });

      allTasks.forEach(({ dbId, tasks }) => {
        const locationId = dbIdToLocationId.get(dbId);
        if (locationId) {
          tasksByLocationId[locationId] = tasks;
        }
      });

      res.json({
        budgets: budgetsByLocationId,
        tasks: tasksByLocationId
      });

    } catch (error: any) {
      console.error('Error in bulk dashboard endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // Bootstrap endpoint - consolidates all basic data queries into one request
  app.get('/api/dashboard/bootstrap', async (req, res) => {
    try {
      const storage = await getStorage();
      const dayFrom = (req.query.from as string) || new Date().toISOString().slice(0, 10);
      const dayTo = (req.query.to as string) || dayFrom;
      
      console.log(`📊 Dashboard bootstrap request: ${dayFrom} to ${dayTo}`);
      
      // Fire all queries in parallel to eliminate sequential loading bottleneck
      const [employees, assignments, locations, projects, tasksRange] = await Promise.all([
        withFastTimeout(storage.getEmployees()),
        withFastTimeout(storage.getAllEmployeeAssignments()), 
        withFastTimeout(storage.getAllLocations()),
        withFastTimeout(storage.getProjects()),
        withFastTimeout(storage.getTasksByDateRange(dayFrom, dayTo))
      ]);
      
      // Add cache headers for better performance
      res.set({
        'Cache-Control': 'public, max-age=30, must-revalidate',
        'ETag': `bootstrap-${dayFrom}-${dayTo}-${Date.now()}`
      });
      
      const result = {
        employees,
        assignments,
        locations,
        projects,
        tasksRange
      };
      
      console.log(`✅ Dashboard bootstrap response: ${employees.length} employees, ${assignments.length} assignments, ${locations.length} locations, ${projects.length} projects, ${tasksRange.length} tasks`);
      
      res.json(result);
    } catch (error: any) {
      console.error('Dashboard bootstrap error:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Bootstrap request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch bootstrap data' });
      }
    }
  });

  app.get('/api/locations/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      console.log(`🔍 Location GET: locationParam = "${req.params.id}"`);
      
      // Convert to number if it's a numeric string
      const locationId = /^\d+$/.test(req.params.id) ? parseInt(req.params.id) : req.params.id;
      console.log(`📊 Location GET: Using ID ${locationId} (type: ${typeof locationId})`);
      
      const location = await storage.getLocation(locationId);
      console.log(`🔎 Location GET: Found location:`, location ? 'YES' : 'NO');
      
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      res.json(location);
    } catch (error) {
      console.error('Location GET error:', error);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  });

  app.post('/api/projects/:projectId/locations', async (req, res) => {
    try {
      const storage = await getStorage();
      const projectDbId = parseInt(req.params.projectId);
      
      // Get the project to access its actual projectId string
      const project = await storage.getProject(projectDbId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check for duplicate location name within the project
      const existingLocations = await storage.getLocations(projectDbId);
      const duplicateLocation = existingLocations.find(loc => 
        loc.name.toLowerCase() === req.body.name?.toLowerCase()
      );
      if (duplicateLocation) {
        return res.status(400).json({ error: `Location name "${req.body.name}" already exists in this project` });
      }
      
      // Generate a unique locationId using the project's actual projectId (not database ID)
      const locationId = `${project.projectId}_${req.body.name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}`;
      
      // Prepare location data with required fields
      const locationData = {
        ...req.body,
        projectId: projectDbId,
        locationId: locationId,
        // Allow empty dates - user will specify dates manually when needed
        startDate: req.body.startDate
      };
      
      const validated = insertLocationSchema.parse(locationData);
      
      const location = await storage.createLocation(validated);
      res.status(201).json(location);
    } catch (error: any) {
      console.error('Error creating location:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid location data', details: error.errors });
      } else {
        res.status(500).json({ error: error.message || 'Failed to create location' });
      }
    }
  });

  app.put('/api/locations/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const validated = insertLocationSchema.partial().parse(req.body);
      const location = await storage.updateLocation(req.params.id, validated);
      res.json(location);
    } catch (error) {
      console.error('Location update error:', error);
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.delete('/api/locations/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      await storage.deleteLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Location deletion error:', error);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Location tasks route  


  // Crew routes
  app.get('/api/crews', async (req, res) => {
    try {
      const storage = await getStorage();
      const crews = await withQuickTimeout(storage.getCrews());
      res.json(crews);
    } catch (error: any) {
      console.error('Error fetching crews:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch crews' });
      }
    }
  });

  app.post('/api/crews', async (req, res) => {
    try {
      const storage = await getStorage();
      const validated = insertCrewSchema.parse(req.body);
      const crew = await storage.createCrew(validated);
      res.status(201).json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.put('/api/crews/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const validated = insertCrewSchema.partial().parse(req.body);
      const crew = await storage.updateCrew(parseInt(req.params.id), validated);
      res.json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.delete('/api/crews/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      await storage.deleteCrew(parseInt(req.params.id));
      res.status(204).send();
    } catch (error: any) {
      console.error('Crew deletion error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete crew' });
    }
  });

  // Employee routes
  app.get('/api/employees', async (req, res) => {
    try {
      const storage = await getStorage();
      const employees = await withQuickTimeout(storage.getEmployees());
      res.json(employees);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch employees' });
      }
    }
  });

  app.get('/api/employees/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const employee = await storage.getEmployee(parseInt(req.params.id));
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch employee' });
    }
  });

  app.post('/api/employees', async (req, res) => {
    try {
      console.log('Creating employee with data:', req.body);
      const storage = await getStorage();
      const validated = insertEmployeeSchema.parse(req.body);
      console.log('Validated employee data:', validated);
      const employee = await storage.createEmployee(validated);
      res.status(201).json(employee);
    } catch (error: any) {
      console.error('Employee creation error:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid employee data', details: error.errors });
      } else {
        res.status(400).json({ error: error.message || 'Invalid employee data' });
      }
    }
  });

  app.put('/api/employees/:id', async (req, res) => {
    try {
      console.log('Updating employee with data:', req.body);
      const storage = await getStorage();
      const validated = insertEmployeeSchema.partial().parse(req.body);
      console.log('Validated employee update data:', validated);
      const employee = await storage.updateEmployee(parseInt(req.params.id), validated);
      res.json(employee);
    } catch (error: any) {
      console.error('Employee update error:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid employee data', details: error.errors });
      } else {
        res.status(400).json({ error: error.message || 'Invalid employee data' });
      }
    }
  });

  app.delete('/api/employees/:id', async (req, res) => {
    try {
      console.log('Deleting employee with ID:', req.params.id);
      const storage = await getStorage();
      await storage.deleteEmployee(parseInt(req.params.id));
      console.log('Employee deleted successfully');
      res.status(204).send();
    } catch (error: any) {
      console.error('Employee deletion error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete employee' });
    }
  });

  app.post('/api/employees/:id/create-user', async (req, res) => {
    try {
      const storage = await getStorage();
      const { username, role } = req.body;
      
      if (!username || !role) {
        return res.status(400).json({ error: 'Username and role are required' });
      }

      const result = await storage.createUserFromEmployee(
        parseInt(req.params.id),
        username,
        role
      );
      
      res.status(201).json({
        ...result,
        message: 'User created successfully. Default password: AccessPacific2835. User will be prompted to change password on first login.'
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create user from employee' });
      }
    }
  });

  // Task routes - OPTIMIZED with fast timeouts
  app.get('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const storage = await getStorage();
      const locationParam = req.params.locationId;
      
      // Convert location identifier to database ID with timeout
      let locationDbId: number;
      if (/^\d+$/.test(locationParam)) {
        // It's a pure number - use as database ID
        locationDbId = parseInt(locationParam);
      } else {
        // It's a locationId string - find the location by locationId with fast timeout
        const location = await withFastTimeout(storage.getLocation(locationParam));
        if (!location) {
          return res.status(404).json({ error: 'Location not found' });
        }
        locationDbId = location.id;
      }
      
      // Get pagination params
      const limit = parseInt(req.query.limit as string) || 50;
      const after = req.query.after as string;
      
      // Get tasks with optimized pagination and timeout
      const tasks = await withFastTimeout(storage.getTasks(locationDbId));
      res.json(tasks);
    } catch (error: any) {
      console.error('Error fetching location tasks:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Tasks loading timeout - please refresh' });
      } else {
        res.status(500).json({ error: 'Failed to fetch tasks' });
      }
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const task = await withFastTimeout(storage.getTask(parseInt(req.params.id)));
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error: any) {
      console.error('Error fetching task:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch task' });
      }
    }
  });

  app.get('/api/tasks/date-range/:startDate?/:endDate?', async (req, res) => {
    try {
      const { startDate, endDate } = req.params;
      
      // Bulletproof date validation
      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
      const toISO = (s: any) => (typeof s === "string" && ISO_DATE.test(s) ? s : null);
      const toIntOrUndef = (v: any) => {
        const n = Number(v);
        return Number.isInteger(n) ? n : undefined;
      };
      const toIntArray = (s?: string) =>
        !s?.trim() 
          ? []
          : s.split(",").map(x => Number(x.trim())).filter(Number.isInteger);

      const from = toISO(startDate);
      const to = toISO(endDate);
      
      if (!from || !to) {
        console.log('Invalid date parameters received:', { startDate, endDate });
        return res.status(400).json({ error: "Invalid from/to dates (YYYY-MM-DD required)" });
      }
      
      // Additional date validation - ensure from <= to
      if (from > to) {
        return res.status(400).json({ error: "Start date must be before or equal to end date" });
      }

      // Optional filters - only pass locationIds if there are actual IDs to filter by
      const locationIdsArray = toIntArray(req.query.locationIds as string | undefined);
      const locationIds = locationIdsArray.length > 0 ? locationIdsArray : undefined;
      const limit = toIntOrUndef(req.query.limit) ?? 1000;
      const offset = toIntOrUndef(req.query.offset) ?? 0;

      const storage = await getStorage();
      const tasks = await withQuickTimeout(storage.getTasksByDateRange(from, to, locationIds, limit, offset));
      
      // Optimize enrichment: batch load locations and projects to avoid N+1 queries
      const uniqueLocationIds = [...new Set(tasks.map(task => task.locationId))];
      const locationsPromises = uniqueLocationIds.map(id => storage.getLocation(id));
      const locationsResults = await Promise.allSettled(locationsPromises);
      
      const locationMap = new Map();
      locationsResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          locationMap.set(uniqueLocationIds[index], result.value);
        }
      });
      
      // Get unique project IDs from locations
      const uniqueProjectIds = [...new Set(
        Array.from(locationMap.values())
          .map(loc => loc.projectId)
          .filter(Boolean)
      )];
      
      const projectsPromises = uniqueProjectIds.map(id => storage.getProject(id));
      const projectsResults = await Promise.allSettled(projectsPromises);
      
      const projectMap = new Map();
      projectsResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          projectMap.set(uniqueProjectIds[index], result.value);
        }
      });
      
      // Enrich tasks using the pre-loaded data
      const enrichedTasks = tasks.map(task => {
        const location = locationMap.get(task.locationId);
        const project = location ? projectMap.get(location.projectId) : null;
        
        return {
          ...task,
          projectName: project?.name || 'Unknown Project',
          locationName: location?.name || 'Unknown Location'
        };
      });
      
      res.json(enrichedTasks);
    } catch (error: any) {
      console.error('[tasks/date-range] error', {
        startDate: req.params.startDate, 
        endDate: req.params.endDate,
        locationIds: req.query.locationIds, 
        limit: req.query.limit, 
        offset: req.query.offset, 
        err: error
      });
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout - please try again' });
      } else {
        res.status(500).json({ error: 'Failed to fetch tasks' });
      }
    }
  });

  app.post('/api/locations/:locationId/tasks', (req: any, res: any, next: any) => {
    res.locals.mark?.('q0');
    validateLimit.run(async () => {
      res.locals.mark?.('q1');
      await createTaskHandler(req, res, next);
    });
  });

  const createTaskHandler = async (req: any, res: any, next: any) => {
    const mark = res.locals.mark;
    try {
      // Queue timing
      mark('q0');
      mark('q1');
      
      const storage = await getStorage();
      
      // Resolve locationId without extra fetches
      const locParam = req.params.locationId;
      let locationId: number;
      
      if (/^\d+$/.test(locParam)) {
        locationId = Number(locParam);
      } else {
        const resolvedId = await storage.resolveLocationIdBySlug(locParam);
        if (!resolvedId) {
          return res.status(404).json({ error: 'Location not found' });
        }
        locationId = resolvedId;
      }

      // Build minimal candidate payload
      const body = req.body ?? {};
      
      console.log('Creating task for location:', locParam, 'with data:', req.body);
      console.log('🔍 DEBUG linkedTaskGroup field:', body.linkedTaskGroup);
      const todayISO = new Date().toISOString().slice(0,10);

      // Compute start/finish (respect weekday rule only if dependentOnPrevious)
      let startDate = body.startDate ?? todayISO;
      let finishDate = body.finishDate ?? startDate;

      // Validate (sync)
      mark('v0');
      const candidate = {
        name: String(body.name || 'Task'),
        startDate: body.startDate || startDate || todayISO,
        finishDate: body.finishDate || finishDate || todayISO,
        taskDate: body.taskDate || startDate || todayISO,
        taskId: body.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        taskType: body.taskType || body.name || 'General',
        costCode: body.costCode || 'GEN',
        status: body.status || 'upcoming',
        scheduledHours: body.scheduledHours || '0.00',
        order: body.order || '999.00',
        linkedTaskGroup: body.linkedTaskGroup || null,
        workDescription: body.workDescription || null,
        notes: body.notes || null
      };
      mark('v1');

      // Single round-trip insert with CTE (no validation needed - SQL handles it)
      mark('d0');
      const created = await storage.createTaskOptimized(locationId, candidate, body.dependentOnPrevious || false);
      mark('d1');

      // Minimal response
      mark('s0');
      res.status(201).json({ id: created.id });
      mark('s1');
    } catch (e: any) {
      console.error('Task creation error:', e);
      
      // Handle DB constraint errors
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Duplicate task name in location' });
      }
      
      res.status(500).json({ error: 'Task creation failed', details: e.message });
    }
  };

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const validated = insertTaskSchema.partial().parse(req.body);
      
      // CRITICAL: Only enforce first task rule in specific scenarios to avoid interfering with drag operations
      const currentTask = await storage.getTask(parseInt(req.params.id));
      if (currentTask && validated.dependentOnPrevious === true) {
        const allTasks = await storage.getTasks(currentTask.locationId);
        const sortedTasks = allTasks.sort((a, b) => (parseFloat(a.order as string) || 0) - (parseFloat(b.order as string) || 0));
        const isFirstTask = sortedTasks.length > 0 && sortedTasks[0].id === currentTask.id;
        
        // Only enforce if this is clearly a direct edit attempt (not a drag operation)
        if (isFirstTask && !req.body.order) {
          console.log('ENFORCING FIRST TASK RULE for direct task edit:', currentTask.name);
          validated.dependentOnPrevious = false;
        }
      }
      
      // Check if the task date is changing
      const dateChanged = validated.taskDate && currentTask && validated.taskDate !== currentTask.taskDate;
      
      const task = await storage.updateTask(parseInt(req.params.id), validated);
      
      // If task date changed, update all assignments for this task to match the new date
      if (dateChanged) {
        console.log(`📅 Task date changed from ${currentTask.taskDate} to ${validated.taskDate}, updating assignments`);
        const assignments = await storage.getAllEmployeeAssignments();
        const taskAssignments = assignments.filter((assignment: any) => assignment.taskId === parseInt(req.params.id));
        
        for (const assignment of taskAssignments) {
          await storage.updateEmployeeAssignment(assignment.id, { 
            ...assignment,
            assignmentDate: validated.taskDate
          });
          console.log(`📅 Updated assignment ${assignment.id} date to ${validated.taskDate}`);
        }
      }
      
      res.json(task);
    } catch (error: any) {
      console.error('Task update error:', error);
      res.status(400).json({ error: 'Invalid task data', details: error.message });
    }
  });

  // Delete all tasks for a location
  app.delete('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const storage = await getStorage();
      const locationParam = req.params.locationId;
      
      console.log(`🗑️ DELETE ALL TASKS: Starting deletion for location ${locationParam}`);
      
      // Handle both locationId string (e.g., "101_test") and pure database ID (e.g., "3")
      let locationId: number;
      if (/^\d+$/.test(locationParam)) {
        // It's a pure numeric database ID
        locationId = parseInt(locationParam);
        console.log(`🗑️ Using numeric location database ID ${locationId}`);
      } else {
        // It's a locationId string - find the location by locationId
        const location = await storage.getLocation(locationParam);
        if (!location) {
          return res.status(404).json({ error: 'Location not found' });
        }
        locationId = location.id;
        console.log(`🗑️ Found location "${location.name}" with database ID ${locationId}`);
      }
      
      // Get all tasks for this location
      const tasks = await storage.getTasks(locationId);
      console.log(`🗑️ Found ${tasks.length} tasks to delete for location ${locationId}`);
      
      if (tasks.length === 0) {
        return res.status(200).json({ message: 'No tasks to delete' });
      }
      
      // Check if any tasks are complete or have assignments
      const assignments = await storage.getAllEmployeeAssignments();
      const taskIds = tasks.map(task => task.id);
      
      // Check for complete tasks
      const completeTasks = tasks.filter(task => 
        task.status === 'complete' || (task.actualHours && parseFloat(task.actualHours.toString()) > 0)
      );
      
      if (completeTasks.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete tasks: Some tasks are marked as complete' 
        });
      }
      
      // Check for assignments
      const taskAssignments = assignments.filter((assignment: any) => 
        taskIds.includes(assignment.taskId)
      );
      
      if (taskAssignments.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete tasks: Some tasks have assignments' 
        });
      }
      
      // Delete all tasks
      console.log(`🗑️ All validation passed. Deleting ${tasks.length} tasks...`);
      for (const task of tasks) {
        await storage.deleteTask(task.id);
        console.log(`🗑️ Deleted task: ${task.name} (ID: ${task.id})`);
      }
      
      console.log(`✅ Successfully deleted all ${tasks.length} tasks for location ${locationId}`);
      res.status(200).json({ 
        message: `Successfully deleted ${tasks.length} tasks`,
        deletedCount: tasks.length
      });
      
    } catch (error) {
      console.error('Delete all tasks error:', error);
      res.status(500).json({ error: 'Failed to delete all tasks' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const taskId = parseInt(req.params.id);
      
      // Get the task being deleted to understand its context
      const taskToDelete = await storage.getTask(taskId);
      if (!taskToDelete) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Get all tasks in the same location for sequential cascading
      const locationTasks = await storage.getTasks(taskToDelete.locationId);
      
      // Handle linked task unlinking before deletion using the proper utility function
      console.log('🔍 DELETION: Checking if task needs unlinking:', {
        taskId,
        taskName: taskToDelete.name,
        linkedGroup: taskToDelete.linkedTaskGroup,
        sequential: taskToDelete.dependentOnPrevious
      });
      
      const { unlinkUpdates: tasksToUpdateForUnlinking } = handleLinkedTaskDeletion(locationTasks, taskId);
      
      console.log('🔗 UNLINKING RESULT:', {
        updatesNeeded: tasksToUpdateForUnlinking.length,
        updates: tasksToUpdateForUnlinking.map(t => ({
          id: t.id,
          name: t.name,
          newSequential: t.dependentOnPrevious,
          newLinkedGroup: t.linkedTaskGroup
        }))
      });
      
      if (tasksToUpdateForUnlinking.length > 0) {
        console.log('🔗 UNLINKING: Processing partner task unlinking');
        tasksToUpdateForUnlinking.forEach(task => {
          console.log(`  └─ Unlinking partner task: ${task.name} (sequential: ${task.dependentOnPrevious})`);
        });
      }
      
      // Update tasks that need sequential status changes before deletion
      if (tasksToUpdateForUnlinking.length > 0) {
        console.log('Applying sequential status updates from deletion:', tasksToUpdateForUnlinking.map(t => ({ 
          id: t.id, 
          name: t.name, 
          sequential: t.dependentOnPrevious, 
          linkedGroup: t.linkedTaskGroup 
        })));
        
        const unlinkingPromises = tasksToUpdateForUnlinking.map(task => {
          const updateData: any = { dependentOnPrevious: task.dependentOnPrevious };
          // Only set linkedTaskGroup to null if the task is being unlinked
          if (task.linkedTaskGroup === null) {
            updateData.linkedTaskGroup = null;
          }
          console.log(`Updating task ${task.name} (ID: ${task.id}) with:`, updateData);
          return storage.updateTask(task.id, updateData);
        });
        await Promise.all(unlinkingPromises);
      }
      
      // Delete all assignments associated with this task first (cascading delete)
      console.log('🗑️ DELETION: Getting assignments for task to delete:', taskId);
      const taskAssignments = await storage.getEmployeeAssignments(taskId);
      
      if (taskAssignments.length > 0) {
        console.log(`🗑️ DELETION: Found ${taskAssignments.length} assignments to delete for task ${taskId}`);
        const assignmentDeletionPromises = taskAssignments.map(assignment => {
          console.log(`  └─ Deleting assignment ${assignment.id} for employee ${assignment.employeeId}`);
          return storage.deleteEmployeeAssignment(assignment.id);
        });
        
        await Promise.all(assignmentDeletionPromises);
        console.log('✅ All task assignments deleted successfully');
      } else {
        console.log('✅ No assignments found for this task');
      }
      
      // Delete the task with timeout for better performance
      await withTimeout(storage.deleteTask(taskId), 5000);
      
      // Process sequential cascading for remaining tasks (including newly unlinked ones)
      const remainingTasks = locationTasks.filter(t => t.id !== taskId);
      
      if (remainingTasks.length > 0) {
        // Apply unlinking updates to remaining tasks
        let updatedRemainingTasks = [...remainingTasks];
        tasksToUpdateForUnlinking.forEach(unlinkUpdate => {
          const taskIndex = updatedRemainingTasks.findIndex(t => t.id === unlinkUpdate.id);
          if (taskIndex >= 0) {
            updatedRemainingTasks[taskIndex] = unlinkUpdate;
          }
        });
        
        // Sort tasks chronologically for sequential cascading
        const sortedTasks = updatedRemainingTasks.sort((a, b) => {
          const dateA = new Date(a.taskDate).getTime();
          const dateB = new Date(b.taskDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (parseFloat(a.order as string) || 0) - (parseFloat(b.order as string) || 0);
        });
        
        // Apply enhanced sequential realignment using the comprehensive function
        console.log('🗑️ DELETION: Applying sequential realignment after task deletion');
        const { realignDependentTasks } = await import('../shared/taskUtils.js');
        
        // Sort tasks by order for proper sequential processing
        const tasksToProcess = [...updatedRemainingTasks].sort((a, b) => (parseFloat(a.order as string) || 0) - (parseFloat(b.order as string) || 0));
        const realignedTasks = realignDependentTasks(tasksToProcess);
        
        // Find tasks that need date updates
        const tasksToUpdate = realignedTasks.filter((realignedTask, index) => {
          const originalTask = tasksToProcess[index];
          return originalTask && originalTask.taskDate !== realignedTask.taskDate;
        });
        
        // Update tasks if cascading is needed
        if (tasksToUpdate.length > 0) {
          console.log(`🔄 Cascading ${tasksToUpdate.length} tasks after deletion with enhanced sequential logic`);
          const updatePromises = tasksToUpdate.map(task => 
            storage.updateTask(task.id, { taskDate: task.taskDate })
          );
          await Promise.all(updatePromises);
        } else {
          console.log('✅ No sequential date updates needed after deletion');
        }
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Task deletion error:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // Employee assignment routes
  app.get('/api/tasks/:taskId/assignments', async (req, res) => {
    try {
      const storage = await getStorage();
      const assignments = await storage.getEmployeeAssignments(parseInt(req.params.taskId));
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments', async (req, res) => {
    try {
      const storage = await getStorage();
      // Add cache headers to reduce repeated calls
      res.set({
        'Cache-Control': 'public, max-age=30',
        'ETag': `assignments-${Date.now()}`
      });
      
      const assignments = await storage.getAllEmployeeAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments/date/:date', async (req, res) => {
    try {
      const storage = await getStorage();
      const assignments = await storage.getEmployeeAssignmentsByDate(req.params.date);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.post('/api/assignments', async (req, res) => {
    try {
      const storage = await getStorage();
      console.log('Creating assignment:', req.body);
      
      // Check if assignment already exists for this task and employee
      const existingAssignments = await storage.getEmployeeAssignments(req.body.taskId);
      const existingAssignment = existingAssignments.find(a => a.employeeId === req.body.employeeId);
      
      if (existingAssignment) {
        // Update existing assignment instead of creating duplicate
        console.log('Assignment already exists, updating:', existingAssignment.id);
        const updated = await withFastTimeout(storage.updateEmployeeAssignment(existingAssignment.id, {
          assignedHours: req.body.assignedHours,
          assignmentDate: req.body.assignmentDate,
          actualHours: req.body.actualHours || null
        }));
        console.log('Assignment updated:', updated);
        
        // Reassign foreman after assignment update
        await reassignTaskForeman(storage, updated.taskId);
        
        return res.status(200).json(updated);
      }
      
      // Create new assignment with unique ID
      const assignmentData = {
        ...req.body,
        assignmentId: req.body.assignmentId || `${req.body.taskId}_${req.body.employeeId}`,
      };
      
      const validated = insertEmployeeAssignmentSchema.parse(assignmentData);
      const assignment = await withFastTimeout(storage.createEmployeeAssignment(validated));
      console.log('Assignment created:', assignment);
      
      // Reassign foreman after new assignment is created
      await reassignTaskForeman(storage, assignment.taskId);
      
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error('Assignment creation error:', error);
      if (error.message?.includes('timeout')) {
        res.status(408).json({ error: 'Assignment save timeout - please try again' });
      } else if (error.code === '23505') {
        res.status(409).json({ error: 'Assignment already exists for this employee and task' });
      } else {
        res.status(400).json({ error: 'Invalid assignment data', details: error.message });
      }
    }
  });

  // Helper function to reassign foreman based on current task assignments
  const reassignTaskForeman = async (storage: any, taskId: number) => {
    try {
      // Get current task assignments and employee data
      const assignments = await storage.getEmployeeAssignments(taskId);
      const allEmployees = await storage.getEmployees();
      
      // Find currently assigned foremen
      const assignedForemen = assignments
        .map((assignment: any) => allEmployees.find((emp: any) => emp.id === assignment.employeeId))
        .filter((emp: any) => emp && emp.isForeman === true);
      
      console.log('🔍 FOREMAN REASSIGNMENT:', {
        taskId,
        totalAssignments: assignments.length,
        assignedForemen: assignedForemen.map((f: any) => ({ id: f.id, name: f.name }))
      });
      
      // Update task foreman based on assignment count
      if (assignedForemen.length === 1) {
        // Single foreman: auto-assign
        await storage.updateTask(taskId, { foremanId: assignedForemen[0].id });
        console.log('✅ AUTO-ASSIGNED single foreman:', assignedForemen[0].name);
      } else if (assignedForemen.length === 0) {
        // No foremen: clear foreman assignment
        await storage.updateTask(taskId, { foremanId: null });
        console.log('🔄 CLEARED foreman assignment - no foremen assigned');
      } else if (assignedForemen.length >= 2) {
        // Multiple foremen: clear existing foreman assignment to force user selection
        const currentTask = await storage.getTask(taskId);
        if (currentTask?.foremanId) {
          const currentForeman = assignedForemen.find(f => f.id === currentTask.foremanId);
          if (!currentForeman) {
            // Current foreman is no longer assigned, clear it
            await storage.updateTask(taskId, { foremanId: null });
            console.log('🔄 CLEARED foreman - current foreman no longer assigned');
          }
          // If current foreman is still assigned, keep them
        } else {
          console.log('🔄 Multiple foremen assigned - user must select overall foreman');
        }
      }
      else if (assignedForemen.length >= 2) {
        const currentTask = await storage.getTask(taskId);
        const currentForemanStillAssigned = assignedForemen.some(f => f.id === currentTask.foremanId);
        
        if (!currentForemanStillAssigned) {
          console.log('🔄 CURRENT foreman no longer assigned, needs manual selection');
          // Clear foreman to trigger selection popup
          await storage.updateTask(taskId, { foremanId: null });
        }
      }
    } catch (error) {
      console.error('❌ Failed to reassign foreman:', error);
    }
  };

  app.delete('/api/assignments/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const assignmentId = parseInt(req.params.id);
      
      // Get assignment details before deletion to know which task to update
      const assignment = await storage.getAllEmployeeAssignments();
      const targetAssignment = assignment.find((a: any) => a.id === assignmentId);
      
      await storage.deleteEmployeeAssignment(assignmentId);
      
      // Reassign foreman if assignment was deleted
      if (targetAssignment) {
        await reassignTaskForeman(storage, targetAssignment.taskId);
      }
      
      res.status(200).json({ message: 'Assignment deleted successfully' });
    } catch (error) {
      console.error('Error deleting assignment:', error);
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  app.post('/api/tasks/:taskId/assignments', async (req, res) => {
    try {
      const storage = await getStorage();
      const taskId = parseInt(req.params.taskId);
      
      // Check if assignment already exists for this task and employee
      const existingAssignments = await storage.getEmployeeAssignments(taskId);
      const existingAssignment = existingAssignments.find(a => a.employeeId === req.body.employeeId);
      
      if (existingAssignment) {
        // Update existing assignment
        const updated = await withFastTimeout(storage.updateEmployeeAssignment(existingAssignment.id, {
          assignedHours: String(req.body.assignedHours),
          assignmentDate: req.body.assignmentDate,
          actualHours: req.body.actualHours ? String(req.body.actualHours) : null
        }));
        return res.status(200).json(updated);
      }
      
      // Transform data for validation
      const dataToValidate = {
        ...req.body,
        taskId,
        assignmentId: `${taskId}_${req.body.employeeId}`,
        assignedHours: String(req.body.assignedHours),
        actualHours: req.body.actualHours ? String(req.body.actualHours) : null
      };
      
      const validated = insertEmployeeAssignmentSchema.parse(dataToValidate);
      const assignment = await storage.createEmployeeAssignment(validated);
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error('Task assignment creation error:', error);
      if (error.code === '23505') {
        res.status(409).json({ error: 'Assignment already exists for this employee and task' });
      } else {
        res.status(400).json({ error: 'Invalid assignment data', details: error.message });
      }
    }
  });

  app.put('/api/assignments/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      const validated = insertEmployeeAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateEmployeeAssignment(parseInt(req.params.id), validated);
      
      // If actual hours were assigned, check if we should mark the task as complete
      if (validated.actualHours !== undefined) {
        // Get all assignments for this task to check if all have actual hours recorded
        const taskAssignments = await storage.getEmployeeAssignments(assignment.taskId);
        const allHaveActualHours = taskAssignments.every(a => 
          a.actualHours !== null && a.actualHours !== undefined
        );
        
        if (allHaveActualHours) {
          // Mark task as complete
          await storage.updateTask(assignment.taskId, { status: 'complete' });
        } else {
          // Mark task as in progress if not already
          const task = await storage.getTask(assignment.taskId);
          if (task && task.status === 'upcoming') {
            await storage.updateTask(assignment.taskId, { status: 'in_progress' });
          }
        }
      }
      
      res.json(assignment);
    } catch (error) {
      console.error('Assignment validation error:', error);
      console.error('Request body:', req.body);
      res.status(400).json({ 
        error: 'Invalid assignment data', 
        details: error instanceof Error ? error.message : 'Validation failed'
      });
    }
  });

  app.delete('/api/assignments/:id', async (req, res) => {
    try {
      const storage = await getStorage();
      await storage.deleteEmployeeAssignment(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  // Authentication routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const storage = await getStorage();
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Find user by username or email
      const users = await storage.getUsers();
      const user = users.find(u => 
        u.username === username || u.email === username
      );
      
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid username/email or password' });
      }

      res.json({ 
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          isPasswordSet: user.isPasswordSet
        },
        requirePasswordChange: !user.isPasswordSet
      });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const storage = await getStorage();
      const { userId, currentPassword, newPassword } = req.body;
      
      if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'User ID, current password, and new password are required' });
      }

      const user = await storage.getUser(userId);
      if (!user || user.password !== currentPassword) {
        return res.status(401).json({ error: 'Invalid current password' });
      }

      await storage.updateUser(userId, { 
        password: newPassword, 
        isPasswordSet: true 
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Password reset routes
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const storage = await getStorage();
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Update user password and clear reset token
      await storage.updateUser(user.id, { password: newPassword });
      await storage.clearPasswordResetToken(user.id);

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.get('/api/auth/verify-reset-token/:token', async (req, res) => {
    try {
      const storage = await getStorage();
      const user = await storage.getUserByResetToken(req.params.token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      res.json({ 
        valid: true, 
        userName: user.name,
        email: user.email 
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to verify reset token' });
    }
  });

  return httpServer;
}
