# Setup Instructions for Construction Management System

## Supabase Database Setup

### 1. Run the SQL Schema
Copy and paste the entire content of `supabase_schema.sql` into your Supabase SQL editor and run it. This will create all necessary tables and sample data.

### 2. Key Changes Made to Budget System

The budget system has been restructured so that:
- **OLD**: Budgets belonged to projects
- **NEW**: Budgets belong to locations (which belong to projects)

This allows for more granular budget tracking per location within a project.

### 3. Database Structure

```
Projects
├── Locations (each project has multiple locations)
│   ├── Budget Line Items (budgets are now per location)
│   ├── Tasks (tasks are assigned to locations)
│   └── Location Budgets (budget allocations)
```

### 4. API Changes

Budget endpoints have been updated:
- **OLD**: `/api/projects/{projectId}/budget`
- **NEW**: `/api/locations/{locationId}/budget`

### 5. UI Changes

The Budget Management page now requires:
1. Select a project
2. Select a location within that project
3. Manage budget line items for that location

### 6. Fixed Issues

1. **Add Task button**: Now properly opens CreateTaskModal
2. **Add Location Budget button**: Now opens budget allocation dialog
3. **Edit/Delete buttons**: Added proper click handlers for budget items
4. **SelectItem errors**: Fixed empty string values

### 7. Required Environment Variables

Make sure your `.env` file contains:
```
DATABASE_URL=your_supabase_connection_string
```

### 8. Testing the Setup

1. Go to Budget Management
2. Select a project
3. Select a location
4. Add/edit/delete budget items
5. Test the location budget allocation from Location Management

### 9. Known Limitations

- Excel import is temporarily disabled (shows "Coming Soon" message)
- Some database operations may still use in-memory storage as fallback
- Budget items are now location-specific rather than project-specific

## Next Steps

1. Set up your Supabase database using the provided SQL
2. Update your DATABASE_URL environment variable
3. Test all functionality with real data
4. The system will automatically fall back to in-memory storage if database connection fails