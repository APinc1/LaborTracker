import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  insertProjectSchema, insertBudgetLineItemSchema, insertLocationSchema, insertCrewSchema, 
  insertEmployeeSchema, insertTaskSchema, insertEmployeeAssignmentSchema 
} from "@shared/schema";
import { handleLinkedTaskDeletion } from "@shared/taskUtils";

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
      const userData = {
        ...req.body,
        password: 'AccessPacific2835', // Default password
        isPasswordSet: false // Force password change on first login
      };
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
      // Validate required fields first
      if (!req.body.projectId || !req.body.name) {
        return res.status(400).json({ error: 'Project ID and name are required' });
      }
      
      // Check for duplicate project ID
      const existingProjects = await storage.getProjects();
      const duplicateProject = existingProjects.find(p => p.projectId === req.body.projectId);
      if (duplicateProject) {
        return res.status(400).json({ error: `Project ID "${req.body.projectId}" already exists` });
      }
      
      // Prepare project data with defaults
      const projectData = {
        projectId: req.body.projectId,
        name: req.body.name,
        startDate: req.body.startDate && req.body.startDate.trim() !== '' ? req.body.startDate : null,
        endDate: req.body.endDate && req.body.endDate.trim() !== '' ? req.body.endDate : null,
        defaultSuperintendent: req.body.defaultSuperintendent || null,
        defaultProjectManager: req.body.defaultProjectManager || null
      };
      
      const project = await storage.createProject(projectData);
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
      
      const validated = insertBudgetLineItemSchema.parse({
        ...req.body,
        locationId: locationDbId
      });
      const budgetItem = await storage.createBudgetLineItem(validated);
      res.status(201).json(budgetItem);
    } catch (error) {
      console.error('Budget create error:', error);
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
      const location = await storage.getLocation(req.params.id);
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
      const validated = insertLocationSchema.partial().parse(req.body);
      const location = await storage.updateLocation(req.params.id, validated);
      res.json(location);
    } catch (error) {
      res.status(400).json({ error: 'Invalid location data' });
    }
  });

  app.delete('/api/locations/:id', async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Location tasks route
  app.get('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.params.locationId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
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

  app.post('/api/employees/:id/create-user', async (req, res) => {
    try {
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

  // Task routes
  app.get('/api/locations/:locationId/tasks', async (req, res) => {
    try {
      const tasks = await storage.getTasks(req.params.locationId);
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
        locationId: req.params.locationId
      });
      
      // CRITICAL: Check if this will be the first task and enforce unsequential status
      const existingTasks = await storage.getTasks(req.params.locationId);
      const isFirstTask = existingTasks.length === 0 || 
                         (validated.order !== undefined && validated.order === 0) ||
                         (validated.order !== undefined && existingTasks.every(t => (t.order || 0) > validated.order));
      
      if (isFirstTask && validated.dependentOnPrevious) {
        console.log('ENFORCING FIRST TASK RULE for new task:', validated.name);
        validated.dependentOnPrevious = false;
      }
      
      const task = await storage.createTask(validated);
      
      // If this task is being linked to an existing task, update the existing task's linkedTaskGroup
      if (validated.linkedTaskGroup && req.body.linkedTaskId) {
        try {
          const existingTask = await storage.getTask(parseInt(req.body.linkedTaskId));
          if (existingTask && !existingTask.linkedTaskGroup) {
            await storage.updateTask(parseInt(req.body.linkedTaskId), {
              linkedTaskGroup: validated.linkedTaskGroup
            });
          }
        } catch (updateError) {
          console.error('Failed to update linked task group:', updateError);
          // Continue with task creation even if linking fails
        }
      }
      
      res.status(201).json(task);
    } catch (error: any) {
      console.error('Task validation error:', error);
      if (error.issues) {
        console.error('Validation issues:', error.issues);
      }
      res.status(400).json({ error: 'Invalid task data', details: error.message });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const validated = insertTaskSchema.partial().parse(req.body);
      
      // CRITICAL: Only enforce first task rule in specific scenarios to avoid interfering with drag operations
      const currentTask = await storage.getTask(parseInt(req.params.id));
      if (currentTask && validated.dependentOnPrevious === true) {
        const allTasks = await storage.getTasks(currentTask.locationId);
        const sortedTasks = allTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
        const isFirstTask = sortedTasks.length > 0 && sortedTasks[0].id === currentTask.id;
        
        // Only enforce if this is clearly a direct edit attempt (not a drag operation)
        if (isFirstTask && !req.body.order) {
          console.log('ENFORCING FIRST TASK RULE for direct task edit:', currentTask.name);
          validated.dependentOnPrevious = false;
        }
      }
      
      const task = await storage.updateTask(parseInt(req.params.id), validated);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: 'Invalid task data' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
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
      
      // Delete the task
      await storage.deleteTask(taskId);
      
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
          return (a.order || 0) - (b.order || 0);
        });
        
        // Apply enhanced sequential realignment using the comprehensive function
        console.log('🗑️ DELETION: Applying sequential realignment after task deletion');
        const { realignDependentTasks } = await import('../shared/taskUtils.js');
        
        // Sort tasks by order for proper sequential processing
        const tasksToProcess = [...updatedRemainingTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
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

  // Authentication routes
  app.post('/api/auth/login', async (req, res) => {
    try {
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
