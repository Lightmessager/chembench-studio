(function installRubrics() {
  'use strict';

  const elements = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og';
  const symbols = new Set(elements.split(' '));
  const ruleKeys = ['version','id','name','criteria'];
  const fieldKeys = ['field','label','metric','unit','tolerance','weight'];

  function record(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
  }
  function requireKeys(obj, keys, where) {
    if (!record(obj) || Object.keys(obj).length !== keys.length || !keys.every(k => Object.hasOwn(obj,k))) {
      throw Error(where + '需要且仅接受这些字段：' + keys.join('、'));
    }
  }
  function name(value, label, allowEmpty=false) {
    if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || /[\x00-\x1f\x7f]/.test(value)) throw Error(label+'需要单行文本。');
    return value.trim();
  }
  function validate(raw) {
    const rule = typeof raw === 'string' ? JSON.parse(raw.replace(/^\uFEFF/,'')) : raw;
    requireKeys(rule,ruleKeys,'评分标准');
    if (rule.version !== 1) throw Error('请选择 version 为 1 的评分标准。');
    if (typeof rule.id!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(rule.id)) throw Error('评分标准 id 需要英文标识符。');
    const ruleName = name(rule.name,'评分标准名称');
    if (!Array.isArray(rule.criteria) || !rule.criteria.length || rule.criteria.length>64) throw Error('请提供 1 到 64 个评分项。');
    const seen = new Set();
    const criteria = rule.criteria.map(c => {
      requireKeys(c,fieldKeys,'每个评分项');
      if (typeof c.field!=='string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(c.field) || c.field in Object.prototype || seen.has(c.field)) throw Error('评分字段须为互不重复的英文标识符。');
      if (!['absolute','relative','rmsd'].includes(c.metric)) throw Error('未知评分度量：'+String(c.metric));
      if (!Number.isFinite(c.tolerance) || c.tolerance<0 || !Number.isFinite(c.weight) || c.weight<=0) throw Error('评分容差须为非负有限数，权重须为正有限数。');
      const label = name(c.label,'评分项名称'), unit = name(c.unit,'单位',true);
      if (c.metric==='rmsd' && unit!=='Å') throw Error('构型 RMSD 的坐标和阈值单位须为 Å。');
      seen.add(c.field);
      return {field:c.field,label,metric:c.metric,unit,tolerance:c.tolerance,weight:c.weight};
    });
    if (!Number.isFinite(criteria.reduce((sum,c)=>sum+c.weight,0))) throw Error('评分项总权重超出数值范围。');
    return {version:1,id:rule.id,name:ruleName,criteria};
  }

  function scalar(tolerance=0, unit='') {
    const tol = typeof tolerance==='string' && tolerance.trim() ? Number(tolerance) : tolerance;
    return validate({version:1,id:'scalar',name:'数值 · 绝对误差',criteria:[
      {field:'value',label:'数值答案',metric:'absolute',unit,tolerance:tol,weight:1}
    ]});
  }
  function geometry() {
    return validate({version:1,id:'geometry',name:'构型 · 对齐 RMSD',criteria:[
      {field:'geometry',label:'优化构型',metric:'rmsd',unit:'Å',tolerance:0.1,weight:1}
    ]});
  }
  function validateAnswers(rubric, answers) {
    const rule = validate(rubric);
    if (!record(answers)) throw Error('参考答案须为字段和值组成的对象。');
    const result = {};
    for (const c of rule.criteria) {
      if (!Object.hasOwn(answers,c.field)) throw Error('请填写参考答案：'+c.label);
      const value = answers[c.field];
      if (c.metric==='rmsd') {
        if (!Array.isArray(value) || !value.length) throw Error(c.label+'需要非空原子坐标表。');
        result[c.field] = value.map((a,i)=>{
          if (!record(a) || !symbols.has(a.element) || ![a.x,a.y,a.z].every(Number.isFinite)) throw Error(c.label+'第 '+(i+1)+' 个原子的元素或坐标无效。');
          return {element:a.element,x:a.x,y:a.y,z:a.z};
        });
      } else {
        if (!Number.isFinite(value)) throw Error(c.label+'需要有限参考数值。');
        result[c.field]=value;
      }
    }
    return result;
  }

  const pythonSource = String.raw`"""Chembench portable rubric v1. Uses only Python's standard library."""
# MIT License
# Copyright (c) 2026 Lightmessager
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
import argparse
import json
import math
from pathlib import Path
import re
import sys


ELEMENTS = "__ELEMENTS__".split()


def finite(v):
    try:
        return type(v) in (int, float) and math.isfinite(v)
    except OverflowError:
        return False


def coordinates(atoms):
    if not isinstance(atoms, list) or not atoms:
        raise ValueError("Expected a non-empty atom list")
    points = []
    for a in atoms:
        if not isinstance(a, dict) or a.get("element") not in ELEMENTS:
            raise ValueError("Invalid element symbol")
        point = tuple(a.get(k) for k in ("x", "y", "z"))
        if not all(finite(v) for v in point):
            raise ValueError("Expected finite coordinates")
        points.append(point)
    return points


def center(points):
    # Shift the origin near the structure before accumulating the mean.
    origin = points[0]
    shifted = [tuple(x - o for x, o in zip(p, origin)) for p in points]
    mean = tuple(math.fsum(p[j] / len(points) for p in shifted) for j in range(3))
    return [tuple(x - m for x, m in zip(p, mean)) for p in shifted]


def largest_eigenvector(matrix):
    """Jacobi diagonalization of a real symmetric 4 by 4 matrix."""
    vectors = [[float(i == j) for j in range(4)] for i in range(4)]
    scale = max(abs(x) for row in matrix for x in row)
    for _ in range(100):
        p, q = max(((i, j) for i in range(4) for j in range(i+1, 4)),
                   key=lambda ij: abs(matrix[ij[0]][ij[1]]))
        off = matrix[p][q]
        if abs(off) <= scale * 1e-16:
            break
        angle = 0.5 * math.atan2(2*off, matrix[q][q] - matrix[p][p])
        c, s = math.cos(angle), math.sin(angle)
        a, b = matrix[p][p], matrix[q][q]
        matrix[p][p] = c*c*a - 2*c*s*off + s*s*b
        matrix[q][q] = s*s*a + 2*c*s*off + c*c*b
        matrix[p][q] = matrix[q][p] = 0.0
        for i in range(4):
            if i != p and i != q:
                a, b = matrix[i][p], matrix[i][q]
                matrix[i][p] = matrix[p][i] = c*a - s*b
                matrix[i][q] = matrix[q][i] = s*a + c*b
            a, b = vectors[i][p], vectors[i][q]
            vectors[i][p], vectors[i][q] = c*a - s*b, s*a + c*b
    index = max(range(4), key=lambda j: matrix[j][j])
    return [row[index] for row in vectors]


def aligned_rmsd(pred, target):
    left, right = coordinates(pred), coordinates(target)
    if [a["element"] for a in pred] != [a["element"] for a in target]:
        raise ValueError("Atom count or ordered element list differs")
    left, right = center(left), center(right)
    scale = max(max(abs(x) for p in points for x in p) for points in (left, right))
    if scale == 0:
        return 0.0
    left = [tuple(x/scale for x in p) for p in left]
    right = [tuple(x/scale for x in p) for p in right]
    # Horn's symmetric quaternion matrix maximizes <R*left, right> over SO(3).
    cov = [[math.fsum(a[i]*b[j] for a,b in zip(left,right)) for j in range(3)] for i in range(3)]
    (xx,xy,xz),(yx,yy,yz),(zx,zy,zz) = cov
    w,x,y,z = largest_eigenvector([
        [xx+yy+zz,yz-zy,zx-xz,xy-yx],
        [yz-zy,xx-yy-zz,xy+yx,zx+xz],
        [zx-xz,xy+yx,yy-xx-zz,yz+zy],
        [xy-yx,zx+xz,yz+zy,zz-xx-yy]])
    norm = math.sqrt(w*w+x*x+y*y+z*z)
    w,x,y,z = (v/norm for v in (w,x,y,z))
    rotation = [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
                [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
                [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]]
    def squared_distance(a,b):
        return sum((sum(r*v for r,v in zip(row,a))-t)**2 for row,t in zip(rotation,b))
    return scale * math.sqrt(math.fsum(squared_distance(a,b) for a,b in zip(left,right)) / len(left))


def read_xyz(text):
    lines = text.strip().splitlines()
    if len(lines)<3 or not lines[0].strip().isascii() or not lines[0].strip().isdigit() or int(lines[0])!=len(lines)-2:
        raise ValueError("Expected one XYZ frame including its comment line")
    atoms = []
    for line in lines[2:]:
        cells = line.split()
        if len(cells)!=4:
            raise ValueError("Expected element, x, y and z")
        x,y,z = [float(v.replace("D","E").replace("d","e")) for v in cells[1:]]
        atoms.append(dict(element=cells[0],x=x,y=y,z=z))
    return atoms


def deviation(criterion, predicted, expected):
    metric = criterion["metric"]
    if metric == "rmsd":
        return aligned_rmsd(predicted, expected)
    if not finite(predicted) or not finite(expected):
        raise ValueError("Expected a finite JSON number")
    if metric == "absolute":
        return abs(predicted - expected)
    if metric == "relative":
        if expected == 0:
            if predicted == 0:
                return 0.0
            raise ValueError("A zero reference requires an exact zero prediction")
        delta = abs(predicted - expected)
        return delta / abs(expected) if finite(delta) else abs(predicted / expected - 1)
    raise ValueError("Unknown metric")


def read_json(text):
    def reject_constant(token):
        raise ValueError("Non-JSON number: " + token)
    def unique_fields(pairs):
        obj = {}
        for field, value in pairs:
            if field in obj:
                raise ValueError("Duplicate JSON field")
            obj[field] = value
        return obj
    return json.loads(text, parse_constant=reject_constant, object_pairs_hook=unique_fields)


def validate_reference(key):
    rule, answers = key["rubric"], key["answers"]
    if not isinstance(answers, dict) or not isinstance(rule, dict) or set(rule) != {"version","id","name","criteria"}:
        raise ValueError("Expected a v1 rubric and an answers object")
    if type(rule["version"]) is not int or rule["version"] != 1 or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", rule["id"]):
        raise ValueError("Invalid rubric version or id")
    if not isinstance(rule["name"], str) or not rule["name"].strip():
        raise ValueError("Invalid rubric name")
    criteria = rule["criteria"]
    if not isinstance(criteria,list) or not 1<=len(criteria)<=64:
        raise ValueError("Expected 1 to 64 grading criteria")
    seen = set()
    reserved = {"constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"}
    for c in criteria:
        if not isinstance(c,dict) or set(c)!={"field","label","metric","unit","tolerance","weight"}:
            raise ValueError("Unexpected criterion fields")
        field = c["field"]
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}",field) or field in seen or field in reserved or field not in answers:
            raise ValueError("Invalid field identifier, duplicate criterion or missing reference answer")
        seen.add(field)
        if not isinstance(c["label"],str) or not c["label"].strip() or not isinstance(c["unit"],str):
            raise ValueError("Invalid criterion label or unit")
        if not finite(c["tolerance"]) or c["tolerance"]<0 or not finite(c["weight"]) or c["weight"]<=0:
            raise ValueError("Invalid tolerance or weight")
        if c["metric"] == "rmsd" and c["unit"] == "Å":
            coordinates(answers[field])
        elif c["metric"] not in ("absolute","relative") or not finite(answers[field]):
            raise ValueError("Invalid metric, unit or reference value")
    if not finite(math.fsum(c["weight"] for c in criteria)):
        raise ValueError("Total weight exceeds finite numeric range")
    return criteria, answers


def grade_submission(output, key):
    criteria, answers = validate_reference(key)
    path = Path(output)
    problem = None
    try:
        content = path.read_text(encoding="utf-8-sig")
        if path.suffix.lower() == ".xyz" and len(criteria)==1 and criteria[0]["metric"]=="rmsd":
            submitted = {criteria[0]["field"]:read_xyz(content)}
        else:
            submitted = read_json(content)
        if not isinstance(submitted, dict):
            raise ValueError("Expected a JSON object")
    except (ValueError, TypeError, OSError, RecursionError) as exc:
        submitted, problem = {}, "Invalid or unavailable submission: " + type(exc).__name__
    rows = []
    for c in criteria:
        field = c["field"]
        row = {**c, "earned_weight":0,"passed":False,"error":None}
        try:
            if problem or field not in submitted:
                raise ValueError(problem or "Missing field")
            error = deviation(c, submitted[field], answers[field])
            if not finite(error):
                raise ValueError("Error exceeds the finite numeric range")
            row.update(error=error, passed=error<=c["tolerance"])
            if row["passed"]:
                row["earned_weight"] = c["weight"]
        except (ValueError, TypeError, OverflowError, RecursionError) as exc:
            row["reason"] = str(exc)
        rows.append(row)
    total = math.fsum(r["weight"] for r in rows)
    score = math.fsum(r["weight"] for r in rows if r["passed"]) / total
    return {"score":score,"passed":all(r["passed"] for r in rows),"criteria":rows}


def grade_files(output, reference):
    """Use the rules and answers fixed in the framework's private reference."""
    key = read_json(Path(reference).read_text(encoding="utf-8-sig"))
    return grade_submission(output, key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rubric", type=Path, help="Local author mode: import a separate rubric JSON")
    parser.add_argument("submission", type=Path)
    parser.add_argument("reference", type=Path, help="Private reference or the answers map when --rubric is supplied")
    args = parser.parse_args()
    try:
        if args.rubric is None:
            result = grade_files(args.submission, args.reference)
        else:
            rubric = read_json(args.rubric.read_text(encoding="utf-8-sig"))
            answers = read_json(args.reference.read_text(encoding="utf-8-sig"))
            result = grade_submission(args.submission, {"rubric":rubric,"answers":answers})
    except (KeyError, ValueError, TypeError, OSError, OverflowError, RecursionError) as exc:
        print("Invalid reference: " + str(exc), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=True, allow_nan=False))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
`.replace('__ELEMENTS__',elements);

  globalThis.Rubrics = Object.freeze({validate,scalar,geometry,validateAnswers,pythonSource,
    standaloneSource:()=> '('+installRubrics.toString()+')();'});
})();
