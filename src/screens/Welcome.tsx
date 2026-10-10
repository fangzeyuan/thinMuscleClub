export default function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen welcome">
      <div className="welcome-hero">
        <div className="brand">
          <span className="brand-mark" />
          薄肌俱乐部
        </div>
        <h1>
          不练成大块头
          <br />
          只练出<em>好线条</em>
        </h1>
        <p className="lead">每天 20 分钟居家训练 + 不用称重的饮食法，帮你用 3 个月练出看得见的薄肌。</p>
      </div>

      <ul className="welcome-points">
        <li>
          <b>01</b>
          <div>
            <h4>2 分钟测评</h4>
            <p>判断你的体型类型，算出预计周期</p>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <h4>专属计划</h4>
            <p>按目标部位、器械和时间自动排课</p>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <h4>每日跟练</h4>
            <p>打开就练，计时计次，越练越懂你</p>
          </div>
        </li>
      </ul>

      <div className="bottom-bar">
        <button className="btn primary block" onClick={onStart}>
          开始测评
        </button>
        <p className="fine">无需注册 · 数据仅保存在本机</p>
      </div>
    </div>
  )
}
