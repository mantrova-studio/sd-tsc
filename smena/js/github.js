function b64(str){
  return btoa(unescape(encodeURIComponent(str)));
}

export async function ghGetJsonFile({ token, repoFull, path }){
  try{
    const url = `https://api.github.com/repos/${repoFull}/contents/${path}`;
    const res = await fetch(url, {
      headers: {
        "Accept":"application/vnd.github+json",
        "Authorization": `Bearer ${token}`
      }
    });
    if(!res.ok){
      return { ok:false, status: res.status, error: await safeText(res) };
    }
    const data = await res.json();
    const sha = data.sha;
    const content = data.content ? decodeURIComponent(escape(atob(data.content.replace(/\n/g,"")))) : "";
    const json = content ? JSON.parse(content) : null;
    return { ok:true, status: res.status, sha, json };
  }catch(e){
    return { ok:false, status: 0, error: String(e) };
  }
}

export async function ghPutJsonFile({ token, repoFull, path, json, message, sha }){
  try{
    const url = `https://api.github.com/repos/${repoFull}/contents/${path}`;
    const body = {
      message,
      content: b64(JSON.stringify(json, null, 2)),
      ...(sha ? { sha } : {})
    };

    const res = await fetch(url, {
      method:"PUT",
      headers: {
        "Accept":"application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(()=>null);
    if(!res.ok){
      return { ok:false, status: res.status, error: data || await safeText(res) };
    }
    return { ok:true, status: res.status, data };
  }catch(e){
    return { ok:false, status: 0, error: String(e) };
  }
}

async function safeText(res){
  try{ return await res.text(); }catch{ return ""; }
}