import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MapPin, Tag, Clock, Users, User } from 'lucide-react';
import { ForemanSelectionModal } from '@/components/ForemanSelectionModal';
import { useForemanLogic } from '@/hooks/useForemanLogic';

interface TaskCardWithForemanProps {
  task: any;
  taskAssignments: any[];
  remainingHours: number;
  remainingHoursColor: string;
  budgetHours: number;
  projectName: string;
  locationName: string;
  actualHours: number;
  scheduledHours: number;
  showAssignmentToggle: boolean;
  users: any[];
  getEmployeeInfo: (id: number) => any;
  employees: any[];
  assignments: any[];
  onTaskUpdate?: () => void;
}

export function TaskCardWithForeman({
  task,
  taskAssignments,
  remainingHours,
  remainingHoursColor,
  budgetHours,
  projectName,
  locationName,
  actualHours,
  scheduledHours,
  showAssignmentToggle,
  users,
  getEmployeeInfo,
  employees,
  assignments,
  onTaskUpdate
}: TaskCardWithForemanProps) {
  
  console.log(`🎯 TaskCardWithForeman ${task.name}:`, { 
    remainingHours, 
    type: typeof remainingHours,
    isNull: remainingHours === null,
    isUndefined: remainingHours === undefined 
  });
  
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
    onTaskUpdate
  });

  return (
    <>
      <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
        <div className="space-y-3">
          {/* Task Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-medium text-gray-900">{task.name}</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{format(new Date(task.taskDate), "MMM d")}</span>
                <span className="text-gray-400">•</span>
                <Badge variant="secondary" className="text-xs">
                  {task.status?.replace('_', ' ') || 'upcoming'}
                </Badge>
              </div>
            </div>
            
            {/* Cost Code Progress - show remaining hours for tasks with cost codes that have budget */}
            {remainingHours !== null && remainingHours !== undefined && (
              <div className="text-right space-y-1">
                <div className="text-sm font-medium">
                  <span className={remainingHoursColor}>
                    {remainingHours.toFixed(1)}h remaining
                  </span>
                </div>
                {budgetHours > 0 && (
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${remainingHours <= 0 ? 'bg-red-500' : remainingHours / budgetHours <= 0.15 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, (remainingHours / budgetHours) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project and Location */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">{projectName}</span>
            <span className="text-gray-400">•</span>
            <span>{locationName}</span>
          </div>

          {/* Cost Code */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Tag className="w-4 h-4" />
            <Badge variant="outline" className="text-xs">
              {task.costCode}
            </Badge>
          </div>

          {/* Hours Information */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{scheduledHours.toFixed(1)}h scheduled</span>
            {actualHours > 0 && (
              <span className="text-green-600">/ {actualHours.toFixed(1)}h actual</span>
            )}
          </div>

          {/* Superintendent, Foreman, and Assigned Employees - Only show when toggle is enabled */}
          {showAssignmentToggle && (task.superintendentId || taskAssignments.length > 0 || foremanDisplay) && (
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>Personnel:</span>
                {/* Foreman Selection Button */}
                {needsForemanSelection && (
                  <button
                    onClick={triggerForemanSelection}
                    className="text-blue-600 hover:text-blue-800 text-xs ml-2"
                    title="Select foreman"
                  >
                    <User className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="ml-6 space-y-1">
                {/* Superintendent */}
                {task.superintendentId && (
                  <div className="text-xs">
                    <span className="font-bold text-gray-800">
                      {(users as any[]).find(u => u.id === task.superintendentId)?.name || 'Superintendent'} (Super)
                    </span>
                  </div>
                )}

                {/* Foreman Display */}
                {foremanDisplay && (
                  <div className="text-xs">
                    <span className={foremanDisplay.isBold ? 'font-bold text-gray-800' : 'text-gray-600'}>
                      {foremanDisplay.name} {foremanDisplay.displayText}
                    </span>
                  </div>
                )}
                
                {/* Assigned Employees */}
                {taskAssignments.map((assignment: any) => {
                  const employee = getEmployeeInfo(assignment.employeeId);
                  if (!employee) return null;
                  
                  const isForeman = employee.isForeman === true;
                  const isDriver = employee.primaryTrade === 'Driver' || employee.secondaryTrade === 'Driver';
                  const assignedHours = parseFloat(assignment.assignedHours) || 0;
                  
                  // Skip displaying foreman in the regular list if they're already shown above
                  if (isForeman && foremanDisplay && employee.id === foremanDisplay.id) {
                    return null;
                  }
                  
                  return (
                    <div key={assignment.id} className="text-xs">
                      <span className={isForeman ? 'text-gray-600' : 'text-gray-600'}>
                        {employee.name}
                        {isForeman && ' (Foreman)'}
                        {isDriver && ' (Driver)'}
                        {assignedHours !== 8 && ` (${assignedHours}h)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Task Description and Notes */}
        {(task.description || task.workDescription || task.notes) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {(task.description || task.workDescription) && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Description: </span>
                {task.description || task.workDescription}
              </p>
            )}
            {task.notes && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Notes: </span>
                {task.notes}
              </p>
            )}
          </div>
        )}
      </div>

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
    </>
  );
}