const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../web/results.js');

const parse = text => ChemResults.parse('reference.txt', text);
const sample = filename => fs.readFileSync(path.join(__dirname,'../examples',filename),'utf8');
const prop = (job, id) => job.properties.find(p => p.id === id);

test('Gaussian excerpt yields distinct total energies, geometry, signed frequency and source line', () => {
  const text = sample('gaussian-water.log').replace('1606.2500', '-1606.2500');
  const {program,jobs:[job]} = parse('\ufeff' + text.replace(/\r?\n/g,'\r\n'));
  assert.equal(program,'Gaussian');
  assert.ok(job.complete);
  assert.equal(job.optimization,'converged');
  assert.equal(prop(job,'scf-energy').value,-76.4012345678);
  assert.deepEqual(prop(job,'geometry').value.map(a=>a.element),['O','H','H']);
  assert.deepEqual(prop(job,'geometry').value[2],{element:'H',x:0,y:-0.758,z:-0.470});
  assert.equal(prop(job,'frequency-1').value,-1606.25);
  assert.equal(prop(job,'frequency-1').unit,'cm⁻¹');
  assert.equal(prop(job,'gibbs-energy').value,-76.398100);
  assert.equal(prop(job,'zero-point-correction').value,0.020797);
  assert.match(text.split(/\r?\n/)[prop(job,'enthalpy').line-1],/thermal Enthalpies/);
});

test('Gaussian Link1 jobs keep final energies and thermochemistry on their own steps', () => {
  const text = ['Entering Gaussian System','SCF Done:  E(RHF) = -70.0 A.U.',
    'SCF Done:  E(RHF) = -7.61230000D+01 A.U.', 'E2 = -0.2D+00 EUMP2 = -7.63230000D+01',
    'CCSD(T)= -7.643000000D+01', 'Normal termination of Gaussian 16.', 'Link1: Proceeding to internal job step number 2.',
    'SCF Done:  E(RHF) = -75.5 A.U.', 'Frequencies --  -122.3 500.2 900.7', 'Error termination via Lnk1e'].join('\n');
  const {jobs} = parse(text);
  assert.equal(jobs.length,2);
  assert.equal(prop(jobs[0],'scf-energy').value,-76.123);
  assert.equal(prop(jobs[0],'mp2-energy').value,-76.323);
  assert.equal(prop(jobs[0],'ccsd-t-energy').value,-76.43);
  assert.ok(!prop(jobs[0],'frequency-1'));
  assert.equal(jobs[0].complete,true);
  assert.equal(jobs[1].complete,false);
  assert.equal(jobs[1].termination,'failed');
  assert.equal(prop(jobs[1],'frequency-1').value,-122.3);
  assert.ok(!prop(jobs[1],'mp2-energy'));
});

test('ORCA keeps Å structure, zero modes, negative frequencies, and temperature-specific totals', () => {
  const text = sample('orca-water.out').replace('1608.26','-78.40').replace('****ORCA TERMINATED NORMALLY****',
    'THERMOCHEMISTRY AT 350.00K\n Final Gibbs free energy ... -76.5000 Eh\n ****ORCA TERMINATED NORMALLY****');
  const {program,jobs:[job]} = parse(text);
  assert.equal(program,'ORCA');
  assert.ok(job.complete);
  assert.equal(job.optimization,'converged');
  assert.equal(prop(job,'final-energy').value,-76.4103456789);
  assert.deepEqual(prop(job,'geometry').value[1],{element:'H',x:0,y:0.757,z:-0.47});
  assert.equal(prop(job,'frequency-0').value,0);
  assert.match(prop(job,'frequency-0').label,/零模/);
  assert.equal(prop(job,'frequency-6').value,-78.4);
  assert.equal(prop(job,'gibbs-energy@298.15 K').value,-76.407275);
  assert.equal(prop(job,'gibbs-energy@350.00 K').value,-76.5);
});

test('a normally terminated job with failed optimization or SCF is ineligible', () => {
  for (const line of ['The optimization did not converge but reached the maximum number of cycles.',
                      'WARNING: SCF NOT FULLY CONVERGED']) {
    const {jobs:[job]} = parse('FINAL SINGLE POINT ENERGY  -10.0\n'+line+'\n****ORCA TERMINATED NORMALLY****');
    assert.equal(job.termination,'normal');
    assert.equal(job.complete,false);
    assert.ok(job.warnings.length);
  }
  const {jobs:[job]} = parse(sample('gaussian-water.log').replace('Optimization completed.',''));
  assert.equal(job.optimization,'unknown');
  assert.equal(job.complete,false);
});

test('truncated or malformed tables cannot turn a previous structure into a final reference', () => {
  const text = sample('orca-water.out').replace('****ORCA TERMINATED NORMALLY****',
    'CARTESIAN COORDINATES (ANGSTROEM)\n---------------------------------\nO   0.000 0.000 0.000\n\n****ORCA TERMINATED NORMALLY****');
  const {jobs:[job]} = parse(text);
  assert.equal(job.complete,false);
  assert.equal(prop(job,'geometry').value.length,3);
  assert.match(job.warnings.join('\n'),/最后一张/);
  const truncated = parse(sample('gaussian-water.log').split('Normal termination')[0]).jobs[0];
  assert.equal(truncated.complete,false);
  assert.equal(truncated.termination,'incomplete');
});

test('concatenated and compound outputs retain boundaries and source numbering', () => {
  const result = parse('FINAL SINGLE POINT ENERGY -1.5\n$$$$ JOB NUMBER 2 $$$$\nFINAL SINGLE POINT ENERGY -2\n****ORCA TERMINATED NORMALLY****\nTotal run time: 2.0');
  assert.equal(result.jobs.length,2);
  assert.equal(result.jobs[0].complete,false);
  assert.equal(prop(result.jobs[0],'final-energy').value,-1.5);
  assert.equal(result.jobs[1].complete,true);
  assert.equal(prop(result.jobs[1],'final-energy').line,3);
  assert.throws(()=>parse('nothing to import'),/未识别/);
  assert.throws(()=>parse(sample('orca-water.out')+sample('gaussian-water.log')),/混合/);
});
