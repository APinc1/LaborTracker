import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { initializeStorageInstance, getStorage } from "./storage";
import { 
  insertProjectSchema, insertBudgetLineItemSchema, insertLocationSchema, insertCrewSchema, 
  insertEmployeeSchema, insertTaskSchema, insertEmployeeAssignmentSchema 
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize storage with seeded data
  await initializeStorageInstance();

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

  // Project routes
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await getStorage().getProjects();
      res.json(projects);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await getStorage().getProject(parseInt(req.params.id));
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const validated = insertProjectSchema.parse(req.body);
      const project = await getStorage().createProject(validated);
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
      const project = await getStorage().updateProject(parseInt(req.params.id), validated);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: 'Invalid project data' });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      await getStorage().deleteProject(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // Budget line item routes
  app.get('/api/locations/:locationId/budget', async (req, res) => {
    try {
      const budgetItems = await getStorage().getBudgetLineItems(parseInt(req.params.locationId));
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
      const budgetItem = await getStorage().createBudgetLineItem(validated);
      res.status(201).json(budgetItem);
    } catch (error) {
      res.status(400).json({ error: 'Invalid budget item data' });
    }
  });

  app.put('/api/budget/:id', async (req, res) => {
    try {
      const validated = insertBudgetLineItemSchema.partial().parse(req.body);
      const budgetItem = await getStorage().updateBudgetLineItem(parseInt(req.params.id), validated);
      res.json(budgetItem);
    } catch (error) {
      res.status(400).json({ error: 'Invalid budget item data' });
    }
  });

  app.delete('/api/budget/:id', async (req, res) => {
    try {
      await getStorage().deleteBudgetLineItem(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete budget item' });
    }
  });

  // Location routes
  app.get('/api/projects/:projectId/locations', async (req, res) => {
    try {
      const locations = await getStorage().getLocations(parseInt(req.params.projectId));
      res.json(locations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  app.get('/api/locations/:id', async (req, res) => {
    try {
      const location = await getStorage().getLocation(parseInt(req.params.id));
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
      const location = await getStorage().createLocation(validated);
      res.status(201).json(location);
    } catch (error) {
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.put('/api/locations/:id', async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const location = await getStorage().updateLocation(parseInt(req.params.id), validated);
      res.json(location);
    } catch (error) {
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.delete('/api/locations/:id', async (req, res) => {
    try {
      await getStorage().deleteLocation(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Crew routes
  app.get('/api/crews', async (req, res) => {
    try {
      const crews = await getStorage().getCrews();
      res.json(crews);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch crews' });
    }
  });

  app.post('/api/crews', async (req, res) => {
    try {
      const validated = insertCrewSchema.parse(req.body);
      const crew = await getStorage().createCrew(validated);
      res.status(201).json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.put('/api/crews/:id', async (req, res) => {
    try {
      const validated = insertCrewSchema.partial().parse(req.body);
      const crew = await getStorage().updateCrew(parseInt(req.params.id), validated);
      res.json(crew);
    } catch (error) {
      res.status(400).json({ error: 'Invalid crew data' });
    }
  });

  app.delete('/api/crews/:id', async (req, res) => {
    try {
      await getStorage().deleteCrew(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete crew' });
    }
  });

  // Employee routes
  app.get('/api/employees', async (req, res) => {
    try {
      const employees = await getStorage().getEmployees();
      res.json(employees);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch employees' });
    }
  });

  app.get('/api/employees/:id', async (req, res) => {
    try {
      const employee = await getStorage().getEmployee(parseInt(req.params.id));
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
      const employee = await getStorage().createEmployee(validated);
      res.status(201).json(employee);
    } catch (error) {
      res.status(400).json({ error: 'Invalid employee data' });
    }
  });

  app.put('/api/employees/:id', async (req, res) => {
    try {
      const validated = insertEmployeeSchema.partial().parse(req.body);
      const employee = await getStorage().updateEmployee(parseInt(req.params.id), validated);
      res.json(employee);
    } catch (error) {
      res.status(400).json({ error: 'Invalid employee data' });
    }
  });

  app.delete('/api/employees/:id', async (req, res) => {
    try {
      await getStorage().deleteEmployee(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete employee' });
    }
  });

  // Task routes
  app.get('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const tasks = await getStorage().getTasks(parseInt(req.params.locationId));
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const task = await getStorage().getTask(parseInt(req.params.id));
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
      const tasks = await getStorage().getTasksByDateRange(req.params.startDate, req.params.endDate);
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
      const task = await getStorage().createTask(validated);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const validated = insertTaskSchema.partial().parse(req.body);
      const task = await getStorage().updateTask(parseInt(req.params.id), validated);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await getStorage().deleteTask(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // Employee assignment routes
  app.get('/api/tasks/:taskId/assignments', async (req, res) => {
    try {
      const assignments = await getStorage().getEmployeeAssignments(parseInt(req.params.taskId));
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments', async (req, res) => {
    try {
      const assignments = await getStorage().getAllEmployeeAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  app.get('/api/assignments/date/:date', async (req, res) => {
    try {
      const assignments = await getStorage().getEmployeeAssignmentsByDate(req.params.date);
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
      const assignment = await getStorage().createEmployeeAssignment(validated);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ error: 'Invalid assignment data' });
    }
  });

  app.put('/api/assignments/:id', async (req, res) => {
    try {
      const validated = insertEmployeeAssignmentSchema.partial().parse(req.body);
      const assignment = await getStorage().updateEmployeeAssignment(parseInt(req.params.id), validated);
      res.json(assignment);
    } catch (error) {
      res.status(400).json({ error: 'Invalid assignment data' });
    }
  });

  app.delete('/api/assignments/:id', async (req, res) => {
    try {
      await getStorage().deleteEmployeeAssignment(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  return httpServer;
}
