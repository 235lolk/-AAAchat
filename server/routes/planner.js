const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireCsrf } = require('../middleware/auth');

/**
 * 规划模块路由
 *
 * 功能：
 * 1) 接受用户的目标描述，调用模型生成结构化计划步骤并返回（不入库）。
 * 2) 支持将生成的计划以 JSON 形式存储到 MySQL（单用户多计划，默认私有）。
 * 3) 支持按用户查询计划列表、查看单个计划详情与删除计划。
 *
 * 依赖：
 * - 鉴权中间件（必须登录）
 * - CSRF 校验（POST/DELETE 请求）
 * - MySQL 连接池（server/db.js）
 *
 * Windows 11 注意：如需在本地执行数据库迁移脚本，请在 PowerShell 下使用
 * `docker exec assistantbot-app node scripts/migrate_plans.js` 或在非容器环境配置好
 * `server/.env` 后使用 `node server\scripts\migrate_plans.js`。
 */

/**
 * 从数据库选择一个可用的 API Key（优先共享，其次用户私有）
 * @param {object} opts - 选项对象
 * @param {number} opts.userId - 当前用户ID
 * @param {boolean} [opts.useShared] - 是否优先使用共享Key
 * @param {number} [opts.sharedKeyId] - 指定共享Key的ID（可选）
 * @returns {Promise<{provider: string, api_key: string, config_json: object}>}
 */
async function chooseApiKey({ userId, useShared, sharedKeyId }) {
  // 优先共享Key
  if (useShared) {
    if (sharedKeyId) {
      const [rows] = await pool.query('SELECT * FROM api_keys WHERE id = ? AND is_shared = 1', [sharedKeyId]);
      if (rows && rows.length > 0) return rows[0];
    }
    const [rows] = await pool.query('SELECT * FROM api_keys WHERE is_shared = 1 ORDER BY id DESC LIMIT 1');
    if (rows && rows.length > 0) return rows[0];
  }
  // 其次用户私有Key
  const [urows] = await pool.query('SELECT * FROM api_keys WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  if (urows && urows.length > 0) return urows[0];
  throw new Error('未找到可用的API Key，请先在“共享池”或“个人设置”中配置');
}

/**
 * 调用模型生成计划（JSON 严格输出）
 * @param {object} params - 生成参数
 * @param {string} params.goal - 目标描述
 * @param {string} [params.constraints] - 约束条件（可选）
 * @param {number} [params.stepsCount] - 步骤数量建议（可选）
 * @param {string} [params.deadline] - 截止日期（可选，YYYY-MM-DD）
 * @param {object} keyRow - 选中的 key 行（含 provider, api_key, config_json）
 * @returns {Promise<object>} 返回结构化计划对象 { steps: [...] }
 */
/**
 * 调用外部模型生成计划（等待模型完整输出），优化提示词以达到“按天具体可执行”。
 * 约束优先级：当传入 days 时，days 为强约束，stepsCount 仅作为粒度参考并不会写入提示词。
 * @param {object} params - 生成参数
 * @param {string} params.goal - 目标描述
 * @param {string} [params.constraints] - 约束条件（可选）
 * @param {number} [params.stepsCount] - 步骤数量建议（可选，若传入 days 则忽略）
 * @param {string} [params.deadline] - 截止日期（可选，YYYY-MM-DD）
 * @param {number} [params.days] - 总天数（可选，要求每天至少一个具体任务）
 * @param {object} keyRow - 选中的 key 行（含 provider, api_key, config_json）
 * @returns {Promise<object>} 返回结构化计划对象 { steps: [...] }
 */
async function generatePlan({ goal, constraints, stepsCount, deadline, days }, keyRow) {
  const provider = keyRow.provider || 'deepseek';
  const cfg = keyRow.config_json || {};
  const baseUrl = (cfg.base_url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
    .replace(/\/$/, '');
  const model = cfg.model || 'deepseek-chat';

  // 要求模型严格返回 JSON，避免混入说明性文本
  const systemPrompt = '你是一名项目规划与进度安排助手。输出必须严格为 JSON，不能包含除 JSON 之外的任何文字或标记。请生成“具体、可执行、按天安排”的任务列表。';

  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = [
    `目标: ${goal}`,
    constraints ? `约束: ${constraints}` : null,
    days ? `总天数: ${days}` : null,
    (!days && stepsCount) ? `步骤数量建议(细化上限): ${stepsCount}` : null,
    deadline ? `整体截止日期(可用于倒排至每日): ${deadline}` : null,
    `今天日期: ${today}`,
    '要求：',
    '- 计划需“具体可执行”，精确到每天需要完成的事项，避免空泛描述；',
    '- 每个步骤代表当天的一个明确行动项（如交付物、检查点或可测量结果）；',
    days
      ? '- 绝对遵循：输出的 steps 数量必须等于总天数 days（steps.length === days），每天至少一个明确任务；如同时提供 stepsCount，请以 days 为准，stepsCount 仅作为粒度参考。'
      : '- 如未提供 days，则可参考 stepsCount 进行合理细化（不强制固定数量）。',
    '- 每个步骤必须提供 due_date 为具体日期（YYYY-MM-DD），覆盖整个周期；建议从今天起或按合理节奏分配至每日；',
    '- description 要包含验收标准或交付细节（例如：提交评审文档、完成代码合并、通过测试用例等）；',
    '- owner 默认为 "me"，status 初始为 "pending"；index 从 1 连续递增；title 可为当天的简要主题。',
    '严格返回如下 JSON：{ "steps": [ { "index": 1, "title": "...", "description": "...", "due_date": "YYYY-MM-DD", "owner": "me", "status": "pending" } ] }',
  ].filter(Boolean).join('\n');

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    temperature: 0.2,
  };

  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keyRow.api_key}`,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`模型请求失败: ${resp.status} ${resp.statusText} - ${text}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';

  // 尝试解析纯 JSON 或 ```json ... ``` 包裹的内容
  let jsonText = content.trim();
  const fenceMatch = jsonText.match(/```json\n([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    // 回退：尝试提取大括号内容
    const braceMatch = jsonText.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      parsed = JSON.parse(braceMatch[0]);
    } else {
      throw new Error('模型未返回合法 JSON，请稍后重试');
    }
  }

  // 基础校验与规范化
  if (!parsed || !Array.isArray(parsed.steps)) {
    throw new Error('返回结构不包含 steps 数组');
  }
  const steps = parsed.steps.map((s, i) => ({
    index: Number(s.index ?? i + 1),
    title: String(s.title ?? `步骤 ${i + 1}`),
    description: String(s.description ?? ''),
    due_date: String(s.due_date ?? (deadline || '')), // 优先使用模型给出的每日日期；缺省时使用整体截止或空
    owner: String(s.owner ?? 'me'),
    status: String(s.status ?? 'pending'),
  }));
  return { steps };
}


// 生成计划
router.post('/generate', authenticate, requireCsrf, async (req, res) => {
  /**
   * 请求体参数：
   * - goal: string 必填，目标描述
   * - constraints: string 可选，约束条件
   * - steps_count: number 可选，建议步骤数
   * - deadline: string 可选，YYYY-MM-DD
   * - days: number 可选，总天数（按天具体安排）
   * - use_shared: boolean 可选，是否优先使用共享Key
   * - shared_key_id: number 可选，指定共享Key
   */
  const { goal, constraints, steps_count, deadline, days, use_shared, shared_key_id } = req.body || {};

  // 基本校验
  if (!goal || typeof goal !== 'string' || goal.trim().length < 4) {
    return res.status(400).json({ error: '请提供清晰的目标描述（至少4个字符）' });
  }

  try {
    const keyRow = await chooseApiKey({
      userId: req.user.id,
      useShared: !!use_shared,
      sharedKeyId: shared_key_id ? Number(shared_key_id) : undefined,
    });
    if (keyRow && typeof keyRow.config_json === 'string') {
      try { keyRow.config_json = JSON.parse(keyRow.config_json); } catch (_) { keyRow.config_json = {}; }
    }

    const plan = await generatePlan({
      goal: goal.trim(),
      constraints: constraints ? String(constraints).trim() : undefined,
      stepsCount: steps_count ? Number(steps_count) : undefined,
      deadline: deadline ? String(deadline).trim() : undefined,
      days: days ? Number(days) : undefined,
    }, keyRow);

    return res.json({ plan });
  } catch (err) {
    return res.status(500).json({ error: err.message || '生成计划失败' });
  }
});

/**
 * 保存计划到数据库（默认私有）
 *
 * 路由：POST /api/planner/save
 * 鉴权：需要登录；需要 CSRF。
 * 请求体：
 * - goal: string 必填，与生成时一致
 * - constraints: string 可选
 * - steps_count: number 可选
 * - deadline: string 可选 YYYY-MM-DD
 * - plan: object 必填，形如 { steps: [...] }
 * - visibility: 'private' | 'public' 可选，默认 'private'
 * 返回：{ id: number }
 */
router.post('/save', authenticate, requireCsrf, async (req, res) => {
  const { goal, constraints, steps_count, deadline, plan, visibility } = req.body || {};
  // 基本校验：goal 与 plan 必须存在
  if (!goal || typeof goal !== 'string' || goal.trim().length < 4) {
    return res.status(400).json({ error: '请提供清晰的目标描述（至少4个字符）' });
  }
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
    return res.status(400).json({ error: 'plan 格式不正确，应包含 steps 数组' });
  }
  try {
    const payload = {
      user_id: req.user.id,
      goal: goal.trim().slice(0, 255),
      constraints: constraints ? String(constraints).trim() : null,
      steps_count: steps_count ? Number(steps_count) : null,
      deadline: deadline ? String(deadline).trim() : null,
      plan_json: JSON.stringify({ steps: plan.steps }),
      visibility: (visibility === 'public') ? 'public' : 'private',
    };
    const [result] = await pool.query(
      'INSERT INTO plans (user_id, goal, constraints, steps_count, deadline, plan_json, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [payload.user_id, payload.goal, payload.constraints, payload.steps_count, payload.deadline, payload.plan_json, payload.visibility]
    );
    return res.json({ id: result.insertId });
  } catch (err) {
    console.error('[planner/save] ', err);
    return res.status(500).json({ error: '保存计划失败' });
  }
});

/**
 * 更新计划（仅限本人或管理员）
 *
 * 路由：PUT /api/planner/:id
 * 鉴权：需要登录；需要 CSRF。
 * 请求体：与保存类似，可选择性更新字段；plan 必须包含 steps
 * 返回：{ success: true, id }
 */
router.put('/:id', authenticate, requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '非法计划ID' });
  const { goal, constraints, steps_count, deadline, plan, visibility } = req.body || {};
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
    return res.status(400).json({ error: 'plan 格式不正确，应包含 steps 数组' });
  }
  try {
    // 访问控制：仅本人或管理员
    const [rows] = await pool.query('SELECT user_id FROM plans WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '计划不存在' });
    const ownerId = rows[0].user_id;
    if (ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权修改该计划' });
    }

    const payload = {
      goal: goal && typeof goal === 'string' ? goal.trim().slice(0, 255) : null,
      constraints: constraints ? String(constraints).trim() : null,
      steps_count: steps_count ? Number(steps_count) : null,
      deadline: deadline ? String(deadline).trim() : null,
      plan_json: JSON.stringify({ steps: plan.steps }),
      visibility: (visibility === 'public') ? 'public' : 'private',
    };
    await pool.query(
      'UPDATE plans SET goal = COALESCE(?, goal), constraints = COALESCE(?, constraints), steps_count = COALESCE(?, steps_count), deadline = COALESCE(?, deadline), plan_json = ?, visibility = COALESCE(?, visibility) WHERE id = ?',
      [payload.goal, payload.constraints, payload.steps_count, payload.deadline, payload.plan_json, payload.visibility, id]
    );
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[planner/update] ', err);
    return res.status(500).json({ error: '更新计划失败' });
  }
});

/**
 * 查询当前用户的计划列表（仅返回概要信息）
 *
 * 路由：GET /api/planner/list
 * 鉴权：需要登录
 * 返回：{ plans: Array<{id, goal, created_at, updated_at}> }
 */
router.get('/list', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, goal, created_at, updated_at FROM plans WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
    );
    return res.json({ plans: rows });
  } catch (err) {
    console.error('[planner/list] ', err);
    return res.status(500).json({ error: '查询计划列表失败' });
  }
});

/**
 * 查询单个计划详情（仅限本人或管理员）
 *
 * 路由：GET /api/planner/:id
 * 鉴权：需要登录
 * 返回：{ id, goal, constraints, steps_count, deadline, plan_json, created_at, updated_at }
 */
router.get('/:id', authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '非法计划ID' });
  try {
    const [rows] = await pool.query('SELECT * FROM plans WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '计划不存在' });
    const plan = rows[0];
    // 访问控制：仅本人或管理员
    if (plan.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权访问该计划' });
    }
    return res.json(plan);
  } catch (err) {
    console.error('[planner/get] ', err);
    return res.status(500).json({ error: '查询计划失败' });
  }
});

/**
 * 删除计划（仅限本人或管理员）
 *
 * 路由：DELETE /api/planner/:id
 * 鉴权：需要登录；需要 CSRF
 * 返回：{ success: true }
 */
router.delete('/:id', authenticate, requireCsrf, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '非法计划ID' });
  try {
    const [rows] = await pool.query('SELECT user_id FROM plans WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '计划不存在' });
    const ownerId = rows[0].user_id;
    if (ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除该计划' });
    }
    await pool.query('DELETE FROM plans WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[planner/delete] ', err);
    return res.status(500).json({ error: '删除计划失败' });
  }
});

module.exports = { plannerRouter: router };