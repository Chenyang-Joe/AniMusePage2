# AniMuse 网页文案草稿 v2

> **和 v1 的区别**：v1 基本是把论文重排了一遍。v2 按新的定位重写 ——
> 这个站不挂 arXiv、不公开论文、项目还要继续做，所以**不能到公式级 / 可复现级**；
> 但它又是面试官唯一能看到项目的地方，所以**要比普通 demo 页讲得多**。
>
> 取舍原则：**能力和结果讲透，机制只讲到"会议 talk"那一层。**
> 看完这页你应该能说清 AniMuse 做到了什么、控制接口长什么样、结果有多好；
> 但不应该能照着实现出来。
>
> 约定同 v1：正文英文，`〔〕`是中文施工备注，`[[DEMO:x]]` / `[[FIG:x]]` 是占位符。
> **`⚠️ 决策点`** 标的是需要你拍板的地方。

---

## 砍掉了什么（相对 v1）

| v1 的内容 | v2 处理 | 为什么 |
|---|---|---|
| Why animals are hard（skeleton vs vertex 对照表） | **删** | 你说删；而且这是论文的 motivation，面试官不需要 |
| SGB 参数化公式 `B=(c,s,q,h)` | **删** | 公式级 |
| LBS 公式 | **删** | 公式级 |
| Topology-aware rigging（k-ring mask、ρ/β/K_near 三个旋钮） | **删** | 这是最该保护的技术细节 |
| Self-supervised training（双向 loss、ℒ_scale 退化分析） | **删** | 同上，而且 ℒ_scale 那个故事是核心 insight |
| SE(3) trajectory diffusion 公式、z-score、DDPM/DDIM 细节 | **删** | 可复现级 |
| Network design（DiT、2-D RoPE、prefix token、umT5） | **删** | 你说删 |
| 超参对照表（backbone / lr / 层数 / 采样步数） | **删** | 这是给复现用的 |
| Ablation（辅助损失表） | **删** | 同上 |
| Stage 1 benchmark（Table 1） | **保留** | 你说 part 1 可以放 |
| Stage 2 benchmark | **⚠️ 决策点，见下** | |
| Pipeline 图 | **保留但简化说明** | 你说保留 |
| WebAnimal3D | **保留** | contribution |
| 四个互动组件 | **全部保留，且提到更靠前** | 这才是这页的主角 |
| BibTeX | **删，换成 Status** | 没发表，放 BibTeX 很怪 |

新增：**Capability summary**（一屏说清系统边界）、**Status & contact**。

---

# 页面结构

```
① Hero            标题 / 作者 / 一句话 / [Video]
② Teaser 图
③ What it does    3 句话 + 立刻上分割滑块（钩子）
④ Overview video
⑤ How it works    Pipeline 图 + 5 句话，无公式
⑥ Stage 1         SGB 是什么 + 三个组件 + Table 1
⑦ Stage 2         text → motion + gallery + ⚠️结果
⑧ Control         inpainting + part editing  ← 差异化重点
⑨ WebAnimal3D
⑩ Capability summary
⑪ Status & contact
```

---

## ① Hero

**Title**
> Night at the Museum: Text-Driven Motion Generation via Semantic Gaussian Bones

**Subtitle**
> Animate any raw animal mesh from a text prompt — no skeleton, no joint names, no manual rigging.

**Authors**
> Chenyang Xu¹  ·  〔TODO: 其他作者〕
> ¹New York University 〔TODO: 确认单位排列〕

**Venue line**
> ⚠️ 决策点：现在写的是 `SIGGRAPH Asia 2026 — Technical Papers (under review)`。
> 既然还要 further develop、不挂 arXiv，建议改成中性的
> **`Work in progress · 2026`**，避免让人去搜投稿状态。

**Buttons**
- ▶ Video（跳到 ④）
- ~~Paper / arXiv / Code / Dataset~~ 全部去掉

〔已加 `<meta name="robots" content="noindex, nofollow">`：这页是发给面试官的，不是给人搜的。
搜索引擎不收录，同行也就搜不到。想公开随时删这一行。〕

---

## ② Teaser

`[[FIG:teaser]]`（已有）

**Caption**
> AniMuse brings static animal meshes to life from text. From a single raw mesh and a
> prompt, it predicts a set of *Semantic Gaussian Bones* and generates their motion.
> Because those bones mean the same body part on every species, the same handle also
> works as a control interface — here, clamping the wallabies' ears.

---

## ③ What AniMuse does

〔全站最重要的一屏。三句话讲清能力边界，然后立刻给可玩的东西。〕

> Give AniMuse a static 3D animal — any mesh, any species, straight out of a scan or a
> generator — and a sentence describing what it should do. It returns an animated mesh
> sequence.
>
> There is no rigging step. No skeleton is fitted, no joints are named, no artist marks
> up the model. AniMuse builds its own deformation handles: **120 oriented "Gaussian
> bones"** that it places inside the mesh, and it generates motion by moving those.
>
> The handles are the interesting part. Because bone *k* lands on the same body part for
> every animal, the same index is a control you can grab — pin it, drag it, or hand it a
> trajectory and let the model write the rest of the body around it.

### `[[DEMO:blob-mesh-slider]]` ✅ 已实现
**Caption**: `Drag the divider: bones on the left, the surface they drive on the right. Drag anywhere else to orbit.`

---

## ④ Overview video

`[[VIDEO]]` → https://youtu.be/UVx4sUNARUM ✅ 已接（点击才加载 iframe）

**Caption** 〔TODO: 视频里讲了什么，一句话〕

---

## ⑤ How it works

〔**只讲到这一层，不再深入。** 有 pipeline 图，有两阶段的输入输出，
够面试官问出好问题，不够别人照着做。〕

`[[FIG:pipeline]]`（已有）

> AniMuse runs in two stages.
>
> **Stage 1 — Rigging.** A point-cloud encoder reads the static mesh and predicts 120
> Semantic Gaussian Bones: soft, oriented ellipsoids that sit inside the body, together
> with how strongly each one pulls on each vertex. They are learned end-to-end from
> mesh sequences alone — no rigged ground truth is ever used, because the training
> signal is simply whether deforming one frame with them reproduces another.
>
> **Stage 2 — Generation.** A diffusion model generates the trajectory of those 120
> bones over time, conditioned on the text prompt and on what Stage 1 learned about each
> bone's local geometry. Standard linear blend skinning turns the bone trajectory back
> into an animated mesh.
>
> The whole motion state is 120 bones per frame, not one entry per vertex — which is
> what keeps long sequences on high-resolution meshes tractable, and what makes the
> control interface below possible in the first place.

**Three properties**〔三张小卡片〕
1. **Skeleton-free** — one model, every topology. Nothing is fitted per species.
2. **Compact** — 120 handles instead of tens of thousands of vertices.
3. **Semantic** — bone *k* is the same body part on a fox and on an elephant.

---

## ⑥ Stage 1 — the rig

> Stage 1 is what removes the artist from the loop. Given a raw mesh it produces a
> complete deformation setup in a single forward pass: where the handles go, how big and
> how oriented each one is, and which parts of the surface each one moves.

### `[[DEMO:sgb-correspondence]]` ✅ 已实现
> Bone colour here is a fixed ramp over the bone index, and it is the *same* ramp on
> every animal. Hover any bone to see its counterpart light up on the others — nothing
> is matched at run time, the correspondence falls out of how the bones are learned.

**Caption**: `The same slot is the same body part across species. Hover to check.`

### `[[DEMO:rig-comparison]]` ✅ 已实现
**Caption**: `Ground truth, the bones AniMuse predicts, and the mesh those bones deform — same instant, same camera.`

### Table 1 — Rigging quality ✅ 保留

> We measure the rig the way you would judge a rigger: extract it from a rest-pose mesh,
> use it to deform that mesh onto a posed target, and see how far off you are. On the
> animal subset of **DeformingThings4D** (25 species), against two recent neural
> skeleton riggers.

| Method | Per-Motion CD-L1 ↓ | Per-Motion CD-L2 ↓ | Cross-Motion CD-L1 ↓ | Cross-Motion CD-L2 ↓ |
|---|---|---|---|---|
| UniRig + Opt. | 0.0228 | 0.0076 | 0.0318 | 0.0108 |
| Puppeteer + Opt. | 0.0306 | 0.0065 | 0.0451 | 0.0122 |
| **AniMuse + Opt.** | **0.0138** | 0.0056 | **0.0198** | 0.0083 |
| **AniMuse (network only)** | 0.0283 | **0.0050** | 0.0372 | **0.0075** |

**Takeaway**
> **39% lower CD-L1** than the best skeleton rigger under matched optimisation.
> And the **network-only** row — a single forward pass, no test-time fitting at all —
> still takes the lowest CD-L2: the rig is good before you optimise anything.

---

## ⑦ Stage 2 — text to motion

> Stage 2 generates the bones' trajectory from a sentence. It is trained on ~75k animal
> motion clips and evaluated on a benchmark it has never seen — different meshes,
> different species distribution, different capture pipeline.

`[[FIG:gallery]]`（已有，prompt → mesh → SGB → 5 帧）

**Caption**: `Each row: the prompt, the input static mesh, the bones AniMuse places in it, and the motion it generates.`

### ⚠️ 决策点：Stage 2 的定量结果放不放？

〔你的顾虑是对的：**页面上出现 "AnimateAnyMesh" 和 "AniMo" 这两个词，
就等于给这两篇的作者做了一个可搜索的锚点。** 他们搜自己方法名就可能搜到这页。〕

**我的建议：折中方案 —— 放一个匿名化的 user study 数字，不放表格。**

理由：
1. **面试官不会去核对表格。** 他要的是"这东西好不好"的一句可信断言。
   一个 50 人的 user study 结论比一张 VLM judge 表有说服力得多，
   而且它不需要点名对手就能成立。
2. **表格必须点名才有意义**，而点名正是你要避免的。
3. **VBench 直接不放** —— 你自己在 rebuttal 里就说了 "scores are saturated"，
   放上去既不加分，又多两个可搜索的方法名。
4. Table 1 保留没问题：UniRig / Puppeteer 是**神经绑定**的工作，
   和你 Stage 2 的技术路线不是同一条赛道，不构成"被防御"的风险。

**建议的写法（Option A，推荐）**

> **How good is it?** We ran a 50-participant user study on the out-of-domain benchmark
> — 30 samples, two-alternative forced choice, following the protocol used in the
> text-to-motion literature. Against the strongest published skeleton-free baseline,
> participants preferred AniMuse's result **74.6%** of the time overall, and **84.0%**
> on whether the motion matched the prompt. Against a skeleton-based baseline the
> margins are wider still. Against ground-truth capture we are, fairly, still behind.

〔三个卡片：`74.6%` overall preference · `84.0%` text match · `50` participants〕

**Option B（更保守）**：连百分比都不放，只写
> A 50-participant user study on out-of-domain data puts AniMuse ahead of both published
> baselines on text match, motion quality and shape integrity. Details on request.

**Option C（全放）**：放 rebuttal 的 Tab.A + Tab.B 两张表，点名。
→ 我不建议。收益只有"看起来更硬"，成本是把两个竞争团队的注意力引过来。

〔无论选哪个，`[[FIG:eval]]`（Bear/Horse 五行对比图）**都建议不放** ——
那张图的行标题直接写着两个对手的名字，等于表格的图片版。〕

---

## ⑧ Control — 这一节是差异化重点

〔这是别人做不到、而且展示成本最低的部分。放在结果后面，作为"不止能生成"的升华。〕

> A generator you can only prompt is a slot machine. Because AniMuse's 120 handles carry
> a stable meaning, they double as a control surface — and because that meaning is shared
> across species, a control authored once applies to every animal.

### 8.1 Motion inpainting

> Pin some bones to a trajectory you want; the model generates a coherent whole-body
> motion around them. Below, the **pink** bones are the pinned ones — the four foot tips,
> the *same four indices* on every animal. Everything else is what the model wrote to fit.

### `[[DEMO:inpainting]]` ✅ 已实现（粉色 pinned / 其余灰色）
**Caption**: `Pink bones are the constraint. The rest of the body is generated around them, under each species' own prompt.`

`[[FIG:inpaint]]`（已有）

### 8.2 Part-level editing

> The same index space gives direct manual control. One slider here drives the twelve
> bones that make up the left front leg — and because those twelve mean the same leg on
> every animal, one slider drives all three species at once, with no per-animal setup.

### `[[DEMO:part-editing]]` ✅ 已实现
**Caption**: `Drag the slider. Switch to Mesh to watch the surface follow.`

〔**可加分**：rebuttal 里提到 SGB 还支持 **motion transfer**（"semantic editing, motion
inpainting, and motion transfer, none of which RigMo supports"）。
如果有 motion transfer 的素材，这里加第三个组件会很强 —— 把 A 的骨骼轨迹套到 B 身上。
⚠️ 需要你确认有没有导出。〕

---

## ⑨ WebAnimal3D

> AniMuse trains on raw mesh sequences — no template, no skeleton, no rigging annotation
> — so the training corpus can come from anywhere. We used that to build
> **WebAnimal3D**, an annotation-free animal motion corpus reconstructed from public web
> video, with an LLM-written caption per clip.

〔三个大数字卡片〕
- **8,602** motion clips
- **reconstructed from web video**, no manual annotation
- **captioned**, so it can be used for text-conditioned training directly

> ⚠️ 决策点：要不要写"we plan to release"？现在项目还要继续做，
> 建议先写成 **`Release planned.`** 一句，不给时间表。

---

## ⑩ Capability summary

〔新增。一张表让面试官 30 秒抓住系统边界 —— 这种"知道自己的边界在哪"的表达，
在面试里比多贴一个 demo 有用。〕

| | |
|---|---|
| **Input** | one static mesh (any topology, any species) + one sentence |
| **Output** | animated mesh sequence, up to 300 frames per pass |
| **Setup required** | none — no skeleton, no joint names, no skinning weights, no artist pass |
| **Control** | pin any subset of the 120 handles; drag a named part; both transfer across species unchanged |
| **Trained on** | ~75k animal motion clips + our web-video corpus |
| **Evaluated on** | 25-species rigging benchmark; an out-of-domain text-to-motion benchmark |
| **Known limits** | 300-frame cap per pass; the topology gate can still bridge two surfaces that touch but aren't connected |

〔最后一行"Known limits"是刻意留的 —— 承认局限在面试里是加分项，
而且这两条都不泄露方法。〕

---

## ⑪ Status & contact

> **Status.** AniMuse is under active development; a paper is in preparation. This page
> shows results, not implementation. Happy to go deeper in person.
>
> **Contact.** 〔TODO: 邮箱？要不要放 GitHub / 个人主页？〕

〔把 BibTeX 那一节换成这个。没发表的东西挂 BibTeX 会显得奇怪，
而 "paper in preparation / happy to go deeper in person" 恰恰是面试场景想要的钩子。〕

---

# 附录 A：还需要你确认的

1. **共同作者名单和单位**（现在只有 Chenyang Xu + NYU）。
2. **Venue line** 写什么？（建议 `Work in progress · 2026`）
3. **⚠️ Stage 2 结果** 选 Option A / B / C？（我建议 A）
4. **Contact** 放什么？邮箱 / 个人主页 / GitHub。
5. **Motion transfer** 有没有导出好的素材？有的话 ⑧ 再加一个组件。
6. Overview video 一句话说明。

# 附录 B：v1 页面怎么处理

`index.html` 保留不动，作为互动组件的技术参考。
新页面另开一个文件（比如 `v2.html` 或者直接换掉 `index.html`、把旧的挪到 `legacy/`）。
⚠️ 你定：**新页面是替换 `index.html`，还是并存？** 我建议替换，旧的挪到 `legacy/index.html`，
这样 GitHub Pages 的根路径就是新版。
