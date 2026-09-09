export class HTTPError extends Error{constructor(public body:unknown){super('标记发送接口请求失败')}}
export async function requestExternalJSON<T>(path:string,init:RequestInit,options:{timeoutMs:number}):Promise<T>{
 const c=new AbortController();const timer=setTimeout(()=>c.abort(),options.timeoutMs)
 try{const r=await fetch(path,{...init,signal:c.signal,headers:{'Content-Type':'application/json',...init.headers}});const body=await r.json();if(!r.ok)throw new HTTPError(body);return body}finally{clearTimeout(timer)}
}
