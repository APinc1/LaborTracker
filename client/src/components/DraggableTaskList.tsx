import React from 'react';
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
import { Calendar, Clock, GripVertical, Edit, CheckCircle, Play, AlertCircle, Trash2, User } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { reorderTasksWithDependencies, realignDependentTasks } from '@shared/taskUtils';

interface DraggableTaskListProps {
  tasks: any[];
  locationId: string;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  onTaskUpdate: () => void;
}

interface SortableTaskItemProps {
  task: any;
  tasks: any[];
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  employees: any[];
  assignments: any[];
}

// Individual sortable task item component
function SortableTaskItem({ task, tasks, onEditTask, onDeleteTask, onAssignTask, employees, assignments }: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.taskId || task.id });

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
      return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
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

  // Helper function to determine task status
  const getTaskStatus = (task: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (task.actualHours && parseFloat(task.actualHours) > 0) {
      return 'complete';
    } else if (task.taskDate === currentDate) {
      return 'in_progress';
    } else {
      return 'upcoming';
    }
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

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={`mb-2 cursor-grab active:cursor-grabbing transition-all duration-200 ${
        isDragging ? 'shadow-xl border-blue-300 bg-blue-50' : 'hover:shadow-md'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            {/* Drag handle */}
            <div {...listeners} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="w-4 h-4 text-gray-400" />
            </div>

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                {getStatusIcon(getTaskStatus(task))}
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
                
                {task.scheduledHours && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{parseFloat(task.scheduledHours).toFixed(1)}h</span>
                  </div>
                )}
                
                <Badge variant="secondary" className="text-xs">
                  {task.costCode}
                </Badge>
                
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
  onTaskUpdate 
}: DraggableTaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    const linkedGroups = new Map();
    const unlinkedTasks = [];
    
    tasks.forEach(task => {
      if (task.linkedTaskGroup) {
        if (!linkedGroups.has(task.linkedTaskGroup)) {
          linkedGroups.set(task.linkedTaskGroup, []);
        }
        linkedGroups.get(task.linkedTaskGroup).push(task);
      } else {
        unlinkedTasks.push(task);
      }
    });
    
    // Convert linked groups to sortable units (use earliest order/date as group position)
    const sortableUnits = [];
    
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
    const result = [];
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
        apiRequest(`/api/tasks/${taskData.id}`, {
          method: 'PUT',
          body: JSON.stringify(taskData),
          headers: { 'Content-Type': 'application/json' }
        })
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sortedTasks.findIndex(task => (task.taskId || task.id) === active.id);
    const newIndex = sortedTasks.findIndex(task => (task.taskId || task.id) === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    console.log('Drag operation:', { 
      draggedTask: sortedTasks[oldIndex].name, 
      oldIndex, 
      newIndex,
      draggedDate: sortedTasks[oldIndex].taskDate,
      targetDate: sortedTasks[newIndex].taskDate
    });

    // Special handling for linked tasks - they should move as groups
    const originalDraggedTask = sortedTasks[oldIndex];
    let reorderedTasks = [...sortedTasks];
    
    if (originalDraggedTask.linkedTaskGroup) {
      // Find all tasks in the same linked group
      const linkedTasks = sortedTasks.filter(t => t.linkedTaskGroup === originalDraggedTask.linkedTaskGroup);
      const linkedTaskIndices = linkedTasks.map(t => sortedTasks.findIndex(task => (task.taskId || task.id) === (t.taskId || t.id)));
      
      // Remove all linked tasks from their current positions
      linkedTaskIndices.sort((a, b) => b - a); // Remove from end to start to maintain indices
      const removedTasks: any[] = [];
      linkedTaskIndices.forEach(index => {
        removedTasks.unshift(reorderedTasks.splice(index, 1)[0]);
      });
      
      // Find the target position (adjust for removed tasks)
      let targetIndex = newIndex;
      linkedTaskIndices.forEach(removedIndex => {
        if (removedIndex < newIndex) targetIndex--;
      });
      
      // Insert all linked tasks at the target position
      reorderedTasks.splice(targetIndex, 0, ...removedTasks);
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
    const draggedTask = tasksWithUpdatedOrder[draggedTaskNewIndex];
    
    // Intelligent date assignment based on task movement
    if (draggedTaskNewIndex >= 0) {
      const previousTask = draggedTaskNewIndex > 0 ? tasksWithUpdatedOrder[draggedTaskNewIndex - 1] : null;
      const nextTask = draggedTaskNewIndex < tasksWithUpdatedOrder.length - 1 ? tasksWithUpdatedOrder[draggedTaskNewIndex + 1] : null;
      
      console.log('Task positioning:', {
        draggedTask: draggedTask.name,
        newIndex: draggedTaskNewIndex,
        previousTask: previousTask?.name,
        previousDate: previousTask?.taskDate,
        nextTask: nextTask?.name,
        nextDate: nextTask?.taskDate,
        isDraggedDependent: draggedTask.dependentOnPrevious
      });
      
      // If moving to first position
      if (draggedTaskNewIndex === 0) {
        // Take the date of the original first task
        const originalFirstTask = tasksWithUpdatedOrder[1]; // Now at position 1
        if (originalFirstTask) {
          draggedTask.taskDate = originalFirstTask.taskDate;
          
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
        console.log('Making first task unsequential:', draggedTask.name, 'was:', draggedTask.dependentOnPrevious);
        draggedTask.dependentOnPrevious = false;
        
        // If dragged task has linked partners, make them all unsequential too
        if (draggedTask.linkedTaskGroup) {
          tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
            if (task.linkedTaskGroup === draggedTask.linkedTaskGroup) {
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
            taskName: draggedTask.name,
            oldDate: draggedTask.taskDate,
            newDate: nextTask.taskDate
          });
          draggedTask.taskDate = nextTask.taskDate;
          // If dragged task has linked partners, sync their dates too
          if (draggedTask.linkedTaskGroup) {
            tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
              if (task.linkedTaskGroup === draggedTask.linkedTaskGroup) {
                return { ...task, taskDate: nextTask.taskDate };
              }
              return task;
            });
          }
        }
        // Otherwise, calculate proper date based on dependency
        else {
          let targetDate: string;
          
          if (draggedTask.dependentOnPrevious) {
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
            const currentDate = new Date(draggedTask.taskDate + 'T00:00:00');
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
                targetDate = draggedTask.taskDate; // Keep original
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
          
          console.log('Assigning new date:', { taskName: draggedTask.name, oldDate: draggedTask.taskDate, newDate: targetDate });
          draggedTask.taskDate = targetDate;
          
          // If dragged task has linked partners, sync their dates too
          if (draggedTask.linkedTaskGroup) {
            tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
              if (task.linkedTaskGroup === draggedTask.linkedTaskGroup) {
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
                employees={employees}
                assignments={assignments}
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
    </div>
  );
}