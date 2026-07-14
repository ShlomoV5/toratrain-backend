CREATE TABLE books (
  id SMALLSERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('torah', 'haftarah', 'megillot'))
);

CREATE TABLE chapters (
  id BIGSERIAL PRIMARY KEY,
  book_id SMALLINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number SMALLINT NOT NULL,
  UNIQUE (book_id, chapter_number)
);

CREATE TABLE verses (
  id BIGSERIAL PRIMARY KEY,
  chapter_id BIGINT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  verse_number SMALLINT NOT NULL,
  raw_text TEXT,
  UNIQUE (chapter_id, verse_number)
);

CREATE TABLE verse_words (
  id BIGSERIAL PRIMARY KEY,
  verse_id BIGINT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  word_index SMALLINT NOT NULL,
  word_text TEXT NOT NULL,
  normalized_text TEXT,
  UNIQUE (verse_id, word_index)
);

CREATE TABLE word_accents (
  id BIGSERIAL PRIMARY KEY,
  word_id BIGINT NOT NULL REFERENCES verse_words(id) ON DELETE CASCADE,
  accent_index SMALLINT NOT NULL,
  trope_code VARCHAR(30) NOT NULL,
  trope_symbol VARCHAR(30),
  UNIQUE (word_id, accent_index)
);

CREATE TABLE student_profiles (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  grade_level VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  book_id SMALLINT NOT NULL REFERENCES books(id),
  start_chapter SMALLINT NOT NULL,
  start_verse SMALLINT NOT NULL,
  end_chapter SMALLINT NOT NULL,
  end_verse SMALLINT NOT NULL,
  due_at TIMESTAMPTZ,
  assigned_by TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignment_progress (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  completion_status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (completion_status IN ('not_started', 'in_progress', 'completed')),
  self_evaluation_feedback JSONB,
  coins_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gamification_progress (
  student_id UUID PRIMARY KEY REFERENCES student_profiles(id) ON DELETE CASCADE,
  accumulated_coins INTEGER NOT NULL DEFAULT 0,
  total_assignments_completed INTEGER NOT NULL DEFAULT 0,
  latest_self_evaluation_feedback JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chapters_book_chapter ON chapters (book_id, chapter_number);
CREATE INDEX idx_verses_chapter_verse ON verses (chapter_id, verse_number);
CREATE INDEX idx_verse_words_lookup ON verse_words (verse_id, word_index);
CREATE INDEX idx_word_accents_lookup ON word_accents (word_id, accent_index);
CREATE INDEX idx_assignments_student_status ON assignments (student_id, status, due_at);
CREATE INDEX idx_assignment_progress_status ON assignment_progress (completion_status);
