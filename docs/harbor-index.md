# Harbor Adapters 与 Harbor-Index

**简体中文** · [English](Harbor-Adapter.md)

第四个导出目标将数值、几何及多指标题转换为本地 Harbor 候选任务。每道题保留题面、原始结构、私有参考答案，以及每项的单位、度量、容差和权重。评分器输出分项明细和 0 至 1 的加权总分。导出 ZIP 同时包括出题记录、可独立运行的转换器和用于核对评分的工具。

## 从工作台到容器

1. 导入 GJF 或 XYZ 后，选择任务类型，填写要求，确认参考值与容差。任务 ID 使用小写字母、数字及连字符。
2. 选择 **Harbor Adapters + Harbor-Index**。重原子计数自带参考算法。需要独立复算时，在“参考算法”填写 Python 函数 `def solve(inputs)`。`inputs` 为 `pathlib.Path`，其中包含标准化 XYZ、输入原文、有效参数和补充文件。函数返回以评分字段为键的字典。单数值题也可直接返回数值，纯几何题也可直接返回坐标列表。已有输出参考答案的题目可以先导出并离线打分。
3. 解压导出的 ZIP。在解压目录用 `python src/chembench-local/src/chembench_local/main.py --output-dir rebuilt` 重新生成任务，然后执行 `python tools/check_candidate.py --tasks rebuilt` 检查判分。Python 需为 3.11 或更高版本，转换器另需 Node.js 18+。macOS 可使用 `python3`。
4. 配置好 Harbor 与 Linux 容器后，用 `harbor run -p tasks -a oracle` 运行已提供的参考解，检查真实依赖与奖励。有参考算法时，导出的 `job-config.yaml` 默认运行 oracle。仅有参考答案时默认运行 nop 作为零分对照，需补充独立求解算法才能验证 oracle。添加外部化学软件时，需要为容器指定实际可用的依赖。

系统生成适配器契约 v1 的任务目录、Python 包、命令行入口和运行配置。`--source` 可读取多个项目组成的 JSON 数组，`--limit` 和 `--task-ids` 可选取子集，`--overwrite` 可更新已有任务。相同源码和项目记录会生成字节相同的任务。适配器中的 `records.json`、`solution/`、`tests/` 都是出题材料，答题环境只装入公开输入。[Harbor 适配器契约](https://github.com/harbor-framework/adapters/blob/main/docs/adapters.mdx) · [Harbor 本地数据集](https://docs.harborframework.com/datasets/create-a-dataset)

## 对照与收录

`check_candidate.py` 会把原始题底与任务测试数据比对，并向导出的验证器提交完全正确、空白和逐项缺失的答卷，核对分项权重对应的全分、零分和部分分。脚本输出的是本地验证器对照结果。

正式的代理表现对照需要两侧一致的任务样本、模型、代理与实测运行。把每侧至少两次独立实验的通过率（百分数）写成 JSON 对象，其中包含长度相同的 `original_runs` 和 `harbor_runs` 数组，执行 `python tools/compare_runs.py measured-runs.json`。工具计算均值、样本标准误和范围重叠情况。可随结果保存原始轨迹、环境版本及费用，再据实整理提交材料。[官方适配器实验与报告要求](https://github.com/harbor-framework/adapters/blob/main/docs/adapters.mdx)

Harbor-Index 是经过筛选和审计的固定评测集。上传排行榜结果需评测官方指定任务及配置。本程序的输出用于自建科学任务与预评测试验，官方收录、真实模型 parity 和公开排行榜成绩均需另行完成。[Harbor-Index](https://github.com/harbor-framework/harbor-index) · [官方运行配置](https://github.com/harbor-framework/harbor-index/blob/main/job-config.yaml) · [论文](https://arxiv.org/abs/2609.04298)


## 官方结构校验

在导出目录执行 `python <adapters 仓库>/scripts/validate_adapter.py src/chembench-local` 可以复查适配器结构。本程序附带的苯酚默认例题取得 **28 项通过、1 项错误、2 项警告**。唯一错误是缺少 `parity_experiment.json`，该文件需要真实代理实验。两项警告分别为默认维护者没有联系邮箱、尚无实测 parity 费用。填写“适配器维护者”可以在导出时加入真实姓名与邮箱。[本次使用的官方验证器](https://github.com/harbor-framework/adapters/blob/543861e1ad298c5d94f2480e9cbad74587041864/scripts/validate_adapter.py)

转换器通过 `ChembenchLocalAdapter.run()` 读取出题记录，并在每次运行时读取 Python 包中的 `task-template/`。包内含运行配置、锁文件与 `adapter_metadata.json`，其中分别记录本地样本数、实测样本数和公开注册数。默认例题的三个数值为 1、0、0。正式对照需保留同一组任务、相同模型和代理版本下的原生端与 Harbor 端多次运行结果，并在发布材料中填写可核验的费用、统计量和 PR 链接。
