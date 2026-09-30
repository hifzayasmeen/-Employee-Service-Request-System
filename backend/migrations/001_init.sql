CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee','agent','admin')),
  team TEXT CHECK (team IN ('IT','HR','Facility'))
);
CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('IT','HR','Facility')),
  priority TEXT NOT NULL CHECK (priority IN ('Low','Medium','High')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  requester_id INT NOT NULL REFERENCES users(id),
  assignee_id INT REFERENCES users(id),
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_requests_category ON requests(category);
CREATE INDEX idx_requests_requester ON requests(requester_id);
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  request_id INT REFERENCES requests(id),
  actor_id INT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
