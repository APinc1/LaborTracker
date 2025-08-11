import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import {
  CSS
} from '@dnd-kit/utilities';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, GripVertical, Edit, CheckCircle, Play, AlertCircle, Trash2, User, Link } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { reorderTasksWithDependencies, realignDependentTasks } from '@shared/taskUtils';
import { calculateRemainingHours, getRemainingHoursIndicator } from '@/lib/remainingHours';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DraggableTaskListProps {
  tasks: any[];
  locationId: string;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  onTaskUpdate: () => void;
  budgetItems?: any[];
  showRemainingHours?: boolean;
}

interface SortableTaskItemProps {
  task: any;
  tasks: any[];
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  employees: any[];
  assignments: any[];
  budgetItems?: any[];
  showRemainingHours?: boolean;
}

// Helper function to determine task status - checks if all assignments have actual hours recorded
const getTaskStatus = (task: any, assignments: any[] = []) => {
  // Use the actual status from the database if available
  if (task.status) {
    return task.status;
  }
  
  // Get all assignments for this task
  const taskAssignments = assignments.filter(assignment => 
    assignment.taskId === task.id || assignment.taskId === task.taskId
  );
  
  // Task is complete if ALL assignments have actual hours recorded (including 0)
  if (taskAssignments.length > 0) {
    const allAssignmentsHaveActualHours = taskAssignments.every(assignment => 
      assignment.actualHours !== null && assignment.actualHours !== undefined
    );
    
    if (allAssignmentsHaveActualHours) {
      return 'complete';
    }
  }
  
  // Fallback logic for backwards compatibility
  const currentDate = new Date().toISOString().split('T')[0];
  
  if (task.actualHours && parseFloat(task.actualHours) > 0) {
    return 'complete';
  } else if (task.taskDate === currentDate) {
    return 'in_progress';
  } else {
    return 'upcoming';
  }
};

// Individual sortable task item component
function SortableTaskItem({ task, tasks, onEditTask, onDeleteTask, onAssignTask, employees, assignments, budgetItems, showRemainingHours }: SortableTaskItemProps) {
  // Disable drag and drop for completed tasks
  const isTaskComplete = getTaskStatus(task, assignments) === 'complete';
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: task.taskId || task.id,
    disabled: isTaskComplete
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : 'none', // Disable all transitions to prevent snap-back
    opacity: isDragging ? 0.8 : 1,
    scale: isDragging ? 1.02 : 1,
    zIndex: isDragging ? 50 : 1
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Play className="w-4 h-4 text-blue-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date';
    try {
      // Handle both ISO date strings and simple date strings
      // For ISO dates like 2025-08-11T00:00:00.000Z, use UTC to avoid timezone issues
      const date = new Date(dateString);
      
      // Use UTC methods to avoid local timezone shifting dates
      const utcMonth = date.getUTCMonth();
      const utcDay = date.getUTCDate();
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      return `${months[utcMonth]} ${utcDay}`;
    } catch {
      return 'Invalid date';
    }
  };

  // Calculate "Day x of y" for cost code
  const getTaskDayInfo = (task: any, allTasks: any[]) => {
    const tasksForCostCode = allTasks
      .filter(t => t.costCode === task.costCode)
      .sort((a, b) => new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime());
    
    const taskIndex = tasksForCostCode.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
    const dayNumber = taskIndex + 1;
    const totalDays = tasksForCostCode.length;
    
    return totalDays > 1 ? `Day ${dayNumber} of ${totalDays}` : null;
  };



  // Get assigned employees for this task
  const getAssignedEmployees = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter(assignment => 
      assignment.taskId === taskId
    );
    
    return taskAssignments.map(assignment => {
      const employee = employees.find(emp => emp.id === assignment.employeeId);
      if (!employee) return null;
      
      return {
        ...employee,
        assignedHours: assignment.assignedHours
      };
    }).filter(Boolean);
  };

  // Format assigned employees display
  const formatAssignedEmployees = (assignedEmployees: any[]) => {
    if (assignedEmployees.length === 0) return null;
    
    // Sort employees: foremen first, drivers last, others in between
    const sortedEmployees = [...assignedEmployees].sort((a, b) => {
      if (a.isForeman && !b.isForeman) return -1;
      if (!a.isForeman && b.isForeman) return 1;
      if (a.primaryTrade === 'Driver' && b.primaryTrade !== 'Driver') return 1;
      if (a.primaryTrade !== 'Driver' && b.primaryTrade === 'Driver') return -1;
      return 0;
    });

    return sortedEmployees.map((employee, index) => {
      const hours = parseFloat(employee.assignedHours);
      const isDriver = employee.primaryTrade === 'Driver';
      const isForeman = employee.isForeman;
      const showHours = hours !== 8;
      
      let displayText = employee.name;
      if (isDriver) {
        displayText += ' (Driver)';
      }
      if (showHours) {
        displayText += ` (${hours}h)`;
      }
      
      return (
        <div 
          key={employee.id} 
          className={`text-xs ${isForeman ? 'font-bold' : ''} ${
            index === 0 ? '' : 'mt-1'
          }`}
        >
          {displayText}
        </div>
      );
    });
  };

  const assignedEmployees = getAssignedEmployees(task);
  const assignedEmployeesDisplay = formatAssignedEmployees(assignedEmployees);
  
  // Calculate total scheduled hours from assignments
  const calculateScheduledHours = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter(assignment => 
      assignment.taskId === taskId
    );
    
    const totalHours = taskAssignments.reduce((sum, assignment) => {
      return sum + parseFloat(assignment.assignedHours || 0);
    }, 0);
    
    return totalHours;
  };

  // Calculate total actual hours from assignments
  const calculateActualHours = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter(assignment => 
      assignment.taskId === taskId
    );
    
    const totalHours = taskAssignments.reduce((sum, assignment) => {
      return sum + parseFloat(assignment.actualHours || 0);
    }, 0);
    
    return totalHours;
  };

  const totalScheduledHours = calculateScheduledHours(task);
  const totalActualHours = calculateActualHours(task);

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={`mb-2 transition-all duration-200 ${
        isTaskComplete 
          ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-75' 
          : isDragging 
            ? 'shadow-xl border-blue-300 bg-blue-50 cursor-grabbing' 
            : 'hover:shadow-md cursor-grab'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            {/* Drag handle */}
            <div 
              {...(isTaskComplete ? {} : listeners)} 
              className={isTaskComplete ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
            >
              <GripVertical className={`w-4 h-4 ${isTaskComplete ? 'text-gray-300' : 'text-gray-400'}`} />
            </div>

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                {getStatusIcon(getTaskStatus(task, assignments))}
                <h4 className="font-medium text-sm truncate">{task.name}</h4>
                {getTaskDayInfo(task, tasks) && (
                  <Badge variant="secondary" className="text-xs">
                    {getTaskDayInfo(task, tasks)}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-xs text-gray-600">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(task.taskDate)}</span>
                </div>
                
                {totalScheduledHours > 0 && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{totalScheduledHours.toFixed(1)}h scheduled</span>
                    {totalActualHours > 0 && (
                      <span className="text-green-600">/ {totalActualHours.toFixed(1)}h actual</span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="text-xs">
                    {task.costCode}
                  </Badge>
                  
                  {/* Add remaining hours display using API data */}
                  {showRemainingHours && task.budgetHours !== undefined && task.remainingHours !== undefined && (() => {
                    // Use API-provided remaining hours data
                    const budgetHours = task.budgetHours || 0;
                    const remainingHours = task.remainingHours || 0;
                    const hoursStatus = task.hoursStatus || 'red';
                    
                    // Only show if there's budget data
                    if (budgetHours <= 0) return null;
                    
                    // Determine styling based on API status
                    let className = 'px-2 py-1 rounded text-xs font-medium';
                    switch (hoursStatus) {
                      case 'green':
                        className += ' text-green-700 bg-green-50 border border-green-200';
                        break;
                      case 'yellow':
                        className += ' text-yellow-700 bg-yellow-50 border border-yellow-200';
                        break;
                      case 'red':
                        className += ' text-red-700 bg-red-50 border border-red-200';
                        break;
                      default:
                        className += ' text-gray-700 bg-gray-50 border border-gray-200';
                    }
                    
                    return (
                      <div className={className}>
                        {remainingHours.toFixed(1)}h remaining
                      </div>
                    );
                  })()}
                </div>
                
                {task.dependentOnPrevious && (
                  <Badge variant="outline" className="text-xs text-blue-600">
                    Sequential
                  </Badge>
                )}
                
                {task.linkedTaskGroup && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    Linked
                  </Badge>
                )}
              </div>

              {/* Assigned employees */}
              {assignedEmployeesDisplay && assignedEmployeesDisplay.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-gray-700">
                    {assignedEmployeesDisplay}
                  </div>
                </div>
              )}
            </div>

            {/* Status badge */}
            <Badge className={`text-xs ${getStatusColor(getTaskStatus(task))}`}>
              {getTaskStatus(task) === 'in_progress' ? 'In Progress' : 
               getTaskStatus(task) === 'complete' ? 'Complete' : 'Upcoming'}
            </Badge>

            {/* Action buttons */}
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditTask(task)}
                className="h-8 w-8 p-0"
              >
                <Edit className="w-3 h-3" />
              </Button>
              {onAssignTask && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAssignTask(task)}
                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                >
                  <User className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteTask(task)}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DraggableTaskList({ 
  tasks, 
  locationId, 
  onEditTask, 
  onDeleteTask,
  onAssignTask,
  onTaskUpdate,
  budgetItems = [],
  showRemainingHours = false
}: DraggableTaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use budget items passed from parent component



  // Link confirmation dialog disabled for now to prevent crashes

  // Fetch employees and assignments for task display
  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Enhanced sorting that properly groups linked tasks and positions them chronologically
  const sortedTasks = (() => {
    // Group tasks by their linked group (if any)
    const linkedGroups = new Map<string, any[]>();
    const unlinkedTasks: any[] = [];
    
    tasks.forEach(task => {
      if (task.linkedTaskGroup) {
        if (!linkedGroups.has(task.linkedTaskGroup)) {
          linkedGroups.set(task.linkedTaskGroup, []);
        }
        linkedGroups.get(task.linkedTaskGroup)!.push(task);
      } else {
        unlinkedTasks.push(task);
      }
    });
    
    // Convert linked groups to sortable units (use earliest order/date as group position)
    const sortableUnits: any[] = [];
    
    // Add unlinked tasks as individual units
    unlinkedTasks.forEach(task => {
      sortableUnits.push({
        type: 'single',
        task: task,
        sortOrder: task.order ?? 999,
        sortDate: new Date(task.taskDate).getTime(),
        tasks: [task]
      });
    });
    
    // Add linked groups as group units
    linkedGroups.forEach(groupTasks => {
      // Since linked tasks should all have the same date, use that date for positioning
      // Sort tasks within the group by their original order for internal consistency
      const sortedGroupTasks = [...groupTasks].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime();
      });
      
      // Use the date from any task in the group (they should all be the same)
      // But find the position where this date should appear chronologically
      const groupDate = new Date(groupTasks[0].taskDate).getTime();
      
      // To position the group correctly, we need to find where this date falls
      // in the overall chronological order, not use the earliest order number
      sortableUnits.push({
        type: 'group',
        task: sortedGroupTasks[0], // Representative task for fallback sorting
        sortOrder: 999, // Don't use order for positioning groups
        sortDate: groupDate, // Use the group's target date
        tasks: sortedGroupTasks
      });
    });
    
    // Sort the units by date first for proper chronological positioning
    sortableUnits.sort((a, b) => {
      // Primary sort: by date for chronological order
      if (a.sortDate !== b.sortDate) {
        return a.sortDate - b.sortDate;
      }
      
      // Secondary sort: by order for tasks on the same date
      // But only use order if both are unlinked tasks (not groups)
      if (a.type === 'single' && b.type === 'single') {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
      }
      
      // Final fallback to ID comparison
      return (a.task.taskId || a.task.id).localeCompare(b.task.taskId || b.task.id);
    });
    
    // Flatten the sorted units back into a task array
    const result: any[] = [];
    sortableUnits.forEach(unit => {
      result.push(...unit.tasks);
    });
    
    return result;
  })();

  console.log('DraggableTaskList - Task ordering:', sortedTasks.map(t => ({ 
    name: t.name, 
    order: t.order, 
    date: t.taskDate, 
    linked: !!t.linkedTaskGroup,
    sequential: t.dependentOnPrevious 
  })));

  const batchUpdateTasksMutation = useMutation({
    mutationFn: async (updatedTasks: any[]) => {
      // Update each task individually
      const promises = updatedTasks.map(taskData => 
        apiRequest('PUT', `/api/tasks/${taskData.id}`, taskData)
      );
      
      const responses = await Promise.all(promises);
      return responses.map(response => response.json());
    },
    onSuccess: () => {
      // Immediately invalidate cache to refresh data and prevent visual issues
      queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "tasks"] });
      onTaskUpdate();
    },
    onError: (error: any) => {
      // Revert the UI on error
      queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "tasks"] });
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reorder tasks", 
        variant: "destructive" 
      });
    },
  });

  // Handle linking the dragged task to the linked group
  // Dialog handlers removed to prevent crashes

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('🚀 DRAG END EVENT TRIGGERED:', { activeId: event.active.id, overId: event.over?.id });
    const { active, over } = event;

    if (!over || active.id === over.id) {
      console.log('🚫 DRAG END: No valid target or same position');
      return;
    }

    const oldIndex = sortedTasks.findIndex(task => (task.taskId || task.id) === active.id);
    const newIndex = sortedTasks.findIndex(task => (task.taskId || task.id) === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Prevent dragging tasks before any completed tasks
    const draggedTask = sortedTasks[oldIndex];
    const targetTask = sortedTasks[newIndex];
    
    console.log('🔍 DRAG VALIDATION:', {
      draggedTask: draggedTask.name,
      draggedStatus: draggedTask.status,
      targetTask: targetTask.name,
      targetStatus: targetTask.status,
      oldIndex,
      newIndex
    });
    
    // Check if there are any completed tasks before or at the target position
    const completedTasksAtOrBeforeTarget = sortedTasks.slice(0, newIndex + 1).filter(t => getTaskStatus(t, assignments as any[]) === 'complete');
    
    console.log('🔍 COMPLETED TASKS CHECK:', {
      completedTasksAtOrBeforeTarget: completedTasksAtOrBeforeTarget.map(t => ({ name: t.name, status: getTaskStatus(t, assignments as any[]) })),
      count: completedTasksAtOrBeforeTarget.length
    });
    
    if (completedTasksAtOrBeforeTarget.length > 0 && getTaskStatus(draggedTask, assignments as any[]) !== 'complete') {
      console.log('🚫 DRAG END: Cannot drag task before completed tasks');
      toast({
        title: "Invalid Move",
        description: "Cannot move tasks before completed tasks",
        variant: "destructive"
      });
      return;
    }

    // Prevent dragging completed tasks
    if (getTaskStatus(draggedTask, assignments as any[]) === 'complete') {
      console.log('🚫 DRAG END: Cannot drag completed tasks');
      toast({
        title: "Invalid Move", 
        description: "Cannot move completed tasks",
        variant: "destructive"
      });
      return;
    }

    console.log('Drag operation:', { 
      draggedTask: sortedTasks[oldIndex].name, 
      targetTask: sortedTasks[newIndex].name,
      oldIndex, 
      newIndex,
      draggedDate: sortedTasks[oldIndex].taskDate,
      targetDate: sortedTasks[newIndex].taskDate,
      activeId: active.id,
      overId: over.id
    });

    const originalDraggedTask = sortedTasks[oldIndex];
    
    console.log('🔍 DRAG TASK ANALYSIS:', {
      draggedTask: originalDraggedTask.name,
      draggedLinkedGroup: originalDraggedTask.linkedTaskGroup,
      isDraggedTaskLinked: !!originalDraggedTask.linkedTaskGroup,
      willCheckForLinking: !originalDraggedTask.linkedTaskGroup
    });
    
    // Simple drag-and-drop reordering without complex linking logic
    console.log('🔄 Simple reorder: ', { 
      draggedTask: originalDraggedTask.name, 
      fromIndex: oldIndex, 
      toIndex: newIndex 
    });

    // Handle reordering - linked tasks move as groups
    let reorderedTasks: any[];
    
    if (originalDraggedTask.linkedTaskGroup) {
      // CRITICAL: For linked tasks, move the entire group as a unit
      console.log('Moving linked task group:', originalDraggedTask.linkedTaskGroup);
      
      // Find all tasks in the dragged group
      const draggedGroupTasks = sortedTasks.filter(t => 
        t.linkedTaskGroup === originalDraggedTask.linkedTaskGroup
      );
      
      // Check if we're actually changing the group's position
      const groupStartIndex = Math.min(...draggedGroupTasks.map(t => sortedTasks.indexOf(t)));
      const groupEndIndex = Math.max(...draggedGroupTasks.map(t => sortedTasks.indexOf(t)));
      
      // If the new position is within the current group bounds, it's not really moving
      if (newIndex >= groupStartIndex && newIndex <= groupEndIndex) {
        console.log('Dragging within same linked group bounds - no actual movement');
        return;
      }
      
      console.log('Moving linked group from positions', groupStartIndex, '-', groupEndIndex, 'to position', newIndex);
      
      // Find all other tasks (not in the dragged group)  
      const otherTasks = sortedTasks.filter(t => 
        t.linkedTaskGroup !== originalDraggedTask.linkedTaskGroup
      );
      
      // Determine where to insert the group
      let insertPosition = 0;
      
      if (newIndex < groupStartIndex) {
        // Moving group earlier - find position in other tasks
        const nonGroupTasksBeforeNewIndex = sortedTasks.slice(0, newIndex).filter(t => 
          t.linkedTaskGroup !== originalDraggedTask.linkedTaskGroup
        );
        insertPosition = nonGroupTasksBeforeNewIndex.length;
      } else {
        // Moving group later - find position in other tasks
        const nonGroupTasksBeforeNewIndex = sortedTasks.slice(0, newIndex + 1).filter(t => 
          t.linkedTaskGroup !== originalDraggedTask.linkedTaskGroup
        );
        insertPosition = nonGroupTasksBeforeNewIndex.length;
      }
      
      // Insert the group at the calculated position
      const beforeTarget = otherTasks.slice(0, insertPosition);
      const afterTarget = otherTasks.slice(insertPosition);
      
      reorderedTasks = [...beforeTarget, ...draggedGroupTasks, ...afterTarget];
      console.log('Reordered task names:', reorderedTasks.map(t => t.name));
    } else {
      // Normal reordering for non-linked tasks
      reorderedTasks = arrayMove(sortedTasks, oldIndex, newIndex);
    }

    // Apply intelligent reordering with smart date handling
    let tasksWithUpdatedOrder = reorderedTasks.map((task, index) => ({
      ...task,
      order: index
    }));

    const draggedTaskNewIndex = tasksWithUpdatedOrder.findIndex(t => (t.taskId || t.id) === active.id);
    const reorderedDraggedTask = tasksWithUpdatedOrder[draggedTaskNewIndex];
    
    // Intelligent date assignment based on task movement
    if (draggedTaskNewIndex >= 0) {
      const previousTask = draggedTaskNewIndex > 0 ? tasksWithUpdatedOrder[draggedTaskNewIndex - 1] : null;
      const nextTask = draggedTaskNewIndex < tasksWithUpdatedOrder.length - 1 ? tasksWithUpdatedOrder[draggedTaskNewIndex + 1] : null;
      
      console.log('Task positioning:', {
        draggedTask: reorderedDraggedTask.name,
        newIndex: draggedTaskNewIndex,
        previousTask: previousTask?.name,
        previousDate: previousTask?.taskDate,
        nextTask: nextTask?.name,
        nextDate: nextTask?.taskDate,
        isDraggedDependent: reorderedDraggedTask.dependentOnPrevious
      });
      
      // If moving to first position
      if (draggedTaskNewIndex === 0) {
        // Take the date of the original first task
        const originalFirstTask = tasksWithUpdatedOrder[1]; // Now at position 1
        if (originalFirstTask) {
          reorderedDraggedTask.taskDate = originalFirstTask.taskDate;
          
          // CRITICAL: When a task moves to first position, the displaced task should become sequential
          // This maintains the dependency chain - the displaced task now depends on the new first task
          console.log('Making displaced task sequential:', originalFirstTask.name, 'was:', originalFirstTask.dependentOnPrevious);
          originalFirstTask.dependentOnPrevious = true;
          
          // If there are linked tasks with the original first, sync their status too
          if (originalFirstTask.linkedTaskGroup) {
            tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
              if (task.linkedTaskGroup === originalFirstTask.linkedTaskGroup) {
                console.log('Making linked task sequential:', task.name);
                return { ...task, dependentOnPrevious: true };
              }
              return task;
            });
          }
        }
        
        // CRITICAL: First task must always be non-sequential
        console.log('Making first task unsequential:', reorderedDraggedTask.name, 'was:', reorderedDraggedTask.dependentOnPrevious);
        reorderedDraggedTask.dependentOnPrevious = false;
        
        // If dragged task has linked partners, make them all unsequential too
        if (reorderedDraggedTask.linkedTaskGroup) {
          tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
            if (task.linkedTaskGroup === reorderedDraggedTask.linkedTaskGroup) {
              console.log('Making linked task unsequential:', task.name);
              return { ...task, dependentOnPrevious: false };
            }
            return task;
          });
        }
      } 
      // For other positions, determine the best date for this position
      else if (previousTask) {
        // When moving before a sequential task, adopt that task's date
        if (nextTask && nextTask.dependentOnPrevious) {
          console.log('Assigning new date:', {
            taskName: reorderedDraggedTask.name,
            oldDate: reorderedDraggedTask.taskDate,
            newDate: nextTask.taskDate
          });
          reorderedDraggedTask.taskDate = nextTask.taskDate;
          // If dragged task has linked partners, sync their dates too
          if (reorderedDraggedTask.linkedTaskGroup) {
            tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
              if (task.linkedTaskGroup === reorderedDraggedTask.linkedTaskGroup) {
                return { ...task, taskDate: nextTask.taskDate };
              }
              return task;
            });
          }
        }
        // Otherwise, calculate proper date based on dependency
        else {
          let targetDate: string;
          
          if (reorderedDraggedTask.dependentOnPrevious) {
            // Dependent tasks follow the previous task (next workday)
            const previousDate = new Date(previousTask.taskDate + 'T00:00:00');
            const nextWorkday = new Date(previousDate);
            nextWorkday.setDate(nextWorkday.getDate() + 1);
            
            // Skip weekends
            while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6) {
              nextWorkday.setDate(nextWorkday.getDate() + 1);
            }
            
            targetDate = nextWorkday.toISOString().split('T')[0];
          } else {
            // Non-dependent tasks: when moving to earlier dates, adopt the existing date
            const currentDate = new Date(reorderedDraggedTask.taskDate + 'T00:00:00');
            const previousDate = new Date(previousTask.taskDate + 'T00:00:00');
          
          // If moving to an earlier position (date), adopt the previous task's date to avoid gaps
          if (currentDate > previousDate) {
            targetDate = previousTask.taskDate; // Adopt the earlier date
            console.log('Adopting earlier date to avoid gaps:', previousTask.taskDate);
          } else {
            // If there's a next task, try to fit between previous and next
            if (nextTask) {
              const nextDate = new Date(nextTask.taskDate + 'T00:00:00');
              
              // Try to place it the day after previous task
              const candidateDate = new Date(previousDate);
              candidateDate.setDate(candidateDate.getDate() + 1);
              
              // Skip weekends
              while (candidateDate.getDay() === 0 || candidateDate.getDay() === 6) {
                candidateDate.setDate(candidateDate.getDate() + 1);
              }
              
              // If candidate date is before next task's date, use it; otherwise use original
              if (candidateDate < nextDate) {
                targetDate = candidateDate.toISOString().split('T')[0];
              } else {
                targetDate = reorderedDraggedTask.taskDate; // Keep original
              }
            } else {
              // No next task, place after previous task
              const nextWorkday = new Date(previousDate);
              nextWorkday.setDate(nextWorkday.getDate() + 1);
              
              // Skip weekends
              while (nextWorkday.getDay() === 0 || nextWorkday.getDay() === 6) {
                nextWorkday.setDate(nextWorkday.getDate() + 1);
              }
              
              targetDate = nextWorkday.toISOString().split('T')[0];
            }
          }
          
          console.log('Assigning new date:', { taskName: reorderedDraggedTask.name, oldDate: reorderedDraggedTask.taskDate, newDate: targetDate });
          reorderedDraggedTask.taskDate = targetDate;
          
          // If dragged task has linked partners, sync their dates too
          if (reorderedDraggedTask.linkedTaskGroup) {
            tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
              if (task.linkedTaskGroup === reorderedDraggedTask.linkedTaskGroup) {
                return { ...task, taskDate: targetDate };
              }
              return task;
            });
          }
        }
      }
      
      // Ensure linked tasks maintain same dates and proper ordering
      const linkedGroups = new Map();
      tasksWithUpdatedOrder.forEach((task, index) => {
        if (task.linkedTaskGroup) {
          if (!linkedGroups.has(task.linkedTaskGroup)) {
            linkedGroups.set(task.linkedTaskGroup, []);
          }
          linkedGroups.get(task.linkedTaskGroup).push({ task, index });
        }
      });

      linkedGroups.forEach((groupTasks, groupId) => {
        if (groupTasks.length > 1) {
          // Sort by current position to maintain relative order within the group
          groupTasks.sort((a: any, b: any) => a.index - b.index);
          const primaryDate = groupTasks[0].task.taskDate;
          
          // Sync all linked tasks to the same date and maintain their dependency structure
          groupTasks.forEach(({ task, index }: any, groupIndex: number) => {
            tasksWithUpdatedOrder[index].taskDate = primaryDate;
            
            // Maintain dependency structure within linked group:
            // First task in linked group handles external dependencies
            // Subsequent tasks in group are non-sequential (linked)
            if (groupIndex === 0) {
              // First task in linked group keeps its current dependency status
              // (could be sequential to previous non-linked task or non-sequential if first overall)
              if (index === 0) {
                // First task in entire list is never sequential
                tasksWithUpdatedOrder[index].dependentOnPrevious = false;
              }
              // else: keep existing dependency status for first task in group
            } else {
              // Subsequent tasks in linked group are always non-sequential
              tasksWithUpdatedOrder[index].dependentOnPrevious = false;
            }
          });
        }
      });
    }
      
      // Always rebuild the entire dependency chain after reordering
      // This handles both the dropped position and tasks that shifted to fill gaps
      console.log('Rebuilding dependency chain for entire task sequence');
      
      const processedLinkedGroups = new Set();
      
      for (let i = 0; i < tasksWithUpdatedOrder.length; i++) {
        const currentTask = tasksWithUpdatedOrder[i];
        
        // Skip the first task (can't be dependent)
        if (i === 0) {
          if (currentTask.dependentOnPrevious) {
            console.log('CRITICAL: Enforcing first task unsequential in rebuild:', currentTask.name);
            currentTask.dependentOnPrevious = false;
          }
          continue;
        }
        
        // Only update dates for dependent tasks - DON'T change dependency status here
        // The dependency status was already set correctly in the drag logic above
        if (!currentTask.dependentOnPrevious) continue;
        
        const prevTask = tasksWithUpdatedOrder[i - 1];
        const prevDate = new Date(prevTask.taskDate + 'T00:00:00');
        const nextDay = new Date(prevDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        // Skip weekends
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
          nextDay.setDate(nextDay.getDate() + 1);
        }
        
        const newDate = nextDay.toISOString().split('T')[0];
        
        // Handle linked tasks: update ALL tasks in the linked group to same date
        if (currentTask.linkedTaskGroup && !processedLinkedGroups.has(currentTask.linkedTaskGroup)) {
          processedLinkedGroups.add(currentTask.linkedTaskGroup);
          
          // Find all tasks in this linked group and sync them to the new date
          tasksWithUpdatedOrder.forEach((task, index) => {
            if (task.linkedTaskGroup === currentTask.linkedTaskGroup) {
              console.log('Syncing linked task:', task.name, 'to:', newDate);
              task.taskDate = newDate;
            }
          });
        } 
        // Handle non-linked sequential tasks normally
        else if (!currentTask.linkedTaskGroup) {
          // Update if date changes
          if (currentTask.taskDate !== newDate) {
            console.log('Rebuilding dependent task date:', { 
              taskName: currentTask.name, 
              position: i,
              oldDate: currentTask.taskDate, 
              newDate,
              previousTask: prevTask.name,
              previousDate: prevTask.taskDate,
              reason: 'Full sequence rebuild after reorder'
            });
            currentTask.taskDate = newDate;
          }
        }
      }
      
      // Always ensure first task is not dependent
      if (tasksWithUpdatedOrder.length > 0 && tasksWithUpdatedOrder[0].dependentOnPrevious) {
        tasksWithUpdatedOrder[0].dependentOnPrevious = false;
      }
    }

    console.log('Before realignDependentTasks:', tasksWithUpdatedOrder.map(t => ({ 
      name: t.name, date: t.taskDate, order: t.order, sequential: t.dependentOnPrevious 
    })));

    // CRITICAL: Apply sequential date logic to ensure proper date alignment
    const finalOrderedTasks = realignDependentTasks(tasksWithUpdatedOrder);
    
    console.log('After realignDependentTasks:', finalOrderedTasks.map(t => ({ 
      name: t.name, date: t.taskDate, order: t.order, sequential: t.dependentOnPrevious 
    })));

    // Batch update all affected tasks
    batchUpdateTasksMutation.mutate(finalOrderedTasks);
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No tasks scheduled for this location</p>
        <p className="text-sm mt-2">Generate tasks from budget items to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Task Schedule</h3>
        <div className="text-sm text-gray-600">
          Drag tasks to reorder • Dependencies auto-update
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedTasks.map(task => task.taskId || task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sortedTasks.map((task) => (
              <SortableTaskItem
                key={task.taskId || task.id}
                task={task}
                tasks={sortedTasks}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onAssignTask={onAssignTask}
                employees={employees as any[]}
                assignments={assignments as any[]}
                budgetItems={budgetItems}
                showRemainingHours={showRemainingHours}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {batchUpdateTasksMutation.isPending && (
        <div className="text-center py-2">
          <div className="text-sm text-gray-600">Updating task dependencies...</div>
        </div>
      )}
      {/* Link Confirmation Dialog - Disabled for now to prevent crashes */}
    </div>
  );
}