// Budget calculation utilities for handling Excel formulas
import { normalizeCostCode } from "./budgetTemplateUtils";

export interface BudgetLineItem {
  id?: number;
  locationId: number;
  lineItemNumber: string;
  lineItemName: string;
  unconvertedUnitOfMeasure: string;
  unconvertedQty: string;
  actualQty: string;
  unitCost: string;
  unitTotal: string;
  convertedQty: string;
  convertedUnitOfMeasure: string;
  conversionFactor: string;
  costCode: string;
  productionRate: string;
  hours: string;
  budgetTotal: string;
  billing: string;
  laborCost: string;
  equipmentCost: string;
  truckingCost: string;
  dumpFeesCost: string;
  materialCost: string;
  subcontractorCost: string;
  notes: string;
}

// Excel column mapping based on your description
export const EXCEL_COLUMN_MAPPING = {
  lineItemNumber: 0,    // Column A (1)
  lineItemName: 1,      // Column B (2) 
  unconvertedUnit: 2,   // Column C (3)
  unconvertedQty: 3,    // Column D (4)
  actualQty: 4,         // Column E (5)
  unitCost: 5,          // Column F (6)
  unitTotal: 6,         // Column G (7) - Formula: unitCost * unconvertedQty
  // Column H (8) is blank
  costCode: 8,          // Column I (9)
  convertedUnit: 9,     // Column J (10)
  convertedQty: 10,     // Column K (11) - Formula: unconvertedQty * conversionFactor
  productionRate: 11,   // Column L (12)
  hours: 12,            // Column M (13) - Formula: convertedQty * productionRate
  laborCost: 13,        // Column N (14) - Formula: hours * 80
  equipmentCost: 14,    // Column O (15)
  truckingCost: 15,     // Column P (16)
  dumpFeesCost: 16,     // Column Q (17)
  materialCost: 17,     // Column R (18)
  subcontractorCost: 18, // Column S (19)
  budgetTotal: 19,      // Column T (20) - Formula: sum(laborCost + equipmentCost + truckingCost + dumpFeesCost + materialCost + subcontractorCost)
  billing: 20           // Column U (21) - Equal to unitTotal
};

// Calculate formulas based on the Excel logic
export const calculateBudgetFormulas = (item: Partial<BudgetLineItem>): BudgetLineItem => {
  const unconvertedQty = parseFloat(item.unconvertedQty || "0");
  const unitCost = parseFloat(item.unitCost || "0");
  const conversionFactor = parseFloat(item.conversionFactor || "1");
  const productionRate = parseFloat(item.productionRate || "0");
  
  // Formula calculations
  const convertedQty = unconvertedQty * conversionFactor;
  const unitTotal = unconvertedQty * unitCost; // Unit total = QTY × unit cost (using unconvertedQty as specified)
  const hours = convertedQty * productionRate; // Hours = converted qty * PX
  const laborCost = hours * 90; // $90 per hour
  
  const equipmentCost = parseFloat(item.equipmentCost || "0");
  const truckingCost = parseFloat(item.truckingCost || "0");
  const dumpFeesCost = parseFloat(item.dumpFeesCost || "0");
  const materialCost = parseFloat(item.materialCost || "0");
  const subcontractorCost = parseFloat(item.subcontractorCost || "0");
  
  const budgetTotal = laborCost + equipmentCost + truckingCost + dumpFeesCost + materialCost + subcontractorCost;
  const billing = unitTotal; // Equal to unitTotal
  
  return {
    id: item.id,
    locationId: item.locationId || 0,
    lineItemNumber: item.lineItemNumber || "",
    lineItemName: item.lineItemName || "",
    unconvertedUnitOfMeasure: item.unconvertedUnitOfMeasure || "",
    unconvertedQty: item.unconvertedQty || "0",
    actualQty: item.actualQty || "0",
    unitCost: item.unitCost || "0",
    unitTotal: unitTotal.toFixed(2),
    convertedQty: convertedQty.toFixed(2),
    convertedUnitOfMeasure: item.convertedUnitOfMeasure || "",
    conversionFactor: item.conversionFactor || "1",
    costCode: item.costCode || "",
    productionRate: item.productionRate || "0",
    hours: hours.toFixed(2),
    budgetTotal: budgetTotal.toFixed(2),
    billing: billing.toFixed(2),
    laborCost: laborCost.toFixed(2),
    equipmentCost: item.equipmentCost || "0",
    truckingCost: item.truckingCost || "0",
    dumpFeesCost: item.dumpFeesCost || "0",
    materialCost: item.materialCost || "0",
    subcontractorCost: item.subcontractorCost || "0",
    notes: item.notes || "",
  };
};

// Parse Excel row data into budget line item
export const parseExcelRowToBudgetItem = (row: any[], locationId: number): BudgetLineItem | null => {
  // Skip rows where line item number is blank
  if (!row[EXCEL_COLUMN_MAPPING.lineItemNumber]) {
    return null;
  }
  
  const rawItem: Partial<BudgetLineItem> = {
    locationId,
    lineItemNumber: row[EXCEL_COLUMN_MAPPING.lineItemNumber]?.toString() || "",
    lineItemName: row[EXCEL_COLUMN_MAPPING.lineItemName]?.toString() || "",
    unconvertedUnitOfMeasure: row[EXCEL_COLUMN_MAPPING.unconvertedUnit]?.toString() || "",
    unconvertedQty: row[EXCEL_COLUMN_MAPPING.unconvertedQty]?.toString() || "0",
    actualQty: row[EXCEL_COLUMN_MAPPING.actualQty]?.toString() || "0",
    unitCost: row[EXCEL_COLUMN_MAPPING.unitCost]?.toString() || "0",
    convertedUnitOfMeasure: row[EXCEL_COLUMN_MAPPING.convertedUnit]?.toString() || "",
    costCode: normalizeCostCode(row[EXCEL_COLUMN_MAPPING.costCode]?.toString() || ""),
    productionRate: row[EXCEL_COLUMN_MAPPING.productionRate]?.toString() || "0",
    equipmentCost: row[EXCEL_COLUMN_MAPPING.equipmentCost]?.toString() || "0",
    truckingCost: row[EXCEL_COLUMN_MAPPING.truckingCost]?.toString() || "0",
    dumpFeesCost: row[EXCEL_COLUMN_MAPPING.dumpFeesCost]?.toString() || "0",
    materialCost: row[EXCEL_COLUMN_MAPPING.materialCost]?.toString() || "0",
    subcontractorCost: row[EXCEL_COLUMN_MAPPING.subcontractorCost]?.toString() || "0",
    notes: "",
  };
  
  // Calculate conversion factor from Excel data
  const excelConvertedQty = parseFloat(row[EXCEL_COLUMN_MAPPING.convertedQty]?.toString() || "0");
  const unconvertedQty = parseFloat(rawItem.unconvertedQty || "0");
  const conversionFactor = unconvertedQty !== 0 ? excelConvertedQty / unconvertedQty : 1;
  rawItem.conversionFactor = conversionFactor.toString();
  
  return calculateBudgetFormulas(rawItem);
};

// Recalculate formulas when unconverted qty changes
export const recalculateOnQtyChange = (item: BudgetLineItem, newUnconvertedQty: string): BudgetLineItem => {
  return calculateBudgetFormulas({
    ...item,
    unconvertedQty: newUnconvertedQty
  });
};