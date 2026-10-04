import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { executeFileSearch } from './file_search.js';

export const grepSearchDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description: 'Search workspace files for a regex or literal text. Supports a file, directory, or glob restriction; returns bounded matching lines without executing a shell.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Regex pattern, or exact text when literal is true.' },
      path_pattern: { type: 'string', description: 'Optional file, directory, or glob such as src/**/*.js.' },
      case_sensitive: { type: 'boolean', description: 'Default false.' },
      literal: { type: 'boolean', description: 'Use exact text rather than regex. Default false.' },
    }, required: ['query'] },
  },
};

function searchProcess(command, argv, workspaceDir, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { resolve({rejected:true,message:'Search stopped.'}); return; }
    const child = spawn(command, argv, {cwd:workspaceDir,stdio:['ignore','pipe','pipe'],signal});
    let stdout='',stderr='',truncated=false,timedOut=false;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const next=stdout+chunk;
      stdout=next.slice(0,30000);
      if (next.length>30000 || stdout.split('\n').length>81) { truncated=true;child.kill(); }
    });
    child.stderr.on('data', chunk=>{stderr=(stderr+chunk).slice(0,2000);});
    const timer=setTimeout(()=>{timedOut=true;child.kill();},10000);
    child.once('error', error=>{clearTimeout(timer);if(signal?.aborted)resolve({rejected:true,message:'Search stopped.'});else reject(error);});
    child.once('close', code=>{
      clearTimeout(timer);
      if(signal?.aborted){resolve({rejected:true,message:'Search stopped.'});return;}
      const matches=stdout.split('\n').filter(Boolean).slice(0,80);
      resolve({matches,match_count:matches.length,truncated:truncated||stdout.split('\n').filter(Boolean).length>80,...(timedOut?{error:'Search timed out. Restrict path_pattern and try again.',timed_out:true}:code!==0&&code!==1&&!truncated?{error:stderr.trim()||`Search failed (exit ${code}).`}:{})});
    });
  });
}

export async function executeGrepSearch(args, context = {}) {
  const workspaceDir=context.workspaceDir || process.cwd();
  if(!args.query.trim())return{error:'Search query must not be empty.'};
  const candidate=args.path_pattern ? path.resolve(workspaceDir,args.path_pattern) : workspaceDir;
  const existing=fs.existsSync(candidate);
  const flags=['--line-number','--with-filename','--no-heading','--color','never','--hidden','--glob','!**/node_modules/**','--glob','!**/.git/**','--glob','!*.lock','--glob','!*.sqlite*'];
  if(!args.case_sensitive)flags.push('--ignore-case');
  if(args.literal)flags.push('--fixed-strings');
  if(args.path_pattern&&!existing)flags.push('--glob',args.path_pattern);
  try {
    const result=await searchProcess('rg',[...flags,'-e',args.query,'--',existing?candidate:workspaceDir],workspaceDir,context.signal);
    return {query:args.query,engine:'rg',...result};
  } catch(error) {
    if(error.code!=='ENOENT')return{error:`Search failed: ${error.message}`};
    const fallback=['-r','-n','-H','-I','--exclude-dir=node_modules','--exclude-dir=.git','--exclude=*.lock','--exclude=*.sqlite*'];
    if(!args.case_sensitive)fallback.push('-i');
    fallback.push(args.literal?'-F':'-E');
    let targets=[existing?candidate:workspaceDir],limitedFiles=false;
    if(args.path_pattern&&!existing) {
      const found=await executeFileSearch({pattern:args.path_pattern,max_results:500},context);
      if(found.error||found.rejected)return found;
      if(!found.files.length)return{query:args.query,engine:'grep',matches:[],match_count:0,truncated:false};
      targets=found.files.map(file=>path.resolve(workspaceDir,file));limitedFiles=found.truncated;
    }
    try {
      const result=await searchProcess('grep',[...fallback,'-e',args.query,'--',...targets],workspaceDir,context.signal);
      return{query:args.query,engine:'grep',...result,...(limitedFiles?{truncated:true,message:'Matching file list reached its limit. Restrict path_pattern to search more precisely.'}:{})};
    }
    catch(fallbackError){return{error:`Search failed: ${fallbackError.message}`};}
  }
}
