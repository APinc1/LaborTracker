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
  locationId?: string;
}

// Task status helper
function getTaskStatus(task: Task, assignments: any[] = []): 'upcoming' | 'in_progress' | 'complete' {
  const currentDate = new Date().toISOString().split('T')[0];
  const taskDate = typeof task.taskDate === 'string' ? task.taskDate : task.taskDate.toISOString().split('T')[0];
  
  // Check if task has actual hours recorded (completed)
  const taskAssignments = assignments.filter((assignment: any) => assignment.taskId === task.id);
  const hasActualHours = taskAssignments.some((assignment: any) => 
    assignment.actualHours && parseFloat(assignment.actualHours) > 0
  );
  
  if (hasActualHours) {
    return 'complete';
  } else if (taskDate === currentDate) {
    return 'in_progress';
  } else {
    return 'upcoming';
  }
}

// Remaining hours calculation helper
function calculateRemainingHours(task: Task, budgetItems: any[]): number | null {
  if (!task.costCode || !budgetItems?.length) {
    return null;
  }

  // Normalize cost codes for comparison
  let normalizedTaskCostCode = task.costCode;
  if (task.costCode === 'DEMO/EX' || task.costCode === 'Demo/Ex' || 
      task.costCode === 'BASE/GRADING' || task.costCode === 'Base/Grading' || 
      task.costCode === 'Demo/Ex + Base/Grading' || task.costCode === 'DEMO/EX + BASE/GRADING') {
    normalizedTaskCostCode = 'Demo/ex + Base/grading';
  }

  // Find matching budget items for this cost code
  const matchingBudgetItems = budgetItems.filter((item: any) => {
    let itemCostCode = item.costCode || 'UNCATEGORIZED';
    
    // Normalize budget item cost codes
    if (itemCostCode === 'DEMO/EX' || itemCostCode === 'Demo/Ex' || 
        itemCostCode === 'BASE/GRADING' || itemCostCode === 'Base/Grading' || 
        itemCostCode === 'Demo/Ex + Base/Grading' || itemCostCode === 'DEMO/EX + BASE/GRADING') {
      itemCostCode = 'Demo/ex + Base/grading';
    }
    
    return itemCostCode === normalizedTaskCostCode;
  });

  if (matchingBudgetItems.length === 0) {
    return null;
  }

  // Calculate total budget hours (only for parent items to avoid double counting)
  const totalBudgetHours = matchingBudgetItems.reduce((sum: number, item: any) => {
    const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
    const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
    const hasChildren = budgetItems.some((child: any) => 
      child.lineItemNumber && child.lineItemNumber.includes('.') && 
      child.lineItemNumber.split('.')[0] === item.lineItemNumber
    );
    
    // Include if it's a parent OR if it's a standalone item (not a child and has no children)
    if (isParent || (!isChild && !hasChildren)) {
      return sum + (parseFloat(item.hours) || 0);
    }
    
    return sum;
  }, 0);

  // For now, assume no actual hours used (this would need assignments data to be accurate)
  // This is a simplified calculation - in real usage, you'd subtract actual hours from assignments
  return totalBudgetHours;
}

function getRemainingHoursIndicator(hours: number | null) {
  if (hours === null) return null;
  
  // Calculate the percentage threshold for warning (15% of total)
  const warningThreshold = hours * 0.15;
  
  if (hours > warningThreshold) {
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
  location,
  locationId
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

// SortableTaskCard component
function SortableTaskCard({ 
  task, 
  onEdit, 
  onDelete, 
  onAssign, 
  budgetItems = [], 
  showRemainingHours = false, 
  assignments = [] 
}: {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAssign?: (task: Task) => void;
  budgetItems: any[];
  showRemainingHours: boolean;
  assignments: any[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.taskId || task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const taskStatus = getTaskStatus(task, assignments);
  const remainingHours = showRemainingHours ? calculateRemainingHours(task, budgetItems) : null;
  const hoursIndicator = getRemainingHoursIndicator(remainingHours);

  const formatDate = (dateInput: string | Date): string => {
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput + 'T00:00:00') : dateInput;
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Determine status badge style
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return { variant: 'default' as const, label: 'Complete', className: 'bg-green-100 text-green-800' };
      case 'in_progress':
        return { variant: 'secondary' as const, label: 'In Progress', className: 'bg-blue-100 text-blue-800' };
      default:
        return { variant: 'outline' as const, label: 'Upcoming', className: 'bg-gray-100 text-gray-800' };
    }
  };

  const statusBadge = getStatusBadge(taskStatus);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
        isDragging ? 'z-50 shadow-lg' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing mt-1 p-1 rounded hover:bg-gray-100"
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-gray-900 truncate">
                {task.name || task.title || `Task ${task.id}`}
              </h3>
              
              {/* Sequential badge */}
              {task.dependentOnPrevious && (
                <Badge variant="outline" className="text-xs">
                  Sequential
                </Badge>
              )}
              
              {/* Status badge */}
              <Badge variant={statusBadge.variant} className={`text-xs ${statusBadge.className}`}>
                {statusBadge.label}
              </Badge>

              {/* Remaining hours indicator */}
              {showRemainingHours && hoursIndicator && remainingHours !== null && (
                <Badge 
                  variant="outline" 
                  className={`text-xs ${hoursIndicator.bgColor} ${hoursIndicator.textColor} border-0`}
                >
                  {remainingHours.toFixed(1)}h remaining
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(task.taskDate)}</span>
              </div>
              
              {task.costCode && (
                <Badge variant="secondary" className="text-xs">
                  {task.costCode}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-4">
          {onAssign && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAssign(task)}
              className="h-8 w-8 p-0"
              title="Assign workers"
            >
              <UserPlus className="w-4 h-4" />
            </Button>
          )}
          
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(task)}
              className="h-8 w-8 p-0"
              title="Edit task"
            >
              <Edit className="w-4 h-4" />
            </Button>
          )}
          
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(task)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}