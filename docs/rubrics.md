# 导入评分标准与独立判分

[English](Grading-Rules.md)

评分标准描述答题者要提交的字段、单位、误差容限和权重。参考值保存在出题人的私有答案中。同一份评分标准可以用于多个分子，也可以交给 AI 编写新的任务规则。

## 两套内置预设

| 预设 | 适用任务 | 答卷 |
| --- | --- | --- |
| 数值 · 绝对误差 | 计数、单选序号、能量、频率或指定的几何量 | 提交含 `value` 的 JSON 对象。沿用任务设定的绝对容差，计数可取 0。 |
| 构型 · 对齐 RMSD | 几何优化后的完整分子构型 | 提交一个单帧 XYZ，保留输入的原子顺序，坐标单位为 Å。默认 RMSD 上限为 0.10 Å。 |

可在 `examples/` 找到 [数值规则](../examples/scalar-energy.rubric.json)、[构型规则](../examples/geometry-rmsd.rubric.json) 和 [能量与构型联合规则](../examples/energy-geometry.rubric.json)。三个文件都能直接导入。能量示例中的容差为 0.0001 Eh，制作新题时应根据方法、计算精度和任务目标确定容差。

## 让 AI 生成评分标准

将下面的要求和实际题面发给 AI，然后将它返回的 JSON 保存为 UTF-8 的 `*.rubric.json` 文件，在任务配置的评分标准区导入。

> 请根据我的题面生成一份 Chembench Studio v1 评分规则，只输出一个 JSON 对象。根字段为 version（整数 1）、id（英文字母开头的英文标识符）、name、criteria。criteria 中的每项必须包含 field、label、metric、unit、tolerance、weight。field 是唯一英文字段名，可带数字和下划线。metric 从 absolute、relative、rmsd 中选择。unit 是答卷数值采用的单位，无量纲时可填空字符串，rmsd 固定使用 Å。tolerance 是非负有限数值，weight 是正有限数值。请让每个评分项对应题面明确要求的一个可判定结果。参考答案与计算日志由出题人另行录入。

例如，单独评分能量与构型时，可以给能量 2 份权重、构型 3 份权重。只通过能量得到 0.4，只通过构型得到 0.6，两项都通过得到 1。以下规则可以直接复制。

```json
{
  "version": 1,
  "id": "energy-and-geometry",
  "name": "优化结果 · 电子能量与构型",
  "criteria": [
    {"field":"energy","label":"最终电子能量","metric":"absolute","unit":"Eh","tolerance":0.0001,"weight":2},
    {"field":"geometry","label":"优化构型","metric":"rmsd","unit":"Å","tolerance":0.1,"weight":3}
  ]
}
```

### 判定细则

- `absolute` 比较预测值与参考值之差的绝对值。该误差与 `tolerance` 使用相同单位。
- `relative` 将绝对误差除以参考值的绝对值。`unit` 仍描述提交的物理量，`tolerance` 是比例，例如 0.02 表示 2%。零参考值只接受数值零。预期存在接近零的参考值时适合使用绝对误差。
- `rmsd` 按原子序号逐一配对，核对元素序列，对全体原子采用相同权重。两组坐标先平移到各自中心，再求使均方误差最小的三维正旋转。结果是对应原子距离平方的平均数再开平方，以 Å 计。求解仅使用 Python 标准库，支持单原子、线形、平面和一般构型。镜像翻转、统一缩放和等价原子重排均不属于允许的对齐变换。[Horn 的单位四元数对齐算法](https://opg.optica.org/josaa/abstract.cfm?uri=josaa-4-4-629)
- 各项包含阈值边界，通过记该项全部权重，超出阈值、缺字段或字段类型错误记零。各项得分相加再除以总权重即为归一化总分。无效答卷文件得零。构型使用浮点坐标，建议给刚体对齐后的数值舍入误差留出容差。
- 混合任务提交 `answer.json`。数值字段使用 JSON number，坐标字段使用对象数组，每个原子含 `element`、`x`、`y`、`z`。所有物理量须使用题面指定的单位。纯构型任务按导出题面指定的路径提交单帧 `answer.xyz`。

## 独立判分

从导出的任务包取出 `grade.py` 和私有参考文件 `answer.json`。在 Python 3 环境中把答卷路径放在第一个参数，私有参考路径放在第二个参数。命令示例中的 `private-reference.json` 指私有参考文件的副本。

```sh
python grade.py submission.json private-reference.json
python grade.py submission.xyz private-reference.json
```

私有参考文件使用 `{"rubric":{...},"answers":{...}}`。每个规则字段都须有参考值，构型答案采用上述原子对象数组。程序输出单个 JSON 对象，`score` 为归一化总分，`passed` 表示全部评分项通过，`criteria` 给出各项的通过状态、权重与实测误差，缺项等情况另附 `reason`。退出码 0 表示全过，1 表示已完成判分且存在未通过项，2 表示命令或私有参考配置错误。AI 应读取 JSON 中的 `score` 和各项结果来处理部分得分。


本地出题时，也可直接导入独立规则与答案映射。此时 `rule.json` 只含规则，`answers.json` 只含 `{"energy":-76.0,"geometry":[...]}` 等参考字段。两者由出题人提供，求解者的答案仍保存在 `submission.json`。可以切换规则反复试评同一份答卷。

```sh
python grade.py --rubric rule.json submission.json answers.json
```

此入口仅处理本地作者显式指定的规则，各框架的验证器始终使用任务包内固定的私有规则。分项明细包括字段名 `field`、说明 `label`、度量 `metric`、提交单位 `unit`、阈值 `tolerance`、权重 `weight`、实得权重 `earned_weight`、误差 `error` 和通过状态 `passed`。相对误差值和它的阈值均为比例。

## 导出后各框架的成绩

| 目标 | 答卷目录 | 框架成绩 |
| --- | --- | --- |
| ASI-Bench | `results/` | 自定义评分器按归一化总分乘该项分值，默认满分 100。 |
| MDArena | `/app/outputs/` | 用原生正确性评分项反映规则中的权重。过程评分由 MDArena 的 judge 单独计算。 |
| Terminal-Bench-Science | `/app/outputs/` | 所有项通过时官方二值奖励为 1。部分分与分项诊断随 verifier 的 `metrics.json` 保存，另生成 CTRF 报告。 |
| Harbor-Index 本地候选 | `/app/outputs/` | 验证器写入归一化奖励及分项明细。正式收录和实测 parity 采用上游流程。 |

各格式使用对应题面声明的唯一答卷文件名。需要新物理量时可添加规则字段；需要频谱匹配、轨迹分布或按分子图寻找原子置换时，则需要新增相应的度量实现。
