// Custom Excel parser for the specific SW62 format
import { BudgetLineItem } from './budgetCalculations';
import { normalizeCostCode } from './budgetTemplateUtils';

// Custom column mapping for SW62 format
export const SW62_COLUMN_MAPPING = {
  lineItemNumber: 0,      // "Line Item"
  lineItemName: 1,        // "SW62 - Centinela"
  unconvertedUnit: 2,     // "Unit"
  unconvertedQty: 3,      // "QTY"
  actualQty: 4,           // "Actuals"
  unitCost: 5,            // "Unit Cost"
  unitTotal: 6,           // "Unit Total"
  costCode: 7,            // "Cost Code"
  convertedUnit: 8,       // "UM"
  convertedQty: 9,        // "QTY"
  productionRate: 10,     // "PX"
  hours: 11,              // "HRS"
  laborCost: 12,          // "LBR COST"
  equipmentCost: 13,      // "EQUIP"
  truckingCost: 14,       // "TRUCKING"
  dumpFeesCost: 15,       // "DUMP FEES"
  materialCost: 16,       // "MATERIAL"
  subcontractorCost: 17,  // "SUB"
  budgetTotal: 18,        // "BUDGET"
  profit: 19              // "PROFIT"
};

export interface ProjectBudgetItem {
  lineItemNumber: string;
  lineItemName: string;
  costCode: string;
  unconvertedUnitOfMeasure: string;
  unconvertedQty: string;
  unitCost: string;
  unitTotal: string;
  convertedUnitOfMeasure: string;
  convertedQty: string;
  productionRate: string;
  hours: string;
  laborCost: string;
  equipmentCost: string;
  truckingCost: string;
  dumpFeesCost: string;
  materialCost: string;
  subcontractorCost: string;
  budgetTotal: string;
  profit: string;
  isGroup: boolean;
}

const parseRowToProjectBudgetItem = (row: any[]): ProjectBudgetItem | null => {
  // Skip rows where line item number is blank or undefined
  if (!row[SW62_COLUMN_MAPPING.lineItemNumber] || 
      row[SW62_COLUMN_MAPPING.lineItemNumber].toString().trim() === '') {
    return null;
  }

  const lineItemNumber = row[SW62_COLUMN_MAPPING.lineItemNumber].toString().trim();
  
  // Helper to get raw value as string (preserve exact Excel data)
  const getRawValue = (index: number): string => {
    const val = row[index];
    if (val === null || val === undefined || val === '') return '';
    return val.toString().trim();
  };
  
  // Helper to get numeric value as string (handles accounting format with parentheses for negatives)
  const getNumericValue = (index: number): string => {
    const val = row[index];
    if (val === null || val === undefined || val === '') return '0';
    let strVal = val.toString().trim();
    
    // Handle accounting format: (123.45) means -123.45
    if (strVal.startsWith('(') && strVal.endsWith(')')) {
      strVal = '-' + strVal.slice(1, -1);
    }
    
    // Remove any currency symbols or commas
    strVal = strVal.replace(/[$,]/g, '');
    
    const num = parseFloat(strVal);
    return isNaN(num) ? '0' : num.toString();
  };

  // Check if this is a group/category row (no quantities)
  const hasQuantity = getRawValue(SW62_COLUMN_MAPPING.unconvertedQty) !== '';
  const hasConvertedQty = getRawValue(SW62_COLUMN_MAPPING.convertedQty) !== '';
  const isGroup = !hasQuantity && !hasConvertedQty;

  return {
    lineItemNumber,
    lineItemName: getRawValue(SW62_COLUMN_MAPPING.lineItemName),
    costCode: normalizeCostCode(getRawValue(SW62_COLUMN_MAPPING.costCode)),
    unconvertedUnitOfMeasure: getRawValue(SW62_COLUMN_MAPPING.unconvertedUnit),
    unconvertedQty: getNumericValue(SW62_COLUMN_MAPPING.unconvertedQty),
    unitCost: getNumericValue(SW62_COLUMN_MAPPING.unitCost),
    unitTotal: getNumericValue(SW62_COLUMN_MAPPING.unitTotal),
    convertedUnitOfMeasure: getRawValue(SW62_COLUMN_MAPPING.convertedUnit),
    convertedQty: getNumericValue(SW62_COLUMN_MAPPING.convertedQty),
    productionRate: getNumericValue(SW62_COLUMN_MAPPING.productionRate),
    hours: getNumericValue(SW62_COLUMN_MAPPING.hours),
    laborCost: getNumericValue(SW62_COLUMN_MAPPING.laborCost),
    equipmentCost: getNumericValue(SW62_COLUMN_MAPPING.equipmentCost),
    truckingCost: getNumericValue(SW62_COLUMN_MAPPING.truckingCost),
    dumpFeesCost: getNumericValue(SW62_COLUMN_MAPPING.dumpFeesCost),
    materialCost: getNumericValue(SW62_COLUMN_MAPPING.materialCost),
    subcontractorCost: getNumericValue(SW62_COLUMN_MAPPING.subcontractorCost),
    budgetTotal: getNumericValue(SW62_COLUMN_MAPPING.budgetTotal),
    profit: getNumericValue(SW62_COLUMN_MAPPING.profit),
    isGroup,
  };
};

export const parseSW62ExcelRow = (row: any[], locationId?: number): BudgetLineItem | null => {
  const parsed = parseRowToProjectBudgetItem(row);
  if (!parsed) return null;
  
  // For location budget, skip group items
  if (parsed.isGroup) return null;
  
  const unconvertedQty = parseFloat(parsed.unconvertedQty);
  const convertedQty = parseFloat(parsed.convertedQty);
  const conversionFactor = unconvertedQty !== 0 ? convertedQty / unconvertedQty : 1;

  return {
    locationId: locationId || 0,
    lineItemNumber: parsed.lineItemNumber,
    lineItemName: parsed.lineItemName,
    unconvertedUnitOfMeasure: parsed.unconvertedUnitOfMeasure,
    unconvertedQty: parsed.unconvertedQty,
    actualQty: "0",
    unitCost: parsed.unitCost,
    unitTotal: parsed.unitTotal,
    convertedQty: parsed.convertedQty,
    convertedUnitOfMeasure: parsed.convertedUnitOfMeasure,
    conversionFactor: conversionFactor.toString(),
    costCode: parsed.costCode,
    productionRate: parsed.productionRate,
    hours: parsed.hours,
    budgetTotal: parsed.budgetTotal,
    billing: parsed.profit,
    laborCost: parsed.laborCost,
    equipmentCost: parsed.equipmentCost,
    truckingCost: parsed.truckingCost,
    dumpFeesCost: parsed.dumpFeesCost,
    materialCost: parsed.materialCost,
    subcontractorCost: parsed.subcontractorCost,
    notes: "",
  };
};

export const parseSW62ExcelRowForProject = (row: any[]): ProjectBudgetItem | null => {
  return parseRowToProjectBudgetItem(row);
};