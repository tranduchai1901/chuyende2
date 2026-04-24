-- QuizMaster all-in-one schema for phpMyAdmin (MySQL 8+)
-- Import 1 file: includes schema + core seed data + AI config tables

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ai_documents;
DROP TABLE IF EXISTS ai_runtime_config;
DROP TABLE IF EXISTS favorite_quizzes;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(128) NOT NULL,
  fullName VARCHAR(128) NOT NULL,
  grade INT NOT NULL DEFAULT 1,
  role ENUM('user','teacher','admin') NOT NULL DEFAULT 'user',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grades (
  id INT PRIMARY KEY,
  name VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  UNIQUE KEY uq_grade_subject (grade, name),
  INDEX idx_subject_grade (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade INT NOT NULL,
  subject VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  difficulty ENUM('De','Trung binh','Kho') NOT NULL DEFAULT 'Trung binh',
  durationMinutes INT NOT NULL DEFAULT 20,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quiz_grade_subject (grade, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quizId INT NOT NULL,
  content TEXT NOT NULL,
  imageUrl TEXT NULL,
  optionA VARCHAR(512) NOT NULL,
  optionB VARCHAR(512) NOT NULL,
  optionC VARCHAR(512) NOT NULL,
  optionD VARCHAR(512) NOT NULL,
  correctAnswer TINYINT UNSIGNED NOT NULL,
  explanation TEXT NULL,
  contentHash CHAR(64) GENERATED ALWAYS AS (SHA2(TRIM(LOWER(content)), 256)) STORED,
  CONSTRAINT chk_correct_answer CHECK (correctAnswer BETWEEN 0 AND 3),
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE,
  UNIQUE KEY uq_quiz_question_hash (quizId, contentHash),
  INDEX idx_question_quiz (quizId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  quizId INT NOT NULL,
  correct INT NOT NULL,
  total INT NOT NULL,
  score INT NOT NULL,
  submittedAt DATETIME NOT NULL,
  CONSTRAINT fk_attempt_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_quiz FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE,
  INDEX idx_attempt_user (userId),
  INDEX idx_attempt_quiz (quizId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE favorite_quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  quizId INT NOT NULL,
  UNIQUE KEY uq_fav_user_quiz (userId, quizId),
  CONSTRAINT fk_fav_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_quiz FOREIGN KEY (quizId) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_runtime_config (
  id TINYINT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
  model VARCHAR(128) NOT NULL DEFAULT 'gemini-1.5-flash',
  apiKey VARCHAR(255) NOT NULL DEFAULT '',
  apiKeys JSON NOT NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  createdBy INT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_doc_user FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_doc_created_by (createdBy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed core data
INSERT INTO users (id, username, password, fullName, grade, role) VALUES
  (1, 'admin', 'admin123', 'Quản trị viên', 12, 'admin'),
  (2, 'student1', '123456', 'Nguyễn Văn A', 10, 'user'),
  (3, 'student2', '123456', 'Trần Thị B', 12, 'user');

INSERT INTO grades (id, name) VALUES
  (1, 'Lớp 1'), (2, 'Lớp 2'), (3, 'Lớp 3'), (4, 'Lớp 4'),
  (5, 'Lớp 5'), (6, 'Lớp 6'), (7, 'Lớp 7'), (8, 'Lớp 8'),
  (9, 'Lớp 9'), (10, 'Lớp 10'), (11, 'Lớp 11'), (12, 'Lớp 12');

INSERT INTO subjects (grade, name) VALUES
  (10, 'Toán'), (10, 'Vật lý'), (10, 'Ngữ văn'),
  (11, 'Toán'), (11, 'Sinh học'),
  (12, 'Toán'), (12, 'Tiếng Anh'), (12, 'Ngữ văn');

INSERT INTO quizzes (id, grade, subject, title, difficulty, durationMinutes) VALUES
  (1, 10, 'Toán', 'Toán lớp 10 - Đề cơ bản', 'De', 20),
  (2, 12, 'Tiếng Anh', 'Tiếng Anh lớp 12 - Reading', 'Trung binh', 25);

INSERT INTO questions (quizId, content, optionA, optionB, optionC, optionD, correctAnswer, explanation) VALUES
  (1, 'Nghiệm của phương trình 2x + 3 = 11 là gì?', 'x = 2', 'x = 3', 'x = 4', 'x = 5', 2, '2x = 8 => x = 4'),
  (1, 'Đồ thị của hàm số y = x^2 là gì?', 'Đường thẳng', 'Parabol', 'Đường tròn', 'Elip', 1, 'Hàm bậc hai có đồ thị parabol'),
  (2, 'Choose the synonym of "rapid".', 'slow', 'quick', 'late', 'weak', 1, 'rapid = quick'),
  (2, 'She ___ to school every day.', 'go', 'goes', 'gone', 'going', 1, 'He/She/It + V(s/es)');

INSERT INTO ai_runtime_config (id, provider, model, apiKey, apiKeys)
VALUES (1, 'gemini', 'gemini-1.5-flash', '', JSON_ARRAY())
ON DUPLICATE KEY UPDATE provider = VALUES(provider), model = VALUES(model), apiKeys = VALUES(apiKeys);
