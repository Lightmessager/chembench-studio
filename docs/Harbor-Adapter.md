# Harbor Adapters and Harbor-Index

[简体中文](harbor-index.md) · **English**

This export converts numeric, geometry and multi-criterion tasks into local Harbor candidate tasks. Each task retains its prompt, original structure, private reference answers and the unit, metric, tolerance and weight of each criterion. The grader reports a weighted score between 0 and 1 and the result of each criterion. The ZIP also includes the source records, a standalone adapter and tools to check how the grader handles submissions.

## From the workbench to a container

1. Import a GJF or XYZ structure, choose a task type, write the prompt and confirm the reference values and tolerances. Use lowercase letters, digits and hyphens for the task ID.
2. Select **Harbor Adapters + Harbor-Index**. The heavy-atom task already has an independent reference solver. To recompute another task independently, enter a Python function `def solve(inputs): ...` in the reference-solver field. Its argument is a `pathlib.Path` to the directory containing the normalized XYZ, original input, effective settings and supporting files. Return a dictionary keyed by grading field, a number for a single numeric task, or a coordinate list for a geometry-only task. If you already have reference answers from a calculation, you can export the task and grade submissions offline.
3. Extract the ZIP. From its root, run the following two commands to regenerate the tasks and verify scoring. The converter requires Python 3.11 or later and Node.js 18 or later. On macOS, use `python3` if applicable.

   ```sh
   python src/chembench-local/src/chembench_local/main.py --output-dir rebuilt
   python tools/check_candidate.py --tasks rebuilt
   ```

4. With Harbor and Linux containers configured, run `harbor run -p tasks -a oracle` for a task with a reference solver to check dependencies and rewards in the actual environment. If the author supplied a solver, the exported `job-config.yaml` defaults to the oracle agent. With reference answers alone, it defaults to the nop agent as a zero-score baseline. Add an independent solver before verifying an oracle run. Tasks that use external chemistry software must have those dependencies available in the container.

The package follows version 1 of the adapter contract and includes the task directory, a Python package, a command-line entry point and a job configuration. Use `--source` for a JSON array of project records, `--limit` or `--task-ids` to select a subset, and `--overwrite` to update existing tasks. The same source code and project records generate byte-identical task files. Treat `records.json`, `solution/` and `tests/` as author materials. The participant environment receives only public inputs. [Harbor adapter contract](https://github.com/harbor-framework/adapters/blob/main/docs/adapters.mdx) · [Harbor local datasets](https://docs.harborframework.com/datasets/create-a-dataset)

## Grader checks and benchmark inclusion

`check_candidate.py` compares the original task references against the generated verifier data. It submits a fully correct answer, an empty answer and answers omitting one criterion at a time. The expected full, zero and partial scores follow from the criterion weights. The output reports local verifier behavior.

To measure agent parity, run both the original and Harbor versions on the same tasks, with matching model and agent versions. Collect pass rates as percentages from at least two independent runs on each side. Store them as equally sized arrays named `original_runs` and `harbor_runs` in a JSON object. Then run `python tools/compare_runs.py measured-runs.json`. It reports each mean, the sample standard error and whether the ranges overlap. Retain the actual trajectories, environment versions and costs with the results for submission. [Official parity experiments and reporting requirements](https://github.com/harbor-framework/adapters/blob/main/docs/adapters.mdx)

Harbor-Index is a fixed evaluation set selected through curation and audit. Leaderboard scores require runs on the official tasks with the prescribed configuration. This exporter prepares locally authored science tasks and preliminary evaluations. Official inclusion, measured model parity and leaderboard submissions each require the upstream process and corresponding evidence. [Harbor-Index](https://github.com/harbor-framework/harbor-index) · [Official run configuration](https://github.com/harbor-framework/harbor-index/blob/main/job-config.yaml) · [Paper](https://arxiv.org/abs/2609.04298)

## Upstream structural validation

From the export root, run `python <adapters-repo>/scripts/validate_adapter.py src/chembench-local`, substituting the path to your checkout of the upstream adapters repository. On the default phenol task, the upstream validator recorded **28 passes, 1 error and 2 warnings**. The error was a missing `parity_experiment.json`, which requires actual agent runs. The warnings concerned the default maintainer's missing contact email and the absence of measured parity costs. Enter an actual maintainer name and email in the adapter maintainer field when preparing the package. [Upstream validator used for this check](https://github.com/harbor-framework/adapters/blob/543861e1ad298c5d94f2480e9cbad74587041864/scripts/validate_adapter.py)

`ChembenchLocalAdapter.run()` reads the source records and uses the Python package's `task-template/` on every run. The distribution includes the job configuration, lockfile and `adapter_metadata.json`. The default example reports one local task, zero empirically measured tasks and zero publicly registered tasks. For a formal comparison, keep results from repeated native and Harbor runs on the same tasks with matching model and agent versions. In your submission, cite verifiable costs, statistics and pull request links.
