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
>
> **状态：所有决策点已定（2026-09-04），这份是最终施工稿。** 唯一还没定的是
> teaser gallery 选哪几只（你说最后再挑），不影响开工。

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
| Stage 2 benchmark | **只留一句匿名化的 user study**，表格全砍 | 见 ⑦ |
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
⑦ Stage 2         text → motion + gallery + 一句 user study 结论
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

**Authors** ✅ 已定
> Chenyang Xu¹ · Zeyu Jiang¹ · Guangzhao He² · Haoran Li¹ · Shichen Zhang¹
> Juexiao Zhang¹ · Sihang Li¹ · Chen Feng¹ · Jing Zhang¹
> ¹New York University　²Cornell University　· author list tentative

**Venue line** ✅ 已定
> `Under Review · 2026` —— 不出现 SIGGRAPH Asia。

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

`[[VIDEO]]` → https://youtu.be/J6a1tpsXST4 ✅ 已接（点击才加载 iframe）

**Caption** ✅ 已定
> Five minutes of AniMuse in motion — the same material as this page, but moving.

〔视频本身是这页内容的视频版 / teaser。**caption 里不提任何会议名。**〕

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

### How good is it? ✅ 已定：走 Option A（匿名化 user study，不放表格）

〔**页面上就写下面这段，不出现任何对手的名字。**
不放 VLM judge 表、不放 VBench、不放 Bear/Horse 那张五行对比图 ——
那张图的行标题就是表格的图片版。Table 1（Stage 1 绑定）照常保留，
UniRig / Puppeteer 是神经绑定的工作，和 Stage 2 不是同一条赛道。〕

> **How good is it?** We ran a **50-participant user study** on the out-of-domain
> benchmark — 30 samples, two-alternative forced choice, following the protocol used
> in the text-to-motion literature. Against the strongest published skeleton-free
> baseline, participants preferred AniMuse's result **74.6%** of the time overall and
> **84.0%** on whether the motion matched the prompt. Against a skeleton-based
> baseline the margins are wider still. Against ground-truth capture we are, fairly,
> still behind — which is the honest state of the problem.

〔三个大数字卡片〕

| | |
|---|---|
| **74.6%** | overall preference over the strongest published baseline |
| **84.0%** | preference on text–motion match |
| **50** | participants, 30 samples, 2AFC |

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

### 8.3 Motion transfer ✅ 已定：只写一句，不做组件

〔没有好素材，不做第三个互动组件。就在 8.2 末尾补一句，把这个能力提一嘴，
面试时可以顺着这句往下聊。〕

> The same property makes motion transfer fall out for free: a trajectory authored
> on one animal is, by construction, already addressed to the right body parts on
> any other. We show pinning and dragging here; the transfer case is the same
> mechanism with the whole trajectory supplied instead of a few slots.

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

✅ 已定：可以写 release。用一句不带时间表的：
> **Release planned.** We release the mesh-level motion data and captions, not the
> underlying videos.

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
> **Contact.** Chenyang Xu — cx2219@nyu.edu

〔✅ 已定：**不放任何官方/项目联系方式**（no project email, no org account），
要联系就联系个人。把 BibTeX 那一节整个换成这个 —— 没发表的东西挂 BibTeX 会显得奇怪，
而 "paper in preparation / happy to go deeper in person" 恰恰是面试场景想要的钩子。〕

---

# 附录 A：决策记录

| # | 问题 | 结论 |
|---|---|---|
| 1 | Venue line | `Under Review · 2026`，不提 SIGGRAPH Asia |
| 2 | 标题用哪版 | tex 版：*…via Semantic Gaussian Bones* |
| 3 | 作者 / 单位 | Chenyang Xu · Zeyu Jiang · Guangzhao He · Haoran Li · Shichen Zhang · Juexiao Zhang · Sihang Li · Chen Feng · Jing Zhang；Guangzhao He 在 Cornell，其余 NYU |
| 4 | Stage 2 结果 | **Option A** —— 匿名化 user study 数字，不放表格、不放 VBench、不放对比图 |
| 5 | WebAnimal3D release | 可以写，`Release planned.`，不给时间表 |
| 6 | Contact | 只放个人邮箱 cx2219@nyu.edu，不放任何官方渠道 |
| 7 | Motion transfer | 没好素材，不做组件，正文提一句 |
| 8 | 新页面落地 | **替换 `index.html`，旧的挪到 `legacy/`** |
| 9 | 视频 caption | 这页内容的视频版 / teaser，**不提会议名** |
| 10 | teaser gallery 选片 | 最后再挑（不阻塞开工） |

**还挂着的一条**（和 draft 无关，属于素材问题）：
inpainting 的熊猫片段是仰面划水的，96 个刚体朝向都救不回四足着地；
现在靠一个手动 −45° 的 roll 摆成了斜姿。要么接受，要么重新生成那段。
另外 `captions.txt` 里第 7 条 alaskan moose 没有对应 GLB，补上就能凑满六宫格。

# 附录 B：v1 页面怎么处理

✅ 已定：**替换 + 挪动。**

- 现在的 `index.html` 挪到 `legacy/index.html`，连同它引用的东西一起，
  作为互动组件的技术参考留着（内部用，不从新页面链过去）。
- 新页面写成根目录的 `index.html`，GitHub Pages 的根路径就是新版。
- `js/viewers/*`、`css/`、`assets/`、`vendor/` 全部复用，不重写 —— 四个互动组件
  已经调好了，新页面只是换文字骨架和章节顺序。
