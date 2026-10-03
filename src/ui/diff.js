// Unified diff renderer for terminal
import { colors, style } from './theme.js';

export function renderDiff(filename, oldContent = '', newContent = '') {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  const out = [];
  out.push(`${colors.bold}${colors.cyan}--- a/${filename}${colors.reset}`);
  out.push(`${colors.bold}${colors.cyan}+++ b/${filename}${colors.reset}`);

  // Simple LCS-based or line-by-line diff generator
  const maxLines = Math.max(oldLines.length, newLines.length);

  // If new file
  if (!oldContent && newContent) {
    newLines.slice(0, 50).forEach((l, i) => {
      out.push(`${colors.green}+ ${l}${colors.reset}`);
    });
    if (newLines.length > 50) {
      out.push(`${colors.dim}... and ${newLines.length - 50} more lines${colors.reset}`);
    }
    return out.join('\n');
  }

  // If deleted file
  if (oldContent && !newContent) {
    oldLines.slice(0, 50).forEach((l, i) => {
      out.push(`${colors.red}- ${l}${colors.reset}`);
    });
    if (oldLines.length > 50) {
      out.push(`${colors.dim}... and ${oldLines.length - 50} more lines${colors.reset}`);
    }
    return out.join('\n');
  }

  // Basic diff for edits
  let oIdx = 0;
  let nIdx = 0;
  let diffCount = 0;

  while (oIdx < oldLines.length || nIdx < newLines.length) {
    const oLine = oldLines[oIdx];
    const nLine = newLines[nIdx];

    if (oLine === nLine) {
      // Context line - only show a few
      oIdx++;
      nIdx++;
    } else {
      diffCount++;
      if (diffCount > 100) {
        out.push(`${colors.dim}... truncated remaining diff ...${colors.reset}`);
        break;
      }
      if (oLine !== undefined && (nLine === undefined || !newLines.includes(oLine))) {
        out.push(`${colors.red}- ${oLine}${colors.reset}`);
        oIdx++;
      } else if (nLine !== undefined) {
        out.push(`${colors.green}+ ${nLine}${colors.reset}`);
        nIdx++;
      } else {
        out.push(`${colors.red}- ${oLine}${colors.reset}`);
        out.push(`${colors.green}+ ${nLine}${colors.reset}`);
        oIdx++;
        nIdx++;
      }
    }
  }

  return out.join('\n');
}
