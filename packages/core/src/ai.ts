import { BODY_TYPE_INFO, DAY_INFO, TARGET_INFO, assess, dateKey, daysBetween, phaseOf, PHASES, weekSchedule, weekdayIndex } from './plan'
import { energyOn } from './energy'
import { dayKcal, dayProtein, dayScore, lastNDates, sleepHours, targets, weightSeries, EXPECTATIONS, expectationIndex } from './pillars'
import { SLOT_LABEL, getDay, ops, uid, type AppState, type Slot, type ToolCall } from './state'
import { completedSessions, sessionMinutes, sessionTitle, trainingOps, type Rpe } from './training'
import { ACTIVITIES, activityById } from './data/activities'

/* ---------------- 工具定义（OpenAI function calling 格式，通义千问/DeepSeek 等兼容） ---------------- */

const dateParam = { type: 'string', description: '日期 YYYY-MM-DD，默认今天' }

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'log_weight',
      description: '记录体重（公斤）。用户提到当前体重时调用。',
      parameters: { type: 'object', properties: { weight_kg: { type: 'number' }, date: dateParam }, required: ['weight_kg'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_waist',
      description: '记录腰围（厘米）。',
      parameters: { type: 'object', properties: { waist_cm: { type: 'number' }, date: dateParam }, required: ['waist_cm'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_meal',
      description: '记录一餐吃的东西。protein_g 和 kcal 按常见份量合理估算。一餐多样食物合并成一条记录。',
      parameters: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          description: { type: 'string', description: '吃了什么，简短' },
          protein_g: { type: 'number' },
          kcal: { type: 'number' },
          date: dateParam,
        },
        required: ['slot', 'description', 'protein_g', 'kcal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_meal',
      description: '删除一条饮食记录（用户纠正时先删除再重新记录）。meal_id 见系统提示中的记录。',
      parameters: { type: 'object', properties: { meal_id: { type: 'string' }, date: dateParam }, required: ['meal_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_water',
      description: '记录饮水。mode=add 为增加（如"刚喝了一杯"按 250ml），mode=set 为设定当日总量。',
      parameters: {
        type: 'object',
        properties: { ml: { type: 'number' }, mode: { type: 'string', enum: ['add', 'set'] }, date: dateParam },
        required: ['ml', 'mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_sleep',
      description: '记录睡眠。记在醒来的那天（"昨晚 12 点睡今早 7 点起"记在今天）。',
      parameters: {
        type: 'object',
        properties: {
          bed_time: { type: 'string', description: 'HH:MM，24 小时制' },
          wake_time: { type: 'string', description: 'HH:MM，24 小时制' },
          quality: { type: 'string', enum: ['good', 'ok', 'poor'] },
          date: dateParam,
        },
        required: ['bed_time', 'wake_time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_workout',
      description: '记录 App 外完成的运动（跑步、健身房、游泳、打球等）。App 内跟练和游戏场景里的训练会自动记录，不要重复记录。',
      parameters: {
        type: 'object',
        properties: {
          activity: { type: 'string', enum: ACTIVITIES.filter((x) => x.id !== 'guided').map((x) => x.id), description: ACTIVITIES.filter((x) => x.id !== 'guided').map((x) => `${x.id}=${x.name}`).join('，') },
          title: { type: 'string', description: '具体名称，如"夜跑""蛙泳"' },
          minutes: { type: 'number' },
          rpe: { type: 'string', enum: ['easy', 'ok', 'hard'], description: '主观强度：轻松/刚好/累' },
          note: { type: 'string' },
          date: dateParam,
        },
        required: ['activity', 'minutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_daily_summary',
      description: '保存每日总结到 App（显示在首页）。总结控制在 100 字以内。',
      parameters: { type: 'object', properties: { summary: { type: 'string' }, date: dateParam }, required: ['summary'] },
    },
  },
]

/* ---------------- 系统提示：每次请求都根据最新 App 数据重新生成 ---------------- */

const WD = ['日', '一', '二', '三', '四', '五', '六']
const QUALITY = { good: '好', ok: '一般', poor: '差' }
const RPE_LABEL = { easy: '轻松', ok: '刚好', hard: '累' }

function dayLine(s: AppState, date: string, withIds: boolean) {
  const p = s.profile!
  const d = getDay(s, date)
  const t = targets(p)
  const en = energyOn(s, date)
  const h = sleepHours(d.sleep)
  const parts = [
    `睡眠：${h === null ? '未记录' : `${d.sleep!.bed}→${d.sleep!.wake}，${h} 小时${d.sleep!.quality ? `，质量${QUALITY[d.sleep!.quality]}` : ''}`}`,
    `训练：${d.sessions.length ? d.sessions.map((x) => `${sessionTitle(x)} ${sessionMinutes(x)} 分钟${x.rpe ? `（感受：${RPE_LABEL[x.rpe]}）` : ''}`).join('；') : '无'}`,
    `饮食：${d.meals.length ? d.meals.map((m) => `${withIds ? `[${m.id}] ` : ''}${SLOT_LABEL[m.slot]} ${m.text}${m.protein != null ? ` 蛋白${m.protein}g` : ''}${m.kcal != null ? ` ${m.kcal}kcal` : ''}`).join('；') : '未记录'}；蛋白质合计 ${dayProtein(d)}/${t.protein}g，热量合计约 ${dayKcal(d)}kcal${d.meals.some((m) => !m.kcal) ? '（有餐未填热量）' : ''}`,
    `热量账本：基础代谢 ${en.bmr} + 日常活动 ${en.daily} + 运动 ${en.exercise} = 消耗 ${en.burn}；目标${en.adjust < 0 ? '缺口' : '盈余'} ${Math.abs(en.adjust)}；今日预算 ${en.budget}，${en.remaining >= 0 ? `还剩 ${en.remaining}` : `超出 ${-en.remaining}`}kcal`,
    `饮水：${d.water}/${t.water}ml`,
  ]
  if (d.weight != null) parts.push(`体重：${d.weight}kg`)
  if (d.waist != null) parts.push(`腰围：${d.waist}cm`)
  parts.push(`过程分：${dayScore(p, d, date)}/100`)
  return parts.join('\n')
}

export function buildSystemPrompt(s: AppState, now = new Date()): string {
  const p = s.profile!
  const a = assess(p)
  const t = targets(p)
  const today = dateKey(now)
  const dayIdx = Math.max(0, daysBetween(s.startDate!, today))
  const week = Math.min(a.weeks, Math.floor(dayIdx / 7) + 1)
  const sched = weekSchedule(p)
  const todayKind = sched[weekdayIndex(now)]
  const exp = EXPECTATIONS[expectationIndex(week)]
  const yesterday = lastNDates(2, now)[0]

  const ws = weightSeries(s, lastNDates(30, now)).filter((x) => x.raw != null)
  const firstW = ws[0]
  const lastW = ws[ws.length - 1]

  const history = lastNDates(8, now)
    .slice(0, 7)
    .reverse()
    .filter((date) => date >= s.startDate!) // 注册之前的日子不算
    .map((date) => {
      const d = getDay(s, date)
      const h = sleepHours(d.sleep)
      return `- ${date}：过程分 ${dayScore(p, d, date)}｜睡 ${h ?? '-'}h｜练 ${d.sessions.map((x) => `${sessionTitle(x)}${sessionMinutes(x)}分钟`).join('、') || '-'}｜蛋白 ${dayProtein(d)}g｜水 ${d.water}ml${d.weight != null ? `｜体重 ${d.weight}` : ''}${d.summary ? `｜总结：${d.summary}` : ''}`
    })
    .join('\n')

  const totalWorkouts = completedSessions(s).length
  const hasRecords = totalWorkouts > 0 || Object.entries(s.days).some(
    ([date, d]) => d.meals.length || d.sleep || d.water || d.waist != null || d.summary || (d.weight != null && date !== s.startDate),
  )

  const SHAPE_LABEL = { skinny: '偏瘦，没什么肉', even: '匀称，但没线条', soft: '有点小肚子', heavy: '整体偏胖' }
  const EXP_LABEL = { 1: '零基础', 2: '偶尔练', 3: '规律训练' }
  const EQUIP_LABEL = { none: '徒手', band: '弹力带', dumbbell: '哑铃' }

  const dataSection = hasRecords
    ? `# 今天（${today}）的数据
今日计划训练：${DAY_INFO[todayKind].title}
${dayLine(s, today, true)}

${yesterday >= s.startDate! ? `# 昨天（${yesterday}）\n${dayLine(s, yesterday, true)}\n\n` : ''}# 近 7 天
${history || `用户 ${s.startDate} 开始计划，此前没有记录`}

# 体重
${ws.length ? `近 30 天记录 ${ws.length} 次；首次 ${firstW.date} ${firstW.raw}kg，最近 ${lastW.date} ${lastW.raw}kg（7 日平均 ${lastW.avg}kg）` : '近 30 天没有体重记录'}`
    : `# App 记录
用户刚完成测评，App 里还没有任何睡、练、吃、水的记录。这是你们的第一次对话。
今天（${today}）按计划是：${DAY_INFO[todayKind].title}。`

  return `你是「薄肌俱乐部」App 里的 AI 教练，名字叫"小薄"。用户在 App 里和你聊天，你能读到 App 的实时数据，也能通过工具把信息写回 App。

# 你的核心任务：消除过程焦虑
用户最怕"努力了却看不到变化"然后放弃。你要：
1. 把注意力从结果（体重秤、镜子）转回可控的过程：睡、练、吃、水。
2. 用下面的真实数据，具体指出用户已经做到的"隐形进步"（例如"这周睡眠平均多了 40 分钟"），不说空泛的鼓励。
3. 体重每天波动 ±1kg 是正常的（水分、钠、经期等），只看 7 日平均趋势。
4. 结合用户所处阶段告诉 Ta 现在看不到变化是否正常。

# 风格
- 中文口语，像懂行的朋友，温暖但不肉麻，不说教，少用感叹号。
- 回复简短：日常 1–3 句；每日总结可以长一些，但不超过 200 字。
- 不要使用 Markdown 标题和表格，可以用简短的列表。

# 数据同步规则（非常重要）
- 用户在对话中提到任何可记录的信息（体重、腰围、吃了什么、喝水、睡眠、App 外的运动），立即调用工具记录，不要先征求确认。
- 信息不全时合理估算（例如"一碗牛肉面"≈ 蛋白 25g、550kcal），记录后在回复中用一句话说明估算值，方便用户纠正。
- 用户纠正时，用 delete_meal 删除旧记录再重新记录。
- 日期：今天是 ${today}（周${WD[now.getDay()]}），昨天是 ${yesterday}，现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}。"昨晚睡"记在今天；"昨天吃的"记在昨天。
- 记录完成后，回复里不要复述全部数字，App 界面会显示同步结果。

# 首次对话：测评解读
用户刚完成测评、第一次和你说话时（App 还没有任何记录），按下面的结构解读，总共不超过 250 字：
1) 用一两句话复述 Ta 的情况和薄肌类型，说明这意味着什么（大白话，不堆术语）
2) 接下来的路线：按阶段各一句话，明确说出"前 2 周镜子里看不出变化是正常的"
3) 每天只需要做好的四件事：睡、练、吃、水，各给一个具体数字目标
4) 结合 Ta 的情况，指出一个最可能踩的坑
5) 最后只问 1 个问题，了解作息或饮食习惯（如平时几点睡、三餐怎么解决），方便之后调整
语气是"我们一起开始"，不要像体检报告。

# 每日总结
当用户要求总结、说"今天结束了/准备睡了"时：
1) 四项（睡、练、吃、水）完成情况，一句话带过
2) 今天做得最好的一点（具体）
3) 明天一个最小的改进动作（具体到可以马上做）
4) 一句基于真实数据的鼓励
然后调用 save_daily_summary 保存一段 100 字以内的摘要。

# 安全边界
- 不做医疗诊断。伤病、慢性病、疼痛请建议就医。
- 不鼓励极端节食（女性每日低于 1200kcal、男性低于 1500kcal 要提醒）。如果出现进食障碍迹象（催吐、长期饿肚子、强烈的身材羞耻），温和关心，并建议寻求专业帮助。

# 用户档案（测评答案）
- ${p.sex === 'male' ? '男' : '女'}，${p.age} 岁，${p.height}cm，测评时 ${p.weight}kg，腰围 ${p.waist ? `${p.waist}cm` : '未填写'}
- 自评体型：${SHAPE_LABEL[p.shape]}；运动经验：${EXP_LABEL[p.exp]}；器械：${p.equip.map((e) => EQUIP_LABEL[e]).join('、')}
- 想练出：${p.targets.map((x) => TARGET_INFO[x].label).join('、')}
- 可投入时间：每周 ${p.days} 天，每次 ${p.minutes} 分钟

# App 根据测评算出的计划
- 薄肌类型：${BODY_TYPE_INFO[a.type].name}（${BODY_TYPE_INFO[a.type].strategy}）
- 估算体脂 ${a.bodyFat}%，目标 ${a.targetFat[0]}–${a.targetFat[1]}%；目标体重约 ${a.targetWeight}kg
- 每日目标：睡眠 ${t.sleepH}h，蛋白质 ${t.protein}g，饮水 ${t.water}ml；热量预算按当天实际消耗动态计算（日均约 ${t.kcal}kcal），超出时不要让用户第二天少吃补回来
- 训练计划：每周 ${p.days} 练，每次 ${p.minutes} 分钟。周一到周日：${sched.map((k) => DAY_INFO[k].title).join('、')}
- 计划进度：第 ${week}/${a.weeks} 周，${PHASES[phaseOf(week, a.weeks)].name}；累计训练 ${totalWorkouts} 次
- 当前阶段的正常预期：${exp.title}。${exp.body}

${dataSection}`
}

/* ---------------- 工具执行：写入 App 数据 ---------------- */

export type Apply = (op: (s: AppState) => AppState) => void

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const validDate = (d: unknown, fallback: string) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback)
const validTime = (t: unknown) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t)
const fmtDay = (date: string, today: string) => (date === today ? '' : `${date.slice(5)} `)

export function executeTool(call: ToolCall, apply: Apply, getState: () => AppState, today: string): { result: string; label: string } {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    return { result: JSON.stringify({ ok: false, error: '参数不是合法 JSON' }), label: '' }
  }
  const date = validDate(args.date, today)
  const pre = fmtDay(date, today)
  const num = (k: string) => (typeof args[k] === 'number' ? (args[k] as number) : Number(args[k]))
  const fail = (error: string) => ({ result: JSON.stringify({ ok: false, error }), label: '' })

  switch (call.function.name) {
    case 'log_weight': {
      const kg = num('weight_kg')
      if (!(kg > 25 && kg < 250)) return fail('体重数值不合理')
      apply(ops.setWeight(date, Math.round(kg * 10) / 10))
      return { result: JSON.stringify({ ok: true }), label: `${pre}体重 ${kg} kg` }
    }
    case 'log_waist': {
      const cm = num('waist_cm')
      if (!(cm > 40 && cm < 200)) return fail('腰围数值不合理')
      apply(ops.setWaist(date, Math.round(cm)))
      return { result: JSON.stringify({ ok: true }), label: `${pre}腰围 ${cm} cm` }
    }
    case 'log_meal': {
      const slot = SLOTS.includes(args.slot as Slot) ? (args.slot as Slot) : 'snack'
      const text = String(args.description ?? '').slice(0, 60)
      if (!text) return fail('缺少 description')
      const protein = Math.max(0, Math.round(num('protein_g') || 0))
      const kcal = Math.max(0, Math.round(num('kcal') || 0))
      const id = uid()
      apply(ops.addMeal(date, { id, slot, text, protein, kcal, source: 'chat' }))
      const d = getDay(getState(), date)
      return {
        result: JSON.stringify({ ok: true, meal_id: id, day_protein_g: dayProtein(d), day_kcal: dayKcal(d) }),
        label: `${pre}${SLOT_LABEL[slot]}：${text} · 蛋白 ${protein}g`,
      }
    }
    case 'delete_meal': {
      const id = String(args.meal_id ?? '')
      const meal = getDay(getState(), date).meals.find((m) => m.id === id)
      if (!meal) return fail('找不到这条记录')
      apply(ops.removeMeal(date, id))
      return { result: JSON.stringify({ ok: true }), label: `${pre}删除：${meal.text}` }
    }
    case 'log_water': {
      const ml = Math.round(num('ml'))
      if (!(ml > 0 && ml < 8000)) return fail('饮水量不合理')
      apply(args.mode === 'set' ? ops.setWater(date, ml) : ops.addWater(date, ml))
      const total = getDay(getState(), date).water
      return { result: JSON.stringify({ ok: true, day_total_ml: total }), label: `${pre}饮水 ${args.mode === 'set' ? '' : '+'}${ml} ml` }
    }
    case 'log_sleep': {
      if (!validTime(args.bed_time) || !validTime(args.wake_time)) return fail('时间格式应为 HH:MM')
      const pad = (t: string) => t.padStart(5, '0')
      const q = ['good', 'ok', 'poor'].includes(args.quality as string) ? (args.quality as 'good' | 'ok' | 'poor') : undefined
      const sleep = { bed: pad(args.bed_time as string), wake: pad(args.wake_time as string), quality: q, source: 'chat' as const }
      apply(ops.setSleep(date, sleep))
      return { result: JSON.stringify({ ok: true, hours: sleepHours(sleep) }), label: `${pre}睡眠 ${sleep.bed}→${sleep.wake}（${sleepHours(sleep)}h）` }
    }
    case 'log_workout': {
      const minutes = Math.round(num('minutes'))
      if (!(minutes > 0 && minutes < 600)) return fail('时长不合理')
      const activity = ACTIVITIES.find((x) => x.id === args.activity && x.id !== 'guided') ?? activityById('other')
      const title = String(args.title ?? '').slice(0, 30) || undefined
      const st = getState()
      // 自动关联到场景里对应类型的设施（如果用户摆放过）
      const facility = st.game.facilities.find((f) => f.kind === activity.facility)
      const rpe = ['easy', 'ok', 'hard'].includes(args.rpe as string) ? (args.rpe as Rpe) : undefined
      apply(
        trainingOps.add({
          id: uid(),
          activityId: activity.id,
          title,
          facilityId: facility?.id,
          source: 'chat',
          date,
          minutes,
          rpe,
          note: args.note ? String(args.note) : undefined,
          weightKg: st.profile?.weight ?? 60,
          endAt: date === today ? Date.now() : new Date(date + 'T20:00:00').getTime(),
        }),
      )
      return { result: JSON.stringify({ ok: true }), label: `${pre}训练：${title ?? activity.name} ${minutes} 分钟` }
    }
    case 'save_daily_summary': {
      const summary = String(args.summary ?? '').slice(0, 300)
      if (!summary) return fail('summary 为空')
      apply(ops.setSummary(date, summary))
      return { result: JSON.stringify({ ok: true }), label: `${pre}已保存今日总结` }
    }
  }
  return fail(`未知工具 ${call.function.name}`)
}
