import {createHash} from 'node:crypto'
const origin=process.env.PODFLOW_SITE_URL||'https://www.liuminxin.cn'
const archiveSecret=process.env.PODFLOW_ARCHIVE_TOKEN
const repository=process.env.GITHUB_REPOSITORY
const githubSecret=process.env.GITHUB_TOKEN
if(!archiveSecret||!githubSecret||!/^[-\w]+\/[-\w]+$/.test(repository||''))throw new Error('Archive credentials are not configured')
const site=async(path,input)=>{
  const response=await fetch(`${origin}/api/podflow/archive/${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${archiveSecret}`,'Content-Type':'application/json'},body:JSON.stringify(input||{})})
  if(!response.ok)throw new Error(`Archive endpoint ${response.status}`);return response.json()
}
const github=async(path,input,method=input?'POST':'GET',headers={})=>{
  const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${githubSecret}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...headers},...(input?{body:JSON.stringify(input)}:{})})
  if(response.status===404)return null
  if(!response.ok)throw new Error(`GitHub ${response.status}`);return response.json()
}
const upload=async(release,name,bytes,mime)=>{
  const existing=release.assets?.find(x=>x.name===name)
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex')
  if(existing){if(existing.digest!==digest)throw new Error('Existing archive digest does not match');return existing}
  const url=release.upload_url.replace('{?name,label}',`?name=${encodeURIComponent(name)}`)
  if(new URL(url).hostname!=='uploads.github.com')throw new Error('Invalid upload target')
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${githubSecret}`,'Content-Type':mime,'Content-Length':String(bytes.length)},body:bytes})
  if(!response.ok)throw new Error(`GitHub upload ${response.status}`)
  const asset=await response.json();if(asset.digest!==digest)throw new Error('Uploaded archive digest does not match');return asset
}
for(let index=0;index<3;index++){
  const {job}=await site('next');if(!job)break
  let completed=false
  try{
    if(!/^[a-f0-9-]{36}$/.test(job.id)||!/^[a-f0-9]{64}$/.test(job.expected?.sha256)||job.expected.bytes>12582912)throw new Error('Invalid archive contract')
    const url=new URL(job.audioUrl)
    if(url.protocol!=='https:'||url.username||url.password||url.port||!['bytedance.com','byteimg.com','volces.com','volccdn.com','volcengine.com','bytecdn.cn','bytespeech.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw new Error('Invalid media host')
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)})
    if(!response.ok)throw new Error(`Media download ${response.status}`)
    const reader=response.body.getReader(),parts=[];let size=0
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12582912)throw new Error('Media too large');parts.push(Buffer.from(value))}}finally{await reader.cancel().catch(()=>{})}
    const bytes=Buffer.concat(parts),sha256=createHash('sha256').update(bytes).digest('hex')
    if(sha256!==job.expected.sha256||bytes.length!==job.expected.bytes)throw new Error('Media does not match the validated audio')
    const tag=`trial-${job.id}`
    let release=await github(`/releases/tags/${tag}`)
    if(!release)release=await github('/releases',{tag_name:tag,name:job.metadata.title,body:'PodFlow Web 自动试作。AI 生成，未经人工核实。',draft:true,prerelease:false})
    const audio=await upload(release,'podcast.mp3',bytes,'audio/mpeg')
    await upload(release,'episode.json',Buffer.from(JSON.stringify(job.metadata,null,2)),'application/json')
    if(release.draft)release=await github(`/releases/${release.id}`,{draft:false},'PATCH')
    await site('complete',{id:job.id,lease:job.lease,url:audio.browser_download_url,sha256})
    completed=true;console.log(JSON.stringify({archived:job.id,bytes:bytes.length}))
  }finally{if(!completed)await site('retry',{id:job.id,lease:job.lease}).catch(()=>{})}
}
