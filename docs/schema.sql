-- AAAchat 数据库 Schema
CREATE DATABASE IF NOT EXISTS aaachat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aaachat;


DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;

-- users 表：改为以 account 为主键索引，email 可选并唯一（允许多个 NULL）
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) DEFAULT '',
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_account (account),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE profiles (
  user_id INT PRIMARY KEY,
  bio TEXT,
  avatar_url VARCHAR(500),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  label VARCHAR(100) DEFAULT '',
  api_key VARCHAR(255) NOT NULL,
  is_shared TINYINT(1) NOT NULL DEFAULT 0,
  config_json TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_api_keys_provider_shared (provider, is_shared, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- conversations 表：按用户分组的会话元信息
CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- chat_messages 表：消息记录，关联到会话，并区分角色
CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  conversation_id INT NULL,
  role ENUM('user','assistant') NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  INDEX idx_chat_messages_conv (conversation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- plans 表：用于存储用户的规划计划（与 /api/planner 路由一致）
-- 说明：visibility 支持 private/public；plan_json 存储完整计划 JSON；
-- 索引：按 user_id + created_at 建联合索引，便于按用户分页查询。
CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  goal VARCHAR(255) NOT NULL,
  constraints TEXT NULL,
  steps_count INT NULL,
  deadline DATE NULL,
  plan_json LONGTEXT NOT NULL,
  visibility ENUM('private','public') NOT NULL DEFAULT 'private',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_plans_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;