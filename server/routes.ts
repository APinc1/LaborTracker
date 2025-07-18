import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  insertProjectSchema, insertBudgetLineItemSchema, insertLocationSchema, insertCrewSchema, 
  insertEmployeeSchema, insertTaskSchema, insertEmployeeAssignmentSchema 
} from "@shared/schema";

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
      const users = await storage.getUsers();
      res.json(users);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error: any) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
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
      const userId = parseInt(req.params.id);
      const success = await storage.deleteUser(userId);
      if (!success) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Project routes
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
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
      const validated = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validated);
      res.status(201).json(project);
    } catch (error: any) {
      console.error('Error creating project:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid project data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create project' });
      }
    }
  });

  app.put('/api/projects/:id', async (req, res) => {
    try {
      const validated = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(parseInt(req.params.id), validated);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: 'Invalid project data' });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      await storage.deleteProject(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Budget line item routes
  app.get('/api/locations/:locationId/budget', async (req, res) => {
    try {
      const budgetItems = await storage.getBudgetLineItems(parseInt(req.params.locationId));
      res.json(budgetItems);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch budget items' });
    }
  });

  app.post('/api/locations/:locationId/budget', async (req, res) => {
    try {
      const validated = insertBudgetLineItemSchema.parse({
        ...req.body,
        locationId: parseInt(req.params.locationId)
      });
      const budgetItem = await storage.createBudgetLineItem(validated);
      res.status(201).json(budgetItem);
    } catch (error) {
      res.status(400).json({ error: 'Invalid budget item data' });
    }
  });

  app.put('/api/budget/:id', async (req, res) => {
    try {
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
      await storage.deleteBudgetLineItem(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete budget item' });
    }
  });

  // Location routes
  app.get('/api/projects/:projectId/locations', async (req, res) => {
    try {
      const locations = await storage.getLocations(parseInt(req.params.projectId));
      res.json(locations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  app.get('/api/locations/:id', async (req, res) => {
    try {
      const location = await storage.getLocation(parseInt(req.params.id));
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      res.json(location);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  });

  app.post('/api/projects/:projectId/locations', async (req, res) => {
    try {
      const validated = insertLocationSchema.parse({
        ...req.body,
        projectId: parseInt(req.params.projectId)
      });
      const location = await storage.createLocation(validated);
      res.status(201).json(location);
    } catch (error) {
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.put('/api/locations/:id', async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const location = await storage.updateLocation(parseInt(req.params.id), validated);
      res.json(location);
    } catch (error) {
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.delete('/api/locations/:id', async (req, res) => {
    try {
      await storage.deleteLocation(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Crew routes
  app.get('/api/crews', async (req, res) => {
    try {
      const crews = await storage.getCrews();
      res.json(crews);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch crews' });
    }
  });

  app.post('/api/crews', async (req, res) => {
    try {
      const validated = insertCrewSchema.parse(req.body);
      const crew = await storage.createCrew(validated);
      res.status(201).json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.put('/api/crews/:id', async (req, res) => {
    try {
      const validated = insertCrewSchema.partial().parse(req.body);
      const crew = await storage.updateCrew(parseInt(req.params.id), validated);
      res.json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.delete('/api/crews/:id', async (req, res) => {
    try {
      await storage.deleteCrew(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete crew' });
    }
  });

  // Employee routes
  app.get('/api/employees', async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch employees' });
    }
  });

  app.get('/api/employees/:id', async (req, res) => {
    try {
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
      const validated = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(validated);
      res.status(201).json(employee);
    } catch (error) {
      res.status(400).json({ error: 'Invalid employee data' });
    }
  });

  app.put('/api/employees/:id', async (req, res) => {
    try {
      const validated = insertEmployeeSchema.partial().parse(req.body);
      const employee = await storage.updateEmployee(parseInt(req.params.id), validated);
      res.json(employee);
    } catch (error) {
      res.status(400).json({ error: 'Invalid employee data' });
    }
  });

  app.delete('/api/employees/:id', async (req, res) => {
    try {
      await storage.deleteEmployee(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete employee' });
    }
  });

  // Task routes
  app.get('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const tasks = await storage.getTasks(parseInt(req.params.locationId));
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const task = await storage.getTask(parseInt(req.params.id));
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  app.get('/api/tasks/date-range/:startDate/:endDate', async (req, res) => {
    try {
      const tasks = await storage.getTasksByDateRange(req.params.startDate, req.params.endDate);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.post('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const validated = insertTaskSchema.parse({
        ...req.body,
        locationId: parseInt(req.params.locationId)
      });
      const task = await storage.createTask(validated);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const validated = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(parseInt(req.params.id), validated);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await storage.deleteTask(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // Employee assignment routes
  app.get('/api/tasks/:taskId/assignments', async (req, res) => {
    try {
      const assignments = await storage.getEmployeeAssignments(parseInt(req.params.taskId));
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments', async (req, res) => {
    try {
      const assignments = await storage.getAllEmployeeAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments/date/:date', async (req, res) => {
    try {
      const assignments = await storage.getEmployeeAssignmentsByDate(req.params.date);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.post('/api/tasks/:taskId/assignments', async (req, res) => {
    try {
      const validated = insertEmployeeAssignmentSchema.parse({
        ...req.body,
        taskId: parseInt(req.params.taskId)
      });
      const assignment = await storage.createEmployeeAssignment(validated);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ error: 'Invalid assignment data' });
    }
  });

  app.put('/api/assignments/:id', async (req, res) => {
    try {
      const validated = insertEmployeeAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateEmployeeAssignment(parseInt(req.params.id), validated);
      res.json(assignment);
    } catch (error) {
      res.status(400).json({ error: 'Invalid assignment data' });
    }
  });

  app.delete('/api/assignments/:id', async (req, res) => {
    try {
      await storage.deleteEmployeeAssignment(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  return httpServer;
}
