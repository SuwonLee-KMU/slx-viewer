const { readModel } = require('./model');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function walk(line, fn) {
  fn(line);
  line.children.forEach(child => walk(child, fn));
}
function port(b, ep) {
  const [x,y,r,t] = b.rect;
  if (!['in','out'].includes(ep.side)) return [(x+r)/2, ep.side === 'state' ? t : y];
  const input = ep.side === 'in';
  const n = Math.max(1, input ? b.ins : b.outs);
  const f = (ep.index - 0.5)/n;
  switch (b.orientation) {
    case 'left': return [input ? r : x, y+(t-y)*f];
    case 'down': return [r-(r-x)*f, input ? y : t];
    case 'up': return [x+(r-x)*f, input ? t : y];
    default: return [input ? x : r, y+(t-y)*f];
  }
}
function diagram(system, index, interactive) {
  const ids = new Map(system.blocks.map(b => [b.sid,b]));
  for (const line of system.lines) walk(line, segment => {
    for (const e of [segment.src,segment.dst]) {
      const b = e && ids.get(e.sid);
      if (b && e.side === 'in') b.ins = Math.max(b.ins,e.index);
      if (b && e.side === 'out') b.outs = Math.max(b.outs,e.index);
    }
  });
  let left=Infinity, top=Infinity, right=-Infinity, bottom=-Infinity;
  function include(x,y) {
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  const paths = [];
  function trace(line, start) {
    let [x,y] = start;
    const points = [[x,y]];
    for (let i=0; i+1<line.points.length; i+=2) {
      x += line.points[i]; y += line.points[i+1]; points.push([x,y]);
    }
    const target = line.dst && ids.get(line.dst.sid);
    if (target) {
      const [dx,dy] = port(target,line.dst);
      if (Math.abs(dx-x)>0.5 && Math.abs(dy-y)>0.5) {
        if (target.orientation === 'up' || target.orientation === 'down') points.push([dx,y]);
        else if (points.length === 1) points.push([(x+dx)/2,y],[(x+dx)/2,dy]);
        else points.push([x,dy]);
      }
      points.push([dx,dy]);
    }
    for (const pair of points) include(...pair);
    if (points.length > 1) paths.push('<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#41484e" stroke-width="1.35"'+(target ? ' marker-end="url(#arrow'+index+')"' : '')+'/>');
    if (line.children.length > 1) paths.push('<circle cx="'+x+'" cy="'+y+'" r="2.5" fill="#41484e"/>');
    line.children.forEach(c => trace(c,[x,y]));
  }
  for (const line of system.lines) {
    const source = line.src && ids.get(line.src.sid);
    if (source) trace(line,port(source,line.src));
  }
  function text(x,y,label,size,anchor='middle',style='') {
    return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-size="'+size+'" '+style+'>'+esc(label)+'</text>';
  }
  function block(b) {
    const [x,y,r,t] = b.rect, w=r-x, h=t-y, cx=(x+r)/2, cy=(y+t)/2;
    const type=b.subtype || b.type;
    const glyph = {Sum:'Σ',Product:'×',Integrator:'1/s',UnitDelay:'z⁻¹',Delay:'z⁻ⁿ',Scope:'∿',Terminator:'⊣',Mux:'Mux',Demux:'Demux',Constant:b.value || 'C',Gain:b.value || 'K',Inport:'In',Outport:'Out',SubSystem:'▣','MATLAB Function':'ƒ'}[type];
    const internal = glyph || type;
    const size = Math.min(14, h*0.65, Math.max(8, (w-5)/(Math.max(1,internal.length)*0.6)));
    const fit = Math.max(1,Math.floor((w-4)/(Math.max(size,1)*0.57)));
    const caption = internal.length > fit ? internal.slice(0,Math.max(0,fit-1))+'…' : internal;
    const names = b.showName ? b.name.trim().split(/\r?\n/) : [];
    if (!glyph || internal !== type && caption !== internal) {
      if (!names.includes(type)) names.push(type);
    }
    const labelY = b.labelAbove ? y-4-13*(names.length-1) : t+13;
    include(x-3,y-3); include(r+3,t+3);
    let body='';
    if (type==='Gain' && ['left','right'].includes(b.orientation)) {
      const start=b.orientation==='left'?r:x, end=b.orientation==='left'?x:r;
      body='<path d="M'+start+' '+y+' V'+t+' L'+end+' '+cy+' Z"/>';
    } else if (type==='Sum' && Math.abs(w-h)<5) {
      body='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+w/2+'" ry="'+h/2+'"/>';
    } else {
      const radius=['Inport','Outport'].includes(type) ? h/2 : 2;
      body='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+radius+'"/>';
    }
    body='<g fill="'+(b.child!==null?'#e4e9ef':'#fff')+'" stroke="#263039" stroke-width="1.4">'+body+'</g>'+text(cx,cy+size*0.34,caption,size);
    names.forEach((s,i)=>{
      const width=s.length*6.4;
      include(cx-width/2,labelY+i*13-12); include(cx+width/2,labelY+i*13+2);
      body+=text(cx,labelY+i*13,s,11);
    });
    const title='<title>'+esc(b.name+' · '+type)+'</title>';
    if (b.child!==null && interactive) return '<a href="#s'+b.child+'" data-system="'+b.child+'">'+title+body+'</a>';
    return '<g>'+title+body+'</g>';
  }
  const blocks=system.blocks.map(block);
  const notes=system.annotations.map(a=>{
    const [x,y,r,t]=a.rect;
    include(x,y); include(r,t);
    return a.text.split(/\r?\n/).map((line,i)=>text(x,y+12+i*14,line,12,'start')).join('');
  });
  if (!Number.isFinite(left)) {include(0,0);include(280,80);notes.push(text(140,45,'Empty system',14));}
  const view=[left-16,top-16,right-left+32,bottom-top+32];
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Block diagram" viewBox="'+view.join(' ')+'" style="font-family:Arial,sans-serif;color:#18212a;fill:#18212a"><defs><marker id="arrow'+index+'" viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#41484e"/></marker></defs>'+paths.join('')+blocks.join('')+notes.join('')+'</svg>';
}
function render(bytes, name, interactive=false, nonce='') {
  const systems=readModel(bytes);
  systems[0].name=name;
  function trail(i) {
    const result=[];
    for (let id=i;id!==null;id=systems[id].parent) result.unshift({id,name:systems[id].name});
    return result;
  }
  const sections=systems.map((s,i)=>{
    const crumbs=trail(i).map(item=>interactive && item.id!==i?'<a href="#s'+item.id+'" data-system="'+item.id+'">'+esc(item.name)+'</a>':esc(item.name)).join(' / ');
    return '<section id="s'+i+'"'+(interactive && i?' hidden':'')+'><header><h1>'+crumbs+'</h1><small>'+s.blocks.length+' blocks</small></header><div class="canvas">'+diagram(s,i,interactive)+'</div></section>';
  });
  const actions=interactive?'<nav aria-label="Zoom"><button id="less" aria-label="Zoom out">−</button><button id="fit">Fit</button><button id="more" aria-label="Zoom in">+</button></nav>':'';
  const script=interactive?'<script nonce="'+esc(nonce)+'">('+init.toString()+')()</script>':'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'nonce-'+esc(nonce)+'\'"><title>'+esc(name)+'</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#18212a;font:14px -apple-system,BlinkMacSystemFont,Arial,sans-serif}section{padding:18px 22px;border-bottom:1px solid #aaa}header{display:flex;align-items:baseline;gap:16px;min-height:36px}h1{margin:0;font-size:17px}small{color:#49525a;white-space:nowrap}.canvas{overflow:auto;padding:8px 0}.canvas svg{display:block;width:100%;min-height:80px}a{color:#234a64;cursor:pointer}svg a:hover rect,svg a:focus rect{stroke-width:3}nav{float:right;position:relative;margin:12px 22px}button{background:#fff;border:1px solid #777;border-radius:4px;color:#222;min-width:30px;padding:4px;cursor:pointer}button+button{margin-left:4px}[hidden]{display:none}</style></head><body>'+actions+sections.join('')+script+'</body></html>';
}
function init() {
  const state=acquireVsCodeApi();
  let current=0, zoom=1;
  function show(id,scale) {
    const next=document.getElementById('s'+id);
    if (!next) return;
    document.getElementById('s'+current).hidden=true;
    current=id; next.hidden=false;
    zoom=Math.max(0.5,Math.min(4,Number(scale)||1));
    next.querySelector('svg').style.width=(zoom*100)+'%';
    state.setState({id,zoom});
  }
  document.addEventListener('click',e=>{
    const link=e.target.closest('[data-system]');
    if (link) {e.preventDefault();show(Number(link.dataset.system),1);}
  });
  document.getElementById('less').onclick=()=>show(current,zoom/1.25);
  document.getElementById('more').onclick=()=>show(current,zoom*1.25);
  document.getElementById('fit').onclick=()=>show(current,1);
  const saved=state.getState();
  if (saved) show(saved.id,saved.zoom);
}
module.exports={render,esc};
