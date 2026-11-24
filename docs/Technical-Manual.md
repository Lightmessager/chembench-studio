# Chembench Studio Technical Manual

For maintainers and benchmark developers. This manual follows a task from molecular input to a graded submission and describes how to extend, build, and verify the application.

[中文版](技术手册.md) · [User guide](User-Guide.md)

## Runtime architecture and project data

The workbench runs in the local browser. Its source entry point is `web/index.html`. The Windows launcher and macOS application open the same self-contained HTML file. The browser parses files, previews tasks, and writes ZIP archives. Quantum chemistry calculations, container-based evaluation, and MDArena process judging require software, images, or model credentials in the evaluation environment.

| Entry point | Responsibility |
| --- | --- |
| `Chemistry.parse(filename, raw)` | Reads GJF, COM, or XYZ input in `web/chemistry.js` and returns ordered atoms, calculation settings, source text, and warnings. |
| `Studio.fresh` and `Studio.checked` | Create a v1 project or restore one from saved data. On restoration, `web/core.js` reparses the original structure and validates the project fields. |
| `ChemResults.parse` and `AnswerBook.apply` | `web/results.js` lists properties for each job in the output. `web/answer-book.js` binds a selected property to a scoring field. |
| `Studio.prepare` and `Studio.zip` | Validate the prompt, rubric, and answers. An adapter produces a map of file paths to text, which the workbench writes to a ZIP archive. |

The project JSON stores the original input in `structure.raw`, effective calculation settings in `settings`, task-type options in `kindData`, and framework options in `profileData`. The `grading` object holds the grading mode, rubric, reference fields, and provenance. Scalar tasks retain `expected` and `tolerance`. `AnswerBook.compile` converts these into the shared grading format.

Drafts use browser `localStorage`. The interface language is a local preference independent of project data. Switching languages preserves user-entered text and calculation logs in their original language. A project JSON file can be restored on another machine and contains private answers. The public task inputs include normalized coordinates in `structure.xyz`, the original file under `source/`, and original and effective settings in `calculation.json`. Solvers should use the effective `settings`. Running the original file directly uses its original route.

## Structure parsing and reference answers

The input reader accepts UTF-8 text. For Gaussian inputs, it reads explicit Cartesian coordinates and the route section of the first job step, including the method, basis set, solvent model, charge, and spin multiplicity. It converts bohr coordinates to Å. The original file retains subsequent Link1 steps and additional sections such as Gen/GenECP basis and pseudopotential definitions. The XYZ reader accepts one frame, including extended XYZ with a `Properties` declaration. Supply missing calculation settings in the form. For a trajectory, extract the intended frame before import.

`ChemResults.parse(filename, text)` identifies Gaussian or ORCA from signatures in the output and returns `{program, jobs}`. Each job records its termination and optimization status, available properties, and warnings. Electronic energies are in Eh, vibrational wavenumbers in cm⁻¹, and coordinates in Å. Electronic and thermochemical quantities appear separately. Use temperature labels to select among temperature-dependent values. ORCA keeps its printed mode numbers. Gaussian modes are numbered from 1 in output order. Negative frequencies retain their sign.

| When binding an answer | Checks and provenance |
| --- | --- |
| Choosing a job and unit | Select a normally terminated job and match the field type and unit. If a combined ORCA file reports termination only at the end, use the earlier subjob’s complete individual log to bind its results. |
| Importing a geometry | Atom count and element order must match. An optimization task requires explicit convergence in the selected log step. The author can also supply a verified reference XYZ. |
| Tracking changes | The workbench records the filename, program, job, property, unit, and one-based source line. Replacing the input structure clears previous answer bindings and their provenance. |

Provenance is exported with the private answers. Public attachments go to solvers verbatim. Export checks catch attachments with the same filename as a bound reference. Authors should also review renamed attachments and the original structure file. For a reproducible import, pair `examples/water-seed.xyz` with `examples/orca-water.out`, a synthetic output fixture.

## Grading and framework exports

`web/rubrics.js` provides both the browser-side validator and the Python grader used by the exports. A v1 rubric contains 1–64 criteria. Each specifies a unique field identifier, metric, unit, nonnegative tolerance, and positive weight. A criterion earns its full weight when its error is at or below tolerance. Missing fields, invalid values, and errors above tolerance earn zero for that criterion. The normalized score is earned weight divided by total weight.

The scalar preset uses absolute error. Custom rules can use relative error, dividing the absolute error by the absolute reference value. A zero reference requires an exact zero prediction. The geometry preset uses an equally weighted, all-atom RMSD with a default tolerance of 0.10 Å. It pairs atoms in input order, translates their geometric centers to the origin, and uses a quaternion to find the best proper rotation. This preserves mirror-image differences. Submit `answer.xyz` for a single RMSD criterion. All other tasks use `answer.json`. In a mixed task, the geometry field is an array of objects with `element,x,y,z` keys.

| Export target | Submission and score |
| --- | --- |
| ASI-Bench Chemistry | Submit under `results/`. The default maximum is 100 points. Criterion details go into `ScoreDetail.details`. |
| MDArena | Submit under `/app/outputs/` and supply `/app/final_answer.txt`. Reward Kit handles weighted correctness criteria. The process judge scores the trajectory separately. |
| Terminal-Bench-Science | Submit under `/app/outputs/`. The reward is 1 if every criterion passes and 0 otherwise. `metrics.json` retains the weighted score and details. |
| Harbor Adapters and Harbor-Index | The local candidate reads `/app/outputs/` and reports the normalized weighted reward directly. Official inclusion requires the upstream review process. |

For example, with weights of 2 for energy and 3 for geometry, a submission that passes geometry alone has `score` 0.6 and `passed` false in the standalone report. The default ASI score is 60, while Terminal-Bench-Science reports a reward of 0.

## Extension points and release verification

**Add a task type.** Use the task-type import control (导入类型定义) to load `examples/bond-distance.task-type.json`. The `id` and `name` identify the type, `instructions` defines the prompt, and `fields` describes public parameters. Supported field types are text, textarea, number, and select. A select field requires options. For automatically computed answers, see the built-in bond-length task in `web/measurement.js`. An independent Harbor reference solution can implement Python’s `solve(inputs)`, read the inputs directory, and return a dictionary keyed by scoring field.

**Add a grading rule.** An AI can produce rule JSON using `docs/Grading-Rules.md`. After import, the author binds private reference values to the fields. A new metric requires updates to `Rubrics.validate`, reference-value validation, the Python error function, and the metric description in the generated prompt. Test a passing answer, a failing answer, and a missing field. Additional fields and new weights can reuse the existing metrics.

Run the following command inside a task-specific grading kit. Standard output contains each criterion’s error, weight, and pass status. Exit code 0 means all criteria passed, 1 means grading completed with at least one failure, and 2 indicates an invalid invocation or reference configuration.

```sh
python grade.py submission.json private-reference.json > score.json
```

Run the tests and builds from the source root with Node.js and Python 3.11+. A full Windows build uses the .NET Framework C# compiler. To build the macOS package on macOS or Linux, change the target to `mac`.

```sh
node --test tests/*.test.cjs
python tools/build.py --target all
node tools/build-grader.cjs
```

The documented release passed 38 automated tests and Windows checks for the offline interface and launcher. The macOS package structure, launcher permissions, and bundled page were verified. Launch on a Mac, a full Harbor container run, and live MDArena process judging remain unverified.
