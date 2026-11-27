const test=require('node:test');
const assert=require('node:assert/strict');
const {zipSync,strToU8}=require('fflate');
const {render}=require('../src/viewer');
const {readModel}=require('../src/model');
const pack=files=>zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
const split='simulink/systems/system_root.xml';
const block=(id,name,nested='')=>'<Block SID="'+id+'" Name="'+name+'" BlockType="SubSystem"><P Name="Position">[0 0 60 30]</P>'+nested+'</Block>';
test('inline legacy system navigates safely and escapes labels',()=>{
  const root='<System>'+block(1,'A &amp; B','<System>'+block(2,'&lt;img&gt;')+'</System>')+'</System>';
  const data=pack({'simulink/blockdiagram.xml':'<ModelInformation><Model>'+root+'</Model></ModelInformation>'});
  const html=render(data,'x.slx',true,'nonce');
  assert.match(html,/id="s1" hidden/); assert.match(html,/data-system="1"/);
  assert.match(html,/&lt;img&gt;/); assert.match(html,/A &amp; B/);
  assert.doesNotMatch(render(data,'x.slx'),/<script|id="s1" hidden/);
});
test('nested signal branches and self-references terminate',()=>{
  const branch='<Branch><P Name="Dst">2#in:1</P></Branch>';
  const data=pack({[split]:'<System>'+block(1,'Source','<System Ref="system_root"/>')+block(2,'Sink')+'<Line><P Name="Src">1#out:1</P><Branch><P Name="Points">[20 0]</P>'+branch+branch+'</Branch></Line></System>'});
  assert.equal(readModel(data).length,1);
  assert.equal(render(data,'x').match(/marker-end=/g).length,2);
});
test('missing diagrams and malformed archives report errors',()=>{
  assert.throws(()=>render(pack({'a':'b'}),'x'),/no supported/);
  assert.throws(()=>render(strToU8('invalid'),'x'));
});
