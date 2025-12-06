// Custom Excel parser for the specific SW62 format
import { BudgetLineItem } from './budgetCalculations';

// Custom column mapping for SW62 format
export const SW62_COLUMN_MAPPING = {
  lineItemNumber: 0,      // "Line Item"
  lineItemName: 1,        // "SW62 - Centinela"
  unconvertedUnit: 2,     // "Unit"
  unconvertedQty: 3,      // "QTY"
  actualQty: 4,           // "Actuals"
  unitCost: 5,            // "Unit Cost"
  unitTotal: 6,           // "Unit Total"
  // Column 7 is empty in this format
  costCode: 8,            // "Cost Code"
  convertedUnit: 9,       // "UM"
  convertedQty: 10,       // "QTY"
  productionRate: 11,     // "PX"
  hours: 12,              // "HRS"
  laborCost: 13,          // "LBR COST"
  equipmentCost: 14,      // "EQUIP"
  truckingCost: 15,       // "TRUCKING"
  dumpFeesCost: 16,       // "DUMP FEES"
  materialCost: 17,       // "MATERIAL"
  subcontractorCost: 18,  // "SUB"
  budgetTotal: 19,        // "BUDGET"
  billing: 20             // "BILLINGS"
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
  billing: string;
  isGroup: boolean;
}

export const parseSW62ExcelRow = (row: any[]): ProjectBudgetItem | null => {
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
  
  // Helper to get numeric value as string
  const getNumericValue = (index: number): string => {
    const val = row[index];
    if (val === null || val === undefined || val === '') return '0';
    const num = parseFloat(val.toString());
    return isNaN(num) ? '0' : num.toString();
  };

  // Check if this is a group/category row (no quantities)
  const hasQuantity = getRawValue(SW62_COLUMN_MAPPING.unconvertedQty) !== '';
  const hasConvertedQty = getRawValue(SW62_COLUMN_MAPPING.convertedQty) !== '';
  const isGroup = !hasQuantity && !hasConvertedQty;

  return {
    lineItemNumber,
    lineItemName: getRawValue(SW62_COLUMN_MAPPING.lineItemName),
    costCode: getRawValue(SW62_COLUMN_MAPPING.costCode),
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
    billing: getNumericValue(SW62_COLUMN_MAPPING.billing),
    isGroup,
  };
};

export const parseSW62ExcelRowForLocation = (row: any[], locationId: number): BudgetLineItem | null => {
  const parsed = parseSW62ExcelRow(row);
  if (!parsed || parsed.isGroup) return null;
  
  const unconvertedQty = parseFloat(parsed.unconvertedQty);
  const convertedQty = parseFloat(parsed.convertedQty);
  const conversionFactor = unconvertedQty !== 0 ? convertedQty / unconvertedQty : 1;

  return {
    locationId,
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
    billing: parsed.billing,
    laborCost: parsed.laborCost,
    equipmentCost: parsed.equipmentCost,
    truckingCost: parsed.truckingCost,
    dumpFeesCost: parsed.dumpFeesCost,
    materialCost: parsed.materialCost,
    subcontractorCost: parsed.subcontractorCost,
    notes: "",
  };
};