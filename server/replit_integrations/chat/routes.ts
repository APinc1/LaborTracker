import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { getStorage } from "../../storage";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const SYSTEM_PROMPT = `You are a planning assistant and technical advisor for a construction management system. You serve two purposes:

## 1. DATA QUERIES (Read-Only)
You can answer questions about the system's data:
- Projects (names, addresses, dates, status)
- Locations within projects (status: active, completed, suspended)
- Tasks and their schedules
- Employees and their assignments
- Budget line items and costs
- Daily job reports

## 2. PRODUCT PLANNING & FEASIBILITY
You can discuss potential app updates and answer "Is this possible?" questions. Here's your knowledge about the system:

### Technical Architecture
- **Frontend**: React 18 + TypeScript, Vite builds, TanStack Query for state, Wouter routing, Tailwind CSS + shadcn/ui components
- **Backend**: Express.js + TypeScript, RESTful API with CRUD operations
- **Database**: Supabase PostgreSQL with Drizzle ORM (type-safe queries)
- **Real-time**: WebSocket server for live updates across clients
- **Authentication**: Session-based with PostgreSQL storage, role-based access (Admin, Superintendent, Project Manager, Foreman)

### Existing Features
- **Projects**: Create/edit projects with addresses, dates, status tracking
- **Locations**: Track work areas within projects with Active/Completed/Suspended states
- **Budget Management**: Two-tier system - project master budgets + location-level derived budgets. SW62 Excel import. Conversion factors. Actuals tracking.
- **Employee Management**: Profiles with roles, trade specializations (Primary/Secondary/Tertiary), union status, apprentice levels
- **Task Scheduling**: Drag-drop reordering, dependency management, date shifting, cost code tracking, driver hours separation
- **Daily Job Reports (DJR)**: Daily reporting with weather auto-fetch, quantity tracking per task, notes, edit history audit trail
- **Dashboard**: Real-time overview, day filtering, location progress monitoring
- **Exports**: PDF and Excel export capabilities

### What's EASY to Add (Low Complexity)
- New fields on existing entities (adding columns to tables)
- New filters or sorting options
- Additional reports or exports
- UI improvements (colors, layouts, icons)
- New dashboard widgets showing existing data
- Email notifications (using existing data)
- Simple calculations or summaries

### What's MODERATE to Add (Medium Complexity)
- New entity types with relationships
- New workflow screens
- File upload/storage features
- Integration with external APIs (weather, maps, etc.)
- Custom user preferences
- Batch operations
- Advanced filtering/search

### What's COMPLEX to Add (High Complexity)
- Real-time collaboration features
- Mobile app (would need React Native or similar)
- Offline capability with sync
- Complex approval workflows
- AI/ML features beyond simple queries
- Multi-tenant/company support
- Custom integrations with ERP systems

## Response Guidelines
- You can ONLY read data and discuss ideas - you cannot make any actual changes
- Be honest about complexity - don't oversimplify difficult features
- Suggest alternatives if something is too complex
- Be concise and practical
- When discussing feasibility, explain WHY something is easy or hard
- Format responses clearly with lists or tables when appropriate

The user will provide context about their data when asking data questions. For planning questions, use your knowledge of the system architecture.`;

async function getRelevantContext(userMessage: string): Promise<string> {
  const storage = await getStorage();
  const messageLower = userMessage.toLowerCase();
  
  let context = "";
  
  // Always get a summary of projects
  const projects = await storage.getProjects();
  const activeProjects = projects.filter((p: any) => !p.isInactive);
  context += `\n## Projects Summary (${activeProjects.length} active, ${projects.length - activeProjects.length} inactive)\n`;
  
  // If asking about specific project, get more details
  if (messageLower.includes('project') || messageLower.includes('location') || messageLower.includes('budget')) {
    context += `Active Projects:\n`;
    for (const project of activeProjects.slice(0, 10)) {
      context += `- ${project.name} (ID: ${project.projectId}): ${project.address || 'No address'}\n`;
    }
  }
  
  // If asking about tasks or schedules
  if (messageLower.includes('task') || messageLower.includes('schedule') || messageLower.includes('today') || 
      messageLower.includes('tomorrow') || messageLower.includes('week') || messageLower.includes('concrete') ||
      messageLower.includes('demo') || messageLower.includes('grading') || messageLower.includes('labor') ||
      messageLower.includes('pour') || messageLower.includes('how much') || messageLower.includes('quantity')) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    
    // Use getTasksByDateRange for efficient querying
    const tasks = await storage.getTasksByDateRange(today, weekEnd, undefined, 200, 0);
    const todayTasks = tasks.filter((t: any) => t.taskDate === today);
    const tomorrowTasks = tasks.filter((t: any) => t.taskDate === tomorrow);
    
    // Get all locations for name lookup
    const allLocations = await storage.getAllLocations();
    const locationMap = new Map(allLocations.map((l: any) => [l.id, l.name]));
    
    // Group tasks by type for summary with quantities
    const tasksByType: Record<string, { count: number, totalQty: number, unit: string }> = {};
    for (const task of tasks) {
      const taskType = task.taskType || 'Other';
      if (!tasksByType[taskType]) {
        tasksByType[taskType] = { count: 0, totalQty: 0, unit: task.unitOfMeasure || '' };
      }
      tasksByType[taskType].count++;
      if (task.qty) {
        tasksByType[taskType].totalQty += parseFloat(task.qty) || 0;
      }
    }
    
    context += `\n## This Week's Tasks (${today} to ${weekEnd}): ${tasks.length} total\n`;
    context += `Task breakdown by type:\n`;
    for (const [type, data] of Object.entries(tasksByType)) {
      if (data.totalQty > 0 && data.unit) {
        context += `- ${type}: ${data.count} tasks, Total quantity: ${data.totalQty} ${data.unit}\n`;
      } else {
        context += `- ${type}: ${data.count} tasks\n`;
      }
    }
    
    context += `\n## Today's Tasks (${today}): ${todayTasks.length} tasks\n`;
    for (const task of todayTasks.slice(0, 15)) {
      const locationName = locationMap.get(task.locationId) || `Location ${task.locationId}`;
      const taskName = task.name || 'Unnamed task';
      const taskType = task.taskType || '';
      const qtyInfo = task.qty && task.unitOfMeasure ? ` - Qty: ${task.qty} ${task.unitOfMeasure}` : '';
      context += `- [${taskType}] ${taskName} at ${locationName}: ${task.status || 'scheduled'}${qtyInfo}\n`;
    }
    
    if (messageLower.includes('tomorrow')) {
      context += `\n## Tomorrow's Tasks (${tomorrow}): ${tomorrowTasks.length} tasks\n`;
      for (const task of tomorrowTasks.slice(0, 15)) {
        const locationName = locationMap.get(task.locationId) || `Location ${task.locationId}`;
        const taskName = task.name || 'Unnamed task';
        const taskType = task.taskType || '';
        const qtyInfo = task.qty && task.unitOfMeasure ? ` - Qty: ${task.qty} ${task.unitOfMeasure}` : '';
        context += `- [${taskType}] ${taskName} at ${locationName}: ${task.status || 'scheduled'}${qtyInfo}\n`;
      }
    }
    
    // Show all week's tasks with types and quantities when asking about specific work
    if (messageLower.includes('concrete') || messageLower.includes('demo') || 
        messageLower.includes('grading') || messageLower.includes('labor') || messageLower.includes('week') ||
        messageLower.includes('pour') || messageLower.includes('how much') || messageLower.includes('quantity')) {
      context += `\n## All Tasks This Week (with quantities):\n`;
      for (const task of tasks.slice(0, 50)) {
        const locationName = locationMap.get(task.locationId) || `Location ${task.locationId}`;
        const taskName = task.name || 'Unnamed task';
        const taskType = task.taskType || '';
        const qtyInfo = task.qty && task.unitOfMeasure ? ` - Qty: ${task.qty} ${task.unitOfMeasure}` : '';
        context += `- [${taskType}] ${taskName} on ${task.taskDate} at ${locationName}: ${task.status || 'scheduled'}${qtyInfo}\n`;
      }
    }
  }
  
  // If asking about employees
  if (messageLower.includes('employee') || messageLower.includes('worker') || messageLower.includes('crew') ||
      messageLower.includes('who') || messageLower.includes('assigned')) {
    const employees = await storage.getEmployees();
    const activeEmployees = employees.filter((e: any) => !e.isInactive);
    context += `\n## Employees: ${activeEmployees.length} active employees\n`;
    
    // Group by primary trade
    const byTrade: Record<string, number> = {};
    for (const emp of activeEmployees) {
      const trade = emp.primaryTrade || 'Unassigned';
      byTrade[trade] = (byTrade[trade] || 0) + 1;
    }
    context += `By Trade: ${Object.entries(byTrade).map(([t, c]) => `${t}: ${c}`).join(', ')}\n`;
  }
  
  // If asking about locations
  if (messageLower.includes('location') || messageLower.includes('suspended') || messageLower.includes('completed') ||
      messageLower.includes('active')) {
    const locations = await storage.getAllLocations();
    const byStatus = {
      active: locations.filter((l: any) => l.status === 'active').length,
      completed: locations.filter((l: any) => l.status === 'completed').length,
      suspended: locations.filter((l: any) => l.status === 'suspended').length
    };
    context += `\n## Locations: ${locations.length} total\n`;
    context += `- Active: ${byStatus.active}\n- Completed: ${byStatus.completed}\n- Suspended: ${byStatus.suspended}\n`;
    
    if (messageLower.includes('suspended')) {
      const suspended = locations.filter((l: any) => l.status === 'suspended');
      if (suspended.length > 0) {
        context += `\nSuspended Locations:\n`;
        for (const loc of suspended) {
          context += `- ${loc.locationName || loc.locationId}: ${loc.suspensionReason || 'No reason provided'}\n`;
        }
      }
    }
  }
  
  // If asking about budget
  if (messageLower.includes('budget') || messageLower.includes('cost') || messageLower.includes('money') ||
      messageLower.includes('$') || messageLower.includes('dollar')) {
    context += `\n## Budget Information Available\n`;
    context += `You can ask about specific project budgets by name.\n`;
  }
  
  return context;
}

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/chat/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/chat/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/chat/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/chat/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/chat/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const chatMessages = await chatStorage.getMessagesByConversation(conversationId);
      
      // Get relevant context from database
      const dbContext = await getRelevantContext(content);
      
      // Build messages with context
      const apiMessages = chatMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      
      // Add database context to the latest user message
      if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === "user") {
        apiMessages[apiMessages.length - 1].content = 
          `${apiMessages[apiMessages.length - 1].content}\n\n---\nContext from database:${dbContext}`;
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from Anthropic
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  // Quick query endpoint (no conversation history)
  app.post("/api/chat/query", async (req: Request, res: Response) => {
    try {
      const { question } = req.body;
      
      // Get relevant context from database
      const dbContext = await getRelevantContext(question);
      
      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `${question}\n\n---\nContext from database:${dbContext}`
        }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error with quick query:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process query" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process query" });
      }
    }
  });
}
