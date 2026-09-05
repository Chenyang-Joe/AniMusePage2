# AniMusePage2 — Task

重做 AniMuse 项目主页。旧站 `/Users/chenyang/Codebase/Study/AniMusePage` 的问题：

1. 页面过于艺术化，不是传统的学术 style
2. 加载太慢
3. 对项目的介绍太简单
4. 没有展示各个 stage 的 demo，没有分段展示

---

## 0. Git

- [x] 本项目连接到 `git@github.com:Chenyang-Joe/AniMusePage2.git`
- Commit message **不要带 Claude 署名 / Co-Authored-By**

## 1. 定调子（参考页面）

找一批网页参考供肉眼 review，再由我决定方向。可以是：
- 同类型项目的 project page
- 经典学术 project page 模版

已给的例子：
- https://eyeline-labs.github.io/Vista4D/
- https://rigmo-page.github.io/
- https://ai4ce.github.io/GARF/

**产出**：`references/` 里一个可本地打开的参考画廊 + 说明。

## 2. Md 草稿

读 `data/Text_Driven_Motion_Generation_via_Semantic_Gaussian_Bones_V1/`（LaTeX 源码），
写一份 md 草稿把网页的**文字部分**敲定。图片、互动组件先用占位符。

大致结构：
- Abstract + pipeline graph + 介绍视频
- Stage 1 介绍 + 几个 Stage 1 互动组件
- Stage 2 介绍 + 几个 Stage 2 互动组件
- 其他 feature 介绍 + inpainting / editing 互动组件

**产出**：`draft.md`

## 3. 建网页

### 3.1 素材
- `data/` 下已有素材：`stage1/`(101 samples × {gt,pred,blob,blob_nopiles,*_textured}.glb)、
  `teaser/{mesh,blob}`、`inpainting/{mesh,blob}+captions.txt`、`editing/{mesh,blob}`、`video/`
- 旧站 `AniMusePage` 的素材可复用，copy 过来

### 3.2 本地建站
先本地 review，效果好了再考虑 deploy 到 GitHub Pages。

### 3.3 性能要求（重点）
- 少量 GLB：一个 demo 给 ~4 个就够
- 先渲染页面骨架，再懒加载 3D 资源
- 视频用外链（YouTube / 图床），不自己上传
- 互动组件的 mesh 暂时随便选几个，效果 OK 后我再认真挑

### 3.4 互动组件设计
1. **Blob ↔ Mesh slider**（两种 form）
   一个 window 里放一个 slider：左边是 blob，右边是 mesh。
   slider 往右滑 → blob 更多；往左滑 → mesh 更多。（这个效果比较难）
   > 注：原话如此，实际方向以 review 时确认为准。
2. **Editing 组件**
   一个 slider 统一控制某个部位（比如脚），拖动后对应部位的 blob 会移动。
   脚对应哪些 blob index 需要问 Chenyang 确认。

---

## 进度

- [x] 0. Git 连接
- [x] 1. 参考页面 → 定了 Nerfies 排版 + 3DGS 式 slider
- [x] 2. draft.md
- [x] 3. 建站 v1（本地跑通，见 PLAN.md 第七节）
- [x] 4. 定稿 `draft_2.md`：不挂 arXiv、不公开方法细节，但比普通 demo 页讲得多
- [x] 5. 按 draft_2 重做页面，v1 挪到 `legacy/`

计划和踩坑记录在 `PLAN.md`，文案和章节规划在 `draft_2.md`，本地启动方式在 `README.md`。

## 还没做的

- teaser gallery 挑哪几只（先随便挑了四只）
- inpainting 的熊猫片段是仰面划水的，现在靠手动 −45° 摆成斜姿；要么接受，要么重生成
- `captions.txt` 第 7 条 alaskan moose 没有对应 GLB，补上能凑满六宫格
- 部署 GitHub Pages
