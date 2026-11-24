# 基准格式与验证范围

**简体中文** · [English](Framework-Compatibility.md)

四个导出器把同一份分子结构和出题配置转换为各自的任务目录。程序随附的苯酚示例有 13 个原子，其中 6 个 C 和 1 个 O 为重原子，期望数值为 7，绝对容差为 0。

题面和任务清单共同指定答卷名。单一几何 RMSD 项提交 `answer.xyz`（Å，与输入相同的原子顺序）。单项数值及多项任务提交 `answer.json`，答案对象按评分字段名填值。缺失或类型错误的项记零，其余项目照常计算。评分器把通过项的权重总和除以总权重，得到 0 至 1 的客观分。

| 目标 | 答卷目录 | 框架得分与报告 |
| --- | --- | --- |
| ASI-Bench Chemistry | `results/` | 权重 100 的自定义 scorer 返回 100 × 客观分。分项保存在 `ScoreDetail.details`。 |
| MDArena | `/app/outputs/`，另交 `/app/final_answer.txt` | 各项在 Reward Kit 中分别注册并赋权，形成 `correctness`。过程 judge 另算 `process`，客观明细写入 `/logs/verifier/metrics.json`。 |
| Terminal-Bench-Science | `/app/outputs/` | `reward.txt` 全部过线为 1，否则为 0。加权客观分和每项诊断保存在 `metrics.json`，pytest 为每项生成 CTRF 测试记录。 |
| Harbor Adapters / Harbor-Index 本地候选 | `/app/outputs/` | `reward.txt` 直接写 0 至 1 的客观分，`metrics.json` 保存明细。候选包支持 CLI 重建和正反答卷验证。 |

分子原件、规范坐标、有效设置和公开补充材料供答题者使用。参考答案和其计算来源放入私有评分区。可在解压目录用 `python tests/verify.py <答卷路径>` 单独打分。ASI 采用 `python grade.py <答卷路径> reference/case_001/reference/answer.json`。候选包先切换到 `tasks/<任务标识>/`。[评分规则及模板](rubrics.md) · [候选集运行方式](harbor-index.md)

制作轨迹分析或能量任务时，请补充相应轨迹、计算输入、单位和统计约定。二进制轨迹可在解压后放入输入目录，并在题面写明路径。

## ASI-Bench

适配器使用 `task_meta.yaml` 和 `task_eval.yaml` 双文件布局。两个文件采用 YAML 兼容的 JSON 表示，包含开发中任务 ID、输入输出声明、评分门槛和有限预计算设置。单例数据位于 `reference/case_001/data/`，参考位于其同级 `reference/`。四个提示文件共享作答要求与输出契约，提供不同程度的提示。复制到仓库后使用 `chemistry.<下划线标识>` 加载。例题的数据生成模式固定为一个设置，增加独立样本时应补充新的设置、输入和参考。 [上游 TaskLoader](https://github.com/apexin-ai/ASI-Bench/blob/a0945096b683db2d3f09e20cae44aabf462218be/ai4sci_bench/core/task.py) · [实例生成器](https://github.com/apexin-ai/ASI-Bench/blob/a0945096b683db2d3f09e20cae44aabf462218be/ai4sci_bench/generators/instance_generator.py) · [化学任务目录](https://github.com/apexin-ai/ASI-Bench/tree/a0945096b683db2d3f09e20cae44aabf462218be/tasks/chemistry)

## MDArena

清单采用 schema 1.3，包含任务分类、体系分类、产物、资源需求和时间预算。单例采用小分子分析配置。MD 包含上游 canary、Reward Kit correctness 检查和过程 judge。构建上游 `mdarena:latest` 镜像后，配置所用评审模型的凭据并运行 `harbor run -p tasks/<任务标识> -a oracle`。过程评分可能消耗模型额度。仓库整体校验还会读取其 `tasks/README.md` 索引，正式集成时需要登记任务。 [官方模板](https://github.com/weitse-hsu/MDArena/tree/d1d789d92a9935e716182e31d99393edcd4ac7d6/task_template) · [作者指南](https://github.com/weitse-hsu/MDArena/blob/d1d789d92a9935e716182e31d99393edcd4ac7d6/CONTRIBUTING.md)

## Terminal-Bench-Science

清单采用 schema 1.4，定义独立 agent 与 verifier 环境、允许传输的答卷及 28800 秒 agent 预算。数值判定使用 Python 标准库。验证镜像在构建时安装测试报告工具，随后在断网模式判分。将包解压后，也可以直接从任务根目录运行 `python tests/verify.py <答卷路径>`。退出码 0 表示通过，退出码 1 表示失败。使用容器完整验证时运行 `harbor run -p <任务目录> -a oracle` 和 `harbor run -p <任务目录> -a nop`。面向公开提交时须由作者补齐署名、专家背景、任务卡、数据来源及难度校准，按上游流程完成提案和评审。 [官方清单模板](https://github.com/harbor-framework/terminal-bench-science/blob/e84fba709382ba3d7d4c129e24c904254991dc32/task-template.toml) · [贡献说明](https://github.com/harbor-framework/terminal-bench-science/blob/e84fba709382ba3d7d4c129e24c904254991dc32/CONTRIBUTING.md)

## 参考算法与复核

重原子计数任务的 Harbor oracle 会重新读取 `structure.xyz` 并统计元素。可为其他任务提供独立的 Python 函数 `def solve(inputs): ...`，接收输入文件夹的 `pathlib.Path`，返回按评分字段命名的字典。单数值题可直接返回数值，纯几何题也可返回原子坐标列表。已有计算输出即可建立评分任务，需要运行 oracle 时再提供独立求解算法。代码只随任务包导出，运行 oracle 时才在任务环境执行。补充材料会原样发给答题者，私有参考数据应填在评分设置中。

Windows 环境验证了苯酚例题的 ASI-Bench 官方加载器、评分器注册及正反答卷（100 分和 0 分），以及 MDArena 官方逐任务静态验证函数。另以 3:1 的能量与几何权重复核，官方 ASI scorer 注册后给出 75/100，MDArena 的逐任务静态校验通过，Reward Kit 0.1.7 的原生 criterion 工厂正确注册并执行了权重为 3、1 的两项检查。仓库内的 `node --test tests/framework-rubrics.test.cjs tests/adapters.test.cjs` 还检查 TOML 解析、参考算法、判分逻辑、公开与私有数据布局及文件名边界。本次验证环境未提供 Docker，完整 Harbor 容器运行、MDArena 在线过程评审及官方投稿审核仍需在配置好相应依赖后进行。


## 求解环境

MDArena 和 Terminal-Bench-Science 的导出设置可指定求解镜像、CPU 和内存。镜像应为支持 Bash、Python 3、可读输入及可写输出目录的 Linux 镜像；可以使用已配好所需化学软件的本地镜像或私有仓库镜像。镜像字段可填标签或固定的 SHA-256 摘要，支持带端口的仓库地址。CPU 接受 1 到 256 的整数，内存接受 128 到 1048576 MB 的整数，实际可分配上限由运行后端决定。

- MDArena 默认使用 `mdarena:latest`、2 核和 8192 MB。其官方检查器核对最后一条 `FROM`。保留此名称才能通过默认基础镜像检查。用于私有试验的替代镜像还需能运行 `uvx`、Reward Kit 与选定的 judge。
- Terminal-Bench-Science 默认使用 `python:3.12-slim-bookworm`、1 核和 2048 MB。更换求解环境后，独立验证镜像仍使用固定 Python 环境，构建时安装 pytest 和 CTRF 插件，运行时将验证报告与 `reward.txt` 写到 `/logs/verifier/`。本地运行 `tests/verify.py` 只依赖 Python 标准库。
