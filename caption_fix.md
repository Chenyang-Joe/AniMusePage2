# `figures/eval.pdf` — caption 改稿（给 Overleaf）

## 先说一个更要紧的问题：这张 PDF 的页面框裁掉了真内容

`eval.pdf` 的页面框是 `[38.398 111.9 877.411 523.201]`，是 960×540 幻灯片的一个紧裁剪，
但它切掉了两块**图里实际有的东西**：

- 左边一整列行标题（`AniMuse(ours)` 被切成 `niMuse(ours)`，`AnimateAnyMesh` 切成 `mateAnyMesh`）
- 最下面**一整行 `GroundTruth`**

`\includegraphics` 用的就是这个框，所以论文里现在这张图应该也是残的 —— 建议**重新导出**
（导出时不要裁）或者把页面框改成 `[0 0 960 540]`。我在网页那边是用脚本把框撑回整页再转的图
（`tools/figures.py`），你可以直接看 `assets/img/eval.jpg` 确认完整版长什么样。

## 图里实际画的内容

- 两个物种：**Bear** 和 **Horse**
- 每个物种 **4 帧**（不是 8 帧）
- **5 行**，从上到下：`AniMuse(ours)` / `Semantic Gaussian Bone` / `AniMo` / `AnimateAnyMesh` / `GroundTruth`
- 每行最后一帧用蓝色高亮
- `AniMo` 那一行用的是不同的 mesh（rebuttal 里说的 Fig.4 标签互换问题，这张图里已经是改对的版本了）

现在 `sections/7_figure.tex` 里的 caption 写的是「8 帧 / `bear9AK_Runforward` / 四行
Ours-AnimateAnyMesh-AniMo-GT」，和图对不上，而且 AniMo 和 AnimateAnyMesh 的顺序也反了。

## 建议的新 caption

```latex
\begin{figure*}[t]
\centering
\includegraphics[width=\linewidth]{figures/eval.pdf}
\caption{\textbf{Qualitative comparison on AnimalML3D} (out-of-domain), four frames
per clip with the final frame highlighted. Rows, top to bottom: \methodname{} (Ours);
the Semantic Gaussian Bones our Stage~1 predicts for the same input, which is the
space Stage~2 actually generates in; AniMo~\citep{wang2025animo};
AnimateAnyMesh~\citep{wu2025animateanymesh}; and ground truth. AnimateAnyMesh stays
close to its input pose across all four frames, the near-static behaviour its low
Motion Diversity in \Cref{tab:gen_eval_animalml3d} reflects. As a skeleton-based
method, AniMo requires a template-conforming input mesh --- the very dependence our
rig removes --- so its row uses the same-species mesh closest to the original input
among AniMo's assets; the substitution is appearance-only and does not affect the
motion comparison.}
\label{fig:vlm_qualitative}
\end{figure*}
```

〔如果你想更短，把最后那句 AniMo 的说明压成一句：
`AniMo's row uses a template-conforming same-species mesh, an appearance-only substitution.`〕

## 顺带两个 rebuttal 里已经答应改、但正文还没改的

1. **Tab.2 缺 caption**（rebuttal `#R3: Tab.2 missing caption`）—— 现在 `tab:gen_eval_animalml3d`
   是有 caption 的，但 `tab:ablation_loss` 和它挤在同一个 `table*` 里，检查一下排版。
2. **AniMo 数据说明**：`4_experiments.tex` 里现在写的是
   *"only the curation tool was open-sourced (not the dataset itself)"*，
   而 rebuttal 里承认 *"AniMo's data-curation tool is in fact released, and we closely
   followed it"* —— 这两句其实一致，但正文那句读起来像在抱怨对方没开源，
   建议改成中性的：
   > We rebuild the corpus with AniMo's released curation pipeline, obtaining
   > $75{,}083$ animal motion clips, comparable in scale to the $78{,}149$ clips reported
   > in the original.
