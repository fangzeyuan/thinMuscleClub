/** 运动项目和场景设施的静态目录（不含用户数据） */

export type FacilityKind = 'home' | 'gym' | 'pool' | 'track' | 'yoga_studio' | 'court' | 'park'
export type ActivityCategory = 'strength' | 'cardio' | 'flexibility' | 'sport' | 'daily'

export interface ActivityType {
  id: string
  name: string
  category: ActivityCategory
  facility: FacilityKind
  /** 代谢当量，用于估算热量：kcal = MET × 体重kg × 小时 */
  met: number
}

export const ACTIVITIES: ActivityType[] = [
  { id: 'guided', name: 'App 跟练', category: 'strength', facility: 'home', met: 5 },
  { id: 'home_workout', name: '居家训练', category: 'strength', facility: 'home', met: 4.5 },
  { id: 'jump_rope', name: '跳绳', category: 'cardio', facility: 'home', met: 10 },
  { id: 'gym_strength', name: '力量训练', category: 'strength', facility: 'gym', met: 5 },
  { id: 'gym_cardio', name: '有氧器械', category: 'cardio', facility: 'gym', met: 7 },
  { id: 'group_class', name: '团课', category: 'cardio', facility: 'gym', met: 6.5 },
  { id: 'swim', name: '游泳', category: 'cardio', facility: 'pool', met: 7 },
  { id: 'run', name: '跑步', category: 'cardio', facility: 'track', met: 9 },
  { id: 'brisk_walk', name: '快走', category: 'daily', facility: 'track', met: 4.3 },
  { id: 'yoga', name: '瑜伽', category: 'flexibility', facility: 'yoga_studio', met: 3 },
  { id: 'pilates', name: '普拉提', category: 'flexibility', facility: 'yoga_studio', met: 3.5 },
  { id: 'badminton', name: '羽毛球', category: 'sport', facility: 'court', met: 5.5 },
  { id: 'basketball', name: '篮球', category: 'sport', facility: 'court', met: 6.5 },
  { id: 'cycling', name: '骑行', category: 'cardio', facility: 'park', met: 7 },
  { id: 'walk', name: '散步', category: 'daily', facility: 'park', met: 3 },
  { id: 'other', name: '其他运动', category: 'sport', facility: 'park', met: 5 },
]

export const FACILITIES: Record<FacilityKind, { name: string; desc: string }> = {
  home: { name: '我的小屋', desc: 'App 跟练、居家训练、跳绳' },
  gym: { name: '健身房', desc: '力量训练、有氧器械、团课' },
  pool: { name: '游泳馆', desc: '游泳' },
  track: { name: '跑道', desc: '跑步、快走' },
  yoga_studio: { name: '瑜伽馆', desc: '瑜伽、普拉提' },
  court: { name: '球馆', desc: '羽毛球、篮球' },
  park: { name: '公园', desc: '骑行、散步、其他运动' },
}

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: '力量',
  cardio: '耐力',
  flexibility: '柔韧',
  sport: '球类',
  daily: '日常',
}

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[ACTIVITIES.length - 1]
export const activitiesAt = (kind: FacilityKind) => ACTIVITIES.filter((a) => a.facility === kind)
