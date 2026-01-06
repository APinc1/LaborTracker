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
import { Calendar, Clock, GripVertical, Edit, CheckCircle, Play, AlertCircle, Trash2, User, Link, Users, FileText, History } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { ForemanSelectionModal } from '@/components/ForemanSelectionModal';
import { useForemanLogic } from '@/hooks/useForemanLogic';
import { useToast } from '@/hooks/use-toast';
import { reorderTasksWithDependencies, realignDependentTasks, realignDependentTasksAfter } from '@shared/taskUtils';
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
import ActualHoursModal from './ActualHoursModal';

interface DraggableTaskListProps {
  tasks: any[];
  locationId: string;
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  onTaskUpdate: () => void;
  onDailyJobReport?: (task: any) => void;
  onEditHistory?: (task: any) => void;
  assignments?: any[];
  employees?: any[];
  users?: any[];
  budgetItems?: any[];
}

interface SortableTaskItemProps {
  task: any;
  tasks: any[];
  onEditTask: (task: any) => void;
  onDeleteTask: (task: any) => void;
  onAssignTask?: (task: any) => void;
  onActualHoursClick?: (task: any) => void;
  onDailyJobReport?: (task: any) => void;
  onEditHistory?: (task: any) => void;
  onTaskUpdate?: () => void;
  employees: any[];
  assignments: any[];
  users: any[];
  remainingHours?: number;
  remainingHoursColor?: string;
}

// Helper function to determine task status - checks if all assignments have actual hours recorded
const getTaskStatus = (task: any, assignments: any[] = []) => {
  // Get all assignments for this task (excluding driver hours)
  const taskAssignments = assignments.filter(assignment => 
    (assignment.taskId === task.id || assignment.taskId === task.taskId) && !assignment.isDriverHours
  );
  
  // Check if there are any actual hours recorded
  const hasAnyActualHours = taskAssignments.some(assignment => 
    assignment.actualHours !== null && assignment.actualHours !== undefined && parseFloat(assignment.actualHours) > 0
  ) || (task.actualHours && parseFloat(task.actualHours) > 0);
  
  // Task is complete if it has assignments and ALL of them have actual hours recorded (including 0)
  if (taskAssignments.length > 0) {
    const allAssignmentsHaveActualHours = taskAssignments.every(assignment => 
      assignment.actualHours !== null && assignment.actualHours !== undefined
    );
    
    if (allAssignmentsHaveActualHours) {
      return 'complete';
    }
  }
  
  // Fallback to database status if no assignments to evaluate
  if (taskAssignments.length === 0 && task.status) {
    return task.status;
  }
  
  const currentDate = new Date().toISOString().split('T')[0];
  const taskDate = task.taskDate;
  
  // If task date is in the past
  if (taskDate && taskDate < currentDate) {
    // Past tasks with any actual hours are complete
    if (hasAnyActualHours) {
      return 'complete';
    }
    // Past tasks without actual hours are still in progress (overdue)
    return 'in_progress';
  }
  
  // Task is in progress if it's today
  if (taskDate === currentDate) {
    return 'in_progress';
  }
  
  // Future tasks are upcoming
  return 'upcoming';
};

// Individual sortable task item component
function SortableTaskItem({ task, tasks, onEditTask, onDeleteTask, onAssignTask, onActualHoursClick, onDailyJobReport, onEditHistory, onTaskUpdate, employees, assignments, users, remainingHours, remainingHoursColor }: SortableTaskItemProps) {
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

  // Use foreman logic hook
  const {
    foremanDisplay,
    showForemanModal,
    setShowForemanModal,
    foremanSelectionType,
    assignedForemen,
    allForemen,
    triggerForemanSelection,
    handleForemanSelection,
    needsForemanSelection
  } = useForemanLogic({
    task,
    assignments,
    employees,
    onTaskUpdate: onTaskUpdate || (() => {}) // Provide fallback function
  });

  // Format assigned employees display with superintendent and foreman
  const formatAssignedEmployees = (assignedEmployees: any[]) => {
    const personnelElements = [];
    
    // Add superintendent first if exists
    if (task.superintendentId) {
      const superintendent = users.find(u => u.id === task.superintendentId);
      if (superintendent) {
        personnelElements.push(
          <div key={`super-${task.superintendentId}`} className="text-xs font-bold">
            {superintendent.name} (Super)
          </div>
        );
      }
    }

    // Add foreman display if exists
    if (foremanDisplay) {
      personnelElements.push(
        <div 
          key={`foreman-${foremanDisplay.id}`} 
          className={`text-xs ${foremanDisplay.isBold ? 'font-bold' : ''}`}
        >
          {foremanDisplay.name} {foremanDisplay.displayText}
        </div>
      );
    }
    
    // Add assigned employees (excluding the displayed foreman to avoid duplication)
    if (assignedEmployees.length > 0) {
      // Sort employees: foremen first, drivers last, others in between
      const sortedEmployees = [...assignedEmployees].sort((a, b) => {
        if (a.isForeman && !b.isForeman) return -1;
        if (!a.isForeman && b.isForeman) return 1;
        if (a.primaryTrade === 'Driver' && b.primaryTrade !== 'Driver') return 1;
        if (a.primaryTrade !== 'Driver' && b.primaryTrade === 'Driver') return -1;
        return 0;
      });

      const employeeElements = sortedEmployees.map((employee, index) => {
        const hours = parseFloat(employee.assignedHours);
        const isDriver = employee.primaryTrade === 'Driver';
        const isForeman = employee.isForeman;
        const showHours = hours !== 8;
        
        // Skip displaying foreman if already shown above
        if (isForeman && foremanDisplay && employee.id === foremanDisplay.id) {
          return null;
        }
        
        let displayText = employee.name;
        if (isForeman) {
          displayText += ' (Foreman)';
        } else if (isDriver) {
          displayText += ' (Driver)';
        }
        if (showHours) {
          displayText += ` (${hours}h)`;
        }
        
        return (
          <div 
            key={employee.id} 
            className={`text-xs ${isForeman ? 'text-gray-600' : ''} ${
              personnelElements.length === 0 && index === 0 ? '' : 'mt-1'
            }`}
          >
            {displayText}
          </div>
        );
      }).filter(Boolean); // Remove null values
      
      personnelElements.push(...employeeElements);
    }
    
    return personnelElements.length > 0 ? personnelElements : null;
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
                
                {remainingHours !== undefined && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span className={remainingHoursColor || 'text-orange-600'}>
                      {remainingHours <= 0 
                        ? `${Math.abs(remainingHours).toFixed(1)}h over` 
                        : `${remainingHours.toFixed(1)}h remaining`
                      }
                    </span>
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
            <Badge className={`text-xs ${getStatusColor(getTaskStatus(task, assignments))}`}>
              {getTaskStatus(task, assignments) === 'in_progress' ? 'In Progress' : 
               getTaskStatus(task, assignments) === 'complete' ? 'Complete' : 'Upcoming'}
            </Badge>

            {/* Action buttons */}
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditTask(task)}
                className="h-8 w-8 p-0 text-[#15803d]"
              >
                <Edit className="w-3 h-3" />
              </Button>
              {onAssignTask && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAssignTask(task)}
                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                  data-testid={`button-assign-task-${task.id}`}
                >
                  <User className="w-3 h-3" />
                </Button>
              )}
              {onDailyJobReport && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDailyJobReport(task)}
                  className="h-8 w-8 p-0 text-purple-600 hover:text-purple-700"
                  title="Daily Job Report"
                  data-testid={`button-djr-${task.id}`}
                >
                  <FileText className="w-3 h-3" />
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
      
      {/* Foreman Selection Modal */}
      <ForemanSelectionModal
        isOpen={showForemanModal}
        onClose={() => setShowForemanModal(false)}
        onSelectForeman={handleForemanSelection}
        assignedForemen={assignedForemen}
        allForemen={allForemen}
        selectionType={foremanSelectionType}
        taskName={task.name}
      />
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
  onDailyJobReport,
  onEditHistory,
  assignments = [],
  employees = [],
  users = [],
  budgetItems = []
}: DraggableTaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to get remaining hours color based on percentage
  const getRemainingHoursColor = (remainingHours: number, totalBudgetHours: number) => {
    if (totalBudgetHours === 0) return 'text-gray-600';
    
    const percentage = (remainingHours / totalBudgetHours) * 100;
    
    if (remainingHours <= 0) {
      return 'text-red-600'; // Red for zero or negative (overrun)
    } else if (percentage <= 15) {
      return 'text-yellow-600'; // Yellow for low remaining (15% or less)
    } else {
      return 'text-green-600'; // Green for healthy remaining
    }
  };

  // Calculate remaining hours for a cost code up to the current task date
  const calculateRemainingHours = (task: any, allTasks: any[], budgetItems: any[], taskAssignments: any[]) => {
    const costCode = task.costCode;
    if (!costCode) return { remainingHours: undefined, totalBudgetHours: 0 };

    // Get total budget hours for this cost code
    const costCodeBudgetHours = budgetItems.reduce((total: number, item: any) => {
      let itemCostCode = item.costCode || 'UNCATEGORIZED';
      
      // Handle combined cost codes (Demo/Ex + Base/Grading)
      if (itemCostCode === 'DEMO/EX' || itemCostCode === 'Demo/Ex' || 
          itemCostCode === 'BASE/GRADING' || itemCostCode === 'Base/Grading' || 
          itemCostCode === 'Demo/Ex + Base/Grading' || itemCostCode === 'DEMO/EX + BASE/GRADING') {
        itemCostCode = 'Demo/Ex + Base/Grading';
      }
      
      // Handle current task cost code in the same way
      let taskCostCode = costCode;
      if (taskCostCode === 'DEMO/EX' || taskCostCode === 'Demo/Ex' || 
          taskCostCode === 'BASE/GRADING' || taskCostCode === 'Base/Grading' || 
          taskCostCode === 'Demo/Ex + Base/Grading' || taskCostCode === 'DEMO/EX + BASE/GRADING') {
        taskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      if (itemCostCode === taskCostCode) {
        // Only include parent items or standalone items (avoid double counting)
        const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
        const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
        const hasChildren = budgetItems.some((child: any) => 
          child.lineItemNumber && child.lineItemNumber.includes('.') && 
          child.lineItemNumber.split('.')[0] === item.lineItemNumber
        );
        
        if (isParent || (!isChild && !hasChildren)) {
          return total + (parseFloat(item.hours) || 0);
        }
      }
      return total;
    }, 0);

    if (costCodeBudgetHours === 0) return { remainingHours: undefined, totalBudgetHours: 0 };

    // Find all tasks for this cost code up to and including the current task date
    const currentTaskDate = new Date(task.taskDate + 'T00:00:00').getTime();
    
    const relevantTasks = allTasks.filter((t: any) => {
      if (!t.costCode) return false;
      
      // Handle cost code matching with combined codes
      let tCostCode = t.costCode;
      let taskCostCode = costCode;
      
      if (tCostCode === 'DEMO/EX' || tCostCode === 'Demo/Ex' || 
          tCostCode === 'BASE/GRADING' || tCostCode === 'Base/Grading' || 
          tCostCode === 'Demo/Ex + Base/Grading' || tCostCode === 'DEMO/EX + BASE/GRADING') {
        tCostCode = 'Demo/Ex + Base/Grading';
      }
      
      if (taskCostCode === 'DEMO/EX' || taskCostCode === 'Demo/Ex' || 
          taskCostCode === 'BASE/GRADING' || taskCostCode === 'Base/Grading' || 
          taskCostCode === 'Demo/Ex + Base/Grading' || taskCostCode === 'DEMO/EX + BASE/GRADING') {
        taskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      const taskDate = new Date(t.taskDate + 'T00:00:00').getTime();
      const isSameCostCode = tCostCode === taskCostCode;
      const isCurrentOrBefore = taskDate <= currentTaskDate;
      
      return isSameCostCode && isCurrentOrBefore;
    });

    // Sum hours from all relevant tasks (actual hours if available, otherwise scheduled hours)
    const usedHours = relevantTasks.reduce((total: number, t: any) => {
      const taskId = t.id || t.taskId;
      const taskAssignmentsList = taskAssignments.filter((assignment: any) => 
        assignment.taskId === taskId
      );
      
      // Try to get actual hours first
      const taskActualHours = taskAssignmentsList.reduce((sum: number, assignment: any) => {
        return sum + (parseFloat(assignment.actualHours) || 0);
      }, 0);
      
      // If no actual hours, fall back to scheduled hours
      let taskHours = taskActualHours;
      if (taskActualHours === 0) {
        taskHours = taskAssignmentsList.reduce((sum: number, assignment: any) => {
          return sum + (parseFloat(assignment.assignedHours) || 0);
        }, 0);
      }
      
      return total + taskHours;
    }, 0);

    // Calculate remaining hours
    const remainingHours = costCodeBudgetHours - usedHours;
    
    return {
      remainingHours: remainingHours, // Allow negative hours to show overruns
      totalBudgetHours: costCodeBudgetHours
    };
  };

  // State for link confirmation dialog
  const [linkConfirmDialog, setLinkConfirmDialog] = useState<{
    show: boolean;
    draggedTask: any;
    linkedGroup: string;
    originalPosition: number;
    newPosition: number;
  }>({
    show: false,
    draggedTask: null,
    linkedGroup: '',
    originalPosition: -1,
    newPosition: -1
  });

  // State for actual hours modal
  const [showActualHoursModal, setShowActualHoursModal] = useState(false);
  const [selectedTaskForHours, setSelectedTaskForHours] = useState<any>(null);

  const handleActualHoursClick = (task: any) => {
    setSelectedTaskForHours(task);
    setShowActualHoursModal(true);
  };

  // Data is now passed as props from parent component

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Enhanced sorting that maintains logical order while grouping linked tasks
  const sortedTasks = (() => {
    // CRITICAL INSIGHT: We need to be smarter about when to use order vs when to use chronological/date sorting
    // - For linked tasks: use their shared date for positioning in the chronological flow
    // - For unlinked sequential tasks: maintain their dependency chain visually 
    // - Only fall back to original order for truly independent tasks
    
    console.log('🔍 SORTING INPUT TASKS:', tasks.map(t => ({ 
      name: t.name, 
      order: t.order, 
      date: t.taskDate, 
      linked: !!t.linkedTaskGroup,
      sequential: t.dependentOnPrevious 
    })));
    
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
    
    // Create sortable units - but use CHRONOLOGICAL positioning, not order field
    const sortableUnits: any[] = [];
    
    // Add linked groups as units (positioned by their shared date)
    linkedGroups.forEach(groupTasks => {
      const sortedGroupTasks = [...groupTasks].sort((a, b) => {
        return (parseFloat(a.order) ?? 999) - (parseFloat(b.order) ?? 999);
      });
      
      const groupDate = new Date(groupTasks[0].taskDate).getTime();
      
      sortableUnits.push({
        type: 'group',
        linkedTaskGroup: groupTasks[0].linkedTaskGroup,
        sortDate: groupDate,
        sortOrder: Math.min(...groupTasks.map(t => parseFloat(t.order) ?? 999)), // Use earliest order for fallback
        tasks: sortedGroupTasks
      });
    });
    
    // Add individual unlinked tasks
    unlinkedTasks.forEach(task => {
      sortableUnits.push({
        type: 'single',
        task: task,
        sortDate: new Date(task.taskDate).getTime(),
        sortOrder: parseFloat(task.order) ?? 999,
        tasks: [task]
      });
    });
    
    // CRITICAL: Sort by DATE FIRST for chronological flow, then by order for user arrangements
    // This ensures logical chronological sequencing while preserving manual arrangements within the same date
    sortableUnits.sort((a, b) => {
      // Primary sort: by date for chronological flow
      const dateDiff = a.sortDate - b.sortDate;
      if (dateDiff !== 0) {
        return dateDiff;
      }
      
      // Secondary sort: by order when dates are identical (maintains user arrangements within same day)
      return a.sortOrder - b.sortOrder;
    });
    
    console.log('🔍 SORTED UNITS:', sortableUnits.map(unit => ({
      type: unit.type,
      date: new Date(unit.sortDate).toISOString().split('T')[0],
      order: unit.sortOrder,
      tasks: unit.tasks.map((t: any) => t.name)
    })));
    
    // Flatten to final task array
    const finalTasks: any[] = [];
    sortableUnits.forEach(unit => {
      finalTasks.push(...unit.tasks);
    });
    
    return finalTasks;
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

  // Handle linking the dragged task to the linked group
  const handleConfirmLink = async () => {
    const { draggedTask, linkedGroup, newPosition } = linkConfirmDialog;
    
    try {
      console.log('🔗 LINKING: Adding task to linked group', {
        task: draggedTask.name,
        linkedGroup: linkedGroup
      });
      
      // Find the target date for the linked group
      const linkedGroupTasks = sortedTasks.filter(t => t.linkedTaskGroup === linkedGroup);
      const targetDate = linkedGroupTasks.length > 0 ? linkedGroupTasks[0].taskDate : draggedTask.taskDate;
      
      // Update the task to be part of the linked group
      const updatedTask = {
        ...draggedTask,
        linkedTaskGroup: linkedGroup,
        taskDate: targetDate, // Set to same date as linked group
        dependentOnPrevious: false // Linked tasks are unsequential
      };
      
      // Create updated task list with the newly linked task
      const allTasks = sortedTasks.map(task => {
        if ((task.taskId || task.id) === (draggedTask.taskId || draggedTask.id)) {
          return updatedTask;
        }
        return task;
      });
      
      // CRITICAL: Apply targeted realignment to update downstream tasks
      console.log('🔄 REALIGNING: Sequential tasks after linking');
      const realignedTasks = realignDependentTasksAfter(allTasks, draggedTask.taskId || draggedTask.id);
      
      // Find tasks that actually changed
      const tasksToUpdate = realignedTasks.filter(task => {
        const originalTask = sortedTasks.find(orig => 
          (orig.taskId || orig.id) === (task.taskId || task.id)
        );
        return !originalTask || 
               originalTask.taskDate !== task.taskDate || 
               originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
               originalTask.dependentOnPrevious !== task.dependentOnPrevious;
      });
      
      console.log('🔄 BATCH UPDATE: Tasks to update after linking:', 
                  tasksToUpdate.map(t => ({ name: t.name, date: t.taskDate, linked: !!t.linkedTaskGroup })));
      
      // Batch update all affected tasks
      if (tasksToUpdate.length > 0) {
        await batchUpdateTasksMutation.mutateAsync(tasksToUpdate);
      }
      
      toast({
        title: "Task Linked",
        description: `${draggedTask.name} has been linked to the group. Sequential tasks updated.`
      });
      
    } catch (error: any) {
      console.error('Failed to link task:', error);
      toast({
        title: "Error",
        description: "Failed to link the task. Please try again.",
        variant: "destructive"
      });
    }
    
    // Close dialog
    setLinkConfirmDialog({ show: false, draggedTask: null, linkedGroup: '', originalPosition: -1, newPosition: -1 });
  };

  // Handle reverting the dragged task to original position
  const handleRevertPosition = () => {
    console.log('🔄 REVERTING: Task position restored');
    
    // Simply close the dialog - the task will stay in its original position
    setLinkConfirmDialog({ show: false, draggedTask: null, linkedGroup: '', originalPosition: -1, newPosition: -1 });
    
    // Force refresh to ensure UI is in sync
    queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "tasks"] });
  };

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
    
    // Only prevent moving upcoming tasks directly before a completed task
    const draggedTaskStatus = getTaskStatus(draggedTask, assignments as any[]);
    const targetTaskStatus = newIndex < sortedTasks.length ? getTaskStatus(sortedTasks[newIndex], assignments as any[]) : null;
    
    console.log('🔍 DRAG VALIDATION:', {
      draggedTask: draggedTask.name,
      draggedStatus: draggedTaskStatus,
      targetIndex: newIndex,
      targetTask: newIndex < sortedTasks.length ? sortedTasks[newIndex].name : 'end of list',
      targetStatus: targetTaskStatus
    });

    // Only prevent if we're moving an upcoming task directly before a completed task
    if (draggedTaskStatus !== 'complete' && targetTaskStatus === 'complete' && newIndex < sortedTasks.length) {
      console.log('🚫 DRAG END: Cannot drag upcoming task directly before completed task');
      toast({
        title: "Invalid Move",
        description: "Cannot move upcoming tasks directly before completed tasks",
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
    
    // CRITICAL: Check if dragging between two linked tasks
    if (!originalDraggedTask.linkedTaskGroup) {
      // Create a temporary array without the dragged task to see the final positions
      const tasksWithoutDragged = sortedTasks.filter((_, index) => index !== oldIndex);
      
      // CRITICAL: We need to determine the final positions after the drag operation
      // In drag operations, the newIndex represents where we're dropping relative to the target task
      
      // When dragging from oldIndex to newIndex, we need to figure out what tasks will be 
      // immediately before and after the insertion point in the final array
      
      let finalInsertionIndex;
      if (oldIndex < newIndex) {
        // Dragging forward: the insertion point is AFTER the target task
        finalInsertionIndex = newIndex; // Insert after the target task
      } else {
        // Dragging backward: the insertion point is BEFORE the target task  
        finalInsertionIndex = newIndex; // Insert before the target task
      }
      
      // Adjust for the removed task when calculating final positions
      const finalArray = [...tasksWithoutDragged];
      finalArray.splice(finalInsertionIndex, 0, originalDraggedTask);
      
      // Now find what tasks are actually before and after in the final position
      const finalDraggedIndex = finalArray.findIndex(t => t === originalDraggedTask);
      const taskBefore = finalDraggedIndex > 0 ? finalArray[finalDraggedIndex - 1] : null;
      const taskAfter = finalDraggedIndex < finalArray.length - 1 ? finalArray[finalDraggedIndex + 1] : null;
      
      // Log the full task order for debugging
      console.log('🔍 FULL TASK ORDER:', sortedTasks.map((t, i) => `${i}: ${t.name} (linked: ${!!t.linkedTaskGroup})`));
      console.log('🔍 TASKS WITHOUT DRAGGED:', tasksWithoutDragged.map((t, i) => `${i}: ${t.name} (linked: ${!!t.linkedTaskGroup})`));
      
      console.log('🔍 DRAG DETECTION DEBUG:', {
        draggedTask: originalDraggedTask.name,
        draggedLinked: originalDraggedTask.linkedTaskGroup,
        oldIndex,
        newIndex,
        finalInsertionIndex,
        finalDraggedIndex,
        taskBefore: taskBefore ? { name: taskBefore.name, linkedGroup: taskBefore.linkedTaskGroup } : null,
        taskAfter: taskAfter ? { name: taskAfter.name, linkedGroup: taskAfter.linkedTaskGroup } : null,
        hasTaskBefore: !!taskBefore,
        hasTaskAfter: !!taskAfter,
        taskBeforeLinked: !!taskBefore?.linkedTaskGroup,
        taskAfterLinked: !!taskAfter?.linkedTaskGroup,
        beforeGroup: taskBefore?.linkedTaskGroup || 'none',
        afterGroup: taskAfter?.linkedTaskGroup || 'none',
        sameGroup: taskBefore?.linkedTaskGroup === taskAfter?.linkedTaskGroup,
        shouldDetect: taskBefore?.linkedTaskGroup && taskAfter?.linkedTaskGroup && taskBefore.linkedTaskGroup === taskAfter.linkedTaskGroup
      });
      
      // Check if inserting between two tasks from the same linked group
      // CRITICAL: Both taskBefore AND taskAfter must exist AND be from the same linked group
      // AND we must be inserting truly BETWEEN them, not at the end of the group
      
      console.log('🔍 CONDITION CHECK DETAILED:');
      console.log('  hasTaskBefore:', !!taskBefore);
      console.log('  hasTaskAfter:', !!taskAfter);
      console.log('  taskBefore name:', taskBefore?.name || 'none');
      console.log('  taskAfter name:', taskAfter?.name || 'none');
      console.log('  taskBeforeLinked:', !!taskBefore?.linkedTaskGroup);
      console.log('  taskAfterLinked:', !!taskAfter?.linkedTaskGroup);
      console.log('  beforeGroup:', taskBefore?.linkedTaskGroup || 'none');
      console.log('  afterGroup:', taskAfter?.linkedTaskGroup || 'none');
      console.log('  sameGroup:', taskBefore?.linkedTaskGroup === taskAfter?.linkedTaskGroup);
      console.log('  differentTasks:', taskBefore !== taskAfter);
      console.log('  willEnterDetection:', taskBefore?.linkedTaskGroup && taskAfter?.linkedTaskGroup && 
                           taskBefore.linkedTaskGroup === taskAfter.linkedTaskGroup &&
                           taskBefore !== taskAfter);
      
      if (taskBefore?.linkedTaskGroup && taskAfter?.linkedTaskGroup && 
          taskBefore.linkedTaskGroup === taskAfter.linkedTaskGroup &&
          taskBefore !== taskAfter) { // Ensure they are different tasks
        
        // Additional check: Determine if we're truly BETWEEN linked tasks or just after them
        // We need to check the actual insertion position, not just the target task
        console.log('🔍 INSERTION POSITION ANALYSIS:', {
          finalInsertionIndex,
          finalDraggedIndex,
          taskBefore: taskBefore ? taskBefore.name : 'none',
          taskAfter: taskAfter ? taskAfter.name : 'none',
          beforeLinked: !!taskBefore?.linkedTaskGroup,
          afterLinked: !!taskAfter?.linkedTaskGroup,
          bothLinked: !!taskBefore?.linkedTaskGroup && !!taskAfter?.linkedTaskGroup,
          sameGroup: taskBefore?.linkedTaskGroup === taskAfter?.linkedTaskGroup
        });
        
        // We're truly BETWEEN linked tasks if:
        // 1. Both taskBefore and taskAfter exist
        // 2. Both are from the same linked group  
        // 3. We're not at the very end of the array
        const isTrulyBetweenLinkedTasks = taskBefore?.linkedTaskGroup && 
                                         taskAfter?.linkedTaskGroup && 
                                         taskBefore.linkedTaskGroup === taskAfter.linkedTaskGroup &&
                                         taskAfter !== null; // Ensure we're not at the end
        
        if (isTrulyBetweenLinkedTasks) {
          console.log('🔗 DETECTED: Dragging between linked tasks!', {
            draggedTask: originalDraggedTask.name,
            linkedGroup: taskBefore.linkedTaskGroup,
            taskBefore: taskBefore.name,
            taskAfter: taskAfter.name
          });
          
          // Show confirmation dialog
          setLinkConfirmDialog({
            show: true,
            draggedTask: originalDraggedTask,
            linkedGroup: taskBefore.linkedTaskGroup,
            originalPosition: oldIndex,
            newPosition: newIndex
          });
          
          return; // Stop processing until user decides
        } else {
          console.log('🚫 NOT BETWEEN LINKED TASKS: Proceeding with normal reorder');
        }
      }
    }

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
                onActualHoursClick={handleActualHoursClick}
                onDailyJobReport={onDailyJobReport}
                onEditHistory={onEditHistory}
                onTaskUpdate={onTaskUpdate || (() => {})}
                employees={employees as any[]}
                assignments={assignments as any[]}
                users={users as any[]}
                remainingHours={(() => {
                  const result = calculateRemainingHours(task, sortedTasks, budgetItems as any[], assignments as any[]);
                  return result?.remainingHours;
                })()}
                remainingHoursColor={(() => {
                  const result = calculateRemainingHours(task, sortedTasks, budgetItems as any[], assignments as any[]);
                  const remainingHours = result?.remainingHours;
                  const totalBudgetHours = result?.totalBudgetHours || 0;
                  return getRemainingHoursColor(remainingHours || 0, totalBudgetHours);
                })()}
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
      {/* Link Confirmation Dialog */}
      <AlertDialog open={linkConfirmDialog.show} onOpenChange={(open) => !open && handleRevertPosition()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-600" />
              Link Task to Group?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've placed "{linkConfirmDialog.draggedTask?.name}" between linked tasks. 
              Would you like to link this task to the group so they all have the same date and move together?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRevertPosition}>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLink}>
              Yes, link to group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Actual Hours Modal */}
      <ActualHoursModal
        isOpen={showActualHoursModal}
        onClose={() => {
          setShowActualHoursModal(false);
          setSelectedTaskForHours(null);
        }}
        task={selectedTaskForHours}
        assignments={assignments as any[]}
        employees={employees as any[]}
        locationId={locationId}
        onUpdate={onTaskUpdate}
      />
    </div>
  );
}