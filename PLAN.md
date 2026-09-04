# AniMuse Page — 建站计划 v2

> v1 的计划基于错误假设（以为要在前端做 LBS）。重读 `references/repos/CANOR_GAUSS` +
> `references/repos/scene_1` + 论文后重写。

---

## 一、纠正：数据到底是什么

### 1. 所有动画都已经烘焙好了，前端不需要任何 deformation 代码

用 `python3 tools/glbinfo.py` 实测每个 GLB 的内部结构：

| 文件 | 结构 | 大小 |
|---|---|---|
| `*/blob/*.glb` | **120 个独立 mesh 节点**（每个 = 一颗 SGB 椭球），由 TRS 关键帧动画驱动（360 channels = 120 bones × translation/rotation/scale） | 0.23–0.47 MB |
| `*/mesh/*.glb` | **单个 mesh + (F−1) 个 morph target**，由一条 `weights` animation channel 逐帧切换 | 8–9 MB |

所以「播放动画」 = 挂一个 `THREE.AnimationMixer` 就完了。
Gaussian bone 的 skinning weight（`gaussian_bone.py` 里的 Mahalanobis softmax × k-ring mask）
只存在于 Stage 1 训练阶段，**永远不需要进浏览器**。

### 2. SGB index 在文件里是 identity 映射

实测 `node[i] → mesh[i] → material[i]`，三者索引完全一致（root wrapper 是最后一个 node）。
所以 three.js 里 `traverse` 收集到的第 i 个 mesh **就是** SGB slot i。这一点 scene_1 已经在用。

### 3. 语义对应关系已经烘焙进颜色了

blob 的 120 个 material 是一条按 index 排的彩虹 ramp，**跨物种完全一致**：
slot 0 在老虎和灰狼身上都是 `(0.95, 0.095, 0.095)`。
→ 「同一个 slot 在不同动物身上是同一个部位」这个核心卖点，**颜色本身就是证据**，不需要额外元数据。

### 4. inpainting 被 pin 住的骨头已经标灰了

`data/inpainting/blob/*.glb` 里，material `[4, 55, 76, 77]` 是灰色 `(0.55, 0.55, 0.55, 1.0)` ——
正好对应 `configs/eval_inpaint/*.yaml` 里的 `inpaint_color: [0.55, 0.55, 0.55, 1.0]`。
**这 4 个就是论文里的 four foot-tip bones**，而且 6 个样本用的是同一组 index。
→ 之前问的「哪些 index 是脚」，inpainting 这边自问自答了。

### 5. editing demo 已经写好了

`references/repos/scene_1/` 是一个能跑的 three.js 实现：
- 左前腿 = 12 个 SGB：`[44, 45, 46, 47, 48, 49, 50, 51, 26, 110, 111, 13]`
- blob 侧：直接改这 12 个 node 的 `position`，位移量按各自的 Y 做线性衰减（低的动得多）
- mesh 侧：`data/editing/mesh/*.glb` 里**预烘焙了一个 morph target**（slider=+100 时的 LBS 结果，
  `morphTargets=1, anims=0`），用 `morphTargetInfluences[0] = slider/100` 驱动，负值自动镜像
→ **直接移植，不重写。**

### 6. blob_nopiles

nopiles = 去掉那 3 根表示朝向的插针。stage1 的 `blob.glb` 有 480 prims（120 球 + 360 针），
`blob_nopiles.glb` 只有 120 prims。teaser / inpainting / editing 的 blob 已经都是 nopiles 版。
→ **全站只用 nopiles。**

---

## 二、纠正：slider 是分割线，不是淡入淡出

参照 3D Gaussian Splatting 官网那个 slider：一条竖直分割线，往右拖 → 左边内容变多。
**左 = blob，右 = mesh。**

实现（一个 renderer，一个 camera，两个 scene）：
```js
renderer.setScissorTest(true);
renderer.setScissor(0, 0, x, H);      renderer.render(blobScene, camera);
renderer.setScissor(x, 0, W - x, H);  renderer.render(meshScene, camera);
```
- camera 共享 → 拖动分割线时两边**永远同视角**，而且整个画面可以自由 orbit（这是用户要的「3D 可拖动」）
- 两个 mixer 由同一个 `clock` 驱动 → 动画永远同帧
- 比双 canvas + clip-path 省一半 GPU

先做能跑的版本（分割线 + orbit + 播放），细节（分割线把手样式、缩略图切换、播放条）后面慢慢调。

---

## 三、加载预算

单个 mesh GLB 的 8 MB 拆开看：

| | 字节 |
|---|---|
| `morph:POSITION`（逐帧顶点，float32） | 6.4–6.6 MB |
| PNG 贴图 | 1.3–1.6 MB |
| 其它（index / POSITION / UV / anim） | ~0.5 MB |

对策，按性价比排序：

1. **页面骨架先渲染，3D 全部 IntersectionObserver 懒挂载**，每个 canvas 位先放一张 poster 图。
   这条最重要 —— 首屏 0 个 GLB。
2. **每个 demo 只放 3–4 个样本**，切换时才加载下一个，加载过的缓存住。
3. **PNG → JPEG**（macOS 自带 `sips`，无依赖）：−1.3 MB/文件。
4. **morph target float32 → int16 normalized**（`KHR_mesh_quantization`，three.js 原生支持）：−3.2 MB/文件。
5. 视频走外链，不自己 host。

3 + 4 做完约 8 MB → 3.4 MB。
如果装 node，`gltf-transform optimize`（meshopt + webp）能压到 ~1.2 MB —— 但**不阻塞**，先按 3+4 走。

> ⚠️ 本机没有 node / npm / numpy / Pillow，只有 Homebrew 和系统 Python 3.9。
> 所以：**不用任何构建工具**，three.js 本地 vendor + importmap，资源脚本用纯 stdlib + `sips`。
> 这对 GitHub Pages 反而更好（推上去就能跑）。

---

## 四、页面结构

排版走 **Nerfies** 骨架（用户已定），交互深度走 3DGS 那种 slider。

```
Title / Authors / 按钮组
Teaser 图
Abstract  +  TL;DR
Overview Video（外链，点击才加载 iframe）
Why animals are hard   ← 新增，治「介绍太简单」
Pipeline 图

── STAGE 1 ── AniMuse Rigging
   1.1 什么是 Semantic Gaussian Bone
       ▸ [组件①] blob | mesh 分割滑块          ← 核心
   1.2 语义一致性
       ▸ [组件②] 跨物种同 index 高亮（颜色已烘焙）
   1.3 Topology-aware rigging（k-ring mask）
   1.4 Rigging 结果 + Table 1
       ▸ [组件③] GT vs Pred 并排同步播放

── STAGE 2 ── AniMuse Generation
   2.1 SE(3) trajectory diffusion
   2.2 DiT 网络设计 + 超参表
   2.3 生成结果 + Table 2 + contact sheet
       ▸ [组件④] prompt → 动画（用 inpainting 的 6 个 caption-mesh 对）
   2.4 Gallery

── CONTROL ──
   3.1 Motion inpainting
       ▸ [组件⑤] 4 个灰色脚部 SGB 被 pin 住，全身动作被 inpaint 出来
   3.2 Part-level editing
       ▸ [组件⑥] 腿部 slider（移植 scene_1）
   3.3 WebAnimal3D

Ablations（默认折叠）
Limitations
BibTeX
```

## 五、目录结构

```
index.html
css/style.css
js/main.js                  页面行为：nav / 折叠 / 懒挂载
js/viewers/split.js         组件① 分割滑块
js/viewers/correspond.js    组件②
js/viewers/compare.js       组件③④⑤（并排同步播放，同一个实现）
js/viewers/editing.js       组件⑥（移植 scene_1）
js/viewers/lazy.js          IntersectionObserver 挂载器
vendor/three/               本地 three.js（无 CDN、无构建）
assets/models/              精选 + 压缩后的 GLB
assets/img/                 figure 转 WebP/JPEG
tools/                      纯 stdlib 的资源脚本
data/                       原始素材（gitignore）
```

## 六、施工顺序

1. vendor three.js + 页面骨架（静态，无 3D）→ 本地能看
2. 组件① 分割滑块（最难，先打通）
3. 挑资源 + 压缩脚本
4. 组件⑥ editing（移植现成的）
5. 组件②③④⑤
6. 填文案（`draft.md`）
7. 性能复查 → 部署 GitHub Pages

---

## 七、施工结果（2026-09-04）

六步全部跑通，五个互动组件都在本地跑起来了。实际压缩比计划好很多：

| | 原始 | 现在 |
|---|---|---|
| 全部素材 | 173 MB | **52 MB**（3.4×） |
| 首屏（滚到任何 3D 之前） | — | **~210 KB** |
| three.js + 单个组件 | — | 2.1 MB + 0.5–7 MB，滚到才下载 |

压缩比预期好的两个原因：
1. `data/editing/` 的 GLB 里有 6–23 MB 的**孤儿 buffer**（morph target 从 JSON 里删了，
   字节没删）。清掉后灰熊 25.4 MB → 0.69 MB。
2. 长片段（inpainting 那几个 249 帧的）按每隔一帧抽稀 + STEP 改 LINEAR 插值，
   一半体积，而且 10fps 的 STEP 本来就卡，LINEAR 反而更顺。

踩到的三个坑，都记在代码注释里了：
- **量化后的 min/max 要写整数**。glTF 规定 normalized accessor 的 min/max 用分量原始单位，
  three.js 自己乘 1/32767。写成解码后的浮点数 → 每个 mesh 的包围盒小 32767 倍 →
  相机自适应、raycast、视锥剔除全废（而且画面看起来是对的，很难查）。
- **blob 节点没有默认 transform**，只有动画轨道。所以必须先 `mixer.update(0)` 再量尺寸，
  否则 120 颗椭球全在原点，包围盒趋近于 0，相机怼到脸上。
- **同一只动物的多个表示要共用一个朝向**。自动转正是按包围盒长轴判断的，
  gt 和 pred 只差一点就可能一个转 90° 一个不转，看起来像两只朝向相反的动物。

## 八、还需要 Chenyang 确认的

1. **作者信息 / arXiv / code 链接** —— double-blind 期间放不放？
2. **overview 视频** 有没有？现在是占位卡片。
3. **灰熊在 editing 组件里朝向还是歪的**（其它两只已经正了）。
   `assets/models/manifest.json` 里 `editing[].rotateY` 就是那个旋钮，改个数就行。
   或者告诉我换一只动物 —— 但 editing 只烘焙了 tiger / elephant / bear 三只。
4. `data/teaser/` 那 90 个我按「帧数适中 + 体积小 + 物种差异大」挑了 4 只
   （沙狐 / 亚洲象 / 红颈袋鼠 / 疣猪），你后面可以换。
5. 要不要 `brew install node`？装了能用 gltf-transform 的 meshopt，
   52 MB 还能再降到 ~20 MB。不装也能用，不阻塞。
