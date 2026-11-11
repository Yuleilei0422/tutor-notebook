(() => {
  "use strict";
  const fault=(code,message)=>Object.assign(new Error(message),{code});
  function create(config,fetcher=globalThis.fetch.bind(globalThis)){
    const endpoint=new URL(config.url);
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url)||
       !/^sb_publishable_[A-Za-z0-9_-]{12,100}$/.test(config.key))throw new Error("同步設定不正確。");
    const C=globalThis.TutorCore;
    async function request(path,{body,token,login=false,refresh=false}={}){
      const headers={apikey:config.key,Accept:"application/json"};
      if(token)headers.Authorization="Bearer "+token;
      if(body)headers["Content-Type"]="application/json";
      let res;
      try{res=await fetcher(endpoint.origin+path,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});}
      catch{throw fault("network","無法連線到同步服務，請檢查網路後再試。");}
      const payload=await res.json().catch(()=>null);
      if(res.ok)return payload;
      if(payload?.code==="40001")throw fault("conflict","另一台裝置已更新。這次沒有覆寫；請先複製未儲存內容，再關閉表單並讀取最新紀錄。");
      if(login&&[400,401,403].includes(res.status))throw fault("login","登入失敗，請確認老師帳號與密碼。");
      if(refresh&&[400,401,403].includes(res.status))throw fault("session-expired","登入已失效，請重新登入雲端。");
      if([401,403].includes(res.status))throw fault("auth","沒有雲端存取權限，請重新登入或檢查專案設定。");
      throw fault("remote","同步失敗，請稍後重試或檢查資料庫是否已設定。");
    }
    function decodeSession(p){
      if(!p?.user?.id||!p.access_token||!p.refresh_token||!(p.expires_in>0))
        throw fault("auth","沒有取得有效的老師登入資料。");
      return {userId:p.user.id,access:p.access_token,refresh:p.refresh_token,expiresAt:Date.now()+Number(p.expires_in)*1000};
    }
    let refreshing;
    async function token(s,onRefresh){
      if(!s?.access||!s?.refresh)throw fault("auth","請先登入老師帳號。");
      if(s.expiresAt>Date.now()+30000)return s.access;
      if(!refreshing)refreshing=request("/auth/v1/token?grant_type=refresh_token",{body:{refresh_token:s.refresh},refresh:true})
        .then(decodeSession).finally(()=>{refreshing=null;});
      const renewed=await refreshing;
      if(renewed.userId!==s.userId)throw fault("auth","登入身份不符，請重新登入。");
      Object.assign(s,renewed);onRefresh?.(s);
      return s.access;
    }
    return Object.freeze({
      login:async(email,password)=>decodeSession(await request("/auth/v1/token?grant_type=password",{body:{email,password},login:true})),
      async read(s,onRefresh){
        const auth=await token(s,onRefresh);
        const rows=await request("/rest/v1/tutor_notebooks?select=revision,payload&owner_id=eq."+encodeURIComponent(s.userId),{token:auth});
        if(!Array.isArray(rows)||rows.length>1)throw fault("data","雲端回傳不完整，未變更目前紀錄。");
        if(!rows.length)return {revision:0,payload:C.empty()};
        if(!Number.isSafeInteger(rows[0].revision)||rows[0].revision<1)throw fault("data","雲端紀錄版本不正確。");
        return {revision:rows[0].revision,payload:C.validate(rows[0].payload)};
      },
      async write(s,expected,data,onRefresh){
        if(!Number.isSafeInteger(expected)||expected<0)throw new Error("版本不正確。");
        const payload=C.validate(data);
        const auth=await token(s,onRefresh);
        const revision=await request("/rest/v1/rpc/tutor_notebook_put",{token:auth,body:{p_expected:expected,p_payload:payload}});
        if(revision!==expected+1)throw fault("data","雲端未確認寫入；請先讀取最新紀錄。");
        return revision;
      }
    });
  }
  globalThis.TutorCloud=Object.freeze({create});
})();
