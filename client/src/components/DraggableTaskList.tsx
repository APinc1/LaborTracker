import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle, Edit, GripVertical, Trash2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Types
interface Task {
  id: number;
  taskId?: string;
  name?: string;
  title?: string;
  taskDate: string | Date;
  dependentOnPrevious?: boolean;
  linkedTaskGroup?: string;
  costCode?: string;
  order?: number;
}

interface DraggableTaskListProps {
  tasks: Task[];
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
  onAssignTask?: (task: Task) => void;
  onTaskUpdate: () => void;
  budgetItems?: any[];
  showRemainingHours?: boolean;
  assignments?: any[];
  location?: string;
}

// Task status helper
function getTaskStatus(task: Task, assignments: any[] = []): 'upcoming' | 'in_progress' | 'complete' {
  // Simple status determination - can be enhanced later
  return 'upcoming';
}

// Remaining hours calculation helper
function calculateRemainingHours(task: Task, budgetItems: any[]): number | null {
  // Simple remaining hours calculation - can be enhanced later
  return 100.6;
}

function getRemainingHoursIndicator(hours: number | null) {
  if (hours === null) return null;
  
  if (hours > 20) {
    return { bgColor: 'bg-green-100', textColor: 'text-green-800' };
  } else if (hours > 0) {
    return { bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' };
  } else {
    return { bgColor: 'bg-red-100', textColor: 'text-red-800' };
  }
}

export default function DraggableTaskList({
  tasks = [],
  onEditTask,
  onDeleteTask,
  onAssignTask,
  onTaskUpdate,
  budgetItems = [],
  showRemainingHours = false,
  assignments = [],
  location
}: DraggableTaskListProps) {
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    })
  );

  // Ensure tasks is an array and sort by order
  const sortedTasks = Array.isArray(tasks) 
    ? tasks.sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];

  const handleDragEnd = async (event: DragEndEvent) => {
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
      targetTask: sortedTasks[newIndex].name,
      oldIndex, 
      newIndex
    });

    // Reorder tasks using arrayMove
    const reorderedTasks = arrayMove(sortedTasks, oldIndex, newIndex);
    console.log('✅ Tasks reordered:', reorderedTasks.map((t, i) => `${i}: ${t.name}`));

    // Update task orders on the server immediately
    try {
      const updatePromises = reorderedTasks.map(async (task, index) => {
        const response = await apiRequest('PUT', `/api/tasks/${task.id}`, {
          order: index
        });
        return response;
      });
      
      await Promise.all(updatePromises);
      console.log('✅ All task orders updated on server');
      
      // Refresh the tasks data
      onTaskUpdate();
      
    } catch (error) {
      console.error('❌ Failed to update task orders:', error);
      toast({
        title: "Error",
        description: "Failed to reorder tasks",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4">
      <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={sortedTasks.map(task => task.taskId || task.id)} strategy={verticalListSortingStrategy}>
          {sortedTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No tasks scheduled</p>
              <p className="text-sm">Tasks will appear here when they are created or assigned to this location.</p>
            </div>
          ) : (
            sortedTasks.map((task) => (
              <SortableTaskCard
                key={task.taskId || task.id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onAssign={onAssignTask}
                budgetItems={budgetItems}
                showRemainingHours={showRemainingHours}
                assignments={assignments as any[]}
              />
            ))
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableTaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAssign?: (task: Task) => void;
  budgetItems: any[];
  showRemainingHours?: boolean;
  assignments: any[];
}

function SortableTaskCard({ 
  task, 
  onEdit, 
  onDelete, 
  onAssign, 
  budgetItems, 
  showRemainingHours = false, 
  assignments 
}: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.taskId || task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const taskStatus = getTaskStatus(task, assignments);
  const statusConfig = {
    upcoming: { label: 'Upcoming', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
    complete: { label: 'Complete', color: 'bg-green-100 text-green-800' }
  };

  const currentStatus = statusConfig[taskStatus as keyof typeof statusConfig] || statusConfig.upcoming;

  // Calculate remaining hours if requested and budget items are available
  let remainingHoursDisplay = null;
  if (showRemainingHours && Array.isArray(budgetItems) && budgetItems.length > 0) {
    const remainingHours = calculateRemainingHours(task, budgetItems);
    const indicator = getRemainingHoursIndicator(remainingHours);
    
    if (remainingHours !== null && indicator) {
      remainingHoursDisplay = (
        <Badge 
          className={`${indicator.bgColor} ${indicator.textColor} text-xs`}
        >
          {remainingHours}h remaining
        </Badge>
      );
    }
  }

  const safeFormatDate = (date: Date | string | number | null | undefined): string => {
    try {
      if (date === null || date === undefined) return 'No date';
      
      let dateObj: Date;
      if (typeof date === 'string') {
        dateObj = date.includes('T') ? new Date(date) : new Date(date + 'T00:00:00');
      } else if (typeof date === 'number') {
        dateObj = new Date(date);
      } else {
        dateObj = date;
      }
      
      if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid date';
      return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100"
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900 truncate">
                {task.name || task.title || 'Untitled Task'}
              </h3>
              {task.dependentOnPrevious && (
                <Badge variant="outline" className="text-xs">
                  Sequential
                </Badge>
              )}
              {task.linkedTaskGroup && (
                <Badge variant="secondary" className="text-xs">
                  Linked
                </Badge>
              )}
              <Badge className={currentStatus.color}>
                {currentStatus.label}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {safeFormatDate(task.taskDate)}
              </div>
              
              {task.costCode && (
                <Badge variant="outline" className="text-xs">
                  {task.costCode}
                </Badge>
              )}
              
              {remainingHoursDisplay}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit?.(task)}
            className="h-8 w-8 p-0"
          >
            <Edit className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAssign?.(task)}
            className="h-8 w-8 p-0"
          >
            <UserPlus className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(task)}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}