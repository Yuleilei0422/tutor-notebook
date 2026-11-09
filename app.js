(() => {
  "use strict";
  const C=window.TutorCore, $=id=>document.getElementById(id), key="kexu.tutor-notebook.v1";
  const demo=new URLSearchParams(location.search).get("demo")==="1";
  const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const id=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,"0")).join("");
  const el=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  function button(label,cls,fn) {
    const b=el("button",cls,label);b.type="button";b.addEventListener("click",fn);return b;
  }
  function example() {
    const students=[
      {id:"demo1",name:"林小禾",course:"高一數學",archived:false},
      {id:"demo2",name:"周小安",course:"國一數學",archived:false},
      {id:"demo3",name:"許小澄",course:"高職數學 B",archived:false}];
    const base={studentId:"demo1",homework:"講義第 32 頁，第 1～6 題。\n第 5、6 題請寫出完整算式。",type:"計算＋應用",due:"2026-11-16",status:"prepared",parentNote:"先複習今天的例題，再開始作答。",privateNote:"下堂課確認截距的意義。"};
    const lessons=[
      {...base,id:"lesson1",date:"2026-11-09",progress:"直線的斜率與方程式"},
      {...base,id:"lesson2",date:"2026-11-02",progress:"坐標平面與兩點距離",homework:"講義第 24 頁，練習 1～5。",due:"2026-11-09",status:"sent",privateNote:""},
      {...base,id:"lesson3",date:"2026-11-08",studentId:"demo2",progress:"最大公因數與最小公倍數",homework:"",type:"",due:"",status:"pending",privateNote:"",parentNote:""},
      {...base,id:"lesson4",date:"2026-11-07",studentId:"demo3",progress:"二次函數的圖形",homework:"練習 1～4 題",due:"",status:"prepared",privateNote:"",parentNote:""}];
    return C.validate({version:1,students,lessons});
  }
  let data=C.empty(), blocked=false, selected=null, editStudent=null, editLesson=null, lessonOwner=null, sheet=null, toastTimer;
  let cloud=null, session=null, revision=0, saveBusy=false;
  const sessionKey=key+".cloud-session";
  const config=globalThis.TutorCloudConfig;
  if(!demo&&config){
    try{cloud=globalThis.TutorCloud.create(config);$("cloud-open").hidden=false;}
    catch{notify("雲端設定無法使用，仍可使用本機紀錄。");}
  }
  function notify(message) {
    clearTimeout(toastTimer);
    const toast=$("toast");
    toast.textContent=message;toast.hidden=false;toast.showPopover?.();
    toastTimer=setTimeout(()=>{toast.hidePopover?.();toast.hidden=true;},4000);
  }
  function read() {
    if(demo)return example();
    const raw=localStorage.getItem(key);
    return raw===null?C.empty():C.validate(JSON.parse(raw));
  }
  function lock(message) {
    blocked=true;
    $("local-label").textContent="紀錄無法讀取";
    document.body.classList.add("storage-error");
    notify(message);
  }
  try {data=read();}
  catch {lock("無法讀取本機紀錄。原資料已保留，請先確認瀏覽器設定。");}
  if(demo){$("demo-banner").hidden=false;$("local-label").textContent="示範模式";}
  function saveSession(s) {
    try{
      if(s)sessionStorage.setItem(sessionKey,JSON.stringify({url:config.url,session:s}));
      else sessionStorage.removeItem(sessionKey);
    }catch{/* The current tab can continue using its in-memory session. */}
  }
  function setCloudView(s,remote) {
    session=s;revision=remote.revision;data=remote.payload;selected=null;
    $("search").value="";$("filter").value="all";
    $("local-label").textContent="雲端紀錄";
    $("cloud-open").textContent="已登入";
    $("storage-note").textContent="目前顯示雲端紀錄。";
    saveSession(s);render();
  }
  async function commit(next) {
    if(saveBusy)throw new Error("正在儲存或同步，請稍候。");
    if(blocked&&!session)throw new Error("本機紀錄無法讀取，暫停儲存以保護原資料。");
    const checked=C.validate(next);
    saveBusy=true;
    try{
      if(session)revision=await cloud.write(session,revision,checked,saveSession);
      else if(!demo){
        try{localStorage.setItem(key,JSON.stringify(checked));}
        catch{throw new Error("無法儲存，請檢查瀏覽器儲存權限或可用空間。");}
      }
      data=checked;
    }finally{saveBusy=false;}
  }
  function person() {return data.students.find(s=>s.id===selected);}
  function setField(form,name,value) {form.elements.namedItem(name).value=value??"";}
  function showStudent(s) {
    if(saveBusy){notify("正在同步，請稍候。");return;}
    if(blocked&&!session){notify("目前無法儲存學生資料。");return;}
    editStudent=s?.id??null;
    const form=$("student-form");form.reset();
    form.elements.name.setCustomValidity("");
    $("student-dialog-title").textContent=s?"編輯學生":"新增學生";
    $("archived-field").hidden=!s;
    if(s){setField(form,"name",s.name);setField(form,"course",s.course);form.elements.archived.checked=s.archived;}
    $("student-dialog").showModal();form.elements.name.focus();
  }
  function showLesson(r) {
    const s=person();if(!s||(blocked&&!session))return;
    if(saveBusy){notify("正在同步，請稍候。");return;}
    lessonOwner=s.id;editLesson=r?.id??null;
    const form=$("lesson-form");form.reset();
    form.elements.homework.required=false;
    form.elements.progress.setCustomValidity("");
    $("lesson-dialog-title").textContent=r?"編輯課堂紀錄":"記一堂課";
    $("lesson-context").textContent=s.name;
    setField(form,"date",r?.date??today());
    if(r)for(const field of ["progress","homework","type","due","status","parentNote","privateNote"])setField(form,field,r[field]);
    form.elements.homework.required=["prepared","sent"].includes(form.elements.status.value);
    $("lesson-dialog").showModal();form.elements.progress.focus();
  }
  function studentTile(s) {
    const b=button("",`student-tile${s.id===selected?" selected":""}`,()=>{
      selected=s.id;$("filter").value="all";render();
    });
    b.setAttribute("aria-current",s.id===selected?"true":"false");
    b.append(el("span","avatar",Array.from(s.name)[0]),el("span","student-info"));
    b.lastChild.append(el("strong","",s.name),el("small","",s.archived?"已封存":s.course||"未設定課程"));
    return b;
  }
  function render() {
    const archived=$("show-archived").checked;
    const visible=data.students.filter(s=>!s.archived||archived);
    if(!visible.some(s=>s.id===selected))selected=visible[0]?.id??null;
    const q=$("search").value.trim().toLowerCase();
    const shown=visible.filter(s=>(s.name+" "+s.course).toLowerCase().includes(q));
    $("student-list").replaceChildren(...shown.map(studentTile));
    if(!shown.length)$("student-list").append(el("p","side-empty",q?"沒有符合的學生":"尚未新增學生"));
    $("archive-control").hidden=!data.students.some(s=>s.archived);
    const s=person();
    $("onboarding").hidden=!!s;$("workspace").hidden=!s;
    if(!s)return;
    $("student-name").textContent=s.name;$("course").textContent=s.archived?"已封存":s.course||"未設定課程";
    $("new-lesson").hidden=s.archived;
    const rows=C.lessonsFor(data,s.id);
    $("last-date").textContent=rows[0]?.date||"—";$("pending-count").textContent=rows.filter(r=>r.status==="pending").length;$("lesson-count").textContent=rows.length;
    const filter=$("filter").value, matching=rows.filter(r=>filter==="all"||r.status===filter);
    $("lesson-list").replaceChildren(...matching.map(r=>lessonCard(s,r)));
    if(!matching.length){
      const box=el("div","record-empty");
      box.append(el("strong","",rows.length?"沒有符合的課堂紀錄":"還沒有課堂紀錄"));
      box.append(el("p","",rows.length?"可以切回全部紀錄。":"記下今天教到哪裡，下次接續更方便。"));
      if(!rows.length&&!s.archived)box.append(button("＋ 記一堂課","button quiet",()=>showLesson()));
      $("lesson-list").append(box);
    }
  }
  function lessonCard(s,r) {
    const card=el("article","lesson-card");
    const date=el("div","lesson-date");date.append(el("strong","",r.date.slice(5).replace("-"," / ")),el("small","",r.date.slice(0,4)));
    const body=el("div","lesson-body");
    const title=el("div","lesson-title");title.append(el("h3","",r.progress),el("span","status "+r.status,C.statuses[r.status]));
    body.append(title);
    if(r.homework)body.append(el("p","homework",r.homework));
    else body.append(el("p","subtle",r.status==="exempt"?"本堂免出作業":"尚未填寫作業內容"));
    if(r.type||r.due)body.append(el("p","metadata",[r.type&&"題型："+r.type,r.due&&"期限："+r.due].filter(Boolean).join("　·　")));
    if(r.privateNote){const d=el("details","private");d.append(el("summary","","私人備註"),el("p","",r.privateNote));body.append(d);}
    const actions=el("div","record-actions");
    actions.append(button("編輯","button quiet small",()=>showLesson(r)));
    if(r.homework&&r.status!=="exempt")actions.append(button("本週作業","button small tinted",()=>preview(s,r)));
    body.append(actions);card.append(date,body);return card;
  }
  function sheetCard(fields) {
    const card=el("article","sheet-card");
    card.append(el("h1","","本週作業"),el("p","sheet-meta",fields.title));
    if(fields.course)card.append(el("p","sheet-course",fields.course));
    for(const [label,val] of [["上課進度",fields.progress],["本次作業",fields.homework],["完成期限",fields.due],["給家長的提醒",fields.note]]){
      if(!val)continue;
      const group=el("section","sheet-field");group.append(el("h2","",label),el("p","",val));card.append(group);
    }
    return card;
  }
  function preview(s,r) {
    sheet=C.parentSheet(s,r);
    $("sheet-preview").replaceChildren(sheetCard(sheet));
    $("print-root").replaceChildren(sheetCard(sheet));
    $("copy-fallback").hidden=true;
    $("sheet-dialog").showModal();
  }
  $("student-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const name=String(f.get("name")).trim();
    if(!name){e.currentTarget.elements.name.setCustomValidity("請填寫姓名或暱稱");e.currentTarget.reportValidity();return;}
    const record={id:editStudent??id(),name,course:String(f.get("course")),archived:f.has("archived")};
    try {
      await commit({...data,students:editStudent?data.students.map(s=>s.id===editStudent?record:s):[...data.students,record]});
      selected=record.id;$("search").value="";$("filter").value="all";
      if(record.archived)$("show-archived").checked=true;
      $("student-dialog").close();render();notify("學生已儲存");
    } catch(err){notify(err.message);}
  });
  $("student-form").elements.name.addEventListener("input",e=>e.target.setCustomValidity(""));
  $("lesson-form").elements.progress.addEventListener("input",e=>e.target.setCustomValidity(""));
  $("lesson-form").elements.status.addEventListener("change",e=>{
    e.currentTarget.form.elements.homework.required=["prepared","sent"].includes(e.target.value);
  });
  $("lesson-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget,f=Object.fromEntries(new FormData(form));
    if(!f.progress.trim()){form.elements.progress.setCustomValidity("請填寫這堂課的進度");form.reportValidity();return;}
    if(["prepared","sent"].includes(f.status)&&!f.homework.trim()){notify("請填寫作業內容，或先儲存為待出題。");return;}
    const record={...f,id:editLesson??id(),studentId:lessonOwner};
    try {
      await commit({...data,lessons:editLesson?data.lessons.map(r=>r.id===editLesson?record:r):[record,...data.lessons]});
      $("filter").value="all";$("lesson-dialog").close();render();notify("課堂紀錄已儲存");
    } catch(err){notify(err.message);}
  });
  for(const close of document.querySelectorAll("[data-close]"))close.addEventListener("click",()=>close.closest("dialog").close());
  $("search").addEventListener("input",render);$("filter").addEventListener("change",render);$("show-archived").addEventListener("change",render);
  for(const x of ["new-student","start"])$(x).addEventListener("click",()=>showStudent());
  $("edit-student").addEventListener("click",()=>showStudent(person()));$("new-lesson").addEventListener("click",()=>showLesson());
  $("backup-open").addEventListener("click",()=>{
    $("backup-note").textContent=session?"匯入會將備份裡的新紀錄加入此老師帳號的雲端；同一筆保留目前版本。":"匯入會合併新增紀錄；同一筆保留目前版本。";
    $("import-backup").textContent=session?"匯入至雲端":"匯入備份";
    $("backup-dialog").showModal();
  });
  $("copy-sheet").addEventListener("click",async()=>{
    if(!sheet)return;
    try {await navigator.clipboard.writeText(sheet.text);notify("已複製，可貼到訊息中");}
    catch {
      const label=$("copy-fallback"),area=label.querySelector("textarea");
      label.hidden=false;area.value=sheet.text;area.focus();area.select();
    }
  });
  const initialTitle=document.title;
  window.addEventListener("afterprint",()=>{document.title=initialTitle;});
  $("print-sheet").addEventListener("click",()=>{if(sheet){document.title="本週作業｜"+sheet.title;window.print();}});
  $("sheet-dialog").addEventListener("close",()=>{sheet=null;$("print-root").replaceChildren();});
  $("export-backup").addEventListener("click",()=>{
    if(blocked&&!session){notify("目前無法讀取本機紀錄。");return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}));
    const a=el("a");a.href=url;a.download=`家教簿備份_${today()}.json`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  });
  $("import-backup").addEventListener("click",()=>$("backup-file").click());
  $("backup-file").addEventListener("change",async e=>{
    const input=e.currentTarget,file=input.files[0],destination=session;input.value="";
    if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error("備份檔太大。");
      const imported=JSON.parse(await file.text());
      if(!$("backup-dialog").open||session!==destination)throw new Error("儲存位置已切換，請重新選擇備份檔。");
      const old=[data.students.length,data.lessons.length];
      const next=C.merge(data,imported);
      await commit(next);$("backup-dialog").close();render();
      notify(`已匯入 ${data.students.length-old[0]} 位學生、${data.lessons.length-old[1]} 堂課`);
    }catch(err){notify(err instanceof SyntaxError?"不是有效的 JSON 備份，原紀錄未變。":err.message);}
  });
  window.addEventListener("storage",e=>{
    if(demo||session||blocked||!(e.key===key||e.key===null))return;
    if(document.querySelector("dialog[open]")){lock("另一個分頁已更動紀錄，請重新整理後再編輯。");return;}
    try {data=read();render();}
    catch {lock("另一個分頁的資料無法讀取，原紀錄已保留。");}
  });
  $("cloud-open").addEventListener("click",()=>{
    if(saveBusy){notify("正在同步，請稍候。");return;}
    $("cloud-form").hidden=!!session;$("cloud-actions").hidden=!session;
    $("cloud-dialog").showModal();
  });
  $("cloud-form").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!cloud||saveBusy)return;
    const form=e.currentTarget,f=new FormData(form),button=form.querySelector('button[type=submit]');
    form.elements.password.value="";saveBusy=true;button.disabled=true;
    try{
      const s=await cloud.login(String(f.get("email")),String(f.get("password")));
      const remote=await cloud.read(s);
      if(!$("cloud-dialog").open)return;
      setCloudView(s,remote);$("cloud-dialog").close();notify("已登入，正在使用雲端紀錄");
    }catch(err){notify(err.message);}
    finally{button.disabled=false;saveBusy=false;}
  });
  async function refreshCloud(report=false){
    if(!session||saveBusy)return;
    saveBusy=true;
    try{
      const remote=await cloud.read(session,saveSession);
      data=remote.payload;revision=remote.revision;render();
      if(report){$("cloud-dialog").close();notify("已讀取最新紀錄");}
    }catch(err){if(report||err.code==="auth")notify(err.message);}
    finally{saveBusy=false;}
  }
  $("cloud-refresh").addEventListener("click",()=>refreshCloud(true));
  $("cloud-logout").addEventListener("click",()=>{
    if(saveBusy){notify("正在同步，請稍候。");return;}
    $("cloud-dialog").close();session=null;revision=0;saveSession(null);
    selected=null;data=C.empty();$("search").value="";$("filter").value="all";$("show-archived").checked=false;
    $("local-label").textContent="此瀏覽器儲存";$("cloud-open").textContent="同步";
    $("storage-note").textContent="紀錄只在此瀏覽器。換裝置前請先匯出備份。";
    try{data=read();}catch{lock("無法讀取本機紀錄，原資料已保留。");}
    render();notify("已回到本機紀錄");
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&!document.querySelector("dialog[open]"))refreshCloud();
  });
  async function restoreCloud() {
    if(!cloud)return;
    saveBusy=true;
    try{
      const stored=JSON.parse(sessionStorage.getItem(sessionKey)||"null");
      if(stored?.url!==config.url||!stored.session)return;
      const remote=await cloud.read(stored.session);
      setCloudView(stored.session,remote);
    }catch{saveSession(null);notify("未能恢復雲端登入，目前顯示本機紀錄。");}
    finally{saveBusy=false;}
  }
  render();
  void restoreCloud();
})();
