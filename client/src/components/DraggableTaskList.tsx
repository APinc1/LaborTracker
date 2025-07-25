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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, GripVertical, Edit, CheckCircle, Play, AlertCircle, Trash2 } from 'lucide-react';
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
                <Badge variant="outline" className="text-xs">
                  {task.taskType}
                </Badge>
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
                    Dependent
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Always sort tasks by date first, then by order as secondary
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = new Date(a.taskDate).getTime();
    const dateB = new Date(b.taskDate).getTime();
    
    // If dates are different, sort by date
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    
    // If dates are same, sort by order
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    
    // Fallback to ID comparison
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

    // Reorder the tasks array
    const reorderedTasks = arrayMove(sortedTasks, oldIndex, newIndex);

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
        // First task can't be dependent
        if (draggedTask.dependentOnPrevious) {
          draggedTask.dependentOnPrevious = false;
        }
        // Keep original date for first task
      } 
      // For other positions, determine the best date for this position
      else if (previousTask) {
        // Calculate what date this position should have
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
          // Non-dependent tasks should fit logically in the sequence
          // If there's a next task, try to fit between previous and next
          if (nextTask) {
            const previousDate = new Date(previousTask.taskDate + 'T00:00:00');
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
            const previousDate = new Date(previousTask.taskDate + 'T00:00:00');
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
      }
      
      // Update all subsequent dependent tasks to maintain proper sequence
      for (let i = draggedTaskNewIndex + 1; i < tasksWithUpdatedOrder.length; i++) {
        const currentTask = tasksWithUpdatedOrder[i];
        if (!currentTask.dependentOnPrevious) continue; // Skip non-dependent tasks
        
        const prevTask = tasksWithUpdatedOrder[i - 1];
        const prevDate = new Date(prevTask.taskDate + 'T00:00:00');
        const nextDay = new Date(prevDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        // Skip weekends
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
          nextDay.setDate(nextDay.getDate() + 1);
        }
        
        const newDate = nextDay.toISOString().split('T')[0];
        console.log('Updating dependent task:', { taskName: currentTask.name, oldDate: currentTask.taskDate, newDate });
        currentTask.taskDate = newDate;
      }
    }

    console.log('Reordered tasks with smart dependency updates:', tasksWithUpdatedOrder);

    // Batch update all affected tasks
    batchUpdateTasksMutation.mutate(tasksWithUpdatedOrder);
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
    </div>
  );
}