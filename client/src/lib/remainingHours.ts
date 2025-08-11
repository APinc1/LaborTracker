// Utility functions for remaining hours calculation with color coding

export interface RemainingHoursData {
  budgetHours: number;
  usedHours: number;
  remainingHours: number;
  remainingPercentage: number;
  colorClass: string;
  colorCode: 'green' | 'yellow' | 'red';
  display: string;
}

/**
 * Calculate remaining hours for a cost code with color coding
 * @param costCode - The cost code to calculate for
 * @param budgetItems - Array of budget line items
 * @param tasks - Array of tasks
 * @returns RemainingHoursData with color coding
 */
export function calculateRemainingHours(
  costCode: string | null | undefined,
  budgetItems: any[] = [],
  tasks: any[] = []
): RemainingHoursData {
  // Handle null/undefined cost codes
  if (!costCode) {
    return {
      budgetHours: 0,
      usedHours: 0,
      remainingHours: 0,
      remainingPercentage: 0,
      colorClass: 'text-gray-500 bg-gray-100',
      colorCode: 'red',
      display: 'No Cost Code'
    };
  }

  // Normalize cost code for matching (handle variations in formatting)
  const normalizedCostCode = normalizeCostCode(costCode);

  // Calculate budget hours for this cost code
  const budgetHours = budgetItems
    .filter(item => item && normalizeCostCode(item.cost_code || item.costCode) === normalizedCostCode)
    .reduce((sum, item) => sum + (parseFloat(item.hours) || 0), 0);

  // Calculate used hours from tasks with this cost code
  const usedHours = tasks
    .filter(task => task && normalizeCostCode(task.cost_code || task.costCode) === normalizedCostCode)
    .reduce((sum, task) => sum + (parseFloat(task.estimated_hours || task.estimatedHours) || 0), 0);

  // Calculate remaining hours
  const remainingHours = budgetHours - usedHours;
  const remainingPercentage = budgetHours > 0 ? (remainingHours / budgetHours) * 100 : 0;

  // Determine color coding based on remaining percentage
  let colorClass: string;
  let colorCode: 'green' | 'yellow' | 'red';

  if (remainingHours <= 0) {
    // Red: No hours remaining or over budget
    colorClass = 'text-red-700 bg-red-100 border-red-200';
    colorCode = 'red';
  } else if (remainingPercentage <= 15) {
    // Yellow: 15% or less remaining
    colorClass = 'text-yellow-700 bg-yellow-100 border-yellow-200';
    colorCode = 'yellow';
  } else {
    // Green: More than 15% remaining
    colorClass = 'text-green-700 bg-green-100 border-green-200';
    colorCode = 'green';
  }

  // Create display string
  let display: string;
  if (budgetHours === 0) {
    display = `${usedHours}h used (no budget)`;
  } else {
    display = `${remainingHours.toFixed(1)}h remaining`;
  }

  return {
    budgetHours,
    usedHours,
    remainingHours,
    remainingPercentage,
    colorClass,
    colorCode,
    display
  };
}

/**
 * Normalize cost code for consistent matching
 * Handles variations like "TRAFFIC CONTROL" vs "Traffic Control" vs "traffic control"
 */
function normalizeCostCode(costCode: string | null | undefined): string {
  if (!costCode) return '';
  
  return costCode
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, ''); // Remove special characters except letters, numbers, and spaces
}

/**
 * Get remaining hours summary for multiple cost codes
 */
export function getRemainingHoursSummary(
  costCodes: string[],
  budgetItems: any[] = [],
  tasks: any[] = []
): Record<string, RemainingHoursData> {
  const summary: Record<string, RemainingHoursData> = {};
  
  costCodes.forEach(costCode => {
    summary[costCode] = calculateRemainingHours(costCode, budgetItems, tasks);
  });
  
  return summary;
}

/**
 * Get color indicator component for remaining hours
 */
export function getRemainingHoursIndicator(data: RemainingHoursData) {
  if (!data) return null;
  
  const { colorCode, display } = data;
  
  // Return appropriate icon based on color code
  switch (colorCode) {
    case 'green':
      return { 
        icon: '🟢', 
        text: display, 
        className: 'text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded text-xs font-medium'
      };
    case 'yellow':
      return { 
        icon: '🟡', 
        text: display, 
        className: 'text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded text-xs font-medium'
      };
    case 'red':
      return { 
        icon: '🔴', 
        text: display, 
        className: 'text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded text-xs font-medium'
      };
    default:
      return { 
        icon: '⚪', 
        text: display, 
        className: 'text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded text-xs font-medium'
      };
  }
}