// Build the standalone author-side rubric importer from the same code as the UI.
const fs=require("node:fs/promises");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
for(const module of ["rubrics","results","measurement","core"])require(path.join(root,"web",module+".js"));
async function main(){
  const read=name=>fs.readFile(path.join(root,name),"utf8");
  const guide=async name=>(await read("docs/"+name)).replaceAll("../examples/","../rules/");
  const example=await read("examples/orca-water.out");
  const job=ChemResults.parse("orca-water.out",example).jobs[0];
  if(!job.complete)throw Error("The sample reference log did not complete.");
  const answers={energy:job.properties.find(p=>p.id==="final-energy").value,geometry:job.properties.find(p=>p.id==="geometry").value};
  const rubric=Rubrics.validate(await read("examples/energy-geometry.rubric.json"));
  Rubrics.validateAnswers(rubric,answers);
  const format=data=>JSON.stringify(data,null,2)+"\n";
  const prediction={energy:answers.energy+1,geometry:answers.geometry.map(a=>({...a,x:2-a.y,y:a.x+3,z:a.z-1}))};
  const files={
    "LICENSE":await read("LICENSE"),
    "grade.py":Rubrics.pythonSource,
    "rules/energy-geometry.rubric.json":format(rubric),
    "rules/scalar-energy.rubric.json":await read("examples/scalar-energy.rubric.json"),
    "rules/geometry-rmsd.rubric.json":await read("examples/geometry-rmsd.rubric.json"),
    "examples/answers.json":format(answers),"examples/submission.json":format(prediction),
    "docs/Grading-Rules.md":await guide("Grading-Rules.md"),
    "docs/rubrics.md":await guide("rubrics.md"),
    "README.md":[
      "# Chembench portable grader",
      "Extract this archive and run the following command with Python 3.11 or later. The grader uses the standard library.",
      "    python grade.py --rubric rules/energy-geometry.rubric.json examples/submission.json examples/answers.json",
      "The synthetic example shifts the energy by 1 Eh and rigidly rotates and translates the geometry. Geometry passes and energy fails. The expected score is 0.6.",
      "See [the grading rule guide](docs/Grading-Rules.md) for the schema and an example. Use --rubric to grade with a separate rule file and private answers mapping. For a project's embedded rubric, run python grade.py submission.json private-reference.json. A JSON report goes to standard output. Exit codes are 0 for full credit, 1 for a graded answer with failed criteria, and 2 for an invalid grading configuration or command. Keep reference answers on the evaluator's side.",
      "# Chembench 便携评分工具","解压后使用 Python 3.11+。运行时只使用标准库。",
      "    python grade.py --rubric rules/energy-geometry.rubric.json examples/submission.json examples/answers.json",
      "示例取自用于测试导入器的合成水分子输出。答卷把所有原子共同旋转和平移，并将能量改动了 1 Eh。能量项未通过，构型项通过，总分应为 0.6。",
      "要让 AI 创建新的打分标准，可提供[评分标准规范](docs/rubrics.md)和题目。将生成的 JSON 传给 --rubric，最后一个参数提供由出题人独立保存的答案字段映射。评分结果写到标准输出，可重定向到 score.json。",
      "带有内嵌规则的私有参考文件也可直接使用：python grade.py submission.json private-reference.json。退出码 0 代表全部通过，1 代表批改成功且有未过项，2 代表私有评分配置或参数有误。"
    ].join("\n\n")+"\n"
  };
  const dir=path.join(root,"release");await fs.mkdir(dir,{recursive:true});
  const target=path.join(dir,"Chembench-Grader.zip");
  await fs.writeFile(target,Buffer.from(await Studio.zip(files).arrayBuffer()));console.log(target);
}
main().catch(e=>{console.error(e);process.exitCode=1});
