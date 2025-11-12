--数据库 See
USE aaachat;

-- 更新：users 表改为以 account 为主，email 可选
INSERT INTO users (account, email, password_hash, name, role) VALUES
('admin', 'admin@example.com', '$2b$10$1SZsf3XqNBwa540FvTwe4.4uAoXLZUWbibbtnhxeyot.twv.B0kk.', 'Admin', 'admin'),
('user', 'user@example.com', '$2b$10$luEeLWocK6yH1J3hMnUwnuKvPV1dMabw2BiMW7XMfFC89hmBvSW26', 'Regular User', 'user');

INSERT INTO profiles (user_id, bio, avatar_url) VALUES
(1, '系统管理员账户', ''),
(2, '普通用户账户', '');

INSERT INTO chat_messages (user_id, content) VALUES
(2, '欢迎来到私人助手BOT！'),

-- 可选：插入一条示例计划（与 /api/planner 对应）
-- 注意：plan_json 通常由后端生成，这里仅示意结构
INSERT INTO plans (user_id, goal, constraints, steps_count, deadline, plan_json, visibility)
VALUES (2, '示例目标：学习Node.js', '每天1小时', 7, NULL, '{"steps":[{"index":1,"title":"环境搭建","description":"安装Node与npm","due_date":"2025-11-13","owner":"me","status":"pending"}]}', 'private');