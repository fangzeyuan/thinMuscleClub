# 薄肌俱乐部 (Thin Muscle Club)

一个面向“薄肌”目标的移动端健身计划 Web 应用：填写身体数据与目标后，自动生成个性化的训练与饮食计划，并跟踪每日训练进度。

## 功能

- **身体评估**：根据性别、年龄、身高、体重、腰围等估算 BMI 与体脂，并归类为四种体型（纤细型 / 准薄肌型 / 隐藏线条型 / 蓄力型）。
- **个性化计划**：按目标部位、训练经验、可用器械（徒手 / 弹力带 / 哑铃）、每周天数与每次时长生成周计划。
- **训练播放器**：逐个动作引导训练，结束后记录时长与消耗热量。
- **自适应强度**：每次训练后反馈“轻松 / 正好 / 吃力”，自动调整下次强度。
- **打卡与统计**：连续打卡天数、训练记录、三餐蛋白质打卡。

所有数据仅保存在浏览器的 `localStorage` 中，不会上传到服务器。

## 技术栈

- [React 18](https://react.dev/) + TypeScript
- [Vite 5](https://vitejs.dev/)

## 本地开发

需要 Node.js 18 或更高版本。

```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务器（默认 http://localhost:5173）
npm run build   # 类型检查并构建到 dist/
npm run preview # 本地预览构建产物
```

## 目录结构

```
src/
├── App.tsx          # 路由与全局状态
├── main.tsx         # 入口
├── styles.css       # 全局样式
├── data/
│   └── exercises.ts # 动作库
├── lib/
│   ├── plan.ts      # 评估、排课与训练生成逻辑
│   └── store.ts     # 本地状态持久化（localStorage）
└── screens/         # 各页面组件
```
