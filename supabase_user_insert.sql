-- Insert users that match your Supabase table
-- Run this in your Supabase SQL editor

INSERT INTO users (username, password, name, email, phone, role) VALUES
('admin', 'password123', 'Admin User', 'admin@construction.com', NULL, 'Admin'),
('mike.johnson', 'password123', 'Mike Johnson', 'mike.johnson@construction.com', NULL, 'Superintendent'),
('sarah.davis', 'password123', 'Sarah Davis', 'sarah.davis@construction.com', NULL, 'Project Manager')
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;