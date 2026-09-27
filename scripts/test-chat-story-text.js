/* Execute the shipped safe prose renderer, including nested dialogue formatting. */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../app/chat.js'), 'utf8');
// Include the real indicator declaration now used by StoryText. Its visibility
// hooks are exercised by test-chat-quality-motion; this h stub inspects prose.
const start = source.indexOf('  function WritingIndicator() {');
const end = source.indexOf('  function ConversationList(', start);
assert(start >= 0 && end > start);
const render = vm.runInNewContext(source.slice(start, end) + '\nStoryText', {
  h: (tag, props, ...children) => ({tag, props, children})
});
const flatten = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join('') : node && node.children ? flatten(node.children) : '';
const dialogue = node => Array.isArray(node) ? node.flatMap(dialogue) : node && node.children ? (node.props && node.props.className === 'rcchat-dialogue' ? [node] : dialogue(node.children)) : [];
for (const [input, expected] of [
  ['She nods. "Hello."', ['"Hello."']],
  ['*She whispers, "Stay close."*', ['"Stay close."']],
  ['**“I promise.”**', ['“I promise.”']],
  ['“A *quiet* word.”', ['“A quiet word.”']],
  ['"First line\nsecond line."', ['"First line\nsecond line."']],
  ["She's certain it isn't over.", []],
  ['<img src=x onerror=alert(1)>', []],
]) {
  const tree = render({text: input});
  assert.deepStrictEqual(dialogue(tree).map(flatten), expected, input);
  assert(!JSON.stringify(tree).includes('dangerouslySetInnerHTML'));
}
assert.equal(flatten(render({text:'*An action.* **A warning.**'})), 'An action. A warning.');
assert(flatten(render({text:'An unfinished "word', pending:true})).includes('An unfinished "word'));
console.log('PASS safe story rendering and distinct dialogue through nested formatting');
