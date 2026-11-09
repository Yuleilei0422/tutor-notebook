(() => {
  "use strict";
  const statuses = Object.freeze({pending:"待出題", prepared:"已出好", sent:"已回傳", exempt:"免出作業"});
  const empty = () => ({version:1,students:[],lessons:[]});
  const fail = () => { throw new Error("備份或紀錄格式不正確。"); };
  function value(x, max, required=false) {
    if(typeof x!=="string" || x.length>max || (required&&!x.trim())) fail();
    return x.trim();
  }
  function day(x, required=true) {
    if(!required && x==="") return x;
    if(typeof x!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) fail();
    const t=new Date(x+"T00:00:00Z");
    if(!Number.isFinite(+t)||t.toISOString().slice(0,10)!==x) fail();
    return x;
  }
  function validate(data) {
    if(!data || data.version!==1 || !Array.isArray(data.students) || !Array.isArray(data.lessons) || data.students.length>2000 || data.lessons.length>20000) fail();
    const ids=new Set();
    const students=data.students.map(s=>{
      if(!s || typeof s.archived!=="boolean") fail();
      const id=value(s.id,100,true);
      if(ids.has(id)) fail();
      ids.add(id);
      return {id,name:value(s.name,70,true),course:value(s.course,100),archived:s.archived};
    });
    const rowIds=new Set();
    const lessons=data.lessons.map(r=>{
      if(!r || !ids.has(r.studentId) || !Object.hasOwn(statuses,r.status)) fail();
      const id=value(r.id,100,true);
      if(rowIds.has(id)) fail();
      rowIds.add(id);
      return {id,studentId:r.studentId,date:day(r.date),progress:value(r.progress,400,true),homework:value(r.homework,2800,["prepared","sent"].includes(r.status)),
        type:value(r.type,140),due:day(r.due,false),status:r.status,parentNote:value(r.parentNote,1000),privateNote:value(r.privateNote,1800)};
    });
    return {version:1,students,lessons};
  }
  function lessonsFor(data,id) {
    return data.lessons.filter(r=>r.studentId===id).sort((a,b)=>b.date.localeCompare(a.date));
  }
  function parentSheet(s,r) {
    if(s.id!==r.studentId || !r.homework.trim() || r.status==="exempt") throw new Error("請先填寫這堂課的作業。");
    const fields={title:`${s.name}｜${r.progress}｜${r.date}`,name:s.name,course:s.course,date:r.date,progress:r.progress,homework:r.homework,due:r.due,note:r.parentNote};
    const text=[`${fields.title}`,"【家教作業單】",fields.course&&`課程：${fields.course}`,`上課進度：${fields.progress}`,`本次作業：\n${fields.homework}`,fields.due&&`完成期限：${fields.due}`,fields.note&&`給家長的提醒：${fields.note}`].filter(Boolean).join("\n\n");
    return {...fields,text};
  }
  function merge(current,incoming) {
    current=validate(current);incoming=validate(incoming);
    const fresh=(list,added)=>{ const seen=new Set(list.map(r=>r.id));return [...list,...added.filter(r=>!seen.has(r.id))]; };
    return validate({version:1,students:fresh(current.students,incoming.students),lessons:fresh(current.lessons,incoming.lessons)});
  }
  globalThis.TutorCore=Object.freeze({empty,validate,lessonsFor,parentSheet,merge,statuses});
})();
