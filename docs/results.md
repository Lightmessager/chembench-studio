# 从量化计算输出写入标准答案

[English](Calculation-Outputs.md)

在任务配置中导入 Gaussian 或 ORCA 文本输出，选定作业段和物理量，核对显示的数值、单位与来源行，再写入标准答案。坐标类题目还会检查原子元素和顺序。随包的 `examples/water-seed.xyz` 可搭配 `gaussian-water.log` 或 `orca-water.out` 试用。这两个输出是人工编写的格式节选。

| 可导入的量 | 单位 | 取值约定 |
| --- | --- | --- |
| 电子能 | Eh | Gaussian 保留本段最后一次 SCF 电子能，也分别列出可识别的 MP2、MP3、E(Corr) 和 CCSD(T) 总能。ORCA 取本段最后一次最终单点能，带 Solute-CPCM 标记的值单独列出。 |
| 热力学量 | Eh | 分别显示已打印的零点能校正、含热校正的内能、焓与 Gibbs 自由能。Gaussian 还可读取电子能与零点能之和。程序使用输出中的数值与可识别的温度标签。同段有多个温度时分别保留对应的热力学总量。 |
| 振动频率 | cm⁻¹ | Gaussian 读取谐振频率行，按出现次序从 1 起编号。ORCA 按振动频率表中的模式号列出。两者均保留负频。ORCA 模式 0–5 中打印为精确零的项会标为报告零模，出题时请结合分子线性、约束及计算选项核对其物理意义。 |
| 构型 | Å | Gaussian 读取本段最后一张完整的 Standard 或 Input orientation 埃坐标表。ORCA 读取最后一张完整的埃坐标表。原子顺序沿用表中行序。几何优化题需有该段明确的优化收敛记录，极小值或过渡态性质还需结合频率核对。 |

来源行从原文件第 1 行开始计数。标量定位到打印该值的行，坐标定位到整张表的标题。电子能、热校正总量和频率分别使用原程序的物理量定义。[Gaussian 热化学说明](https://gaussian.com/wp-content/uploads/dl/thermo.pdf) · [ORCA 热化学](https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/thermochemistry.html) · [ORCA 振动频率](https://www.faccts.de/docs/orca/6.1/tutorials/prop/freq.html)

## 串联与复合作业

解析器识别程序启动标记、Gaussian Link1 分段和 ORCA 的编号子作业标题。每段独立记录结束和优化状态。写入参考值需要本段有正常结束记录；已识别的 SCF 或几何优化失败以及破损的末张坐标表会阻止写入。

若 ORCA 合并日志只在文件末尾出现一次正常结束标记，前面具有分段标题但缺少自己结束标记的子步会显示为未完成。要使用这些步骤，可以导入对应计算的独立完整输出。Compound 脚本、扫描、数值位移等可能使用自定义标题或摘要；制作这类题目时，请定位目标步骤的原始输出与源行。当前导入器面向文本计算记录，支持范围不包括任意 Compound 脚本的执行轨迹重建。[ORCA Compound 说明](https://www.faccts.de/docs/orca/6.1/manual/contents/workflowsautomatization/compound.html)

## 实际文件核对

- Gaussian 16 水分子优化与频率文件分为两个正常结束段。第二段提取出 3 个原子的坐标、−74.9659011806 Eh 的 SCF 能量，以及 2169.7613、4141.3837 和 4392.5759 cm⁻¹ 三个频率。[原始输出](https://github.com/cclib/cclib-data/blob/master/Gaussian/Gaussian16/water_neutral_nbo_opt_freq.out)
- ORCA 5 苯分子文件提取出 12 个原子的坐标及 −231.769539246948 Eh 的最终能量。将这份真实输出拼接两次时，两段各自正常结束。移除第一个终止标记再拼接，解析器将前段标为未完成、后段标为正常结束。这项检查使用构造的串联文件。[原始输出](https://github.com/cclib/cclib-data/blob/master/ORCA/ORCA5.0/Benzene_opt_etsyms.log)
