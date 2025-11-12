/**
 * 计划对话编辑器（前端纯规则解析）
 * 功能：解析用户的中文自然语言指令，修改内存中的计划 steps，并回显反馈。
 * 使用：
 * const editor = new PlanChatEditor({ messagesEl, inputEl, sendBtn, getPlan, setPlan, onFeedback })
 *
 * 注意：
 * - 本模块不发起网络请求，仅修改前端状态，保存时请调用保存接口。
 * - 解析规则覆盖常见表达：标记完成/取消完成、修改标题/描述/截止日期/负责人。
 */
export class PlanChatEditor {
  /**
   * 构造函数
   * 参数：
   * - messagesEl: 聊天消息容器元素（用于显示用户与系统的消息）
   * - inputEl: 文本输入框元素
   * - sendBtn: 发送按钮元素
   * - getPlan: 函数，返回当前 steps 数组
   * - setPlan: 函数，设置新的 steps 数组并触发外部渲染
   * - onFeedback: 函数，向页面顶部提示框回传信息（type: info/success/warning/danger）
   */
  constructor({ messagesEl, inputEl, sendBtn, getPlan, setPlan, onFeedback }) {
    this.messagesEl = messagesEl;
    this.inputEl = inputEl;
    this.sendBtn = sendBtn;
    this.getPlan = getPlan;
    this.setPlan = setPlan;
    this.onFeedback = onFeedback || (() => {});

    // 绑定事件：发送按钮和输入框回车键
    this.sendBtn?.addEventListener('click', () => this.handleSend());
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.appendSystem('现在可以通过自然语言修改计划，例如：“标记第2步完成”。');
  }

  /**
   * 处理发送消息：读取输入内容，追加到消息列表，解析并应用到计划。
   */
  handleSend() {
    const text = String(this.inputEl?.value || '').trim();
    if (!text) return;
    this.appendUser(text);
    this.inputEl.value = '';

    const steps = Array.isArray(this.getPlan?.()) ? JSON.parse(JSON.stringify(this.getPlan())) : [];
    const cmd = this.parseCommand(text);
    if (!cmd) {
      this.appendSystem('抱歉，我没理解你的指令。可试试：标记第3步完成 / 修改第3步截止日期为2025-12-20');
      this.onFeedback('无法解析该指令，请更具体一些。', 'warning');
      return;
    }

    const res = this.applyCommand(cmd, steps);
    if (res?.ok) {
      // 应用变更后更新外部状态，并反馈
      this.setPlan(steps);
      this.appendSystem(res.message || '已根据你的指令更新计划。');
      this.onFeedback(res.message || '计划已更新。', 'success');
    } else {
      this.appendSystem(res?.message || '执行失败，请检查指令是否包含正确的步骤编号。');
      this.onFeedback(res?.message || '执行失败。', 'danger');
    }
  }

  /**
   * 解析自然语言指令为结构化命令
   * 支持示例：
   * - 标记第3步完成 / 将第3步标记为完成 / 完成第3步
   * - 取消第3步完成 / 将第3步标记为未完成 / 未完成第3步
   * - 修改第3步截止日期为2025-12-20 / 把第3步截止日期改为2025-12-20
   * - 修改第2步标题为“xxx” / 把第2步标题改为xxx
   * - 修改第2步描述为“xxx” / 把第2步描述改为xxx
   * - 修改第2步负责人为“张三” / 把第2步负责人改为张三
   */
  parseCommand(text) {
    const t = String(text).replace(/[“”"']/g, '').trim();

    // 标记完成
    let m = t.match(/(?:标记|设置|标注)?第?(\d+)步?(?:为)?完成|完成第?(\d+)步?/);
    if (m) {
      const idx = Number(m[1] || m[2]);
      if (Number.isFinite(idx)) return { type: 'done', index: idx };
    }

    // 取消完成
    m = t.match(/(?:取消|移除).*?第?(\d+)步?.*?(?:完成|已完成)|未完成第?(\d+)步?/);
    if (m) {
      const idx = Number(m[1] || m[2]);
      if (Number.isFinite(idx)) return { type: 'undo', index: idx };
    }

    // 修改截止日期 YYYY-MM-DD（简单校验）
    m = t.match(/第?(\d+)步?.*?(?:截止日期|截止|到期日|截止时间).*?(?:改为|为)\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
    if (m) {
      const idx = Number(m[1]);
      const date = m[2];
      if (Number.isFinite(idx)) return { type: 'update', field: 'due_date', index: idx, value: date };
    }

    // 修改标题
    m = t.match(/第?(\d+)步?.*?(?:标题|名称|题目).*?(?:改为|为)\s*(.+)/);
    if (m) {
      const idx = Number(m[1]);
      const val = m[2];
      if (Number.isFinite(idx)) return { type: 'update', field: 'title', index: idx, value: val };
    }

    // 修改描述
    m = t.match(/第?(\d+)步?.*?(?:描述|说明|细节).*?(?:改为|为)\s*(.+)/);
    if (m) {
      const idx = Number(m[1]);
      const val = m[2];
      if (Number.isFinite(idx)) return { type: 'update', field: 'description', index: idx, value: val };
    }

    // 修改负责人
    m = t.match(/第?(\d+)步?.*?(?:负责人|责任人|执行人).*?(?:改为|为)\s*(.+)/);
    if (m) {
      const idx = Number(m[1]);
      const val = m[2];
      if (Number.isFinite(idx)) return { type: 'update', field: 'owner', index: idx, value: val };
    }

    return null;
  }

  /**
   * 应用结构化命令到 steps 数组
   * 返回 { ok: boolean, message: string }
   */
  applyCommand(cmd, steps) {
    const findIndex = (idx) => steps.findIndex(s => Number(s.index) === Number(idx));
    const i = findIndex(cmd.index);
    if (i < 0) return { ok: false, message: `未找到第 ${cmd.index} 步，请确认编号。` };

    if (cmd.type === 'done') {
      steps[i].status = 'done';
      return { ok: true, message: `已标记第 ${cmd.index} 步为完成。` };
    }
    if (cmd.type === 'undo') {
      steps[i].status = 'pending';
      return { ok: true, message: `已取消第 ${cmd.index} 步完成状态。` };
    }
    if (cmd.type === 'update') {
      const allowed = ['title', 'description', 'due_date', 'owner'];
      if (!allowed.includes(cmd.field)) return { ok: false, message: '不支持的字段修改。' };
      steps[i][cmd.field] = String(cmd.value || '').trim();
      // 特殊：截止日期简单校验格式
      if (cmd.field === 'due_date' && !/^\d{4}-\d{2}-\d{2}$/.test(steps[i][cmd.field])) {
        return { ok: false, message: '日期格式需为 YYYY-MM-DD。' };
      }
      return { ok: true, message: `已将第 ${cmd.index} 步的「${this.cnField(cmd.field)}」修改为：${steps[i][cmd.field]}。` };
    }

    return { ok: false, message: '暂不支持该类型的操作。' };
  }

  /** 将字段英文名转换为中文展示名 */
  cnField(f) {
    return ({ title: '标题', description: '描述', due_date: '截止日期', owner: '负责人' })[f] || f;
  }

  /** 在聊天窗口追加用户消息 */
  appendUser(text) {
    this.appendBubble(text, 'user');
  }

  /** 在聊天窗口追加系统消息 */
  appendSystem(text) {
    this.appendBubble(text, 'system');
  }

  /**
   * 生成并追加消息气泡
   * - type = 'user' 使用浅蓝背景；'system' 使用浅灰背景。
   */
  appendBubble(text, type = 'system') {
    const wrap = document.createElement('div');
    wrap.className = `d-flex ${type === 'user' ? 'justify-content-end' : 'justify-content-start'} my-1`;
    const bubble = document.createElement('div');
    bubble.className = `p-2 rounded ${type === 'user' ? 'bg-primary text-white' : 'bg-light text-dark'}`;
    bubble.style.maxWidth = '80%';
    bubble.style.wordBreak = 'break-word';
    bubble.textContent = String(text || '');
    wrap.appendChild(bubble);
    this.messagesEl?.appendChild(wrap);
    // 滚动到底部，方便阅读
    this.messagesEl?.scrollTo({ top: this.messagesEl.scrollHeight, behavior: 'smooth' });
  }
}