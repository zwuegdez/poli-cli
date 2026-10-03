// Tool Registry and Dispatcher
import { viewFileDefinition, executeViewFile } from './view_file.js';
import { writeFileDefinition, executeWriteFile } from './write_file.js';
import { editFileDefinition, executeEditFile } from './edit_file.js';
import { runCommandDefinition, executeRunCommand } from './run_command.js';
import { grepSearchDefinition, executeGrepSearch } from './grep_search.js';
import { fileSearchDefinition, executeFileSearch } from './file_search.js';
import { listDirDefinition, executeListDir } from './list_dir.js';

export const ALL_TOOLS = [
  viewFileDefinition,
  writeFileDefinition,
  editFileDefinition,
  runCommandDefinition,
  grepSearchDefinition,
  fileSearchDefinition,
  listDirDefinition
];

export async function executeTool(name, args, context = {}) {
  switch (name) {
    case 'view_file':
      return await executeViewFile(args, context);
    case 'write_file':
      return await executeWriteFile(args, context);
    case 'edit_file':
      return await executeEditFile(args, context);
    case 'run_command':
      return await executeRunCommand(args, context);
    case 'grep_search':
      return await executeGrepSearch(args, context);
    case 'file_search':
      return await executeFileSearch(args, context);
    case 'list_dir':
      return await executeListDir(args, context);
    default:
      return { error: `Unknown tool: "${name}"` };
  }
}
