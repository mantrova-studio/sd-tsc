import { safeJsonParse } from "./util.js";

function b64encodeUnicode(str){
  // encode UTF-8 to base64
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

function b64decodeUnicode(b64){
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function ghGetJsonFile({ token, repoFull, path }){
  const url = `https://api.github.com/repos/${repoFull}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      ...(token ? { "Authorization": `token ${token}` } : {})
    }
  });

  if(!res.ok){
    const t = await res.text();
    return { ok:false, status:res.status, error:t || res.statusText };
  }
  const data = await res.json();
  const content = data?.content ? b64decodeUnicode(data.content.replace(/\n/g,"")) : "";
  const json = safeJsonParse(content, null);
  return { ok:true, json, sha:data.sha, raw:data };
}

export async function ghPutJsonFile({ token, repoFull, path, json, message, sha }){
  const url = `https://api.github.com/repos/${repoFull}/contents/${path}`;
  const body = {
    message: message || "Update shifts.json",
    content: b64encodeUnicode(JSON.stringify(json, null, 2)),
    ...(sha ? { sha } : {})
  };

  const res = await fetch(url, {
    method:"PUT",
    headers: {
      "Accept":"application/vnd.github+json",
      "Authorization": `token ${token}`
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if(!res.ok){
    return { ok:false, status:res.status, error:text || res.statusText };
  }
  const data = safeJsonParse(text, null);
  return { ok:true, data };
}