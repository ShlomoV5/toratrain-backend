CREATE TYPE user_role AS ENUM ('ADMIN', 'STUDENT');
CREATE TYPE assignment_status AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number INT NOT NULL,
  UNIQUE(book_id, number)
);

CREATE TABLE IF NOT EXISTS verses (
  id BIGSERIAL PRIMARY KEY,
  chapter_id BIGINT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  number INT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(chapter_id, number)
);

CREATE TABLE IF NOT EXISTS words (
  id BIGSERIAL PRIMARY KEY,
  verse_id BIGINT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  position INT NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(verse_id, position)
);

CREATE TABLE IF NOT EXISTS tropes (
  id BIGSERIAL PRIMARY KEY,
  word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  coins INT NOT NULL DEFAULT 0,
  feedback JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_verse_id BIGINT REFERENCES verses(id) ON DELETE SET NULL,
  end_verse_id BIGINT REFERENCES verses(id) ON DELETE SET NULL,
  part_start_index INT,
  part_end_index INT,
  status assignment_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assignments_student_status
  ON assignments(student_user_id, status);
