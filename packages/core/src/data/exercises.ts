export type Tag = 'core' | 'shoulder' | 'arm' | 'chest' | 'back' | 'glute' | 'leg' | 'cardio' | 'posture'
export type Equip = 'none' | 'band' | 'dumbbell'

export interface Exercise {
  id: string
  name: string
  /** 第一个是主要部位 */
  tags: Tag[]
  equip: Equip
  /** 1 入门 / 2 进阶 / 3 挑战 */
  level: 1 | 2 | 3
  mode: 'reps' | 'time'
  /** 基准次数或秒数（进阶水平、正常强度下） */
  base: number
  /** 单侧动作，次数/时间为每侧 */
  perSide?: boolean
  met: number
  cues: string[]
}

export const TAG_LABEL: Record<Tag, string> = {
  core: '核心',
  shoulder: '肩部',
  arm: '手臂',
  chest: '胸部',
  back: '背部',
  glute: '臀部',
  leg: '腿部',
  cardio: '燃脂',
  posture: '体态',
}

/** 动作演示占位图里使用的单字 */
export const TAG_GLYPH: Record<Tag, string> = {
  core: '核',
  shoulder: '肩',
  arm: '臂',
  chest: '胸',
  back: '背',
  glute: '臀',
  leg: '腿',
  cardio: '燃',
  posture: '姿',
}

export const EXERCISES: Exercise[] = [
  // 核心
  { id: 'crunch', name: '卷腹', tags: ['core'], equip: 'none', level: 1, mode: 'reps', base: 15, met: 4, cues: ['下背贴地，用腹部发力卷起', '下巴与胸口留一拳距离', '起身呼气，下落吸气'] },
  { id: 'plank', name: '平板支撑', tags: ['core', 'shoulder'], equip: 'none', level: 1, mode: 'time', base: 35, met: 4, cues: ['肘在肩正下方', '头到脚跟成一条直线', '收紧腹部和臀部，别塌腰'] },
  { id: 'deadbug', name: '死虫式', tags: ['core', 'posture'], equip: 'none', level: 1, mode: 'reps', base: 12, met: 3.5, cues: ['下背始终压实地面', '对侧手脚同时缓慢伸展', '动作越慢越有效'] },
  { id: 'bicycle', name: '自行车卷腹', tags: ['core'], equip: 'none', level: 1, mode: 'reps', base: 20, met: 5, cues: ['肘去找对侧膝盖', '转动的是躯干不是脖子', '伸直腿离地越低越难'] },
  { id: 'twist', name: '俄罗斯转体', tags: ['core'], equip: 'none', level: 2, mode: 'reps', base: 20, met: 5, cues: ['背挺直后仰约 45°', '双手随躯干左右转动', '想更难就把脚抬离地面'] },
  { id: 'legraise', name: '仰卧抬腿', tags: ['core'], equip: 'none', level: 2, mode: 'reps', base: 12, met: 4.5, cues: ['双手放在臀下保护腰', '下放时腿不触地', '腰离地就减小幅度'] },
  { id: 'sideplank', name: '侧平板支撑', tags: ['core', 'posture'], equip: 'none', level: 2, mode: 'time', base: 25, perSide: true, met: 4, cues: ['肘在肩正下方', '髋部上顶，身体成直线', '练出侧腰线条的关键'] },
  { id: 'climber', name: '登山跑', tags: ['core', 'cardio'], equip: 'none', level: 1, mode: 'time', base: 30, met: 8, cues: ['俯撑姿势，肩在手腕正上方', '膝盖交替快速提向胸口', '臀部不要翘起'] },
  { id: 'vup', name: 'V 字两头起', tags: ['core'], equip: 'none', level: 3, mode: 'reps', base: 12, met: 6, cues: ['手脚同时抬起在上方相触', '控制下放，不要砸地', '做不到可以屈膝'] },

  // 肩
  { id: 'ytw', name: '俯卧 Y 字上举', tags: ['shoulder', 'posture', 'back'], equip: 'none', level: 1, mode: 'reps', base: 12, met: 3, cues: ['俯卧，双臂成 Y 字', '拇指朝上，肩胛下沉后收', '改善圆肩、练出直角肩'] },
  { id: 'pike', name: '派克俯卧撑', tags: ['shoulder', 'arm'], equip: 'none', level: 2, mode: 'reps', base: 10, met: 5, cues: ['臀部抬高成倒 V', '头朝双手之间下落', '主要练三角肌前束'] },
  { id: 'bandraise', name: '弹力带侧平举', tags: ['shoulder'], equip: 'band', level: 1, mode: 'reps', base: 15, met: 3.5, cues: ['脚踩弹力带中段', '手肘微屈抬至与肩平', '直角肩核心动作'] },
  { id: 'facepull', name: '弹力带面拉', tags: ['shoulder', 'posture', 'back'], equip: 'band', level: 1, mode: 'reps', base: 15, met: 3.5, cues: ['弹力带拉向额头高度', '手肘向外向后打开', '感受后肩和上背发力'] },
  { id: 'dblateral', name: '哑铃侧平举', tags: ['shoulder'], equip: 'dumbbell', level: 1, mode: 'reps', base: 15, met: 3.5, cues: ['选轻重量，控制速度', '小拇指略高于大拇指', '不要耸肩借力'] },
  { id: 'dbpress', name: '哑铃推举', tags: ['shoulder', 'arm'], equip: 'dumbbell', level: 2, mode: 'reps', base: 12, met: 4.5, cues: ['核心收紧，不要后仰', '推至手臂接近伸直', '下放到耳朵高度'] },

  // 手臂 / 胸
  { id: 'kneepush', name: '跪姿俯卧撑', tags: ['chest', 'arm'], equip: 'none', level: 1, mode: 'reps', base: 12, met: 4, cues: ['膝盖到头成一条直线', '手略宽于肩', '胸口贴近地面再推起'] },
  { id: 'pushup', name: '标准俯卧撑', tags: ['chest', 'arm', 'core'], equip: 'none', level: 2, mode: 'reps', base: 12, met: 5, cues: ['身体成直线，不塌腰', '手肘与身体约 45°', '下到胸口离地一拳'] },
  { id: 'diamond', name: '窄距俯卧撑', tags: ['arm', 'chest'], equip: 'none', level: 3, mode: 'reps', base: 10, met: 5, cues: ['双手拇指食指成菱形', '手肘贴近身体', '重点刺激肱三头肌'] },
  { id: 'dip', name: '椅子臂屈伸', tags: ['arm'], equip: 'none', level: 1, mode: 'reps', base: 12, met: 4, cues: ['双手撑在稳固的椅子边缘', '背贴近椅子下沉', '告别"拜拜肉"'] },
  { id: 'bandcurl', name: '弹力带弯举', tags: ['arm'], equip: 'band', level: 1, mode: 'reps', base: 15, met: 3, cues: ['大臂夹紧身体不动', '顶峰稍作停顿', '慢慢放下'] },
  { id: 'dbcurl', name: '哑铃弯举', tags: ['arm'], equip: 'dumbbell', level: 1, mode: 'reps', base: 12, met: 3, cues: ['大臂固定，只动小臂', '不要甩腰借力', '下放控制 2 秒'] },
  { id: 'dbkick', name: '哑铃俯身臂屈伸', tags: ['arm'], equip: 'dumbbell', level: 1, mode: 'reps', base: 12, perSide: true, met: 3, cues: ['俯身，大臂贴紧身体', '小臂向后伸直', '感受手臂后侧收紧'] },
  { id: 'dbfloor', name: '哑铃地板卧推', tags: ['chest', 'arm'], equip: 'dumbbell', level: 1, mode: 'reps', base: 12, met: 4, cues: ['仰卧屈膝', '大臂触地即推起', '推起时胸肌夹紧'] },

  // 背
  { id: 'superman', name: '超人起飞', tags: ['back', 'posture'], equip: 'none', level: 1, mode: 'reps', base: 12, met: 3.5, cues: ['俯卧，手脚同时抬离地面', '顶端停顿 1 秒', '眼睛看地面，别仰头'] },
  { id: 'bandrow', name: '弹力带划船', tags: ['back', 'arm'], equip: 'band', level: 1, mode: 'reps', base: 15, met: 4, cues: ['弹力带绕脚底坐姿划船', '肘向后拉，夹紧肩胛', '挺胸不驼背'] },
  { id: 'dbrow', name: '哑铃俯身划船', tags: ['back', 'arm'], equip: 'dumbbell', level: 1, mode: 'reps', base: 12, perSide: true, met: 4, cues: ['单手撑凳，背部平直', '哑铃拉向髋部', '练出背部线条'] },
  { id: 'wallangel', name: '靠墙天使', tags: ['posture', 'shoulder'], equip: 'none', level: 1, mode: 'reps', base: 10, met: 2.5, cues: ['后脑、背、臀贴墙', '手臂贴墙上下滑动', '缓解圆肩驼背'] },
  { id: 'catcow', name: '猫牛式', tags: ['posture', 'back'], equip: 'none', level: 1, mode: 'time', base: 40, met: 2.5, cues: ['跪撑，吸气塌腰抬头', '呼气拱背低头', '跟着呼吸慢慢做'] },

  // 臀腿
  { id: 'squat', name: '徒手深蹲', tags: ['leg', 'glute'], equip: 'none', level: 1, mode: 'reps', base: 15, met: 5, cues: ['脚与肩同宽，脚尖略外八', '臀部向后坐，膝盖对脚尖', '起身时臀部夹紧'] },
  { id: 'bridge', name: '臀桥', tags: ['glute'], equip: 'none', level: 1, mode: 'reps', base: 15, met: 3.5, cues: ['脚跟靠近臀部', '顶起至肩到膝成直线', '顶端夹臀停 1 秒'] },
  { id: 'lunge', name: '交替后撤箭步蹲', tags: ['leg', 'glute'], equip: 'none', level: 2, mode: 'reps', base: 12, perSide: true, met: 5, cues: ['向后撤一大步', '前膝不超过脚尖太多', '上身保持直立'] },
  { id: 'sidelift', name: '侧卧抬腿', tags: ['glute', 'leg'], equip: 'none', level: 1, mode: 'reps', base: 15, perSide: true, met: 2.5, cues: ['身体侧躺成直线', '脚尖朝前缓慢抬腿', '练臀中肌，提升臀型'] },
  { id: 'singlebridge', name: '单腿臀桥', tags: ['glute'], equip: 'none', level: 2, mode: 'reps', base: 10, perSide: true, met: 4, cues: ['一条腿伸直抬起', '支撑腿发力顶髋', '髋部保持水平'] },
  { id: 'bulgarian', name: '保加利亚分腿蹲', tags: ['leg', 'glute'], equip: 'none', level: 3, mode: 'reps', base: 10, perSide: true, met: 6, cues: ['后脚搭在椅子上', '垂直下蹲', '前腿承担主要重量'] },
  { id: 'bandwalk', name: '弹力带侧向走', tags: ['glute'], equip: 'band', level: 1, mode: 'time', base: 30, met: 4, cues: ['弹力带套在膝盖上方', '半蹲姿态侧向迈步', '全程保持弹力带张力'] },
  { id: 'dbrdl', name: '哑铃罗马尼亚硬拉', tags: ['glute', 'leg', 'back'], equip: 'dumbbell', level: 2, mode: 'reps', base: 12, met: 5, cues: ['膝盖微屈，髋部后推', '哑铃贴腿下滑', '感受腿后侧拉伸'] },
  { id: 'gobletsquat', name: '哑铃高脚杯深蹲', tags: ['leg', 'glute', 'core'], equip: 'dumbbell', level: 2, mode: 'reps', base: 12, met: 5.5, cues: ['哑铃竖握于胸前', '蹲至大腿平行地面', '挺胸，核心收紧'] },

  // 燃脂
  { id: 'jack', name: '开合跳', tags: ['cardio'], equip: 'none', level: 1, mode: 'time', base: 35, met: 8, cues: ['前脚掌落地，膝盖微屈', '手臂举过头顶', '怕吵可以改成无跳版'] },
  { id: 'highknee', name: '高抬腿', tags: ['cardio', 'core'], equip: 'none', level: 1, mode: 'time', base: 30, met: 8, cues: ['膝盖抬至髋部高度', '手臂配合摆动', '保持节奏和呼吸'] },
  { id: 'skater', name: '滑冰跳', tags: ['cardio', 'glute'], equip: 'none', level: 2, mode: 'time', base: 30, met: 7, cues: ['左右侧向跳跃', '落地屈膝缓冲', '后腿交叉在后方'] },
  { id: 'burpee', name: '波比跳', tags: ['cardio', 'chest', 'leg'], equip: 'none', level: 3, mode: 'reps', base: 10, met: 10, cues: ['下蹲→俯撑→收腿→跳起', '节奏比速度重要', '燃脂之王'] },
]

export const WARMUP: { name: string; sec: number; cues: string[] }[] = [
  { name: '原地踏步 + 摆臂', sec: 40, cues: ['让心率慢慢上来', '肩膀放松'] },
  { name: '手臂绕环', sec: 30, cues: ['向前 15 秒，向后 15 秒', '幅度由小到大'] },
  { name: '徒手深蹲（慢速）', sec: 30, cues: ['激活臀腿', '动作慢一点'] },
]
