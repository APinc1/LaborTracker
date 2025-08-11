-- Construction Management System Database Schema for Supabase
-- Run this script in your Supabase SQL editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL -- Admin, Superintendent, Project Manager, Foreman
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

-- Budget Line Items table (now tied to locations instead of projects)
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
    notes TEXT
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
    role TEXT NOT NULL,
    is_foreman BOOLEAN DEFAULT FALSE,
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
    notes TEXT
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
    notes TEXT
);

-- Insert sample data
INSERT INTO users (username, password, name, email, role) VALUES
('admin', 'password123', 'Admin User', 'admin@construction.com', 'Admin'),
('mike_johnson', 'password123', 'Mike Johnson', 'mike.johnson@construction.com', 'Superintendent'),
('sarah_davis', 'password123', 'Sarah Davis', 'sarah.davis@construction.com', 'Project Manager');

INSERT INTO projects (project_id, name, start_date, end_date, default_superintendent, default_project_manager) VALUES
('PRJ-2024-001', 'Main St Bridge Reconstruction', '2024-01-15', '2024-12-31', 2, 3),
('PRJ-2024-002', 'Downtown Office Complex', '2024-03-01', '2025-02-28', 2, 3);

INSERT INTO crews (name) VALUES
('Concrete Crew A'),
('Demo Crew B'),
('Asphalt Crew C');

INSERT INTO employees (team_member_id, name, role, is_foreman) VALUES
('EMP-001', 'Mike Johnson', 'Superintendent', true),
('EMP-002', 'Sarah Davis', 'Project Manager', false),
('EMP-003', 'Tom Wilson', 'Foreman', true),
('EMP-004', 'Lisa Chen', 'Equipment Operator', false),
('EMP-005', 'Carlos Rodriguez', 'Laborer', false);