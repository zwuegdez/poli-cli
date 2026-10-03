import { Session } from '../session.js';
import { selectChoice } from '../ui/select.js';
import { section, truncate, plainText } from '../ui/theme.js';

export async function chooseSession({ session, id, select = selectChoice }) {
  if (id && id !== true) return String(id);
  const saved = Session.list(session.workspaceDir).filter(record => record.id !== session.id);
  if (!saved.length) { console.log('No saved conversations in this workspace.'); return null; }
  const choices = saved.map(record => ({
    value: record.id,
    label: truncate(record.preview, 64),
    description: `${record.turns} turns · ${plainText(record.updatedAt).slice(0, 16).replace('T', ' ')} · ${record.id}`,
  }));
  if (!process.stdin.isTTY && select === selectChoice) {
    console.log(section('Saved conversations', choices.map(choice => `${choice.value}  ${choice.label}`).join('\n')));
    console.log('Use /resume <id> or poli resume <id>.');
    return null;
  }
  return select({ title: 'Resume a conversation', choices });
}
