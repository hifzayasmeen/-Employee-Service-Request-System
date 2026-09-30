ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id, expires_at);

CREATE TABLE email_outbox (
  id BIGSERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, recipient, event_type)
);
CREATE INDEX idx_email_outbox_pending ON email_outbox(available_at, id) WHERE sent_at IS NULL;