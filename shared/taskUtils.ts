// Task dependency and date shifting utilities

/**
 * Check if a date is a weekday (Monday-Friday)
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 1 = Monday, 5 = Friday
}

/**
 * Get the next weekday from a given date
 */
export function getNextWeekday(date: Date): Date {
  const nextDay = new Date(date);
  do {
    nextDay.setDate(nextDay.getDate() + 1);
  } while (!isWeekday(nextDay));
  return nextDay;
}

/**
 * Add weekdays to a date (skipping weekends)
 */
export function addWeekdays(date: Date, days: number): Date {
  let result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result = getNextWeekday(result);
    addedDays++;
  }
  
  return result;
}

/**
 * Calculate the difference in weekdays between two dates
 */
export function getWeekdayDifference(startDate: Date, endDate: Date): number {
  let current = new Date(startDate);
  let count = 0;
  
  while (current < endDate) {
    current.setDate(current.getDate() + 1);
    if (isWeekday(current)) {
      count++;
    }
  }
  
  return count;
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDateToString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse date string and return Date object
 */
export function parseDateString(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}

/**
 * Update task dependencies when a task date changes
 */
export function updateTaskDependencies(
  tasks: any[], 
  changedTaskId: string, 
  newDate: string,
  oldDate: string
): any[] {
  // Find the changed task and its position
  const changedTaskIndex = tasks.findIndex(task => task.taskId === changedTaskId || task.id === changedTaskId);
  if (changedTaskIndex === -1) return tasks;

  const updatedTasks = [...tasks];
  const changedTask = updatedTasks[changedTaskIndex];
  
  // Update the changed task's date
  updatedTasks[changedTaskIndex] = {
    ...changedTask,
    taskDate: newDate
  };

  // Instead of calculating difference, rebuild the sequence from the changed task forward
  // This ensures all subsequent dependent tasks follow the correct date sequence
  let currentDate = parseDateString(newDate);
  
  // Process all subsequent tasks and rebuild dependent task dates
  for (let i = changedTaskIndex + 1; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    
    // Only update dependent tasks
    if (task.dependentOnPrevious) {
      // Get the previous task's date
      const previousTask = updatedTasks[i - 1];
      const previousDate = parseDateString(previousTask.taskDate);
      
      // Calculate next workday after previous task
      const nextWorkday = getNextWeekday(previousDate);
      
      updatedTasks[i] = {
        ...task,
        taskDate: formatDateToString(nextWorkday)
      };
      
      currentDate = nextWorkday;
    } else {
      // For non-dependent tasks, keep their current date but update currentDate for next iteration
      currentDate = parseDateString(task.taskDate);
    }
  }

  return updatedTasks;
}

/**
 * Reorder tasks and update dependencies
 */
export function reorderTasksWithDependencies(
  tasks: any[],
  draggedTaskId: string,
  newPosition: number
): any[] {
  const updatedTasks = [...tasks];
  
  // Find the dragged task
  const draggedTaskIndex = updatedTasks.findIndex(task => 
    task.taskId === draggedTaskId || task.id === draggedTaskId
  );
  
  if (draggedTaskIndex === -1) return tasks;

  // Remove the dragged task and insert it at the new position
  const [draggedTask] = updatedTasks.splice(draggedTaskIndex, 1);
  updatedTasks.splice(newPosition, 0, draggedTask);

  // Update order values for all tasks
  const tasksWithUpdatedOrder = updatedTasks.map((task, index) => ({
    ...task,
    order: index
  }));

  // Re-align dependent tasks based on new sequence
  return realignDependentTasks(tasksWithUpdatedOrder);
}

/**
 * Re-align dependent tasks to follow previous task by one weekday
 */
export function realignDependentTasks(tasks: any[]): any[] {
  const updatedTasks = [...tasks];
  
  for (let i = 1; i < updatedTasks.length; i++) {
    const currentTask = updatedTasks[i];
    const previousTask = updatedTasks[i - 1];
    
    // Only re-align if current task is dependent on previous
    if (currentTask.dependentOnPrevious) {
      const previousDate = parseDateString(previousTask.taskDate);
      const nextWeekday = getNextWeekday(previousDate);
      
      updatedTasks[i] = {
        ...currentTask,
        taskDate: formatDateToString(nextWeekday)
      };
    }
  }
  
  return updatedTasks;
}

/**
 * Initialize task order when creating new tasks
 */
export function initializeTaskOrder(tasks: any[]): any[] {
  return tasks.map((task, index) => ({
    ...task,
    order: task.order ?? index,
    dependentOnPrevious: task.dependentOnPrevious ?? true
  }));
}

/**
 * Generate a unique linked task group ID
 */
export function generateLinkedTaskGroupId(): string {
  return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Link tasks to occur on the same date
 */
export function linkTasksToSameDate(
  tasks: any[],
  taskIds: string[],
  targetDate: string,
  groupId?: string
): any[] {
  if (taskIds.length < 2) return tasks;
  
  const linkedGroupId = groupId || generateLinkedTaskGroupId();
  const updatedTasks = [...tasks];
  
  // Update all specified tasks to have the same date and group ID
  taskIds.forEach(taskId => {
    const taskIndex = updatedTasks.findIndex(task => 
      task.taskId === taskId || task.id === taskId
    );
    
    if (taskIndex !== -1) {
      updatedTasks[taskIndex] = {
        ...updatedTasks[taskIndex],
        taskDate: targetDate,
        linkedTaskGroup: linkedGroupId,
        dependentOnPrevious: false // Linked tasks are not dependent on previous
      };
    }
  });
  
  return updatedTasks;
}

/**
 * Update all tasks in a linked group when one task's date changes
 */
export function updateLinkedTasksDate(
  tasks: any[],
  changedTaskId: string,
  newDate: string
): any[] {
  const changedTask = tasks.find(task => 
    task.taskId === changedTaskId || task.id === changedTaskId
  );
  
  if (!changedTask?.linkedTaskGroup) return tasks;
  
  const updatedTasks = [...tasks];
  
  // Update all tasks in the same linked group
  updatedTasks.forEach((task, index) => {
    if (task.linkedTaskGroup === changedTask.linkedTaskGroup) {
      updatedTasks[index] = {
        ...task,
        taskDate: newDate
      };
    }
  });
  
  return updatedTasks;
}

/**
 * Remove a task from its linked group
 */
export function unlinkTask(tasks: any[], taskId: string): any[] {
  const updatedTasks = [...tasks];
  const taskIndex = updatedTasks.findIndex(task => 
    task.taskId === taskId || task.id === taskId
  );
  
  if (taskIndex !== -1) {
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      linkedTaskGroup: null,
      dependentOnPrevious: true // Restore default dependency behavior
    };
  }
  
  return updatedTasks;
}

/**
 * Get all tasks in the same linked group
 */
export function getLinkedTasks(tasks: any[], taskId: string): any[] {
  const task = tasks.find(t => t.taskId === taskId || t.id === taskId);
  if (!task?.linkedTaskGroup) return [task];
  
  return tasks.filter(t => t.linkedTaskGroup === task.linkedTaskGroup);
}

/**
 * Handle linked task deletion - unlink partner tasks and set appropriate dependency
 */
export function handleLinkedTaskDeletion(
  tasks: any[],
  deletedTaskId: string | number
): { unlinkUpdates: any[]; remainingTasks: any[] } {
  const deletedTask = tasks.find(t => (t.taskId || t.id) === deletedTaskId);
  const unlinkUpdates: any[] = [];
  
  if (deletedTask?.linkedTaskGroup) {
    // Find partner tasks in the same linked group
    const linkedPartners = tasks.filter(t => 
      t.linkedTaskGroup === deletedTask.linkedTaskGroup && 
      (t.taskId || t.id) !== deletedTaskId
    );
    
    linkedPartners.forEach(partnerTask => {
      // If either task was sequential, make the remaining task sequential
      const shouldBeSequential = deletedTask.dependentOnPrevious || partnerTask.dependentOnPrevious;
      
      unlinkUpdates.push({
        ...partnerTask,
        linkedTaskGroup: null,
        dependentOnPrevious: shouldBeSequential
      });
    });
  }
  
  const remainingTasks = tasks.filter(t => (t.taskId || t.id) !== deletedTaskId);
  
  return { unlinkUpdates, remainingTasks };
}

/**
 * Enhanced dependency update that handles both sequential and linked tasks
 */
export function updateTaskDependenciesEnhanced(
  tasks: any[],
  changedTaskId: string,
  newDate: string,
  oldDate: string
): any[] {
  // First handle linked tasks
  let updatedTasks = updateLinkedTasksDate(tasks, changedTaskId, newDate);
  
  // Then handle sequential dependencies
  updatedTasks = updateTaskDependencies(updatedTasks, changedTaskId, newDate, oldDate);
  
  return updatedTasks;
}