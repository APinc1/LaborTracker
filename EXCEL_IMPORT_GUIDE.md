# Excel Budget Import Guide

## Overview
The Excel import feature allows you to upload budget data with formulas that are automatically preserved and recalculated when quantities change.

## Excel File Format Requirements

### Column Structure (21 columns total):
1. **Line Item Number** - Required, must not be blank
2. **Line Item Name** - Description of the work item
3. **Unconverted Unit** - Unit of measure (e.g., "SF", "CY", "LF")
4. **Unconverted Qty** - Original quantity
5. **Actual Qty** - Actual quantity used
6. **Unit Cost** - Cost per unit
7. **Unit Total** - Formula: `Unit Cost × Unconverted Qty`
8. **[Blank Column]** - Skip this column
9. **Cost Code** - Project cost code
10. **Converted Unit** - Converted unit of measure
11. **Converted Qty** - Formula: `Unconverted Qty × Conversion Factor`
12. **Production Rate** - Work rate per unit
13. **Hours** - Formula: `Converted Qty × Production Rate`
14. **Labor Cost** - Formula: `Hours × $80`
15. **Equipment Cost** - Equipment costs
16. **Trucking Cost** - Trucking expenses
17. **Dump Fees** - Dump fees
18. **Material Cost** - Material expenses
19. **Subcontractor Cost** - Subcontractor fees
20. **Budget Total** - Formula: `Sum of columns 14-19`
21. **Billing** - Equal to Unit Total (column 7)

## Formula Preservation

### Automatic Calculations
When you change the **Unconverted Qty** after import, the system automatically recalculates:
- **Unit Total** = Unit Cost × New Unconverted Qty
- **Converted Qty** = New Unconverted Qty × Conversion Factor
- **Hours** = New Converted Qty × Production Rate
- **Labor Cost** = New Hours × $80
- **Budget Total** = Labor Cost + Equipment Cost + Trucking Cost + Dump Fees + Material Cost + Subcontractor Cost
- **Billing** = Unit Total

### Conversion Factor Detection
The system automatically detects the conversion factor by comparing:
- Original Converted Qty ÷ Original Unconverted Qty = Conversion Factor

This factor is stored and used for all future calculations.

## Import Process

### Step 1: Prepare Your Excel File
1. Ensure your Excel file follows the 21-column format
2. Include a header row (will be skipped during import)
3. Fill in all required fields (Line Item Number, Name, Unit Cost, etc.)
4. Leave blank any rows you don't want to import

### Step 2: Import to System
1. Navigate to Budget Management
2. Select your project
3. Select the specific location
4. Click "Import Excel" button
5. Choose your Excel file
6. Review import results

### Step 3: Verify and Adjust
1. Check that all formulas calculated correctly
2. Adjust quantities as needed - formulas will recalculate automatically
3. Edit individual items if necessary

## Features After Import

### Dynamic Recalculation
- Change any **Unconverted Qty** value
- All dependent formulas update automatically
- Changes are saved to the database immediately

### Formula Consistency
- All Excel formulas are preserved as JavaScript calculations
- Conversion factors are maintained per line item
- Labor rate is standardized at $80/hour

### Data Validation
- Empty line item numbers are skipped
- Invalid data is flagged during import
- Success/failure count is reported

## Troubleshooting

### Common Issues
1. **"No valid budget items found"** - Check that line item numbers are filled
2. **Import failures** - Verify all required columns have data
3. **Formula errors** - Check that numeric fields contain valid numbers

### Data Requirements
- Line Item Number: Must not be blank
- Line Item Name: Required
- Unit Cost: Must be numeric
- Cost Code: Required
- All cost fields: Must be numeric (can be 0)

## Technical Notes

### Database Storage
- Raw values are stored in the database
- Conversion factors are saved for each line item
- Formulas are executed client-side for real-time updates

### Performance
- Large files (1000+ rows) may take several seconds to import
- Each line item is processed individually
- Real-time updates occur immediately after quantity changes

## Best Practices

1. **Data Preparation**: Clean your Excel data before import
2. **Testing**: Import a small sample first to verify format
3. **Backup**: Keep original Excel files as reference
4. **Validation**: Review imported data for accuracy
5. **Updates**: Use the quantity editing feature for ongoing changes

This system maintains the power of Excel formulas while providing a robust database-backed solution for construction budget management.