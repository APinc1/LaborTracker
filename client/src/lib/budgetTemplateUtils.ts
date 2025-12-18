import * as XLSX from 'xlsx';

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
  'GENERAL LABOR',
  'General Labor',
  'DEMO/EX',
  'Demo/Ex',
  'BASE/GRADING',
  'Base/Grading',
  'Demo/Ex + Base/Grading',
  'CONCRETE',
  'Concrete',
  'FORM',
  'Form',
  'POUR',
  'Pour',
  'Form + Pour',
  'ASPHALT',
  'Asphalt',
  'TRAFFIC CONTROL',
  'Traffic Control',
  'TRAFFIC',
  'LANDSCAPE',
  'Landscaping',
  'UTILITY ADJ',
  'Utility Adj',
  'PUNCHLIST',
  'Punchlist',
  'PUNCHLIST CONCRETE',
  'Punchlist Concrete',
  'PUNCHLIST DEMO',
  'Punchlist Demo',
  'PUNCHLIST GENERAL LABOR',
  'Punchlist General Labor',
];

export function downloadBudgetTemplate() {
  const workbook = XLSX.utils.book_new();
  
  const headers = BUDGET_COLUMNS.map(col => col.header);
  const templateData = [headers];
  
  const worksheet = XLSX.utils.aoa_to_sheet(templateData);
  
  const columnWidths = BUDGET_COLUMNS.map(col => ({ wch: Math.max(col.header.length + 2, 15) }));
  worksheet['!cols'] = columnWidths;
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget Template');
  
  const instructionsData = [
    ['SW62 Budget Template Instructions'],
    [''],
    ['REQUIRED COLUMNS:'],
    ['- Line Item Number (Column A): Must be unique and not blank'],
    ['- Cost Code (Column H): Must be a valid cost code from the list below'],
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
  
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
  instructionsSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  
  XLSX.writeFile(workbook, 'Budget_Template_SW62.xlsx');
}

export const FORMAT_REQUIREMENTS = [
  { title: 'Required Columns', items: ['Line Item Number (Column A) - must be unique', 'Cost Code (Column H) - must match valid codes'] },
  { title: 'Number Format', items: ['No $ signs or commas in cost fields', 'Use decimals for cents (e.g., 1234.56)'] },
  { title: 'File Format', items: ['Excel file (.xlsx or .xls)', '20 columns in SW62 format'] },
];
