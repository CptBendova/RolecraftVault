// Execute the shipped wizard function with small React hooks and inert child components.
const assert = require('assert'), fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'chat.js'), 'utf8');
const start = source.indexOf('  function NewChatModal(props) {');
const end = source.indexOf('  function SettingsModal(props) {', start);
assert(start >= 0 && end > start, 'new-story wizard is present');
const fragment = Symbol('fragment');
const React = { Fragment: fragment };
let state = [], cursor = 0;
function useState(initial) {
  const index = cursor++;
  if (!(index in state)) state[index] = initial;
  return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
}
function h(type, props, ...children) { return { type, props: props || {}, children }; }
function Component() {}
const internals = { React, h, useState, useEffect() {}, useMemo: task => task(), read() {}, resolveCharacter: (record, variantId) => record && Object.assign({}, record, { activeVariantName: variantId ? (record.variants || []).find(item => item.id === variantId)?.name : '' }), participantKey: p => JSON.stringify([p.characterId, p.variantId || '']), speakerName: p => p.name + (p.activeVariantName ? ' (' + p.activeVariantName + ')' : ''), MAX_PARTICIPANTS: 8, DEFAULT_MODEL: 'openrouter/auto', ModalFrame: Component, CastCard: Component, Portrait: Component, ModelCatalog: Component, ModelControls: Component, PromptControls: Component };
const NewChatModal = new Function('d', `const {${Object.keys(internals).join(',')}}=d;${source.slice(start, end)};return NewChatModal;`)(internals);
const names = ['Ari', 'Beatrice', 'Cyra', 'Dara', 'Elin', 'Faye', 'Gale', 'Hara', 'Iona'];
const chars = names.map((name, index) => ({ id: String(index), name, firstMessage: name + ' opens.' }));
chars[0].variants = [{ id: 'alt', name: 'Alternate Ari' }];
let created;
const props = { library: { chars, personas: [] }, models: [], configured: true, onCreate: form => { created = form; return Promise.resolve(); }, onClose() {} };
function render() { cursor = 0; return NewChatModal(props); }
function nodes(tree) { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== 'object') return []; return [tree].concat(tree.children.flatMap(nodes)); }
function content(tree) { if (Array.isArray(tree)) return tree.map(content).join(''); if (tree == null || typeof tree === 'boolean') return ''; if (typeof tree !== 'object') return String(tree); return tree.children.map(content).join(''); }
function choose(type, test) { const node = nodes(render()).find(item => item.type === type && test(item)); assert(node, 'control exists'); return node; }
function click(label) { choose('button', node => content(node) === label).props.onClick(); }
choose(Component, node => node.props.name === 'Ari' && !node.props.subtitle?.includes('group')).props.onClick();
click('+ Add characters to this story');
for (const name of names.slice(1, 8)) choose(Component, node => node.props.name === name && node.props.subtitle === 'Tap to add to this group').props.onClick();
assert(content(render()).includes('Eight characters selected'));
assert(!nodes(render()).some(node => node.type === Component && node.props.name === 'Iona' && node.props.subtitle === 'Tap to add to this group'), 'the cast cannot exceed eight');
click('Continue'); click('Continue');
const speaker = choose('select', node => node.props.id === 'rcchat-first-speaker');
assert(content(render()).includes('blank shared scene'));
const loreScope = choose('select', node => node.props.id === 'rcchat-new-group-lore-scope');
assert.strictEqual(loreScope.props.value, 'speaker', 'new groups default to the chosen speaker’s lorebooks');
speaker.props.onChange({ target: { value: JSON.stringify(['1', '']) } });
click('Create roleplay');
assert.deepStrictEqual(created.initialParticipants.map(item => item.characterId), ['0', '1', '2', '3', '4', '5', '6', '7']);
assert.strictEqual(created.initialSpeakerKey, JSON.stringify(['1', '']));
assert.strictEqual(created.groupLoreScope, 'speaker');
state = []; created = null;
choose(Component, node => node.props.name === 'Ari' && !node.props.subtitle?.includes('group')).props.onClick();
click('+ Add characters to this story');
choose(Component, node => node.props.name === 'Beatrice' && node.props.subtitle === 'Tap to add to this group').props.onClick();
click('Continue'); click('Continue');
choose('select', node => node.props.id === 'rcchat-new-group-lore-scope').props.onChange({ target: { value: 'shared' } });
click('Create roleplay');
assert.strictEqual(created.groupLoreScope, 'shared', 'the wizard retains an explicit all-cast choice');
state = []; created = null;
choose(Component, node => node.props.name === 'Ari' && !node.props.subtitle?.includes('group')).props.onClick();
click('Continue'); click('Continue');
assert(!nodes(render()).some(node => node.type === 'select' && node.props.id === 'rcchat-first-speaker'), 'solo review stays compact');
click('Create roleplay');
assert.deepStrictEqual(created.initialParticipants, [{ characterId: '0', variantId: '' }]);
assert.strictEqual(created.initialSpeakerKey, JSON.stringify(['0', '']));
console.log('PASS source-backed group wizard keeps the solo default and submits a bounded cast with the selected first speaker');
