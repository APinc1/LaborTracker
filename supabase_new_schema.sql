-- Construction Management System - Complete Supabase Schema
-- Run this script in your new Supabase SQL editor

-- Enable UUID extension (Supabase usually has this enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL, -- Admin, Superintendent, Project Manager, Foreman
    password_reset_token TEXT,
    password_reset_expires TIMESTAMP,
    is_password_set BOOLEAN DEFAULT true
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    default_superintendent INTEGER REFERENCES users(id),
    default_project_manager INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    location_id TEXT NOT NULL UNIQUE,
    project_id INTEGER REFERENCES projects(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    is_complete BOOLEAN DEFAULT FALSE
);

-- Budget Line Items table
CREATE TABLE IF NOT EXISTS budget_line_items (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    line_item_number TEXT NOT NULL,
    line_item_name TEXT NOT NULL,
    unconverted_unit_of_measure TEXT NOT NULL,
    unconverted_qty DECIMAL(10,2) NOT NULL,
    actual_qty DECIMAL(10,2) DEFAULT 0,
    unit_cost DECIMAL(10,2) NOT NULL,
    unit_total DECIMAL(10,2) NOT NULL,
    converted_qty DECIMAL(10,2),
    converted_unit_of_measure TEXT,
    cost_code TEXT NOT NULL,
    production_rate DECIMAL(10,2),
    hours DECIMAL(10,2),
    budget_total DECIMAL(10,2) NOT NULL,
    billing DECIMAL(10,2),
    labor_cost DECIMAL(10,2),
    equipment_cost DECIMAL(10,2),
    trucking_cost DECIMAL(10,2),
    dump_fees_cost DECIMAL(10,2),
    material_cost DECIMAL(10,2),
    subcontractor_cost DECIMAL(10,2),
    notes TEXT,
    conversion_factor DECIMAL(10,4)
);

-- Location Budgets table (for budget allocations)
CREATE TABLE IF NOT EXISTS location_budgets (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    budget_line_item_id INTEGER REFERENCES budget_line_items(id) NOT NULL,
    allocated_amount DECIMAL(10,2) NOT NULL,
    notes TEXT
);

-- Crews table
CREATE TABLE IF NOT EXISTS crews (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    team_member_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    crew_id INTEGER REFERENCES crews(id),
    employee_type TEXT NOT NULL DEFAULT 'Regular',
    apprentice_level INTEGER,
    is_foreman BOOLEAN DEFAULT FALSE,
    primary_trade TEXT,
    secondary_trade TEXT,
    tertiary_trade TEXT,
    union_status TEXT,
    role TEXT NOT NULL DEFAULT 'Laborer',
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    task_id TEXT NOT NULL UNIQUE,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    task_type TEXT NOT NULL,
    name TEXT NOT NULL,
    task_date DATE NOT NULL,
    start_date DATE NOT NULL,
    finish_date DATE,
    cost_code TEXT NOT NULL,
    superintendent_id INTEGER REFERENCES users(id),
    foreman_id INTEGER REFERENCES employees(id),
    scheduled_hours DECIMAL(10,2),
    actual_hours DECIMAL(10,2),
    start_time TEXT,
    finish_time TEXT,
    work_description TEXT,
    notes TEXT,
    dependencies TEXT,
    status TEXT DEFAULT 'Pending',
    priority INTEGER DEFAULT 1,
    crew_id INTEGER REFERENCES crews(id)
);

-- Employee Assignments table
CREATE TABLE IF NOT EXISTS employee_assignments (
    id SERIAL PRIMARY KEY,
    assignment_id TEXT NOT NULL UNIQUE,
    task_id INTEGER REFERENCES tasks(id) NOT NULL,
    employee_id INTEGER REFERENCES employees(id) NOT NULL,
    crew_id INTEGER REFERENCES crews(id),
    assigned_hours DECIMAL(10,2),
    actual_hours DECIMAL(10,2),
    hourly_rate DECIMAL(10,2),
    is_lead BOOLEAN DEFAULT FALSE,
    assignment_date DATE NOT NULL,
    notes TEXT
);

-- Insert sample data for testing
INSERT INTO users (username, password, name, email, role) VALUES
('admin', 'password123', 'System Administrator', 'admin@construction.com', 'Admin'),
('mike.johnson', 'password123', 'Mike Johnson', 'mike.johnson@construction.com', 'Superintendent'),
('sarah.davis', 'password123', 'Sarah Davis', 'sarah.davis@construction.com', 'Project Manager');

INSERT INTO projects (project_id, name, start_date, end_date, default_superintendent, default_project_manager) VALUES
('PRJ-2024-001', 'Main St Bridge Reconstruction', '2024-01-15', '2024-12-31', 2, 3),
('PRJ-2024-002', 'Downtown Office Complex', '2024-03-01', '2025-02-28', 2, 3);

INSERT INTO locations (location_id, project_id, name, description, start_date, end_date, estimated_cost, is_complete) VALUES
('PRJ-2024-001_NorthSection', 1, 'Main St Bridge - North Section', 'North section of the bridge reconstruction', '2024-01-15', '2024-06-30', 150000.00, false),
('PRJ-2024-002_EastWing', 2, 'City Hall - East Wing', 'East wing of the downtown office complex', '2024-03-01', '2024-08-15', 200000.00, false);

INSERT INTO crews (name) VALUES
('Concrete Crew A'),
('Demo Crew B'),
('Asphalt Crew C');

INSERT INTO employees (team_member_id, name, role, is_foreman, crew_id, employee_type) VALUES
('EMP-001', 'Mike Johnson', 'Superintendent', true, 1, 'Regular'),
('EMP-002', 'Sarah Davis', 'Project Manager', false, 1, 'Regular'),
('EMP-003', 'Tom Wilson', 'Foreman', true, 1, 'Regular'),
('EMP-004', 'Lisa Chen', 'Equipment Operator', false, 2, 'Regular'),
('EMP-005', 'Carlos Rodriguez', 'Laborer', false, 3, 'Regular');

-- Sample budget line items
INSERT INTO budget_line_items (
    location_id, line_item_number, line_item_name, unconverted_unit_of_measure,
    unconverted_qty, unit_cost, unit_total, cost_code, budget_total
) VALUES
(1, '001', 'Concrete Foundation', 'CY', 50.00, 150.00, 7500.00, 'CC-001', 7500.00),
(1, '002', 'Steel Reinforcement', 'LB', 2000.00, 1.25, 2500.00, 'ST-001', 2500.00);

-- Sample tasks
INSERT INTO tasks (
    task_id, location_id, task_type, name, task_date, start_date, finish_date,
    cost_code, scheduled_hours, status
) VALUES
('TASK-001', 1, 'Construction', 'Pour Foundation', '2025-08-11', '2025-08-11', '2025-08-11', 'CC-001', 8.0, 'Pending'),
('TASK-002', 1, 'Construction', 'Install Rebar', '2025-08-12', '2025-08-12', '2025-08-12', 'ST-001', 6.0, 'Pending');

-- Sample assignments
INSERT INTO employee_assignments (
    assignment_id, task_id, employee_id, crew_id, assigned_hours, assignment_date
) VALUES
('1_1', 1, 1, 1, 8.0, '2025-08-11'),
('1_3', 1, 3, 1, 8.0, '2025-08-11'),
('2_2', 2, 2, 1, 6.0, '2025-08-12');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);
CREATE INDEX IF NOT EXISTS idx_locations_location_id ON locations(location_id);
CREATE INDEX IF NOT EXISTS idx_locations_project_id ON locations(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_location_id ON tasks(location_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_task_id ON employee_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_employee_id ON employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_assignments_assignment_date ON employee_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_budget_line_items_location_id ON budget_line_items(location_id);
CREATE INDEX IF NOT EXISTS idx_employees_team_member_id ON employees(team_member_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Enable Row Level Security (RLS) - Optional for additional security
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;