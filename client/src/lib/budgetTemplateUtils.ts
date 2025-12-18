import ExcelJS from 'exceljs';

export const BUDGET_COLUMNS = [
  { header: 'Line Item Number', key: 'lineItemNumber', required: true, description: 'Unique identifier for the line item (required)' },
  { header: 'Line Item Name', key: 'lineItemName', required: false, description: 'Description of the work item' },
  { header: 'Unconverted Unit', key: 'unconvertedUnit', required: false, description: 'Unit of measure (e.g., SF, CY, LF)' },
  { header: 'Unconverted Qty', key: 'unconvertedQty', required: false, description: 'Original quantity' },
  { header: 'Actual Qty', key: 'actualQty', required: false, description: 'Actual quantity used' },
  { header: 'Unit Cost', key: 'unitCost', required: false, description: 'Cost per unit (number format)' },
  { header: 'Unit Total', key: 'unitTotal', required: false, description: 'Formula: Unit Cost × Unconverted Qty' },
  { header: 'Cost Code', key: 'costCode', required: true, description: 'Project cost code (see valid codes below)' },
  { header: 'Converted Unit', key: 'convertedUnit', required: false, description: 'Converted unit of measure' },
  { header: 'Converted Qty', key: 'convertedQty', required: false, description: 'Formula: Unconverted Qty × Conversion Factor' },
  { header: 'Production Rate', key: 'productionRate', required: false, description: 'Work rate per unit' },
  { header: 'Hours', key: 'hours', required: false, description: 'Formula: Converted Qty × Production Rate' },
  { header: 'Labor Cost', key: 'laborCost', required: false, description: 'Formula: Hours × $80' },
  { header: 'Equipment Cost', key: 'equipmentCost', required: false, description: 'Equipment costs (number format)' },
  { header: 'Trucking Cost', key: 'truckingCost', required: false, description: 'Trucking expenses (number format)' },
  { header: 'Dump Fees', key: 'dumpFees', required: false, description: 'Dump fees (number format)' },
  { header: 'Material Cost', key: 'materialCost', required: false, description: 'Material expenses (number format)' },
  { header: 'Subcontractor Cost', key: 'subcontractorCost', required: false, description: 'Subcontractor fees (number format)' },
  { header: 'Budget Total', key: 'budgetTotal', required: false, description: 'Formula: Sum of Labor through Subcontractor costs' },
  { header: 'Billing', key: 'billing', required: false, description: 'Equal to Unit Total' },
];

export const VALID_COST_CODES = [
  'Allowance',
  'Asphalt',
  'Base/Grading',
  'Concrete',
  'Demo/Ex',
  'Demo/Ex + Base/Grading',
  'Form',
  'Form + Pour',
  'General Labor',
  'General Requirement',
  'Landscaping',
  'Mobilization',
  'Pour',
  'Punchlist',
  'Punchlist Concrete',
  'Punchlist Demo',
  'Punchlist General Labor',
  'Sub',
  'Traffic Control',
  'Utility Adj',
];

export async function downloadBudgetTemplate() {
  const workbook = new ExcelJS.Workbook();
  
  const worksheet = workbook.addWorksheet('Budget Template');
  
  worksheet.columns = BUDGET_COLUMNS.map(col => ({
    header: col.header,
    key: col.key,
    width: Math.max(col.header.length + 2, 15),
  }));
  
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  
  const costCodeColIndex = BUDGET_COLUMNS.findIndex(col => col.key === 'costCode') + 1;
  const costCodeFormula = `"${VALID_COST_CODES.join(',')}"`;
  
  for (let row = 2; row <= 500; row++) {
    const cell = worksheet.getCell(row, costCodeColIndex);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [costCodeFormula],
      showErrorMessage: true,
      errorTitle: 'Invalid Cost Code',
      error: 'Please select a valid cost code from the dropdown list.',
    };
  }
  
  const instructionsSheet = workbook.addWorksheet('Instructions');
  
  const instructions = [
    ['SW62 Budget Template Instructions'],
    [''],
    ['REQUIRED COLUMNS:'],
    ['- Line Item Number (Column A): Must be unique and not blank'],
    ['- Cost Code (Column H): Must be a valid cost code from the dropdown list'],
    [''],
    ['NUMBER FORMAT:'],
    ['- All cost columns should be numbers without $ signs or commas'],
    ['- Use decimals for cents (e.g., 1234.56 not $1,234.56)'],
    [''],
    ['FORMULAS (calculated automatically after import):'],
    ['- Unit Total = Unit Cost × Unconverted Qty'],
    ['- Converted Qty = Unconverted Qty × Conversion Factor'],
    ['- Hours = Converted Qty × Production Rate'],
    ['- Labor Cost = Hours × $80'],
    ['- Budget Total = Sum of Labor, Equipment, Trucking, Dump, Material, Subcontractor'],
    ['- Billing = Unit Total'],
    [''],
    ['VALID COST CODES:'],
    ...VALID_COST_CODES.map(code => [`  • ${code}`]),
    [''],
    ['COLUMN STRUCTURE (20 columns total):'],
    ...BUDGET_COLUMNS.map((col, i) => [`  ${i + 1}. ${col.header}${col.required ? ' (Required)' : ''} - ${col.description}`]),
  ];
  
  instructions.forEach((row, index) => {
    instructionsSheet.getCell(index + 1, 1).value = row[0];
  });
  
  instructionsSheet.getColumn(1).width = 80;
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Master_Budget_Template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const FORMAT_REQUIREMENTS = [
  { title: 'Required Columns', items: ['Line Item Number (Column A) - must be unique', 'Cost Code (Column H) - must match valid codes'] },
  { title: 'Number Format', items: ['No $ signs or commas in cost fields', 'Use decimals for cents (e.g., 1234.56)'] },
  { title: 'File Format', items: ['Excel file (.xlsx or .xls)', '20 columns in SW62 format'] },
];

export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  rowCount: number;
}

export function validateBudgetData(data: any[][]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let dataRowCount = 0;
  
  if (!data || data.length === 0) {
    return {
      isValid: false,
      errors: [{ row: 0, column: 'File', message: 'The file is empty or could not be read' }],
      warnings: [],
      rowCount: 0,
    };
  }
  
  const headerRow = data[0];
  if (!headerRow || headerRow.length < 20) {
    warnings.push(`Expected 20 columns but found ${headerRow?.length || 0}. Some data may not import correctly.`);
  }
  
  const lineItemNumbers = new Set<string>();
  const costCodeColIndex = 7;
  const lineItemColIndex = 0;
  
  const validCostCodesLower = VALID_COST_CODES.map(c => c.toLowerCase());
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
      continue;
    }
    
    const lineItemNumber = row[lineItemColIndex]?.toString().trim() || '';
    const costCode = row[costCodeColIndex]?.toString().trim() || '';
    
    const hasAnyData = row.some(cell => cell !== null && cell !== undefined && cell !== '');
    
    if (!lineItemNumber && hasAnyData) {
      errors.push({
        row: i + 1,
        column: 'Line Item Number',
        message: 'Line item number is required but missing',
      });
      continue;
    }
    
    if (!lineItemNumber) {
      continue;
    }
    
    dataRowCount++;
    
    if (lineItemNumbers.has(lineItemNumber)) {
      errors.push({
        row: i + 1,
        column: 'Line Item Number',
        message: `Duplicate line item number: "${lineItemNumber}"`,
      });
    } else {
      lineItemNumbers.add(lineItemNumber);
    }
    
    if (!costCode) {
      errors.push({
        row: i + 1,
        column: 'Cost Code',
        message: 'Cost code is required but missing',
      });
    } else if (!validCostCodesLower.includes(costCode.toLowerCase())) {
      errors.push({
        row: i + 1,
        column: 'Cost Code',
        message: `Invalid cost code: "${costCode}". Must be one of: ${VALID_COST_CODES.join(', ')}`,
      });
    }
    
    const numericColumns = [
      { index: 3, name: 'Unconverted Qty' },
      { index: 5, name: 'Unit Cost' },
      { index: 6, name: 'Unit Total' },
      { index: 9, name: 'Converted Qty' },
      { index: 10, name: 'Production Rate' },
      { index: 11, name: 'Hours' },
      { index: 12, name: 'Labor Cost' },
      { index: 13, name: 'Equipment Cost' },
      { index: 14, name: 'Trucking Cost' },
      { index: 15, name: 'Dump Fees' },
      { index: 16, name: 'Material Cost' },
      { index: 17, name: 'Subcontractor Cost' },
      { index: 18, name: 'Budget Total' },
      { index: 19, name: 'Billing' },
    ];
    
    for (const col of numericColumns) {
      const value = row[col.index];
      if (value !== null && value !== undefined && value !== '') {
        const strValue = value.toString().trim();
        if (strValue && isNaN(parseFloat(strValue.replace(/[$,]/g, '')))) {
          errors.push({
            row: i + 1,
            column: col.name,
            message: `Invalid number format: "${strValue}"`,
          });
        }
      }
    }
  }
  
  if (dataRowCount === 0) {
    errors.push({
      row: 0,
      column: 'File',
      message: 'No valid data rows found. Make sure the file has data starting from row 2.',
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    rowCount: dataRowCount,
  };
}
