require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
const cors = require('cors');

const { authRouter } = require('./routes/auth');
const { usersRouter } = require('./routes/users');
const { profilesRouter } = require('./routes/profiles');
const { chatRouter } = require('./routes/chat');
const { keysRouter } = require('./routes/keys');
const { plannerRouter } = require('./routes/planner');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 静态资源：提供前端页面
app.use(express.static(path.join(__dirname, '..', 'client')));
// 静态资源：提供上传文件访问
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API 路由
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/keys', keysRouter);
app.use('/api/planner', plannerRouter);

// 根路径返回登录页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});