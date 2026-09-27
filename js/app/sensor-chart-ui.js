(function(root){
  'use strict';
  const App=root.App=root.App || {};
  let modal=null,modalFrame=0,activeNodeId=null;
  const popouts=new Map();

  function nodeById(id){return App.graph?.getNodeById?.(id) || null;}
  function hasSensors(node){return !!node?.properties?.flow?.nodes?.some(item=>item?.kind==='sensor');}
  function button(label,className){const el=document.createElement('button');el.type='button';el.className=className || 'sensorChartButton';el.textContent=label;return el;}
  function sizeCanvas(canvas){
    const rect=canvas.getBoundingClientRect(),width=Math.max(320,Math.round(rect.width)),height=Math.max(300,Math.round(rect.height)),dpr=Math.max(1,Math.min(2,Number(root.devicePixelRatio) || 1));
    const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
    return {width,height,dpr};
  }
  function render(node,canvas){
    if(!node || !canvas?.isConnected || typeof node.drawSensorChart!=='function')return false;
    const {width,height,dpr}=sizeCanvas(canvas),ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#f7f9fc';ctx.fillRect(0,0,width,height);
    return !!node.drawSensorChart(ctx,{width,height,top:12,fontScale:Math.max(1.15,Math.min(1.45,width/760))});
  }
  function modalLoop(){
    modalFrame=0;if(!modal || modal.hidden)return;const node=nodeById(activeNodeId);
    if(!hasSensors(node)){closeModal();return;}render(node,modal.canvas);modalFrame=root.requestAnimationFrame(modalLoop);
  }
  function closeModal(){
    if(!modal)return;modal.hidden=true;activeNodeId=null;if(modalFrame){root.cancelAnimationFrame(modalFrame);modalFrame=0;}document.body.classList.remove('sensor-chart-modal-open');
  }
  function ensureModal(){
    if(modal)return modal;
    const overlay=document.createElement('div');overlay.className='sensorChartModalOverlay';overlay.hidden=true;overlay.setAttribute('role','presentation');
    const dialog=document.createElement('section');dialog.className='sensorChartModal';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','sensorChartModalTitle');
    const header=document.createElement('header');header.className='sensorChartModalHeader';const heading=document.createElement('div');heading.className='sensorChartModalHeading';
    const eyebrow=document.createElement('span');eyebrow.className='sensorChartModalEyebrow';eyebrow.textContent='FLOW SENSOR';const title=document.createElement('h2');title.id='sensorChartModalTitle';title.textContent='Sensor performance';const subtitle=document.createElement('span');subtitle.className='sensorChartModalSubtitle';
    heading.append(eyebrow,title,subtitle);const actions=document.createElement('div');actions.className='sensorChartModalActions';const popout=button('Pop Out','sensorChartButton is-primary'),close=button('Close');actions.append(popout,close);header.append(heading,actions);
    const body=document.createElement('div');body.className='sensorChartModalBody';const canvas=document.createElement('canvas');canvas.className='sensorChartModalCanvas';canvas.setAttribute('aria-label','Cycle Time and throughput charts');body.append(canvas);dialog.append(header,body);overlay.append(dialog);document.body.append(overlay);
    close.addEventListener('click',closeModal);popout.addEventListener('click',()=>{const node=nodeById(activeNodeId);if(node && openPopout(node))closeModal();});overlay.addEventListener('pointerdown',event=>{if(event.target===overlay)closeModal();});
    modal={overlay,dialog,title,subtitle,canvas,popout,close,hidden:true};Object.defineProperty(modal,'hidden',{get:()=>overlay.hidden,set:value=>{overlay.hidden=!!value;}});
    return modal;
  }
  function openModal(node){
    if(!hasSensors(node)){App.showToast?.('This node has no Flow Sensor chart.');return false;}
    const view=ensureModal();activeNodeId=node.id;view.title.textContent=`${node.title || 'Node'} Sensor performance`;view.subtitle.textContent=`Node #${node.id} · live Cycle Time / TPH`;view.hidden=false;document.body.classList.add('sensor-chart-modal-open');view.close.focus({preventScroll:true});if(modalFrame)root.cancelAnimationFrame(modalFrame);modalFrame=root.requestAnimationFrame(modalLoop);return true;
  }
  function popoutMarkup(){return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sensor performance</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#eef2f7;color:#172033;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{display:grid;grid-template-rows:auto minmax(0,1fr)}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #d8e0ea;background:#fff}h1{margin:0;font-size:17px}p{margin:3px 0 0;color:#667085;font-size:12px}button{min-height:34px;padding:0 14px;border:1px solid #c8d3df;border-radius:8px;background:#fff;color:#172033;font:600 13px inherit;cursor:pointer}main{min-height:0;padding:14px}canvas{display:block;width:100%;height:100%;border:1px solid #d8e0ea;border-radius:12px;background:#f7f9fc;box-shadow:0 8px 28px #17365d12}</style></head><body><header><div><h1 id="title">Sensor performance</h1><p id="subtitle">Live Cycle Time / TPH</p></div><button id="close" type="button">Close</button></header><main><canvas id="chart"></canvas></main></body></html>';}
  function openPopout(node){
    if(!hasSensors(node)){App.showToast?.('This node has no Flow Sensor chart.');return false;}
    const existing=popouts.get(node.id);if(existing && !existing.win.closed){existing.win.focus();return true;}
    const win=root.open('','factSimSensorChart'+node.id,'popup=yes,width=1100,height=760,resizable=yes,scrollbars=no');if(!win){App.showToast?.('Pop Out was blocked by the browser. Allow pop-ups and try again.');return false;}
    win.document.open();win.document.write(popoutMarkup());win.document.close();win.document.title=`${node.title || 'Node'} Sensor performance`;win.document.getElementById('title').textContent=`${node.title || 'Node'} Sensor performance`;win.document.getElementById('subtitle').textContent=`Node #${node.id} · live Cycle Time / TPH`;win.document.getElementById('close').onclick=()=>win.close();
    const state={win,frame:0};popouts.set(node.id,state);const loop=()=>{if(win.closed){popouts.delete(node.id);return;}const current=nodeById(node.id);if(!hasSensors(current)){win.close();popouts.delete(node.id);return;}render(current,win.document.getElementById('chart'));state.frame=root.requestAnimationFrame(loop);};state.frame=root.requestAnimationFrame(loop);win.focus();return true;
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && modal && !modal.hidden){event.preventDefault();closeModal();}});
  root.addEventListener('beforeunload',()=>{for(const state of popouts.values())try{state.win.close();}catch(_error){}});
  App.openSensorChart=openModal;App.openSensorChartPopout=openPopout;App.closeSensorChart=closeModal;
})(window);
