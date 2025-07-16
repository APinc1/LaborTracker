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

export const parseSW62ExcelRow = (row: any[], locationId: number): BudgetLineItem | null => {
  // Skip rows where line item number is blank or undefined
  if (!row[SW62_COLUMN_MAPPING.lineItemNumber] || 
      row[SW62_COLUMN_MAPPING.lineItemNumber].toString().trim() === '') {
    return null;
  }

  // Skip header/category rows (these usually have no quantity or cost data)
  const hasQuantity = row[SW62_COLUMN_MAPPING.unconvertedQty] && 
                     row[SW62_COLUMN_MAPPING.unconvertedQty].toString().trim() !== '';
  const hasConvertedQty = row[SW62_COLUMN_MAPPING.convertedQty] && 
                         row[SW62_COLUMN_MAPPING.convertedQty].toString().trim() !== '';

  if (!hasQuantity && !hasConvertedQty) {
    return null;
  }

  // Parse values with defaults
  const unconvertedQty = parseFloat(row[SW62_COLUMN_MAPPING.unconvertedQty]?.toString() || "0");
  const convertedQty = parseFloat(row[SW62_COLUMN_MAPPING.convertedQty]?.toString() || "0");
  const unitCost = parseFloat(row[SW62_COLUMN_MAPPING.unitCost]?.toString() || "0");
  const productionRate = parseFloat(row[SW62_COLUMN_MAPPING.productionRate]?.toString() || "0");

  // Calculate conversion factor
  const conversionFactor = unconvertedQty !== 0 ? convertedQty / unconvertedQty : 1;

  // Calculate unit total if not provided
  const unitTotal = row[SW62_COLUMN_MAPPING.unitTotal] ? 
    parseFloat(row[SW62_COLUMN_MAPPING.unitTotal].toString()) : 
    unconvertedQty * unitCost;

  // Calculate hours if not provided
  const hours = row[SW62_COLUMN_MAPPING.hours] ? 
    parseFloat(row[SW62_COLUMN_MAPPING.hours].toString()) : 
    convertedQty * productionRate;

  // Calculate labor cost if not provided
  const laborCost = row[SW62_COLUMN_MAPPING.laborCost] ? 
    parseFloat(row[SW62_COLUMN_MAPPING.laborCost].toString()) : 
    hours * 80; // $80/hour

  // Parse other costs
  const equipmentCost = parseFloat(row[SW62_COLUMN_MAPPING.equipmentCost]?.toString() || "0");
  const truckingCost = parseFloat(row[SW62_COLUMN_MAPPING.truckingCost]?.toString() || "0");
  const dumpFeesCost = parseFloat(row[SW62_COLUMN_MAPPING.dumpFeesCost]?.toString() || "0");
  const materialCost = parseFloat(row[SW62_COLUMN_MAPPING.materialCost]?.toString() || "0");
  const subcontractorCost = parseFloat(row[SW62_COLUMN_MAPPING.subcontractorCost]?.toString() || "0");

  // Calculate budget total if not provided
  const budgetTotal = row[SW62_COLUMN_MAPPING.budgetTotal] ? 
    parseFloat(row[SW62_COLUMN_MAPPING.budgetTotal].toString()) : 
    laborCost + equipmentCost + truckingCost + dumpFeesCost + materialCost + subcontractorCost;

  // Billing equals unit total
  const billing = row[SW62_COLUMN_MAPPING.billing] ? 
    parseFloat(row[SW62_COLUMN_MAPPING.billing].toString()) : 
    unitTotal;

  return {
    locationId,
    lineItemNumber: row[SW62_COLUMN_MAPPING.lineItemNumber].toString(),
    lineItemName: row[SW62_COLUMN_MAPPING.lineItemName]?.toString() || "",
    unconvertedUnitOfMeasure: row[SW62_COLUMN_MAPPING.unconvertedUnit]?.toString() || "",
    unconvertedQty: unconvertedQty.toString(),
    actualQty: row[SW62_COLUMN_MAPPING.actualQty]?.toString() || "0",
    unitCost: unitCost.toString(),
    unitTotal: unitTotal.toFixed(2),
    convertedQty: convertedQty.toString(),
    convertedUnitOfMeasure: row[SW62_COLUMN_MAPPING.convertedUnit]?.toString() || "",
    conversionFactor: conversionFactor.toString(),
    costCode: row[SW62_COLUMN_MAPPING.costCode]?.toString() || "",
    productionRate: productionRate.toString(),
    hours: hours.toFixed(2),
    budgetTotal: budgetTotal.toFixed(2),
    billing: billing.toFixed(2),
    laborCost: laborCost.toFixed(2),
    equipmentCost: equipmentCost.toFixed(2),
    truckingCost: truckingCost.toFixed(2),
    dumpFeesCost: dumpFeesCost.toFixed(2),
    materialCost: materialCost.toFixed(2),
    subcontractorCost: subcontractorCost.toFixed(2),
    notes: "",
  };
};