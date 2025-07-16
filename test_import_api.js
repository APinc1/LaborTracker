import XLSX from 'xlsx';
import { parseSW62ExcelRow } from './client/src/lib/customExcelParser.js';

// Test the Excel import API call
const testExcelImport = async () => {
  console.log('🧪 Testing Excel Import Process');
  console.log('================================');
  
  // Read the Excel file with full location sheet
  const filePath = './attached_assets/HSIP Crenshaw - 76th and Crenshaw (NW) - QTY Change Log 3.18 (NO AC)_1752699781462.xlsx';
  const workbook = XLSX.readFile(filePath);
  
  // Get the "full location" sheet
  const sheetName = 'full location';
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON array
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`📊 Processing ${jsonData.length} rows from "${sheetName}" sheet`);
  
  // Parse the first few valid rows
  const budgetItems = [];
  for (let i = 1; i < Math.min(5, jsonData.length); i++) {
    const row = jsonData[i];
    
    console.log(`\n📋 Row ${i}:`);
    console.log(`  Line Item: ${row[0]}`);
    console.log(`  Name: ${row[1]}`);
    console.log(`  Unit: ${row[2]}`);
    console.log(`  Qty: ${row[3]}`);
    console.log(`  Unit Cost: ${row[5]}`);
    console.log(`  Cost Code: ${row[8]}`);
    console.log(`  Converted Qty: ${row[10]}`);
    
    // Parse with SW62 format
    const budgetItem = parseSW62ExcelRow(row, 3); // Use location ID 3
    
    if (budgetItem) {
      console.log(`  ✅ Parsed successfully`);
      console.log(`  💰 Budget Total: $${budgetItem.budgetTotal}`);
      console.log(`  🏷️  Cost Code: ${budgetItem.costCode}`);
      budgetItems.push(budgetItem);
    } else {
      console.log(`  ❌ Skipped (header or invalid row)`);
    }
  }
  
  if (budgetItems.length > 0) {
    console.log(`\n🚀 Testing API call with first item:`);
    const testItem = budgetItems[0];
    
    try {
      const response = await fetch('http://localhost:5000/api/locations/3/budget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testItem),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ API call successful!');
        console.log('📦 Response:', JSON.stringify(result, null, 2));
      } else {
        console.log('❌ API call failed');
        console.log('Status:', response.status);
        const error = await response.text();
        console.log('Error:', error);
      }
    } catch (error) {
      console.log('❌ Network error:', error.message);
    }
  }
};

testExcelImport();