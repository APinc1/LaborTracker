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
 * Find all tasks that are linked together (same date and linked = true)
 */
export function findLinkedTaskGroups(tasks: any[]): Map<string, any[]> {
  const linkedGroups = new Map<string, any[]>();
  
  // Group tasks by linkedTaskGroup OR by date if they're marked as linked
  const linkedTasks = tasks.filter((task: any) => task.linked || task.linkedTaskGroup);
  
  linkedTasks.forEach((task: any) => {
    // Use linkedTaskGroup as primary key, fallback to date
    const groupKey = task.linkedTaskGroup || (task.taskDate || task.date);
    if (!linkedGroups.has(groupKey)) {
      linkedGroups.set(groupKey, []);
    }
    linkedGroups.get(groupKey)!.push(task);
  });
  
  // Only return groups with more than 1 task
  const filteredGroups = new Map<string, any[]>();
  for (const [groupKey, group] of linkedGroups) {
    if (group.length > 1) {
      filteredGroups.set(groupKey, group);
    }
  }
  
  return filteredGroups;
}

/**
 * Find which linked group a task belongs to
 */
export function findTaskLinkedGroup(taskId: string, tasks: any[]): any[] | null {
  const linkedGroups = findLinkedTaskGroups(tasks);
  
  for (const [groupKey, group] of linkedGroups) {
    const foundTask = group.find((task: any) => 
      (task.taskId || task.id).toString() === taskId
    );
    if (foundTask) {
      return group;
    }
  }
  
  return null;
}

/**
 * Get all task IDs in the same linked group as the given task
 */
export function getLinkedGroupTaskIds(taskId: string, tasks: any[]): string[] {
  const linkedGroup = findTaskLinkedGroup(taskId, tasks);
  if (!linkedGroup) {
    return [taskId]; // Return the task itself
  }
  
  const groupIds = linkedGroup.map((task: any) => (task.taskId || task.id).toString());
  return groupIds;
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
 * Re-align only tasks that come AFTER a specific modified task
 */
export function realignDependentTasksAfter(tasks: any[], modifiedTaskId: string): any[] {
  console.log('🔄 REALIGN DEPENDENT TASKS AFTER: Starting targeted date realignment');
  console.log('Modified task ID:', modifiedTaskId);
  console.log('All task IDs in list:', tasks.map(t => ({ name: t.name, id: t.taskId || t.id, order: t.order })));
  
  // Sort tasks by their logical order
  const logicallyOrderedTasks = [...tasks].sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });
  
  // Find the modified task index
  const modifiedTaskIndex = logicallyOrderedTasks.findIndex(task => 
    (task.taskId || task.id) === modifiedTaskId
  );
  
  if (modifiedTaskIndex === -1) {
    console.log('🚫 Modified task not found, using full realignment');
    return realignDependentTasks(tasks);
  }
  
  console.log(`🎯 Found modified task at index ${modifiedTaskIndex}: "${logicallyOrderedTasks[modifiedTaskIndex].name}"`);
  console.log('Will only shift tasks after this one that are dependent');
  
  const updatedTasks = [...logicallyOrderedTasks];
  
  // Only process tasks AFTER the modified task
  console.log(`🎯 Will process tasks from index ${modifiedTaskIndex + 1} to ${updatedTasks.length - 1}`);
  
  let actualChanges = 0;
  for (let i = modifiedTaskIndex + 1; i < updatedTasks.length; i++) {
    const currentTask = updatedTasks[i];
    const previousTask = updatedTasks[i - 1];
    
    console.log(`🔍 Checking task ${i}: "${currentTask.name}" (order: ${currentTask.order}, sequential: ${currentTask.dependentOnPrevious})`);
    
    // Only re-align if current task is dependent on previous
    if (currentTask.dependentOnPrevious) {
      const previousDate = parseDateString(previousTask.taskDate);
      const nextWeekday = getNextWeekday(previousDate);
      const newDateString = formatDateToString(nextWeekday);
      
      console.log(`✅ SEQUENTIAL UPDATE (AFTER): "${currentTask.name}" ${currentTask.taskDate} → ${newDateString} (after "${previousTask.name}" on ${previousTask.taskDate})`);
      
      updatedTasks[i] = {
        ...currentTask,
        taskDate: newDateString
      };
      actualChanges++;
    } else {
      console.log(`⏭️ SKIPPING: "${currentTask.name}" is not sequential, keeping date ${currentTask.taskDate}`);
    }
  }
  
  console.log(`🔄 TARGETED REALIGNMENT COMPLETE: Made ${actualChanges} changes to tasks after modified task`);
  
  // Important: DO NOT modify tasks BEFORE the modified task
  console.log('🚫 Tasks BEFORE modified task should remain unchanged:');
  for (let i = 0; i < modifiedTaskIndex; i++) {
    console.log(`  ${i}: "${updatedTasks[i].name}" keeping date ${updatedTasks[i].taskDate}`);
  }
  
  // Return tasks in their original input order with updated dates
  const resultTasks = tasks.map(originalTask => {
    const updatedTask = updatedTasks.find(ut => 
      (ut.taskId || ut.id) === (originalTask.taskId || originalTask.id)
    );
    return updatedTask || originalTask;
  });
  
  return resultTasks;
}

/**
 * Re-align dependent tasks to follow previous task by one weekday
 */
export function realignDependentTasks(tasks: any[]): any[] {
  console.log('🔄 REALIGN DEPENDENT TASKS: Starting sequential date realignment');
  console.log('Input tasks:', tasks.map(t => ({ 
    name: t.name, 
    date: t.taskDate, 
    order: t.order, 
    sequential: t.dependentOnPrevious,
    linked: !!t.linkedTaskGroup 
  })));
  
  // CRITICAL: Sort tasks by their logical order (order field) for proper sequential processing
  // NOT by date or display order - sequential dependencies follow logical order
  const logicallyOrderedTasks = [...tasks].sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });
  
  console.log('🔧 Processing tasks in logical order:', logicallyOrderedTasks.map(t => ({ 
    name: t.name, 
    order: t.order, 
    date: t.taskDate, 
    sequential: t.dependentOnPrevious 
  })));
  
  const updatedTasks = [...logicallyOrderedTasks];
  
  // CRITICAL: Ensure the first task is never sequential (no previous task to depend on)
  if (updatedTasks.length > 0) {
    console.log(`🔧 FIRST TASK CHECK: "${updatedTasks[0].name}" order:${updatedTasks[0].order} sequential:${updatedTasks[0].dependentOnPrevious}`);
    if (updatedTasks[0].dependentOnPrevious) {
      console.log(`🔧 MAKING FIRST TASK NON-SEQUENTIAL: "${updatedTasks[0].name}" was sequential but is now first`);
      updatedTasks[0] = {
        ...updatedTasks[0],
        dependentOnPrevious: false
      };
    } else {
      console.log(`🔧 FIRST TASK ALREADY NON-SEQUENTIAL: "${updatedTasks[0].name}"`);
    }
  }
  
  for (let i = 1; i < updatedTasks.length; i++) {
    const currentTask = updatedTasks[i];
    const previousTask = updatedTasks[i - 1];
    
    console.log(`🔍 Checking task ${i}: "${currentTask.name}" (sequential: ${currentTask.dependentOnPrevious})`);
    
    // Only re-align if current task is dependent on previous
    if (currentTask.dependentOnPrevious) {
      // CRITICAL: Find the actual previous task by looking at the immediate predecessor
      // Don't skip over linked groups - respect the logical order sequence
      let actualPreviousTask = previousTask;
      
      // Special handling: If the previous task is part of a linked group,
      // use the latest date from that linked group as the reference
      if (actualPreviousTask.linkedTaskGroup) {
        // Find all tasks in the same linked group and use the one with the latest date
        const linkedGroupTasks = updatedTasks.filter(t => 
          t.linkedTaskGroup === actualPreviousTask.linkedTaskGroup
        );
        if (linkedGroupTasks.length > 0) {
          // Sort by date to find the latest task in the linked group
          linkedGroupTasks.sort((a, b) => new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime());
          actualPreviousTask = linkedGroupTasks[linkedGroupTasks.length - 1];
          console.log(`🔗 Previous task is in linked group, using latest task "${actualPreviousTask.name}" with date ${actualPreviousTask.taskDate}`);
        }
      }
      
      console.log(`🔧 DEBUG: Actual previous task "${actualPreviousTask.name}" date: ${actualPreviousTask.taskDate}`);
      const previousDate = parseDateString(actualPreviousTask.taskDate);
      console.log(`🔧 DEBUG: Parsed previous date:`, previousDate);
      console.log(`🔧 DEBUG: Previous date day of week: ${previousDate.getDay()} (0=Sun, 1=Mon, etc)`);
      const nextWeekday = getNextWeekday(previousDate);
      console.log(`🔧 DEBUG: Next weekday calculated:`, nextWeekday);
      console.log(`🔧 DEBUG: Next weekday day of week: ${nextWeekday.getDay()}`);
      const newDateString = formatDateToString(nextWeekday);
      console.log(`🔧 DEBUG: Formatted new date string: ${newDateString}`);
      
      console.log(`✅ SEQUENTIAL UPDATE: "${currentTask.name}" ${currentTask.taskDate} → ${newDateString} (after "${actualPreviousTask.name}" on ${actualPreviousTask.taskDate})`);
      
      updatedTasks[i] = {
        ...currentTask,
        taskDate: newDateString
      };
      
      // If this task is part of a linked group, update all tasks in the group
      if (currentTask.linkedTaskGroup) {
        console.log(`🔗 Updating linked group ${currentTask.linkedTaskGroup} to date ${newDateString}`);
        for (let j = 0; j < updatedTasks.length; j++) {
          if (updatedTasks[j].linkedTaskGroup === currentTask.linkedTaskGroup) {
            console.log(`  └─ Linked task "${updatedTasks[j].name}" ${updatedTasks[j].taskDate} → ${newDateString}`);
            updatedTasks[j] = {
              ...updatedTasks[j],
              taskDate: newDateString
            };
          }
        }
      }
    } else {
      console.log(`⏭️  Skipping non-sequential task: "${currentTask.name}"`);
    }
  }
  
  console.log('Output tasks:', updatedTasks.map(t => ({ 
    name: t.name, 
    date: t.taskDate, 
    order: t.order, 
    sequential: t.dependentOnPrevious,
    linked: !!t.linkedTaskGroup 
  })));
  
  // Return tasks in their original input order (for display), but with updated dates
  const resultTasks = tasks.map(originalTask => {
    const updatedTask = updatedTasks.find(ut => 
      (ut.taskId || ut.id) === (originalTask.taskId || originalTask.id)
    );
    return updatedTask || originalTask;
  });
  
  return resultTasks;
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
 * Handle linked task deletion - unlink partner tasks only if group becomes too small
 */
export function handleLinkedTaskDeletion(
  tasks: any[],
  deletedTaskId: string | number
): { unlinkUpdates: any[]; remainingTasks: any[] } {
  console.log('🔗 HANDLE LINKED TASK DELETION:', {
    deletedTaskId,
    totalTasks: tasks.length,
    taskDetails: tasks.map(t => ({ id: t.id || t.taskId, name: t.name, linkedGroup: t.linkedTaskGroup }))
  });
  
  const deletedTask = tasks.find(t => (t.id || t.taskId) === deletedTaskId);
  const unlinkUpdates: any[] = [];
  
  console.log('🔍 DELETED TASK DETAILS:', {
    found: !!deletedTask,
    task: deletedTask ? {
      id: deletedTask.id || deletedTask.taskId,
      name: deletedTask.name,
      linkedGroup: deletedTask.linkedTaskGroup,
      sequential: deletedTask.dependentOnPrevious
    } : null
  });
  
  if (deletedTask?.linkedTaskGroup) {
    // Find remaining tasks in the same linked group (after deletion)
    const linkedPartners = tasks.filter(t => 
      t.linkedTaskGroup === deletedTask.linkedTaskGroup && 
      (t.id || t.taskId) !== deletedTaskId
    );
    
    console.log('🔗 LINKED PARTNERS FOUND:', {
      count: linkedPartners.length,
      partners: linkedPartners.map(p => ({
        id: p.id || p.taskId,
        name: p.name,
        sequential: p.dependentOnPrevious,
        linkedGroup: p.linkedTaskGroup
      }))
    });
    
    // Only unlink if there's 1 or fewer tasks remaining
    // (A single task can't be "linked" to anything)
    if (linkedPartners.length <= 1) {
      console.log('🔓 UNLINKING: 1 or fewer partners remain');
      linkedPartners.forEach(partnerTask => {
        // If either task was sequential, make the remaining task sequential
        const shouldBeSequential = deletedTask.dependentOnPrevious || partnerTask.dependentOnPrevious;
        
        console.log('🔄 UNLINKING PARTNER:', {
          partnerName: partnerTask.name,
          deletedWasSequential: deletedTask.dependentOnPrevious,
          partnerWasSequential: partnerTask.dependentOnPrevious,
          shouldBeSequential
        });
        
        unlinkUpdates.push({
          ...partnerTask,
          linkedTaskGroup: null,
          dependentOnPrevious: shouldBeSequential
        });
      });
    } else if (linkedPartners.length >= 2) {
      console.log('🔗 KEEPING LINKED: 2+ partners remain');
      // If 2+ tasks remain linked, ensure the first one (lowest order) is sequential
      // if the deleted task was sequential
      if (deletedTask.dependentOnPrevious) {
        // Sort remaining tasks by order to find the new first task
        const sortedPartners = linkedPartners.sort((a, b) => (a.order || 0) - (b.order || 0));
        const newFirstTask = sortedPartners[0];
        
        // Make the new first task sequential, others stay as they are
        unlinkUpdates.push({
          ...newFirstTask,
          dependentOnPrevious: true
        });
      }
    }
  } else {
    console.log('⏭️  SKIP UNLINKING: Task has no linked group');
  }
  
  const remainingTasks = tasks.filter(t => (t.id || t.taskId) !== deletedTaskId);
  
  console.log('🎯 UNLINKING FINAL RESULT:', {
    unlinkUpdatesCount: unlinkUpdates.length,
    unlinkUpdates: unlinkUpdates.map(u => ({
      id: u.id || u.taskId,
      name: u.name,
      newLinkedGroup: u.linkedTaskGroup,
      newSequential: u.dependentOnPrevious
    }))
  });
  
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

/**
 * Get task completion status based on assignments
 */
export function getTaskStatus(task: any, assignments: any[] = []): string {
  // Use the actual status from the database if available
  if (task?.status) {
    return task.status;
  }
  
  // Get all assignments for this task
  const taskAssignments = assignments.filter((assignment: any) => 
    assignment.taskId === task?.id || assignment.taskId === task?.taskId
  );
  
  // Task is complete if ALL assignments have actual hours recorded (including 0)
  if (taskAssignments.length > 0) {
    const allAssignmentsHaveActualHours = taskAssignments.every((assignment: any) => 
      assignment.actualHours !== null && assignment.actualHours !== undefined
    );
    
    if (allAssignmentsHaveActualHours) {
      return 'complete';
    }
  }
  
  // Fallback logic for backwards compatibility
  const currentDate = new Date().toISOString().split('T')[0];
  
  if (task?.actualHours && parseFloat(task.actualHours) > 0) {
    return 'complete';
  } else if (task?.taskDate === currentDate) {
    return 'in_progress';
  } else {
    return 'upcoming';
  }
}