# Using Calculation Outputs as Reference Answers

[简体中文](results.md)

In **Task setup**, open **Read calculation output**, select a Gaussian or ORCA text file, and choose the calculation step and property you need. Verify the value, unit and source line before saving it as a reference answer. For geometry, the workbench checks the number of atoms and the order of their elements against the seed structure.

To practice, use [water-seed.xyz](../examples/water-seed.xyz) with the [Gaussian](../examples/gaussian-water.log) or [ORCA](../examples/orca-water.out) output. Both sample logs are synthetic excerpts created to demonstrate the import formats.

## Supported quantities

| Quantity | Unit | Reading convention |
| --- | --- | --- |
| Electronic energy | Eh | For Gaussian, the parser records the last SCF energy in the step and separately lists recognized MP2, MP3, E(Corr) and CCSD(T) total energies. For ORCA, it records the last final single-point energy in the step. A Solute-CPCM value is listed separately. |
| Thermochemical quantities | Eh | The parser distinguishes the printed zero-point correction, thermally corrected internal energy, enthalpy and Gibbs free energy. For Gaussian, it can also read the sum of electronic and zero-point energies. Thermochemical totals retain recognized temperature labels, including multiple temperatures within one step. |
| Vibrational frequencies | cm⁻¹ | Gaussian harmonic frequencies are numbered from 1 in output order. ORCA uses the mode numbers printed in its frequency table. Both retain negative frequencies. An exact zero printed for ORCA modes 0–5 is labeled a reported zero mode. Interpreting it requires checking molecular linearity, constraints and calculation settings. |
| Geometry | Å | Gaussian uses the last complete Standard or Input orientation table in Å. ORCA uses the last complete Cartesian table in Å. Both retain the printed atom order. An optimized-geometry task requires confirmed optimization convergence in the selected log section. Use the frequencies when determining whether the result is a minimum or a transition state. |

Lines are numbered from 1 in the original file. A scalar points to the line that prints its value. A geometry points to the header of its coordinate table. The quantities use the definitions of their originating software. [Gaussian thermochemistry](https://gaussian.com/wp-content/uploads/dl/thermo.pdf) · [ORCA thermochemistry](https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/thermochemistry.html) · [ORCA vibrational frequencies](https://www.faccts.de/docs/orca/6.1/tutorials/prop/freq.html)

## Multi-step and compound jobs

The parser recognizes program start markers, Gaussian Link1 boundaries and numbered ORCA subjob headings. It records termination and optimization status for each section independently. Writing a reference requires normal termination for that section. Recognized SCF or geometry optimization failure, or a malformed final coordinate table, prevents importing the reference.

Some concatenated ORCA logs print a single normal-termination marker at the end. Earlier labeled subjobs without their own termination markers appear incomplete. To use such a step, load the separate, complete output for that calculation. Compound scripts, scans and numerical displacements may use custom headings and summaries. For those tasks, locate the specific step and source line in the original output. The importer reads text records and does not reconstruct arbitrary Compound execution histories. [ORCA Compound documentation](https://www.faccts.de/docs/orca/6.1/manual/contents/workflowsautomatization/compound.html)

## Checks against calculation files

- **Gaussian 16 water optimization and frequencies.** The file contains two normally terminated sections. The second yielded three atoms, an SCF energy of −74.9659011806 Eh and frequencies of 2169.7613, 4141.3837 and 4392.5759 cm⁻¹. [Calculation output](https://github.com/cclib/cclib-data/blob/master/Gaussian/Gaussian16/water_neutral_nbo_opt_freq.out)
- **ORCA 5 benzene.** The parser recovered 12 atoms and a final energy of −231.769539246948 Eh. A separate test constructed a concatenated log from two copies of the file. With both termination markers present, both sections were complete. With the first marker removed, the first appeared incomplete and the second complete. [Calculation output](https://github.com/cclib/cclib-data/blob/master/ORCA/ORCA5.0/Benzene_opt_etsyms.log)
