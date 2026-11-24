# Importing Grading Rules and Scoring Submissions

[简体中文](rubrics.md)

A grading rule, or rubric, declares submission fields, units, tolerances and weights. The task author supplies the actual reference values in a separate private answer key. You can reuse one rule for several molecules or give its format to an AI to draft a new rule.

## Built-in presets

| Preset | Use | Submission |
| --- | --- | --- |
| Scalar with absolute tolerance | Counts, multiple-choice option numbers, energies, frequencies and individual geometric measurements | Submit a JSON object with a numeric `value` field. Use the task's absolute tolerance. A count can require exact equality. |
| Geometry with aligned RMSD | The complete optimized molecular structure | Submit a single-frame XYZ, preserving input atom order, with coordinates in Å. The default maximum RMSD is 0.10 Å. |

All three example files can be imported directly. The sample energy tolerance of 0.0001 Eh is specific to the example. Choose a tolerance consistent with the computational method, numerical precision and intended task. [Scalar rule](../examples/scalar-energy.rubric.json) · [Geometry rule](../examples/geometry-rmsd.rubric.json) · [Combined energy and geometry rule](../examples/energy-geometry.rubric.json)

## Authoring a rule with an AI

Send your question and the following instructions to the AI. Save its reply as UTF-8 `*.rubric.json` and load it with **Import rule JSON** in **Task setup**.

> Create a Chembench Studio v1 grading rule for my task. Return one JSON object. The top-level fields are version (integer 1), id (an ASCII identifier beginning with a letter), name and criteria. Each criterion has field, label, metric, unit, tolerance and weight. Use a unique field identifier beginning with a letter, followed by letters, digits or underscores. Choose absolute, relative or rmsd as metric. Give the units required of the submission, using an empty string for dimensionless quantities and Å for rmsd. Use a finite nonnegative tolerance and a finite positive weight. Each criterion must evaluate an explicit deliverable in the task. The task author supplies reference answers and calculation outputs separately.

This example gives the energy 2 shares and the geometry 3 shares. Passing just the energy criterion earns 0.4, passing just the geometry earns 0.6, and passing both earns 1.

```json
{
  "version": 1,
  "id": "energy-and-geometry",
  "name": "Optimization results · energy and geometry",
  "criteria": [
    {"field":"energy","label":"Final electronic energy","metric":"absolute","unit":"Eh","tolerance":0.0001,"weight":2},
    {"field":"geometry","label":"Optimized geometry","metric":"rmsd","unit":"Å","tolerance":0.1,"weight":3}
  ]
}
```

### How grading works

- **Absolute error.** `absolute` takes the absolute difference between the prediction and the reference. The error and tolerance use the submitted quantity's unit.
- **Relative error.** `relative` divides the absolute difference by the absolute reference. The field's unit describes the submitted value. Both error and tolerance are fractions, so 0.02 means 2%. A zero reference requires an exactly zero prediction. Absolute error is usually a better choice near zero.
- **Aligned RMSD.** `rmsd` pairs atoms by position in the input sequence, checks their elements, and gives them equal weights. The grader centers each coordinate set and finds the proper three-dimensional rotation that minimizes the mean squared distance between matching atoms. The result is the square root of that mean, in Å. The implementation uses the Python standard library and handles single atoms, linear and planar configurations, and general geometries. Reflections, rescaling and permutation of equivalent atoms are outside the alignment model. Allow for numerical roundoff when setting the tolerance. [Horn's unit-quaternion alignment method](https://opg.optica.org/josaa/abstract.cfm?uri=josaa-4-4-629)
- **Partial credit.** Error equal to the tolerance passes. A passing criterion earns its full weight. An exceeded threshold, missing field or incorrect field type earns zero for that criterion. The overall score is the sum of earned weights divided by all weights. An invalid submission file scores zero.
- **Submission format.** For a mixed task, submit `answer.json` with JSON numbers for scalar fields and an array of objects with `element`, `x`, `y`, `z` for a geometry. Use the units in the prompt. A single RMSD task uses one frame in `answer.xyz`. Follow the file path printed in the exported prompt.

## Standalone grading

Download the task's independent grading kit, or take `grade.py` and the private reference file from the task package. The following commands use `private-reference.json` as the reference filename. Pass the submission first and the reference second.

```sh
python grade.py submission.json private-reference.json
python grade.py submission.xyz private-reference.json
```

The reference object contains `rubric` and `answers`. Each rubric field requires its own reference value. A geometry uses the same atom-object array described above. The grader emits one JSON report. It returns exit code 0 if every criterion passed, 1 if it finished grading with one or more failed criteria, and 2 for a command or reference configuration error. To handle partial credit in automation, read `score` and `criteria` from the report.

| Report field | Meaning |
| --- | --- |
| `score`, `passed` | Normalized score and whether all criteria passed. |
| `criteria[].field`, `label`, `metric`, `unit`, `tolerance` | The criterion identifier, display name, metric, submitted unit and threshold. |
| `weight`, `earned_weight`, `error`, `passed` inside a criterion | Assigned weight, awarded weight, measured error and pass/fail. A `reason` explains issues such as a missing field. |

For local trials, you can pass independent rule and answer files. Here `rule.json` contains the rubric, `answers.json` contains a field-to-reference mapping (such as `energy` and `geometry`), and `submission.json` is the solver's response. Change the first file to try different rules on the same answer. Each framework's verifier uses its own packaged rule.

```sh
python grade.py --rubric rule.json submission.json answers.json
```

## Framework scores after export

| Target | Submission directory | Reported score |
| --- | --- | --- |
| ASI-Bench | `results/` | The custom scorer multiplies the normalized score by its assigned points. The default maximum is 100. |
| MDArena | `/app/outputs/` | Native correctness criteria use the rubric weights. MDArena has a separate process judge. |
| Terminal-Bench-Science | `/app/outputs/` | Binary reward is 1 only if every criterion passes. The verifier saves weighted partial credit and per-criterion diagnostics in `metrics.json` and emits a CTRF report. |
| Harbor-Index local candidate | `/app/outputs/` | The verifier writes the normalized reward and criterion details. Official inclusion and parity experiments use the upstream process. |

Each target expects the submission filename stated in its prompt. To grade an additional quantity using one of the existing metrics, add a rubric field. Spectrum matching, trajectory distributions and graph-based matching of equivalent atoms each need an appropriate metric implementation.
