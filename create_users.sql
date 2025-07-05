-- Create users table
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'employee')),
    full_name VARCHAR(100),
    email VARCHAR(100),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);

-- Insert default users
-- Manager: username = manager1, password = manager123
-- Employee: username = employee1, password = employee123
-- Note: These passwords will be hashed by bcrypt in the application

INSERT INTO users (username, password, role, full_name, email) VALUES
('manager1', '$2b$10$rQZ8K9LmNpOqRsTuVwXyZeFgHiJkLmNpOqRsTuVwXyZeFgHiJkLmN', 'manager', 'Manager One', 'manager1@insureme.com'),
('employee1', '$2b$10$sRZ9L0NnOqRsTuVwXyZeFgHiJkLmNpOqRsTuVwXyZeFgHiJkLmN', 'employee', 'Employee One', 'employee1@insureme.com'); 