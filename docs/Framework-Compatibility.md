# Framework compatibility and verification

[简体中文](compatibility.md) · **English**

The four exporters turn one molecular structure and task specification into framework-specific directories. The bundled phenol example contains 13 atoms. Its six carbon atoms and one oxygen atom give a reference heavy-atom count of 7, with an absolute tolerance of zero.

The task prompt and manifest specify the submission filename. Submit `answer.xyz` for a single geometry RMSD criterion, in ångströms and in the input atom order. For a numeric or multi-criterion task, submit `answer.json` with one key per grading field. A missing field or an incorrect type earns zero for that criterion. The normalized objective score is the sum of the weights of passing criteria divided by the total weight.

| Target | Where to submit | Framework score and report |
| --- | --- | --- |
| ASI-Bench Chemistry | `results/` | With the default weight of 100, the custom scorer awards 100 times the normalized score. Individual results appear in `ScoreDetail.details`. |
| MDArena | `/app/outputs/`, with a separate `/app/final_answer.txt` | Reward Kit registers a weighted check for each criterion to produce `correctness`. A separate judge assesses `process`. Objective diagnostics go to `/logs/verifier/metrics.json`. |
| Terminal-Bench-Science | `/app/outputs/` | `reward.txt` contains 1 if every criterion passes and 0 otherwise. `metrics.json` records the weighted score and diagnostics. Pytest reports one CTRF test per criterion. |
| Harbor Adapters / Harbor-Index local candidate | `/app/outputs/` | `reward.txt` contains the normalized objective score from 0 to 1, with details in `metrics.json`. The candidate package includes commands to rebuild tasks and check correct and incorrect submissions. |

Participants receive the original structure, normalized coordinates, effective settings and public supporting files. The private grading directory holds the references and their calculation provenance. For standalone grading in an extracted MDArena or Terminal-Bench-Science task, run `python tests/verify.py <submission-path>`. For a Harbor candidate, first change into `tasks/<task-id>/` and use the same command. For ASI, use `python grade.py <submission-path> reference/case_001/reference/answer.json`. [Grading rules and examples](Grading-Rules.md) · [Running a Harbor candidate](Harbor-Adapter.md)

For trajectory or energy tasks, supply the relevant trajectory or calculation inputs, units and statistical conventions. You can add binary trajectories directly to the public input directory after extraction and identify their paths in the prompt.

## ASI-Bench

The adapter writes `task_meta.yaml` and `task_eval.yaml` using JSON syntax accepted by YAML parsers. They specify the development task ID, inputs and outputs, scoring threshold and a finite set of precomputed settings. A single instance stores its inputs in `reference/case_001/data/` and its grading reference in the sibling `reference/` directory. The four prompts share the same required answer and output format while offering different levels of guidance. After copying the task into the upstream repository, load it as `chemistry.<id_with_underscores>`. The example has one fixed setting. For more independent instances, supply additional settings, inputs and references. [Upstream TaskLoader](https://github.com/apexin-ai/ASI-Bench/blob/a0945096b683db2d3f09e20cae44aabf462218be/ai4sci_bench/core/task.py) · [Instance generator](https://github.com/apexin-ai/ASI-Bench/blob/a0945096b683db2d3f09e20cae44aabf462218be/ai4sci_bench/generators/instance_generator.py) · [Chemistry task directory](https://github.com/apexin-ai/ASI-Bench/tree/a0945096b683db2d3f09e20cae44aabf462218be/tasks/chemistry)

## MDArena

The schema 1.3 manifest defines task and system categories, required artifacts, resources and time budgets. The example uses a small-molecule analysis configuration. The export includes the upstream canary, Reward Kit correctness checks and a process judge. Build the upstream `mdarena:latest` image, configure credentials for the judge model and run `harbor run -p tasks/<task-id> -a oracle` for a task with a reference solver. Process judging can incur model charges. The repository-wide validator also reads the upstream `tasks/README.md` index. Register the task there for integration. [Official template](https://github.com/weitse-hsu/MDArena/tree/d1d789d92a9935e716182e31d99393edcd4ac7d6/task_template) · [Author guidelines](https://github.com/weitse-hsu/MDArena/blob/d1d789d92a9935e716182e31d99393edcd4ac7d6/CONTRIBUTING.md)

## Terminal-Bench-Science

The schema 1.4 manifest defines separate agent and verifier environments, permitted submission artifacts and a 28,800-second agent budget. The numerical grader uses the Python standard library. The verifier image installs reporting tools at build time and scores submissions offline. From the extracted task root, `python tests/verify.py <submission-path>` returns exit code 0 when every criterion passes and 1 for a graded submission with any failure.

For a container check, run `harbor run -p <task-dir> -a oracle` with an independent solver, then `harbor run -p <task-dir> -a nop` for the empty baseline. For a public submission, the author supplies attribution, expert background, a task card, data provenance and difficulty calibration, then follows the upstream proposal and review process. [Official manifest template](https://github.com/harbor-framework/terminal-bench-science/blob/e84fba709382ba3d7d4c129e24c904254991dc32/task-template.toml) · [Contribution guidelines](https://github.com/harbor-framework/terminal-bench-science/blob/e84fba709382ba3d7d4c129e24c904254991dc32/CONTRIBUTING.md)

## Reference solvers and verification evidence

The heavy-atom Harbor oracle reads `structure.xyz` and counts the elements. For other tasks, an author may provide an independent Python function `def solve(inputs): ...`. It receives the input directory as a `pathlib.Path` and returns a dictionary keyed by grading field. A single numeric task can return a number directly. A geometry-only task can return a coordinate list. An existing calculation output suffices to author and grade a task. To run the oracle, also provide the independent solver. The workbench packages this code for execution in the task environment. Supporting files are distributed to participants verbatim, so enter private reference data in the grading controls.

On Windows, the upstream ASI loader and scorer were exercised with the phenol task, producing 100 and 0 for correct and incorrect answers. MDArena's official per-task static validation also passed. In a separate mixed task with energy and geometry weights of 3 and 1, the registered upstream ASI scorer awarded 75/100. The mixed task passed MDArena static validation, and Reward Kit 0.1.7 registered and executed its two weighted checks through the native criterion factory.

Run `node --test tests/framework-rubrics.test.cjs tests/adapters.test.cjs` in the source repository to check TOML parsing, reference solvers, scoring, public and private file layout, and filename handling. Docker was unavailable in the verification environment. Full Harbor container runs, live MDArena process judging and official submission review remain unverified.

## Solver environment

MDArena and Terminal-Bench-Science exports allow the author to select a solver image, CPU count and memory. Use a Linux image with Bash, Python 3, readable inputs and a writable output directory. A local image or a private registry image may include the required chemistry software. Image references accept a tag or a fixed SHA-256 digest, including registry hostnames with ports. CPU count accepts integers from 1 to 256 and memory from 128 to 1,048,576 MB. Actual capacity depends on the runtime backend.

- MDArena defaults to `mdarena:latest`, 2 CPU cores and 8,192 MB. The upstream base-image check inspects the final `FROM` line and expects this image name. A replacement for private use must also support `uvx`, Reward Kit and the selected judge.
- Terminal-Bench-Science defaults to `python:3.12-slim-bookworm`, 1 CPU core and 2,048 MB. The separate verifier uses a fixed Python environment, installs pytest and the CTRF plugin at build time, and writes its reports and `reward.txt` to `/logs/verifier/`. Standalone `tests/verify.py` needs only the Python standard library.
