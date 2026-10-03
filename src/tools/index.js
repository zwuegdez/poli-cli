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

// Normalize only unambiguous tool/parameter aliases; never infer a shell action.
export function normalizeToolCall(name, args) {
  const aliases = { list_directory: 'list_dir', read_file: 'view_file', search_files: 'file_search' };
  name = aliases[name] || name;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { name, args };
  args = { ...args };
  const pathKey = name === 'list_dir' ? 'dir_path' : ['view_file', 'write_file', 'edit_file'].includes(name) ? 'file_path' : null;
  if (pathKey && args.path != null) {
    if (args[pathKey] == null) args[pathKey] = args.path;
    delete args.path;
  }
  return { name, args };
}

function toolError(error, name, context) {
  const definition = ALL_TOOLS.find(t => t.function.name === name)?.function;
  return {
    error,
    workspace_dir: context.workspaceDir || process.cwd(),
    ...(definition ? { expected_tool: definition } : { available_tools: ALL_TOOLS.map(t => t.function) }),
    recovery: 'Use these local tools directly. The CLI executes them. Do not ask the user to paste the tool schema or workspace path.',
  };
}

export async function executeTool(name, args, context = {}) {
  if (context.signal?.aborted) return { rejected: true, message: 'Turn stopped.' };
  ({ name, args } = normalizeToolCall(name, args));
  const definition = ALL_TOOLS.find(t => t.function.name === name)?.function;
  if (!definition) return toolError(`Unknown tool: "${name}". Choose one of the available_tools returned here.`, name, context);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return toolError('Tool arguments must be an object.', name, context);
  for (const required of definition.parameters.required || []) {
    if (args[required] == null) return toolError(`Missing required argument: ${required}`, name, context);
  }
  for (const [key, property] of Object.entries(definition.parameters.properties || {})) {
    if (args[key] == null) continue;
    const valid = property.type === 'integer' ? Number.isInteger(args[key]) : property.type === 'array' ? Array.isArray(args[key]) : typeof args[key] === property.type;
    if (!valid) return toolError(`Argument ${key} must be ${property.type}.`, name, context);
  }
  if (name === 'edit_file' && !args.target_content) return toolError('target_content must not be empty. Read the file and provide an exact block.', name, context);
  try {
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
  } catch (error) { return { error: error.message }; }
}
