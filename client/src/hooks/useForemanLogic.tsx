import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ForemanDisplayInfo {
  id: number;
  name: string;
  displayText: string;
  isBold: boolean;
}

interface UseForemanLogicProps {
  task: any;
  assignments: any[];
  employees: any[];
  onTaskUpdate?: () => void;
}

export function useForemanLogic({ task, assignments, employees, onTaskUpdate }: UseForemanLogicProps) {
  const [showForemanModal, setShowForemanModal] = useState(false);
  const [foremanSelectionType, setForemanSelectionType] = useState<'overall' | 'responsible'>('overall');
  
  const queryClient = useQueryClient();

  // Static calculations without useEffect to prevent loops
  const allForemen = employees.filter(emp => emp.isForeman === true && !emp.isInactive);
  
  const taskAssignments = assignments.filter(assignment => 
    assignment.taskId === task.id || assignment.taskId === task.taskId
  );
  
  const assignedForemenIds = taskAssignments
    .map(assignment => assignment.employeeId)
    .filter((id, index, array) => array.indexOf(id) === index); // Remove duplicates
  
  const assignedForemen = allForemen.filter(foreman => 
    assignedForemenIds.includes(foreman.id)
  );

  // Calculate foreman display (no state updates here)
  const foremanDisplay = useMemo(() => {
    // If task already has a foremanId set, use that
    if (task.foremanId) {
      const currentForeman = allForemen.find(f => f.id === task.foremanId);
      if (currentForeman) {
        const assignedCount = assignedForemen.length;
        let displayText = '';
        
        if (assignedCount === 0) {
          displayText = '(Responsible Foreman)';
        } else if (assignedCount === 1) {
          displayText = '(Foreman)';
        } else {
          displayText = '(Overall Foreman)';
        }
        
        return {
          id: currentForeman.id,
          name: currentForeman.name,
          displayText,
          isBold: assignedCount > 0 // Bold if actually assigned
        };
      }
    }

    // Single foreman case
    if (assignedForemen.length === 1) {
      const foreman = assignedForemen[0];
      return {
        id: foreman.id,
        name: foreman.name,
        displayText: '(Foreman)',
        isBold: true
      };
    }

    return null;
  }, [task.foremanId, assignedForemen, allForemen]);

  // Mutation to update task foreman
  const updateTaskForemanMutation = useMutation({
    mutationFn: async ({ taskId, foremanId }: { taskId: number; foremanId: number }) => {
      console.log('🔧 UPDATING TASK FOREMAN:', { taskId, foremanId });
      return apiRequest(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ foremanId }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      console.log('✅ FOREMAN UPDATE SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', task.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations', task.locationId, 'tasks'] });
      onTaskUpdate?.();
    },
    onError: (error) => {
      console.error('❌ FOREMAN UPDATE FAILED:', error);
    }
  });

  // Function to trigger foreman selection
  const triggerForemanSelection = () => {
    if (assignedForemen.length >= 2) {
      setForemanSelectionType('overall');
      setShowForemanModal(true);
    } else if (assignedForemen.length === 0) {
      setForemanSelectionType('responsible');
      setShowForemanModal(true);
    }
    // Single foreman case is handled automatically
  };

  // Check if foreman selection is needed (but don't auto-trigger)
  const needsForemanSelection = assignedForemen.length >= 2 && !task.foremanId;

  // Listen for custom event to trigger foreman selection after assignment saves
  useEffect(() => {
    const handleForemanTrigger = (event: CustomEvent) => {
      const { taskId: eventTaskId, type = 'overall' } = event.detail;
      
      // Only trigger for this specific task
      if (eventTaskId == task.id || eventTaskId == task.taskId) {
        console.log('🔍 FOREMAN EVENT: Triggering', type, 'selection for', task.name);
        setForemanSelectionType(type);
        setShowForemanModal(true);
      }
    };

    window.addEventListener('triggerForemanSelection', handleForemanTrigger as EventListener);
    
    return () => {
      window.removeEventListener('triggerForemanSelection', handleForemanTrigger as EventListener);
    };
  }, [task.id, task.taskId, task.name]);

  // Handle foreman selection from modal
  const handleForemanSelection = (foremanId: number) => {
    updateTaskForemanMutation.mutate({ 
      taskId: task.id, 
      foremanId 
    });
    setShowForemanModal(false);
  };

  return {
    foremanDisplay,
    showForemanModal,
    setShowForemanModal,
    foremanSelectionType,
    assignedForemen,
    allForemen,
    triggerForemanSelection,
    handleForemanSelection,
    needsForemanSelection
  };
}