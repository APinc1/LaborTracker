-- Construction Management System - Supabase Schema
-- This schema matches exactly with the current in-memory data structure

-- Create tables in dependency order

-- Users table (authentication and roles)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL, -- Admin, Superintendent, Project Manager, Foreman
  password_reset_token TEXT,
  password_reset_expires TIMESTAMP,
  is_password_set BOOLEAN DEFAULT false
);

-- Projects table
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  default_superintendent INTEGER REFERENCES users(id),
  default_project_manager INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Crews table
CREATE TABLE crews (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Employees table
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  team_member_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  crew_id INTEGER REFERENCES crews(id),
  employee_type TEXT NOT NULL, -- Core, Freelancer, Apprentice
  apprentice_level INTEGER, -- 1, 2, or 3 (only if employeeType is Apprentice)
  is_foreman BOOLEAN DEFAULT false, -- Only available if employeeType is Core
  is_union BOOLEAN DEFAULT false,
  primary_trade TEXT, -- Mason, Formsetter, Laborer, Operator, Driver
  secondary_trade TEXT, -- Mason, Formsetter, Laborer, Operator, Driver
  tertiary_trade TEXT, -- Mason, Formsetter, Laborer, Operator, Driver
  user_id INTEGER REFERENCES users(id) -- Optional link to user account
);

-- Locations table
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  location_id TEXT NOT NULL UNIQUE,
  project_id INTEGER REFERENCES projects(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  is_complete BOOLEAN DEFAULT false
);

-- Budget line items table
CREATE TABLE budget_line_items (
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
  conversion_factor DECIMAL(10,6) DEFAULT 1,
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
  notes TEXT
);

-- Location budgets table
CREATE TABLE location_budgets (
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) NOT NULL,
  budget_line_item_id INTEGER REFERENCES budget_line_items(id) NOT NULL,
  allocated_amount DECIMAL(10,2) NOT NULL,
  notes TEXT
);

-- Tasks table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  location_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  name TEXT NOT NULL,
  task_date DATE NOT NULL,
  start_date DATE NOT NULL,
  finish_date DATE NOT NULL,
  cost_code TEXT NOT NULL,
  superintendent_id INTEGER REFERENCES users(id),
  foreman_id INTEGER REFERENCES employees(id),
  scheduled_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),
  start_time TEXT,
  finish_time TEXT,
  work_description TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming', -- upcoming, in_progress, complete
  "order" INTEGER NOT NULL DEFAULT 0,
  dependent_on_previous BOOLEAN NOT NULL DEFAULT true,
  linked_task_group TEXT -- Tasks with same group ID occur on same date
);

-- Employee assignments table
CREATE TABLE employee_assignments (
  id SERIAL PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE,
  task_id INTEGER REFERENCES tasks(id) NOT NULL,
  employee_id INTEGER REFERENCES employees(id) NOT NULL,
  assignment_date DATE NOT NULL,
  assigned_hours DECIMAL(10,2) DEFAULT 8,
  actual_hours DECIMAL(10,2)
);

-- Insert sample data that matches the in-memory storage exactly

-- Sample users
INSERT INTO users (username, password, name, email, phone, role, is_password_set) VALUES
('admin', 'AccessPacific2835', 'John Smith', 'admin@buildtracker.com', '(555) 123-4567', 'Superintendent', true),
('pmgr', 'password', 'Maria Rodriguez', 'maria@buildtracker.com', '(555) 234-5678', 'Project Manager', false),
('super', 'password', 'David Johnson', 'david@buildtracker.com', '(555) 345-6789', 'Superintendent', false),
('foreman', 'password', 'Carlos Martinez', 'carlos@buildtracker.com', '(555) 456-7890', 'Foreman', false);

-- Sample crews
INSERT INTO crews (name) VALUES
('Concrete Crew A'),
('Demo Crew B'),
('Transport Crew');

-- Sample employees
INSERT INTO employees (team_member_id, name, email, phone, crew_id, employee_type, apprentice_level, is_foreman, is_union, primary_trade, secondary_trade, tertiary_trade) VALUES
('EMP-001', 'Mike Johnson', 'mike@buildtracker.com', '(555) 234-5678', 1, 'Core', NULL, true, true, 'Formsetter', 'Laborer', NULL),
('EMP-002', 'Sarah Martinez', 'sarah@buildtracker.com', '(555) 345-6789', 2, 'Core', NULL, true, false, 'Operator', 'Driver', NULL),
('EMP-003', 'Tom Wilson', 'tom@buildtracker.com', '(555) 456-7890', 3, 'Freelancer', NULL, false, false, 'Driver', NULL, NULL),
('EMP-004', 'Jake Thompson', 'jake@buildtracker.com', '(555) 567-8901', 1, 'Apprentice', 2, false, true, 'Mason', 'Laborer', NULL),
('EMP-005', 'Alex Rodriguez', 'alex@buildtracker.com', '(555) 678-9012', 2, 'Freelancer', NULL, false, false, 'Operator', NULL, NULL);

-- Sample projects
INSERT INTO projects (project_id, name, start_date, end_date, default_superintendent, default_project_manager) VALUES
('PRJ-2024-001', 'Main St Bridge', '2024-03-01', '2024-03-25', 1, 1),
('PRJ-2024-002', 'City Hall Renovation', '2024-03-10', '2024-04-05', 1, 1);

-- Sample locations
INSERT INTO locations (location_id, project_id, name, start_date, end_date, is_complete) VALUES
('PRJ-2024-001_NorthSection', 1, 'Main St Bridge - North Section', '2024-03-01', '2024-03-25', false),
('PRJ-2024-002_EastWing', 2, 'City Hall - East Wing', '2024-03-10', '2024-04-05', false);

-- Sample budget line items
INSERT INTO budget_line_items (
  location_id, line_item_number, line_item_name, unconverted_unit_of_measure, 
  unconverted_qty, actual_qty, unit_cost, unit_total, converted_qty, 
  converted_unit_of_measure, cost_code, production_rate, hours, budget_total, 
  billing, labor_cost, equipment_cost, trucking_cost, dump_fees_cost, 
  material_cost, subcontractor_cost, notes
) VALUES
(1, '1.1', 'Concrete Forms', 'SF', 1000, 0, 15.50, 15500, 185, 'CY', 'CONCRETE', 5.4, 40, 15500, 0, 8000, 2000, 1500, 500, 3000, 500, 'Concrete forms for bridge deck'),
(1, '2.1', 'Demolition Work', 'SF', 500, 0, 12.00, 6000, 500, 'SF', 'DEMO/EX', 20, 25, 6000, 0, 3000, 1500, 500, 1000, 0, 0, 'Demolition of existing structures');

-- Sample tasks (using current dates for testing)
INSERT INTO tasks (
  task_id, location_id, task_type, name, task_date, start_date, finish_date, 
  cost_code, superintendent_id, foreman_id, scheduled_hours, actual_hours, 
  start_time, finish_time, work_description, notes, status, "order", 
  dependent_on_previous, linked_task_group
) VALUES
('PRJ-2024-001_NorthSection_Form_Day1', 'PRJ-2024-001_NorthSection', 'Form', 'Form Day 1 of 3', '2025-08-11', '2025-08-11', '2025-08-11', 'CONCRETE', 1, 1, 40, NULL, '08:00', '17:00', 'Set up concrete forms for bridge deck section. Ensure proper alignment and elevation.', 'Weather conditions good, expect normal progress', 'upcoming', 0, true, NULL),
('PRJ-2024-002_EastWing_Demo_Day1', 'PRJ-2024-002_EastWing', 'Demo/Ex', 'Demo/Ex Base Grade', '2025-08-11', '2025-08-11', '2025-08-11', 'DEMO/EX', 1, 2, 24, NULL, '09:30', '16:00', 'Demolish existing concrete and prepare base grade for new foundation.', 'Coordinate with utilities for underground clearance', 'in_progress', 0, false, NULL),
('PRJ-2024-001_NorthSection_Form_Day2', 'PRJ-2024-001_NorthSection', 'Form', 'Form Day 2 of 3', '2025-08-12', '2025-08-11', '2025-08-12', 'CONCRETE', 1, 1, 40, NULL, '08:00', '17:00', 'Continue concrete forms for bridge deck section.', 'Continue previous day work', 'upcoming', 1, true, NULL);

-- Sample employee assignments
INSERT INTO employee_assignments (assignment_id, task_id, employee_id, assignment_date, assigned_hours, actual_hours) VALUES
('1_1', 1, 1, '2025-08-11', 8, NULL),
('2_2', 2, 2, '2025-08-11', 10, NULL),
('3_1', 1, 3, '2025-08-11', 6, NULL);

-- Create indexes for performance
CREATE INDEX idx_projects_project_id ON projects(project_id);
CREATE INDEX idx_locations_location_id ON locations(location_id);
CREATE INDEX idx_locations_project_id ON locations(project_id);
CREATE INDEX idx_tasks_location_id ON tasks(location_id);
CREATE INDEX idx_tasks_task_date ON tasks(task_date);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_employee_assignments_task_id ON employee_assignments(task_id);
CREATE INDEX idx_employee_assignments_employee_id ON employee_assignments(employee_id);
CREATE INDEX idx_employee_assignments_assignment_date ON employee_assignments(assignment_date);
CREATE INDEX idx_budget_line_items_location_id ON budget_line_items(location_id);
CREATE INDEX idx_budget_line_items_cost_code ON budget_line_items(cost_code);
CREATE INDEX idx_employees_team_member_id ON employees(team_member_id);
CREATE INDEX idx_users_username ON users(username);

-- Add some useful constraints
ALTER TABLE employees ADD CONSTRAINT chk_apprentice_level CHECK (
  (employee_type = 'Apprentice' AND apprentice_level BETWEEN 1 AND 3) OR 
  (employee_type != 'Apprentice' AND apprentice_level IS NULL)
);

ALTER TABLE employees ADD CONSTRAINT chk_foreman_type CHECK (
  (is_foreman = true AND employee_type = 'Core') OR 
  (is_foreman = false)
);

ALTER TABLE tasks ADD CONSTRAINT chk_task_status CHECK (
  status IN ('upcoming', 'in_progress', 'complete')
);

ALTER TABLE users ADD CONSTRAINT chk_user_role CHECK (
  role IN ('Admin', 'Superintendent', 'Project Manager', 'Foreman')
);

ALTER TABLE employees ADD CONSTRAINT chk_employee_type CHECK (
  employee_type IN ('Core', 'Freelancer', 'Apprentice')
);

-- Enable Row Level Security (RLS) for Supabase
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (you can customize these based on your needs)
CREATE POLICY "authenticated_users_all" ON users FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_projects_all" ON projects FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_locations_all" ON locations FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_budget_all" ON budget_line_items FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_location_budgets_all" ON location_budgets FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_crews_all" ON crews FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_employees_all" ON employees FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_tasks_all" ON tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_assignments_all" ON employee_assignments FOR ALL TO authenticated USING (true);