import fs from 'node:fs/promises';
import path from 'node:path';

export const fileSearchDefinition = {
  type:'function',function:{name:'file_search',description:'Find workspace files by filename substring or glob (such as *.js or src/**/*.test.js). Skips generated directories and does not follow directory symlinks.',parameters:{type:'object',properties:{pattern:{type:'string',description:'Filename substring or glob; paths match relative to the workspace.'},max_results:{type:'integer',description:'Result limit, 1–500; default 50.'}},required:['pattern']}},
};

function globPattern(pattern) {
  let expression='';
  for(let index=0;index<pattern.length;index++) {
    const char=pattern[index];
    if(char==='*'&&pattern[index+1]==='*') {
      index++;
      if(pattern[index+1]==='/'){index++;expression+='(?:.*/)?';}else expression+='.*';
    } else if(char==='*')expression+='[^/]*';
    else if(char==='?')expression+='[^/]';
    else expression+=char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp('^'+expression+'$','i');
}

export async function executeFileSearch(args, context = {}) {
  const workspaceDir=context.workspaceDir || process.cwd();
  if(!args.pattern.trim())return{error:'File pattern must not be empty.'};
  const limit=args.max_results ?? 50;
  if(limit<1||limit>500)return{error:'max_results must be between 1 and 500.'};
  const pattern=args.pattern.replace(/^\.\//,'');
  const glob=/[*?]/.test(pattern)?globPattern(pattern):null;
  const results=[],pending=[workspaceDir];
  const ignored=new Set(['node_modules','.git','.next','dist']);
  while(pending.length&&results.length<limit) {
    if(context.signal?.aborted)return{rejected:true,message:'File search stopped.',files:results};
    const current=pending.pop();
    let entries;
    try { entries=await fs.readdir(current,{withFileTypes:true}); }
    catch(error){if(current===workspaceDir)return{error:`Cannot search workspace: ${error.message}`};continue;}
    for(const entry of entries) {
      if(results.length>=limit)break;
      if(ignored.has(entry.name))continue;
      const full=path.join(current,entry.name),relative=path.relative(workspaceDir,full).split(path.sep).join('/');
      if(entry.isDirectory())pending.push(full);
      else if(entry.isFile()) {
        const target=pattern.includes('/')?relative:entry.name;
        if(glob?glob.test(target):target.toLowerCase().includes(pattern.toLowerCase()))results.push(relative);
      }
    }
  }
  return{pattern:args.pattern,total_found:results.length,files:results,truncated:results.length>=limit};
}
