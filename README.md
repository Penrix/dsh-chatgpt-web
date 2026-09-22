# dsh-chatgpt-web

> 目标不是“给 ChatGPT Web 再做一个聊天壳”，而是把长期上下文、工作状态与原始认知证据从 ChatGPT Web conversation 中剥离出来，让 ChatGPT Web 只承担它最有价值的部分：高质量推理。

## Status

- 建立：2026-09-22
- 阶段：认知与架构定向
- 当前第一目标：验证 **DSH canonical session + ChatGPT Web provider** 是否能显著改善高语义任务的长期连续性
- 相关项目：
  - `Penrix/webcodex`：本地身体 / durable execution runtime
  - `Penrix/chatgpt-continuity`：原始对话 DVR / evidence
  - `Penrix/codex-chatgpt-web`：ChatGPT Web provider 与浏览器自动化经验

---

# WHY｜为什么做

## 1. 真正的问题不是“新旧窗口续接”

最初的问题被描述成：

```text
旧 ChatGPT 窗口上下文满
↓
开新窗口
↓
如何恢复旧窗口的认知
```

经过反复实验，这个描述已经不准确。

更关键的现象是：

- 即使仍在原窗口里，随着对话继续，高语义认知也会逐渐模糊；
- 即使从“最正确的那个节点”新建 branch，新分支虽然拥有共同历史，认知状态仍明显弱于原分支；
- 因此问题不能归因于“新窗口没有旧窗口历史”；
- 对代码任务影响很小，但对高度依赖审美、隐含权重、语义坐标和错误边界的任务影响极大。

当前工作假设是：

> **ChatGPT Web conversation 不能被当成高语义认知的长期可靠宿主。**

这里不假设某个固定的“五轮”是 OpenAI 的产品契约。用户实测中，约五轮后就经常出现明显衰减；真正重要的是：这种衰减在同一窗口和 branch 中都能发生，因此它不是单纯的跨窗口恢复问题。

## 2. 代码连续性与高语义认知连续性不是同一个问题

代码任务的大部分真相在模型外部：

```text
source
Git
tests
compiler
filesystem
issue
logs
```

模型哪怕换一个新窗口，只要重新读取这些客观状态，通常就能继续。

高语义、审美型任务不同。决定下一步的不只是显式规则，而是：

- 当前哪些语义最重；
- 第一搜索权给谁；
- 哪些方向虽然合理但已经被否掉；
- 什么答案“看起来正确”但实际很廉价；
- 哪些具体成功/失败样本正在充当语义坐标；
- 用户曾怎样纠正模型，以及这些纠正如何改变之后的搜索空间。

这些东西很容易在上下文压缩或重新推理时退回 Generic Prior。

因此本项目不把“能继续做代码”当成“认知已经连续”。

## 3. 现有恢复包不够

当前人工恢复高语义认知时，已经实际需要近似四段连续工作：

```text
Round 1
阅读男频语义认知文档
→ 建立基础坐标

Round 2
阅读当前恢复包
→ 恢复当前 FCC / Working

Round 3
阅读 GitHub 中完整形成史
→ 理解这些结论为什么形成

Round 4
阅读相关任务的错误形成史
→ 恢复排斥路径、边界与“为什么不能那样做”
```

即使如此，恢复结果也通常只是“勉强够用”，并且继续对话后又会衰减。

这说明不能继续把主要工程目标定义成：

> 写一个更完整的 checkpoint，然后让新窗口读它。

## 4. DVR 仍然非常重要

本项目明确拒绝以下错误推论：

> “既然认知会衰减，所以 DVR 没意义。”

恰恰相反。

Checkpoint / summary 是别人对演奏的说明；DVR 是原始演奏本身。

```text
checkpoint
≈ “这里应该紧张、那里应该放松”

DVR
≈ 把真正那次演奏重新播放
```

ChatGPT Web 在长对话中未必能够可靠访问整个历史，旧窗口自己写恢复包时也未必真正重新读取了全部形成过程。因此：

> **原始对话证据不能由窗口末尾的一次总结替代。**

DVR 的价值不是让模型永不衰减，而是在需要恢复或校准时，能够重新播放真实的形成过程、成功样本、失败样本和用户纠正。

---

# WHAT｜要做成什么

## 1. 把 session/context 主权移出 ChatGPT Web

目标结构：

```text
                 DSH
        canonical cognitive/session host
                 │
                 │ context projection / LLM call
                 ▼
           ChatGPT Web
        high-quality reasoning
                 │
                 ▼
                 DSH
                 │
                 │ tool/effect intent
                 ▼
             WebCodex
       durable local execution
                 │
                 ▼
               Windows

旁路证据：
chatgpt-continuity
→ raw DVR / branch graph / original cognition history
```

原则：

- DSH 拥有 canonical session/history。
- ChatGPT Web conversation 不拥有历史真相。
- ChatGPT Web 不拥有任务身份。
- ChatGPT Web conversation 可以被重建、轮换甚至丢弃。
- WebCodex 拥有执行现实：文件、Git、Shell、Job、Computer Use、Agent/ACP 等。
- DVR 拥有原始认知形成证据。
- Codex 可以继续作为 coding worker / coding context host，但不默认承担高语义认知宿主。

## 2. ChatGPT Web 仍然是“大脑”，但不再是“记忆容器”

这里不是要把 ChatGPT Web 降级成无状态小模型。

目标仍然是：

> **使用 ChatGPT Web 中最强、最适合的模型完成理解、审美判断、推理和决策。**

改变的是：

```text
以前：
ChatGPT Web = reasoning + session + memory + task container

目标：
ChatGPT Web = reasoning engine
DSH = long-lived session/context host
WebCodex = body
DVR = raw evidence
```

可以把 DSH 理解为外部海马体 / 工作台，而不是“另一个大脑”。

## 3. 不要求永久复用同一个 Web conversation

需要把不同策略作为实验变量，而不是先验地认定某一种正确：

```text
A. 长期复用一个 managed ChatGPT conversation
B. 定期轮换 Web conversation
C. 到认知衰减点时重建
D. 每次 inference 都用 fresh conversation
```

无论采用哪种策略，DSH canonical session 都应该独立存在。

如果 Web conversation 与 DSH canonical history 不一致，应以 DSH 为准，而不是让网页 conversation 反过来成为 source of truth。

---

# HOW｜当前工程方向

## 1. 先接通最小 DSH → ChatGPT Web provider

第一阶段先证明：

```text
DSH Session
↓
构造本轮 messages/context
↓
ChatGPT Web
↓
得到 assistant output
↓
写回同一个 DSH Session
```

不要在第一步同时重做 WebCodex、DVR、向量检索和完整 UI。

## 2. 再接 WebCodex 作为身体

目标闭环：

```text
DSH
↓
ChatGPT Web reasoning
↓
structured tool intent
↓
WebCodex ToolRuntime
↓
Windows effect
↓
authoritative result
↓
DSH SessionEvent
↓
下一轮 ChatGPT Web reasoning
```

WebCodex 的 Goal / Workflow Session / Job / Agent / ACP 等继续拥有它们自己的执行语义，不把高语义认知硬塞进这些对象。

## 3. DVR 作为可回听的原始证据

`chatgpt-continuity` 不应变成 summary store。

后续 DSH 的 context projection 可以按需要引用：

- 最近真实对话；
- 某段关键纠正；
- 某次成功输出；
- 某次失败输出；
- 某个概念的形成史；
- 某个任务的错误形成史。

检索只是找到原始证据的位置，不能成为历史真相本身。

## 4. Context Projection 是核心研究问题

即使 DSH 保存完整事件流，模型单次输入仍然有边界。

所以真正要研究的是：

> **在不依赖 ChatGPT Web 隐式长对话记忆的前提下，每一轮应该从 canonical session + DVR 中投影什么给模型。**

这不是普通“做摘要”。

至少要保留三种不同东西：

```text
A. current task state
   当前要做什么、做到哪、下一步是什么

B. cognitive anchors
   当前真正承重的成功样本、语义坐标、重要纠正

C. negative history
   已经证明错误的方向、为什么错、模型最容易回流的 Generic Prior
```

是否需要 embeddings / semantic retrieval 目前不下结论。先用真实失败数据决定。

---

# 当前已经确认的边界

## 不要再做

- 不再把“新旧窗口”当成根问题。
- 不把 branch 当成天然能够复制认知状态的机制。
- 不假设更长的 checkpoint 就能解决问题。
- 不让旧窗口最后一次 summary 取代完整 DVR。
- 不把 WebCodex Project Memory / Goal / Session 当成艺术认知的完整替代物。
- 不先上向量数据库再寻找问题。
- 不粗暴合并 `webcodex`、`chatgpt-continuity`、`codex-chatgpt-web`。
- 不把 ChatGPT Web DOM/browser transport 的临时 conversation identity 当成长期 task identity。

## 必须保留

- 原始 DVR。
- 用户纠正与 supersession 关系。
- 成功样本和失败样本，而不只是结论。
- DSH canonical session 的独立身份。
- WebCodex 的执行真相与 retry/uncertainty 边界。
- provider 层对“可能已经发生的 Send/effect”保持 fail-closed，不盲重试。

---

# 第一批实验

## Experiment A｜普通 Web 对话基线

用一个已知高语义任务连续工作多轮，记录：

- 第几轮开始出现明显 Generic Prior 回流；
- 哪些关键区分最先丢；
- 显式规则是否仍记得但实际判断已经变差；
- branch 后与原分支的差异。

## Experiment B｜DSH canonical session + Web provider

同一个任务改由 DSH 保存 canonical session。

主动在若干轮次：

- 继续复用 managed conversation；
- 或重建 managed conversation；
- 或 fresh conversation rehydrate。

比较高语义输出质量。

## Experiment C｜DVR 回听

当模型状态出现衰减时，不只给 checkpoint，而是从 DVR 重新提供：

- 原始关键纠正；
- 正确样本；
- 错误样本；
- 形成过程。

观察它是否比 summary/checkpoint 更有效地恢复正确判断。

通过这些实验以后，再决定：

- managed Web conversation 应复用多久；
- context projection 应怎样组织；
- DVR retrieval 需要什么索引；
- 是否值得引入 semantic/vector retrieval；
- 哪些认知应进入长期显式 memory。

---

# 成功标准

本项目不是以“能调用 ChatGPT Web”作为最终成功。

真正目标是：

> **在高语义、强审美、长时间任务中，ChatGPT Web 不再因为自身 conversation 的长期压缩而成为唯一上下文宿主。**

一个可接受的系统应该做到：

1. DSH Session 在 Web conversation 之外长期存在。
2. 任意 managed ChatGPT conversation 消失，不丢 canonical session。
3. 可以从 DVR 找回原始认知证据，而不是只剩模型总结。
4. 可以明确区分当前工作事实、当前认知材料和历史原始证据。
5. WebCodex 负责可靠执行，本地 effect 不因模型 turn/window 死亡而丢失或盲重试。
6. 通过实际高语义任务证明：比“一个普通 ChatGPT Web 长对话一直聊下去”更稳定，而不只是架构更漂亮。

---

# 一句话定义

> **DSH 持有长期 session/context，DVR 保存原始认知演奏，ChatGPT Web 负责高质量推理，WebCodex 负责本地身体。窗口可以死，provider 可以换，但历史真相、执行现实和可回听的认知形成过程不能一起死。**
