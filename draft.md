# AniMuse — 网页文案草稿 v1

> 约定：正文用英文（project page 惯例），`〔〕`里是中文施工备注。
> 占位符统一写成 `[[FIG:xxx]]` / `[[VIDEO:xxx]]` / `[[DEMO:xxx]]`，建站时替换。
> 未定的地方标 `〔TODO〕`。

---

## 0. Header

**Title**
> Night at the Museum: Text-Driven Motion Generation via Semantic Gaussian Bones

**Short title / 站点名**：AniMuse

**Authors**〔TODO：投稿是 double-blind，网页上要不要放作者？先留位〕
> Author One¹  ·  Author Two¹  ·  Author Three²
> ¹Institution A   ²Institution B

**Venue line**
> SIGGRAPH Asia 2026 (Technical Papers) — under review 〔TODO：确认能不能写〕

**Button row**〔一排 pill 按钮，图标 + 文字〕
- 📄 Paper (PDF)
- 📄 arXiv 〔TODO 链接〕
- 💻 Code 〔TODO：github repo〕
- 🗂 WebAnimal3D Dataset 〔TODO〕
- ▶️ Video

---

## 1. Teaser

`[[FIG:teaser]]` → `data/.../figures/new_teaser.png`（2.3 MB，建站时压成 WebP ≤400 KB）

**Caption**
> AniMuse brings static animal meshes to life from text. From a single raw mesh and a prompt,
> AniMuse predicts Semantic Gaussian Bones (SGBs) and generates SE(3) bone trajectories to
> animate diverse species. The shared SGB index space also enables sparse control: users can
> clamp selected slots — such as the wallabies' ears — and inpaint the remaining full-body motion.

---

## 2. TL;DR〔一句话卡片，放 Abstract 上面〕

> **TL;DR** — AniMuse animates *any* raw animal mesh from a text prompt, with **no skeleton, no joint
> names, and no manual rigging**. It learns 120 *Semantic Gaussian Bones* that mean the same body part
> on every animal, then diffuses SE(3) trajectories over them — so you can also pin a few bones and let
> the model inpaint the rest.

---

## 3. Abstract

> We introduce **AniMuse**, a two-stage framework for text-driven animal mesh animation directly from
> raw meshes, without predefined skeletons, joint names, or manual rigging. At its core are **Semantic
> Gaussian Bones (SGBs)**, a compact skeleton-free deformation representation decoded from a globally
> shared learnable query book and trained through explicit linear blend skinning with topology-aware
> mask-gated weights. The shared query book yields stable cross-instance bone slots, providing a
> mesh-native control space for text-conditioned generation and SGB-slot motion inpainting. A DiT-based
> diffusion model generates per-bone SE(3) trajectories from text and geometric bone latents, while
> allowing users to clamp selected SGB slots and inpaint the remaining full-body motion. On
> DeformingThings4D, our rig reduces bidirectional CD-L1 by **39%** over the best neural skeleton
> baseline, and a forward-only variant achieves the lowest CD-L2 overall. On the out-of-domain
> AnimalML3D benchmark, AniMuse improves overall motion quality over skeleton-based and vertex-based
> baselines.

---

## 4. Overview Video

`[[VIDEO:overview]]`
〔用 YouTube / Bilibili 外链嵌入，**不要**自己 host mp4——这是旧站慢的主因之一。
16:9 responsive iframe，`loading="lazy"`，封面用一张静态图占位，点击才加载 iframe。〕

**Caption**：`5-minute overview of AniMuse.` 〔TODO：视频还没有，先放占位卡片〕

---

## 5. The Problem〔新增段落，专治「介绍太简单」〕

**Section title**: Why animals are hard

> A museum specimen preserves the shape of an animal, but not the motion that made it alive. A static 3D
> animal mesh has the same problem: it captures limbs, proportions and species identity, but contains no
> recipe for how that body should move.
>
> For humans this is a solved bridge — SMPL and a standard skeleton connect *how to deform* with *what
> motion to generate*. Animals have no such template. Skeletal topology, limb count, body proportions and
> articulation patterns all vary across species.

**Two existing control spaces, two bottlenecks**〔做成左右两栏对照卡片〕

| | Skeleton-based | Vertex-based |
|---|---|---|
| Examples | AniMo, AnyTop, Dragon, OmniMotionGPT | AnimateAnyMesh, ActionMesh |
| Control space | joint hierarchy | all V vertices |
| Cost | needs predefined joints / names / per-species rigs | scales as O(V · F) |
| Breaks when | the mesh doesn't match the template | the mesh is dense or the clip is long |

> **AniMuse takes a third space:** compact like a skeleton, but *learned directly from raw meshes* and
> not tied to any fixed joint topology.

`[[FIG:control-space-diagram]]` 〔可选：三栏示意图 skeleton / vertices / SGB，我可以用 SVG 画〕

---

## 6. Pipeline

`[[FIG:pipeline]]` → `data/.../figures/main.pdf`（8.5 MB PDF → 建站时转 PNG/WebP）

**Caption**
> **AniMuse's two-stage pipeline.** *Top — Stage 1 (Rigging):* from a static mesh, a PointTransformer
> with a shared learnable query book predicts K Semantic Gaussian Bones and per-vertex rigging weights.
> *Bottom — Stage 2 (Generation):* a DiT denoises an SE(3) trajectory over the SGBs, conditioned on a
> text prompt and the Stage-1 per-bone latents; LBS recovers the deformed mesh sequence at decoding.

〔建议：pipeline 图做成可点击的 —— 点上半部分跳到 Stage 1 章节，点下半部分跳到 Stage 2。
用 `<map>` 或者绝对定位的透明 `<a>` 覆盖层，成本很低，效果很好。〕

---

# Stage 1 — AniMuse Rigging

〔本节视觉上要和 Stage 2 明显分开：整段换一个浅底色 + 大号 "STAGE 1" 标记〕

## 7.1 What is a Semantic Gaussian Bone?

> A Semantic Gaussian Bone is a soft, oriented deformation handle:
>
> **B = ( c, s, q, h )** — center **c** ∈ ℝ³, per-axis scale **s** ∈ ℝ³₊, orientation quaternion
> **q** ∈ S³, and a per-bone geometric latent **h** ∈ ℝᴰ.
>
> The Gaussian-bone parameters (c, s, q) follow RigMo. What makes an SGB *semantic* is **where it comes
> from**: every bone is decoded from one slot of a **globally shared learnable query book**. Because slot
> *k* decodes bone *k* on *every* input mesh, each slot settles into a stable cross-instance role — slot
> 37 is the same body part on a tiger and on a tortoise. That is what turns the SGB index into a control
> interface, and what makes **h** a meaningful conditioning token for Stage 2 rather than an
> instance-specific feature.

**Three properties we exploit**〔三个小卡片，配图标〕
1. **Compact** — K = 120 ≪ V. Per-frame motion state is orders of magnitude smaller than a per-vertex
   trajectory, so long high-resolution sequences don't blow up the generator.
2. **Skeleton-free** — SGBs are learned, not designed per species. One model handles every topology.
3. **Grounded** — each bone ships with a geometric context vector **h** at no extra cost, giving Stage 2
   per-bone structural grounding for free.

**From SGBs to a posed mesh** — standard LBS, applied per frame at decoding time:
> vᵢ¹ = Σₖ wᵢₖ ( Rₖʳᵉˡ (vᵢ⁰ − cₖ⁰) + cₖ¹ ),  Rₖʳᵉˡ = R(qₖ¹) R(qₖ⁰)ᵀ
〔用 KaTeX 渲染；只放这一个公式，其它公式收进折叠区〕

### `[[DEMO:blob-mesh-slider]]` — 交互组件 ①

〔**核心组件**。一个 viewer 里同时有 mesh 和 blob(SGB) 两种 form，一根 slider 在两者之间过渡。
- slider = 0 → 只看 mesh；slider = 1 → 只看 blob/SGB 椭球；中间 → 两者叠加（mesh 半透明 + blob 实心）
- 素材：`data/stage1/<sample>/{gt_textured.glb, blob.glb}`，先随便挑 4 个 sample
- 下面配一排缩略图切换 sample
- **待确认**：你原话是「滑到右侧 blob 更多，滑到左边 mesh 更多」，但又说「左边是 blob 右边是 mesh」——
  这两句是反的，建站时按「左 mesh → 右 blob」实现，review 时你说一声就改。〕

**Caption**: `Drag to fade between the input mesh and the 120 Semantic Gaussian Bones AniMuse predicts for it.`

### `[[DEMO:sgb-correspondence]]` — 交互组件 ②

〔**语义一致性**的可视化，这是 SGB 最核心的卖点，一定要有。
- 并排 3-4 个不同物种的 blob
- 鼠标 hover 任意一个 blob 上的某颗椭球 → 所有物种里**同 index** 的椭球一起高亮
- 素材：`data/teaser/blob/*.glb`，挑 4 个差异大的（比如 tiger / elephant / tortoise / lemur）
- **待确认**：blob.glb 里椭球的顺序是否就是 SGB index 顺序？需要你确认〕

**Caption**: `The same query slot decodes the same body part across species. Hover any bone to highlight its counterpart on every other animal.`

## 7.2 Topology-Aware Rigging

> Rigging weights from a plain Gaussian softmax over K bones are **topology-unaware**: a quadruped's
> front and back legs are spatially close but topologically distant, so they attract weight from the
> same bones and leak deformation into each other.
>
> RigMo fixes this with exact mesh-surface geodesics. We get the same effect with a **K-ring topology
> mask** computed entirely as GPU sparse matrix multiplication — a binary mask Mᵢₖ that *only disables*
> bones a vertex cannot topologically reach, while the softmax still supplies continuous magnitudes.

**Three knobs**〔小表格〕

| Knob | Symbol | What it does |
|---|---|---|
| Physical reach | ρ = 0.2 | BFS radius around each bone; with mean edge length ē it sets the hop budget k_hops = ⌊ρ/ē⌋, keeping the gate constant in *physical* units regardless of vertex count |
| Delay scale | β = 0.7 | converts each seed's Euclidean offset from the bone center into a delay in BFS iterations, so far seeds activate later |
| Fallback count | K_near | any vertex with no reachable bone is force-attached to its K_near nearest bones, guaranteeing coverage |

`[[FIG:kring-algorithm]]` 〔Algorithm 1 的伪代码，用 `<pre>` + 折叠区收起来〕

### `[[DEMO:skinning-weights]]` — 交互组件 ③

〔展示 topology mask 的效果：
- 一个 mesh，hover 某颗 SGB → mesh 上被它影响的顶点按权重着色（热力图）
- **加分项**：一个 toggle「with / without topology mask」，直观看到前后腿串味被消掉
- 素材：`data/stage1/<sample>/{gt.glb, blob.glb, blob_nopiles.glb}`
- **待确认**：`blob_nopiles.glb` 是不是就是 "no topology mask" 的版本？还是别的意思？〕

**Caption**: `Hover a bone to see which vertices it drives. Toggle the topology mask to watch cross-limb leakage appear and disappear.`

## 7.3 Self-Supervised Training

> We supervise the rig **through differentiable mesh deformation** — no rigging ground truth is ever
> used. Given two posed meshes Vᵃ, Vᵇ from the same animation, the network independently predicts an SGB
> set for each, and we minimise a **symmetric** reconstruction loss across both deformation directions:
>
> L_rig = L^{a→b} + L^{b→a} + λ_s · L_scale
>
> The bidirectional form makes every predicted SGB set act as *both* source and target rig within a
> training step — doubling supervision per frame pair and avoiding any privileged "rest" frame. Because
> the whole path is differentiable, gradients flow back through the rigging weights into bone placement,
> scale, orientation, and the per-bone latent.

**Why L_scale matters**〔这个 ablation 的故事很好讲，值得单独一个 callout〕
> Trained on the ℓ₂ term alone, the network finds a degenerate shortcut: instead of *rotating* each bone
> to track its part, it shifts the bone center and shrinks the anisotropic scale, so every bone collapses
> to an isotropic sphere and deformation is explained almost entirely by translation. Normal consistency
> alleviates this but doesn't kill it — the bones can still use frame-to-frame scale fluctuation to fake
> rotation. **L_scale** ties the scales predicted from two different poses of the same mesh together,
> locking bone geometry across frames and forcing genuine rotation.

`[[FIG:ablation-degenerate]]` 〔可选：退化 vs 正常的 blob 对比图。**待确认**：有没有这个 figure？没有的话我拿文字讲〕

## 7.4 Rigging Results

> The experiment isolates Stage 1: extract a rig from a rest-pose mesh, use it to deform that mesh onto a
> posed target, and measure the residual. On the animal subset of **DeformingThings4D** (25 species) we
> sample 40 pairs per species; targets come either from the *same* sequence (**per-motion**) or a
> *different* sequence of the same species (**cross-motion**), the latter probing whether a rig
> generalises beyond the motion it was extracted from. Bidirectional Chamfer Distance, worst 1% of pairs
> excluded.

**Table 1 — Rigging evaluation on DeformingThings4D (25 species)**

| Method | Per-Motion CD-L1 ↓ | Per-Motion CD-L2 ↓ | Cross-Motion CD-L1 ↓ | Cross-Motion CD-L2 ↓ |
|---|---|---|---|---|
| UniRig + Opt. | 0.0228 | 0.0076 | 0.0318 | 0.0108 |
| Puppeteer + Opt. | 0.0306 | 0.0065 | 0.0451 | 0.0122 |
| **AniMuse + Opt.** | **0.0138** | 0.0056 | **0.0198** | 0.0083 |
| **AniMuse (network only)** | 0.0283 | **0.0050** | 0.0372 | **0.0075** |

**Takeaway callout**〔做成一个高亮框，两句话〕
> Under matched optimisation, AniMuse cuts the best skeleton baseline's CD-L1 by **39%** per-motion
> (0.0228 → 0.0138) and **38%** cross-motion (0.0318 → 0.0198).
> The **network-only** variant — no per-pair fitting at all — still takes the lowest CD-L2 in both
> settings. A single forward pass matches several hundred steps of test-time optimisation on top of the
> skeleton baselines.

### `[[DEMO:rig-comparison]]` — 交互组件 ④〔可选，看时间〕

〔并排 3 个 viewer：UniRig / Puppeteer / Ours，同一个 target pose，同步转视角。
素材：`data/stage1/<sample>/{gt.glb, pred.glb}`——**待确认**：有没有 baseline 的 glb？没有就退化成图片。〕

---

# Stage 2 — AniMuse Generation

## 8.1 SE(3) Trajectory Diffusion

> Conditioned on the rest-pose SGB set from Stage 1 and a text prompt, Stage 2 generates an F-frame
> trajectory. The (k, f)-th token encodes bone *k* at frame *f* as a 9-D vector:
>
> **T_{k,f} = [ c_{k,f} , r⁶ᴰ_{k,f} ] ∈ ℝ⁹**
>
> — a bone center plus a 6-D continuous rotation. Per-bone scale is held at its rest value; the
> trajectory never predicts scale. Tokens are stacked into a **K × F × 9** target with channel-wise
> z-score normalisation.

**What's different from prior latent diffusion**〔这个对比要突出〕
> Unlike latent-space approaches such as RigMo, our diffusion runs **directly in SE(3) parameter space**
> — there is no autoencoder wrapped around the trajectory. Standard DDPM training, cosine ᾱ_t schedule,
> x₀-prediction, and an L2 loss split by translation and rotation channels. Frame 0 is held to its clean
> target throughout noising and sampling, acting as a fixed identity anchor the rest of the trajectory
> denoises around. 50 DDIM steps at sampling.

## 8.2 Network Design

> The denoiser f_θ(T_t, t, e_text, p) is a standard **DiT**. We flatten the K × F trajectory grid into
> L = K·F tokens, with bone and frame indices encoded by a **2-D rotary positional embedding** on the
> self-attention queries and keys. Because self-attention runs over the flat sequence, it mixes spatial
> (cross-bone) and temporal (cross-frame) context in a single pass.

**Two conditioning streams**〔左右两栏〕
- **Text** — a frozen **umT5-XXL** encoder produces e_text; every block cross-attends to it.
- **Geometry** — the Stage-1 prefix p_k = [ s_k ‖ h_k ], per-bone scale concatenated with the per-bone
  latent. Projected once, consumed by *every* block as cross-attention keys/values in parallel with the
  text stream, so each motion token can retrieve its bone's geometric identity at every depth.

> A 1-bit anchor flag is appended to the noised-trajectory channels at the input projection — originally
> just for frame 0, later generalised into the inpainting interface below.

**Config**〔小表格，塞 setup 细节，治「介绍太简单」〕

| | Stage 1 | Stage 2 |
|---|---|---|
| Backbone | 5-block PointTransformer, widths 512–2048 | 16-layer DiT, hidden 512 |
| Input | 4096-point cloud (FPS) | K × F trajectory grid |
| Bones K | 120 | 120 |
| Query book | D = 512, globally shared | — |
| Text encoder | — | frozen umT5-XXL |
| Mask params | ρ = 0.2, β = 0.7 | — |
| Objective | ℓ₂ + L_normal + L_scale, bidirectional | DDPM, x₀-pred, cosine schedule |
| Optimiser | AdamW, lr 2×10⁻⁵, no warmup | AdamW, lr 5×10⁻⁵, no warmup |
| Sampling | — | 50 DDIM steps |

### `[[DEMO:text-to-motion]]` — 交互组件 ⑤

〔**Stage 2 的主 demo**。
- 一排预设 prompt（chip 样式），点一个 → 下面的 viewer 播放对应的生成动画
- 播放时可以拖时间轴 scrub
- 一个 toggle：`mesh` / `SGB trajectory` / `both`——正好复用组件①的 blend 逻辑
- 素材：`data/inpainting/{mesh,blob}/*.glb` + `captions.txt`（已经有 7 条 prompt-mesh 对，现成的！）
- **注意**：一次只加载一个 GLB，切 prompt 时才加载下一个〕

**Caption**: `Pick a prompt. AniMuse generates the SE(3) trajectory over 120 bones; LBS recovers the mesh.`

## 8.3 Motion Generation Results

> We compare against the two representative paradigms: **AniMo** (bone-based, joint-level transforms over
> a learned skeleton) and **AnimateAnyMesh** (mesh-based, per-vertex trajectories).
>
> Training uses **AniMo4D\***, our reproduction of the AniMo training set — only their curation *tool*
> was open-sourced, not the dataset, so we rebuilt the corpus from scratch with their pipeline, obtaining
> **75,083** clips against the 78,149 reported originally. AniMuse and AniMo are both trained on
> AniMo4D\*; AnimateAnyMesh uses its released checkpoint (no training code available). All three are
> tested on **AnimalML3D**, which is fully **out-of-distribution** w.r.t. AniMo4D\*.

**How we evaluate**〔评测方法也要讲清楚，这是审稿人和读者都关心的〕
> Per-frame distance metrics don't capture whether an animation *reads* correctly. We use a **pairwise
> vision–language judge**: render 8 frames sampled uniformly along each generated sequence, stack two
> methods' renders on the *same* mesh and prompt into a 2×8 contact sheet, and have a strong VLM score
> each row independently 1–5 on six attributes. Three pairwise tracks centred on AniMuse (vs. GT,
> vs. AniMo, vs. AnimateAnyMesh); we report each method's mean per-attribute score.

**Table 2 — Pairwise VLM evaluation on AnimalML3D (out-of-domain)**

| Method | Action Alignment | Pose Plausibility | Motion Coherence | Motion Diversity | Visual Integrity | Species Consistency | Overall ↑ |
|---|---|---|---|---|---|---|---|
| **AniMuse (Ours)** | **2.92** | 3.89 | 4.15 | **3.12** | 4.20 | 4.22 | **3.50** |
| AnimateAnyMesh | 2.24 | **4.04** | **4.40** | 2.12 | **4.41** | **4.24** | 3.16 |
| AniMo | 2.60 | 3.03 | 3.33 | 3.10 | 3.46 | 3.84 | 3.05 |
| *GT (reference)* | *4.14* | *4.60* | *4.79* | *4.42* | *4.82* | *4.63* | *4.56* |

**Takeaway callout**
> AnimateAnyMesh wins the "looks clean" attributes for a simple reason — **it barely moves**. Its Motion
> Diversity collapses to 1.00 on the `bear9AK_Runforward` sample. A near-static sequence is trivially
> coherent and visually intact. AniMuse leads on the attributes that actually measure whether the prompt
> was followed: **Action Alignment**, **Motion Diversity**, and **Overall Quality**.

`[[FIG:vlm-contact-sheet]]` → `figures/eval.pdf`
**Caption**
> 8-frame contact sheet for AnimalML3D sample `bear9AK_Runforward`, top to bottom: AniMuse (Ours),
> AnimateAnyMesh, AniMo, GT. As a skeleton-based method, AniMo requires a template-conforming input mesh
> — the very dependence our rig removes — so its row uses the closest same-species mesh among AniMo's
> assets; an appearance-only substitution that does not affect the motion comparison.

## 8.4 Gallery

`[[FIG:gallery]]` → `figures/teaser.pdf`
〔或者做成交互版：每行 = prompt + input mesh + SGB + 5 帧动作。
建议先用静态图，加载快；后面有余力再换成视频网格。〕

**Caption**
> Gallery of AniMuse text-driven animations on diverse animal meshes. Each row, left to right: the text
> prompt, the input static mesh, the predicted Semantic Gaussian Bones, and the generated motion
> trajectory across five frames.

---

# Beyond Generation — Control

## 9.1 Motion Inpainting

> Because SGBs share semantic indices across species, **a constraint placed on bone k in one mesh applies
> to the same body part in any other mesh.** We turn this into *motion inpainting*: a user pins the
> trajectory of a chosen subset of bones, and the model generates coherent full-body motion consistent
> with that specification — simultaneously across multiple meshes.

**How it works**
> We generalise the frame-0 anchor. Each token already carries a 1-bit anchor flag, originally raised
> only on frame-0 tokens; we extend it to *any* (k, f) token whose trajectory should be held fixed, and
> re-clamp those tokens to their target values at every diffusion step during sampling.
>
> To make the model accept arbitrary user masks, we fine-tune with a randomised inpainting mask drawn
> uniformly from three patterns per step: **(i)** one bone fixed across all frames, **(ii)** all bones
> fixed in one frame, **(iii)** a sparse random subset of bones at a sparse random subset of frames. The
> standard frame-0 anchor is just a special case of (ii).

**Cross-species synchronisation**
> To verify that semantic indices really align across species, we pin the four foot-tip bones — the same
> SGB indices by construction — of a **fox, a panda and an otter** to a synchronised sinusoidal vertical
> motion, and run AniMuse under each species' own text prompt. All three share the same periodic foot
> pace while their bodies adapt naturally to each morphology.

`[[FIG:inpainting]]` → `figures/inpaint.pdf`

### `[[DEMO:inpainting-sync]]` — 交互组件 ⑥

〔三个 viewer 并排（fox / panda / otter），一个共享的 slider 控制正弦波的相位/幅度，
三只动物的脚同步动，身体各自不同。
- 素材：`data/inpainting/{mesh,blob}/`〔**待确认**：现有的 7 个 sample 是 swim/tread water 的，
  不是论文里的 fox/panda/otter foot-pin。要么换素材，要么这个 demo 改成展示现有内容〕〕

## 9.2 Part-Level Editing

### `[[DEMO:part-editing]]` — 交互组件 ⑦

〔**你特别要的那个**。
- 一个 viewer + 若干 slider，每个 slider 控制一组语义 SGB slot（比如「四只脚」「头」「尾巴」）
- 拖 slider → 对应的 blob 沿某个轴平移 → mesh 通过 LBS 实时跟着变形
- 素材：`editing/{mesh,blob}/` 已经有 3 个：Bengal Tiger / African Elephant / Grizzly Bear
- **必须问你**：120 个 SGB 里，哪些 index 对应「脚」？以及头/尾/耳朵分别是哪些？
  → 你给我一个 `{"front_left_foot":[12,45], "head":[3,7,9], ...}` 这样的 json 就行
- **技术路线**：前端自己实现 LBS。需要 per-vertex rigging weights W (V×K)。
  **必须问你**：现在的 blob.glb / mesh.glb 里带 skinning weights 吗？
  - 带 → 直接用 GPU skinning，实时且便宜
  - 不带 → 需要你导出一份 weights（稀疏，每个顶点存 top-4 bone 就够，体积很小）〕

**Caption**: `Drag a slider to move a group of semantic bone slots. The mesh follows through linear blend skinning — no re-generation needed.`

## 9.3 WebAnimal3D

> Because AniMuse trains directly on raw mesh sequences — no template, no predefined skeleton, no manual
> rigging annotation — the training corpus can be extended with mesh sequences **from any source**. We
> exploit this to curate **WebAnimal3D**, an annotation-free animal motion corpus reconstructed from
> publicly available web video.

**Stats**〔做成三个大数字卡片〕
- **8,602** animal motion clips
- reconstructed with **AniMer+** from the web-scale video collection of Animal4D
- each clip carries an **LLM-generated caption** describing species and action — the text supervision
  Stage 2 consumes

> The AniMuse model that produces the teaser is trained jointly on **DT4D + WebAnimal3D**. We release
> WebAnimal3D as a starting point for future research on skeleton-free animal motion at larger scale.

**Provenance note**〔折叠区，学术严谨性加分〕
> The three corpora are built by independent pipelines and contain no overlapping motion sequences. DT4D
> is the publicly released benchmark of Li et al. AniMo4D\* is regenerated solely from AniMo's curation
> tool, whose original dataset was not released; we provide our reproduction recipe only to support
> apples-to-apples evaluation. WebAnimal3D contains mesh trajectories reconstructed via AniMer+ from a
> publicly available web video corpus — we plan to release the mesh-level motion data and captions, but
> not the underlying videos.

---

## 10. Ablations〔默认折叠〕

**Table 3 — Auxiliary losses on Stage-1 rigging (DT4D subset).** CD-L2 in units of 10⁻⁴.

| Loss configuration | Per-Motion CD-L1 ↓ | Per-Motion CD-L2 ↓ | Cross-Motion CD-L1 ↓ | Cross-Motion CD-L2 ↓ |
|---|---|---|---|---|
| ℓ₂ only | 0.0139 | 4.64 | 0.0147 | 4.83 |
| ℓ₂ + L_normal | 0.0111 | 3.45 | 0.0110 | 2.11 |
| ℓ₂ + L_scale | 0.0108 | 2.57 | 0.0123 | 2.88 |
| **ℓ₂ + L_normal + L_scale** | **0.0108** | **2.50** | **0.0109** | **2.05** |

> Either auxiliary loss already beats the ℓ₂-only baseline on every metric, but only the combination wins
> all four columns — confirming that the two terms address complementary failure modes.

`[[FIG:supp-qualitative]]` → `figures/figure2.pdf` (additional qualitative results on AniMo4D\*)

---

## 11. Limitations〔诚实一点，审稿人喜欢〕

> - **Stage 1** — the topology mask can still fail when a Gaussian bone sits *between* two close-but-
>   topologically-distant surfaces, causing them to share that bone and leaking deformation across them.
> - **Stage 2** — currently caps at **300 frames** per pass. We have not yet adopted long-horizon
>   techniques such as Diffusion Forcing, despite the compact bone-trajectory representation being
>   naturally suited to minute-long generation.

---

## 12. BibTeX

```bibtex
@article{animuse2026,
  title   = {Night at the Museum: Text-Driven Motion Generation via Semantic Gaussian Bones},
  author  = {TODO},
  journal = {ACM Transactions on Graphics (TOG)},
  year    = {2026}
}
```
〔TODO：确定引用格式，anonymous 期间可能先不放〕

## 13. Footer

> Template adapted from 〔TODO：定了方向再填〕. Website built with three.js.
> © 2026 〔TODO〕

---

# 附录：待确认清单（2026-09-04 更新）

读完 `references/repos/CANOR_GAUSS` 和 `scene_1` 之后，原来 9 个问题里 6 个自问自答了：

| 原问题 | 答案 | 出处 |
|---|---|---|
| blob 椭球顺序 = SGB index？ | 是，`node[i] = mesh[i] = material[i] = slot i` | 实测 GLB + Chenyang 确认 |
| 哪些 index 是脚？ | inpainting 里 pin 的是 **4, 55, 76, 77**，GLB 里已经涂成灰色 | 对上了 `configs/eval_inpaint` 的 `inpaint_color` |
| 哪些 index 是腿？ | **44–51, 26, 110, 111, 13**（左前腿，12 个） | `scene_1/main.js` |
| rigging weights 要导出吗？ | **不需要**。动画全烘焙好了，前端只要 `AnimationMixer` | GLB 结构 |
| `blob_nopiles` 是什么？ | 去掉表示朝向的 3 根插针的版本，全站只用它 | Chenyang |
| slider 方向？ | 分割线，**左 blob 右 mesh** | Chenyang |

还没解决的：

1. **作者信息**能不能公开？（double-blind 期间）arXiv / code / dataset 链接有吗？
2. **overview 视频**有吗？现在页面上是个占位卡片。
3. **灰熊在 editing 组件里朝向是歪的**，老虎和大象已经正了。
   改 `assets/models/manifest.json` 的 `editing[].rotateY` 就行，你说个数我改。
4. **teaser gallery 的选片** —— 我先按体积和物种差异挑了 4 只，你后面认真挑。
5. **baseline 的 glb**（UniRig / Puppeteer 结果）有吗？有的话 Stage 1 那个对比组件
   可以从「GT / SGB / 我们」扩成四栏。
