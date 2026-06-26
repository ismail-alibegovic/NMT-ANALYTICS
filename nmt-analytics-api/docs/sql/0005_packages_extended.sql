-- Add extended fields to packages table
ALTER TABLE packages
ADD COLUMN description TEXT,
ADD COLUMN duration_days INTEGER,
ADD COLUMN max_participants INTEGER,
ADD COLUMN start_date DATE,
ADD COLUMN end_date DATE;

-- Add check constraints
ALTER TABLE packages ADD CONSTRAINT valid_duration_days
CHECK (duration_days IS NULL OR duration_days > 0);

ALTER TABLE packages ADD CONSTRAINT valid_max_participants
CHECK (max_participants IS NULL OR max_participants > 0);

ALTER TABLE packages ADD CONSTRAINT valid_date_range
CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
