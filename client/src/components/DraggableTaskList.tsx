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
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
}

// Individual sortable task item component
function SortableTaskItem({ task, onEditTask, onDeleteTask }: SortableTaskItemProps) {
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
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 1
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

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={`mb-2 ${isDragging ? 'shadow-xl border-blue-300 bg-blue-50' : 'hover:shadow-md'} transition-shadow duration-200`}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            {/* Drag handle */}
            <div {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
              <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
            </div>

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                {getStatusIcon(task.status || 'upcoming')}
                <h4 className="font-medium text-sm truncate">{task.name}</h4>
                <Badge variant="outline" className="text-xs">
                  {task.taskType}
                </Badge>
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
                className="h-8 w-8 p-0 hover:bg-blue-100"
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteTask(task)}
                className="h-8 w-8 p-0 hover:bg-red-100 text-red-600 hover:text-red-700"
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

  // Sort tasks by order field, then by taskDate as fallback
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    // Fallback to date sorting if order is not set
    return new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime();
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
      onTaskUpdate();
      toast({ 
        title: "Success", 
        description: "Tasks reordered successfully" 
      });
    },
    onError: (error: any) => {
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

    // Reorder the tasks array
    const reorderedTasks = arrayMove(sortedTasks, oldIndex, newIndex);

    // Apply dependency logic using the utility function
    const tasksWithDependencies = reorderTasksWithDependencies(
      reorderedTasks,
      active.id as string,
      newIndex
    );

    console.log('Reordered tasks with dependencies:', tasksWithDependencies);

    // Batch update all affected tasks
    batchUpdateTasksMutation.mutate(tasksWithDependencies);
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