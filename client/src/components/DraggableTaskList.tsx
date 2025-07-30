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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar, Clock, GripVertical, Edit, CheckCircle, Play, AlertCircle, Trash2, Link } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { reorderTasksWithDependencies } from '@shared/taskUtils';

interface DraggableTaskListProps {
  tasks: any[];
  locationId: string;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onTaskUpdate: () => void;
}

interface SortableTaskItemProps {
  task: any;
  tasks: any[];
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
}

// Individual sortable task item component
function SortableTaskItem({ task, tasks, onEditTask, onDeleteTask }: SortableTaskItemProps) {
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
                {getStatusIcon(task.status || 'upcoming')}
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
            </div>

            {/* Status badge */}
            <Badge className={`text-xs ${getStatusColor(task.status || 'upcoming')}`}>
              {task.status === 'in_progress' ? 'In Progress' : 
               task.status === 'complete' ? 'Complete' : 'Upcoming'}
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
  onTaskUpdate 
}: DraggableTaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for linking dialog
  const [showLinkingDialog, setShowLinkingDialog] = useState(false);
  const [pendingDragData, setPendingDragData] = useState<{
    draggedTask: any;
    linkedGroup: string;
    originalIndex: number;
    newIndex: number;
    reorderedTasks: any[];
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort tasks by order first to maintain user-intended positioning, then by date as fallback
  const sortedTasks = [...tasks].sort((a, b) => {
    // If both tasks have order values, use order as primary sort
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    
    // If only one has order, prioritize the one with order
    if (a.order !== undefined && b.order === undefined) {
      return -1;
    }
    if (a.order === undefined && b.order !== undefined) {
      return 1;
    }
    
    // If neither has order, sort by date as fallback
    const dateA = new Date(a.taskDate).getTime();
    const dateB = new Date(b.taskDate).getTime();
    
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    
    // Final fallback to ID comparison
    return (a.taskId || a.id).localeCompare(b.taskId || b.id);
  });

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

    // Check if task is being dragged between linked tasks (and is not already linked)
    const originalDraggedTask = sortedTasks[oldIndex];
    const targetTask = sortedTasks[newIndex];
    
    // Get neighboring tasks at the target position
    const previousTaskAtTarget = newIndex > 0 ? sortedTasks[newIndex - 1] : null;
    const nextTaskAtTarget = newIndex < sortedTasks.length - 1 ? sortedTasks[newIndex + 1] : null;
    
    // Check if being dragged between linked tasks
    const isBeingDroppedBetweenLinkedTasks = (
      !originalDraggedTask.linkedTaskGroup && // Not already linked
      previousTaskAtTarget?.linkedTaskGroup && 
      nextTaskAtTarget?.linkedTaskGroup && 
      previousTaskAtTarget.linkedTaskGroup === nextTaskAtTarget.linkedTaskGroup
    );
    
    if (isBeingDroppedBetweenLinkedTasks) {
      // Show dialog to ask if user wants to link the task
      const reorderedTasks = arrayMove(sortedTasks, oldIndex, newIndex);
      setPendingDragData({
        draggedTask: originalDraggedTask,
        linkedGroup: previousTaskAtTarget.linkedTaskGroup,
        originalIndex: oldIndex,
        newIndex: newIndex,
        reorderedTasks: reorderedTasks
      });
      setShowLinkingDialog(true);
      return; // Don't proceed with normal drag handling
    }
    
    // Special handling for linked tasks - they should move as groups
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
          // Original first task becomes sequential
          originalFirstTask.dependentOnPrevious = true;
        }
        // First task must be non-sequential
        draggedTask.dependentOnPrevious = false;
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
          groupTasks.forEach(({ task, index }: any, groupIndex) => {
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
      
      for (let i = 0; i < tasksWithUpdatedOrder.length; i++) {
        const currentTask = tasksWithUpdatedOrder[i];
        
        // Skip the first task (can't be dependent)
        if (i === 0) {
          if (currentTask.dependentOnPrevious) {
            currentTask.dependentOnPrevious = false;
          }
          continue;
        }
        
        // Only update dependent tasks
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
      
      // Always ensure first task is not dependent
      if (tasksWithUpdatedOrder.length > 0 && tasksWithUpdatedOrder[0].dependentOnPrevious) {
        tasksWithUpdatedOrder[0].dependentOnPrevious = false;
      }
    }

    console.log('Reordered tasks with smart dependency updates:', tasksWithUpdatedOrder);

    // Batch update all affected tasks
    batchUpdateTasksMutation.mutate(tasksWithUpdatedOrder);
  };

  // Functions to handle linking dialog
  const handleLinkConfirm = () => {
    if (!pendingDragData) return;
    
    const { draggedTask, linkedGroup, reorderedTasks } = pendingDragData;
    
    // Apply reordering and add task to linked group
    let tasksWithUpdatedOrder = reorderedTasks.map((task, index) => ({
      ...task,
      order: index
    }));
    
    // Add the dragged task to the linked group and sync date
    const linkedTasks = tasksWithUpdatedOrder.filter(t => t.linkedTaskGroup === linkedGroup);
    const linkedGroupDate = linkedTasks.length > 0 ? linkedTasks[0].taskDate : draggedTask.taskDate;
    
    tasksWithUpdatedOrder = tasksWithUpdatedOrder.map(task => {
      if ((task.taskId || task.id) === (draggedTask.taskId || draggedTask.id)) {
        return {
          ...task,
          linkedTaskGroup: linkedGroup,
          taskDate: linkedGroupDate,
          dependentOnPrevious: false // Linked tasks are not sequential
        };
      }
      return task;
    });
    
    console.log('Linking task to group:', {
      taskName: draggedTask.name,
      linkedGroup,
      newDate: linkedGroupDate
    });
    
    batchUpdateTasksMutation.mutate(tasksWithUpdatedOrder);
    setShowLinkingDialog(false);
    setPendingDragData(null);
  };

  const handleLinkCancel = () => {
    // Revert to original position - no changes needed since we haven't applied any updates yet
    console.log('Linking cancelled - task stays in original position');
    setShowLinkingDialog(false);
    setPendingDragData(null);
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
      
      {/* Linking Dialog */}
      <Dialog open={showLinkingDialog} onOpenChange={setShowLinkingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-600" />
              Link Task to Group?
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-700 mb-4">
              You dropped <strong>"{pendingDragData?.draggedTask?.name}"</strong> between linked tasks.
            </p>
            <p className="text-gray-600">
              Would you like to link this task to the group so they all move together and share the same date?
            </p>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleLinkCancel}
              className="flex-1"
            >
              No, Keep Separate
            </Button>
            <Button 
              onClick={handleLinkConfirm}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              Yes, Link Tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}