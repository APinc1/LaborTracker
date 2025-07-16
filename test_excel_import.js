import XLSX from 'xlsx';
import fs from 'fs';

// Test script to examine Excel file structure
const filePath = './attached_assets/HSIP Crenshaw - 76th and Crenshaw (NW) - QTY Change Log 3.18 (NO AC)_1752699781462.xlsx';

try {
  // Read the Excel file
  const workbook = XLSX.readFile(filePath);
  
  console.log('📊 Excel File Analysis');
  console.log('=====================');
  console.log('Sheet Names:', workbook.SheetNames);
  
  // Get the "full location" sheet or "Line Items" sheet or first sheet
  let sheetName = 'Sheet1';
  if (workbook.SheetNames.includes('full location')) {
    sheetName = 'full location';
  } else if (workbook.SheetNames.includes('Line Items')) {
    sheetName = 'Line Items';
  } else {
    sheetName = workbook.SheetNames[0];
  }
  
  const worksheet = workbook.Sheets[sheetName];
  
  console.log('Using sheet:', sheetName);
  
  // Convert to JSON with headers
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('\n📋 Sheet Structure:');
  console.log('Total rows:', jsonData.length);
  
  // Show header row
  if (jsonData.length > 0) {
    console.log('\n🏷️  Header Row:');
    jsonData[0].forEach((header, index) => {
      console.log(`Column ${index + 1}: "${header}"`);
    });
  }
  
  // Show first few data rows
  console.log('\n📊 Sample Data Rows:');
  for (let i = 1; i < Math.min(5, jsonData.length); i++) {
    console.log(`\nRow ${i}:`);
    const row = jsonData[i];
    
    // Show key columns according to our mapping
    console.log(`  Line Item Number (Col 1): "${row[0] || 'EMPTY'}"`);
    console.log(`  Line Item Name (Col 2): "${row[1] || 'EMPTY'}"`);
    console.log(`  Unconverted Unit (Col 3): "${row[2] || 'EMPTY'}"`);
    console.log(`  Unconverted Qty (Col 4): "${row[3] || 'EMPTY'}"`);
    console.log(`  Unit Cost (Col 6): "${row[5] || 'EMPTY'}"`);
    console.log(`  Unit Total (Col 7): "${row[6] || 'EMPTY'}"`);
    console.log(`  Cost Code (Col 9): "${row[8] || 'EMPTY'}"`);
    console.log(`  Converted Qty (Col 11): "${row[10] || 'EMPTY'}"`);
    
    // Check if this row would be processed (line item number not empty)
    const shouldProcess = row[0] && row[0].toString().trim() !== '';
    console.log(`  ✅ Would be imported: ${shouldProcess}`);
  }
  
  // Count valid rows
  let validRows = 0;
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (row[0] && row[0].toString().trim() !== '') {
      validRows++;
    }
  }
  
  console.log(`\n📈 Import Summary:`);
  console.log(`Total data rows: ${jsonData.length - 1}`);
  console.log(`Valid rows for import: ${validRows}`);
  console.log(`Rows that would be skipped: ${jsonData.length - 1 - validRows}`);
  
} catch (error) {
  console.error('❌ Error reading Excel file:', error.message);
}