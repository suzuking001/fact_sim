// Entity Type manager and Basic/Flow/Contents/Advanced inspector tabs.

(function(root){
  'use strict';
  const App = root.App || (root.App = {});

  function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value, fallback){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; } }
  function running(){ return typeof root.isSimRunning === 'function' && root.isSimRunning(); }
  function changed(mutator){
    const graph = App.graph;
    let opened = false;
    try{
      if(graph?.beforeChange){ graph.beforeChange(); opened = true; }
    }catch(err){
      console.warn('Unable to capture pre-change snapshot', err);
    }
    try{
      mutator();
      graph?.change?.();
    }finally{
      if(opened && graph?.afterChange) graph.afterChange();
      App.canvas?.setDirty?.(true, true);
    }
  }

  function button(label, action, className){
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className || 'selectionInspectorBtn is-muted';
    el.textContent = label;
    el.addEventListener('click', action);
    return el;
  }

  function select(options, value){
    const el = document.createElement('select');
    el.className = 'selectionInspectorSelect';
    for(const entry of options){
      const opt = document.createElement('option');
      opt.value = String(Array.isArray(entry) ? entry[0] : entry);
      opt.textContent = String(Array.isArray(entry) ? entry[1] : entry);
      el.appendChild(opt);
    }
    el.value = String(value == null ? '' : value);
    return el;
  }

  function typeOptions(registry, includeCategory, includeOtherwise, includeSequence){
    const out = [];
    if(includeOtherwise) out.push(['otherwise', 'Otherwise']);
    if(includeSequence) out.push(['sequence', 'Sequence (generate Work)']);
    if(includeCategory){
      out.push(['category:work', 'Any Work'], ['category:container', 'Any Container'], ['category:carrier', 'Any Carrier']);
    }
    for(const type of registry?.list?.() || []) out.push([`type:${type.typeId}`, type.name]);
    return out;
  }

  function targetValue(target){
    const normalized = App.normalizeEntityTarget ? App.normalizeEntityTarget(target) : target;
    if(normalized?.mode === 'otherwise') return 'otherwise';
    if(normalized?.mode === 'sequence') return 'sequence';
    if(normalized?.mode === 'category') return `category:${normalized.category}`;
    return `type:${normalized?.typeId || ''}`;
  }

  function parseTarget(value){
    const text = String(value || '');
    if(text === 'otherwise') return { mode: 'otherwise' };
    if(text === 'sequence') return { mode: 'sequence' };
    if(text.startsWith('category:')) return { mode: 'category', category: text.slice(9) };
    return { mode: 'type', typeId: text.replace(/^type:/, '') };
  }

  function makeCard(title, hint){
    const card = document.createElement('section');
    card.className = 'selectionInspectorCard';
    const section = document.createElement('div');
    section.className = 'selectionInspectorSection';
    const heading = document.createElement('h3');
    heading.className = 'selectionInspectorSectionTitle';
    heading.textContent = title;
    section.appendChild(heading);
    if(hint){
      const p = document.createElement('p');
      p.className = 'selectionInspectorHint';
      p.textContent = hint;
      section.appendChild(p);
    }
    card.appendChild(section);
    return { card, section };
  }

  function basicDerivedNode(node){
    return !!node && (node.type === 'factory/basic' || Number(node.properties?.basicNodeVersion) >= 1);
  }

  function graphLink(node, linkId){
    if(linkId == null) return null;
    return node?.graph?.links?.[linkId] || App.graph?.links?.[linkId] || null;
  }

  function connectedSteps(node, direction){
    const isInput = direction === 'upstream';
    const ports = Array.isArray(isInput ? node?.inputs : node?.outputs) ? (isInput ? node.inputs : node.outputs) : [];
    const result = [];
    ports.forEach((port, portIndex)=>{
      const ids = isInput ? [port?.link] : (Array.isArray(port?.links) ? port.links : []);
      ids.filter((id)=>id != null).forEach((id)=>{
        const link = graphLink(node, id);
        if(!link) return;
        const otherId = isInput ? link.origin_id : link.target_id;
        const other = node?.graph?.getNodeById?.(otherId) || App.graph?.getNodeById?.(otherId);
        const title = String(other?.title || `Node #${otherId}`);
        const otherPortIndex = isInput ? link.origin_slot : link.target_slot;
        const otherPorts = isInput ? other?.outputs : other?.inputs;
        const otherPort = Array.isArray(otherPorts) ? otherPorts[otherPortIndex] : null;
        result.push({
          portIndex,
          portName: String(port?.name || `${isInput ? 'IN' : 'OUT'} ${portIndex + 1}`),
          nodeId: otherId,
          title,
          otherPortName: String(otherPort?.name || '')
        });
      });
    });
    return result;
  }

  function numberedTimeProperties(node, prefix){
    const props = isObject(node?.properties) ? node.properties : {};
    const pattern = new RegExp(`^${prefix}(?:\\d+)?$`);
    const keys = Object.keys(props).filter((key)=>pattern.test(key));
    if(!keys.includes(prefix)) keys.unshift(prefix);
    return Array.from(new Set(keys)).sort((a, b)=>{
      if(a === prefix) return -1;
      if(b === prefix) return 1;
      return (Number(a.replace(prefix, '')) || 1) - (Number(b.replace(prefix, '')) || 1);
    });
  }

  function processTimeProperties(node){ return numberedTimeProperties(node, 'processTime'); }
  function downTimeProperties(node){ return numberedTimeProperties(node, 'downTime'); }

  function cycleTimingKeys(node, direction){
    App.ensureBasicPortTimings?.(node);
    const ports = direction === 'input' ? node?.inputs : node?.outputs;
    const signalPattern = direction === 'input' ? /^sigIn/i : /^sigOut/i;
    const entityPorts = (ports || []).filter((port)=>port?.portId && port?.channel !== 'signal' && !signalPattern.test(String(port.name || '')));
    const timings = node.properties?.portTimings || {};
    const keys = direction === 'input'
      ? entityPorts.flatMap((port)=>{
          const stages = timings.inputs?.[port.portId]?.processStages;
          return (Array.isArray(stages) && stages.length ? stages : [{ stageId:`${port.portId}-process-1` }])
            .map((stage)=>`@${direction}:${port.portId}:${stage.stageId}`);
        })
      : entityPorts.map((port)=>`@${direction}:${port.portId}`);
    if(keys.length) return keys;
    return direction === 'input' ? processTimeProperties(node) : downTimeProperties(node);
  }

  function parseCycleTimingKey(key){
    const raw = String(key || '').replace(/^@/, '');
    const parts = raw.split(':');
    return parts.length >= 2
      ? { direction:parts[0], portId:parts[1], stageId:parts.slice(2).join(':') }
      : { direction:'', portId:'', stageId:'' };
  }

  function readCycleTiming(node, key){
    if(!String(key).startsWith('@')) return Math.max(0, Number(node.properties?.[key]) || 0);
    const { direction, portId, stageId } = parseCycleTimingKey(key);
    const timings = App.ensureBasicPortTimings?.(node) || node.properties?.portTimings || {};
    if(direction === 'input'){
      const timing = timings.inputs?.[portId] || {};
      const stage = (timing.processStages || []).find((entry)=>String(entry?.stageId) === stageId);
      return Math.max(0, Number(stage?.durationSec ?? timing.processTimeSec) || 0);
    }
    return Math.max(0, Number(timings.outputs?.[portId]?.downTimeSec) || 0);
  }

  function writeCycleTiming(node, key, value){
    const seconds = Math.max(0, Number(value) || 0);
    if(!String(key).startsWith('@')){
      node.properties[key] = seconds;
      node.onPropertyChanged?.(key);
      return;
    }
    const { direction, portId, stageId } = parseCycleTimingKey(key);
    const timings = App.ensureBasicPortTimings?.(node) || node.properties.portTimings;
    if(direction === 'input'){
      const timing = timings.inputs[portId] = { ...(timings.inputs[portId] || {}) };
      timing.processStages = Array.isArray(timing.processStages) ? timing.processStages : [];
      let stage = timing.processStages.find((entry)=>String(entry?.stageId) === stageId);
      if(!stage){ stage = { stageId:stageId || `${portId}-process-1`, durationSec:0 }; timing.processStages.push(stage); }
      stage.durationSec = seconds;
      timing.processTimeSec = timing.processStages.reduce((sum, entry)=>sum + Math.max(0, Number(entry?.durationSec) || 0), 0);
    }else{
      timings.outputs[portId] = { ...(timings.outputs[portId] || {}), downTimeSec:seconds };
    }
  }

  function formatSeconds(value){
    const number = Math.max(0, Number(value) || 0);
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
  }

  function cycleArc(svg, value, ringFraction, offset, color, label, extraClass = ''){
    const namespace = 'http://www.w3.org/2000/svg';
    const radius = 76;
    const circumference = 2 * Math.PI * radius;
    const fraction = Math.max(0, Number(ringFraction) || 0);
    if(fraction <= 0) return offset;
    const length = circumference * fraction;
    const circle = document.createElementNS(namespace, 'circle');
    circle.setAttribute('class', `entityCycleArc${extraClass ? ` ${extraClass}` : ''}`);
    circle.setAttribute('cx', '150');
    circle.setAttribute('cy', '130');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '24');
    circle.setAttribute('stroke-linecap', 'butt');
    circle.setAttribute('stroke-dasharray', `${Math.max(0.1, length)} ${circumference}`);
    circle.setAttribute('stroke-dashoffset', String(-offset));
    circle.setAttribute('transform', 'rotate(180 150 130)');
    if(label) circle.setAttribute('aria-label', `${label}: ${formatSeconds(value)} seconds`);
    else circle.setAttribute('aria-hidden', 'true');
    svg.appendChild(circle);
    return offset + length;
  }

  function cyclePoint(fraction, radius = 88){
    const angle = Math.PI + (Math.max(0, Number(fraction) || 0) * Math.PI * 2);
    return {
      x: 150 + radius * Math.cos(angle),
      y: 130 + radius * Math.sin(angle)
    };
  }

  function appendCycleLabels(svg){
    const namespace = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('class', 'entityCycleLabels');
    const definitions = [
      { key:'process', label:'PROCESS', x:39, y:16, box:[0, 1, 78, 30] },
      { key:'down', label:'DOWN', x:35, y:245, box:[0, 230, 70, 29] }
    ];
    for(const item of definitions){
      const box = document.createElementNS(namespace, 'rect');
      box.setAttribute('class', `entityCycleCalloutBox is-${item.key}`);
      box.setAttribute('x', String(item.box[0])); box.setAttribute('y', String(item.box[1]));
      box.setAttribute('width', String(item.box[2])); box.setAttribute('height', String(item.box[3])); box.setAttribute('rx', '10');
      const text = document.createElementNS(namespace, 'text');
      text.setAttribute('class', `entityCycleCalloutText is-${item.key}`);
      text.setAttribute('x', String(item.x)); text.setAttribute('y', String(item.y));
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.textContent = item.label;
      group.append(box, text);
    }
    svg.appendChild(group);
  }

  function appendCycleDirectionArrows(svg){
    const namespace = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('class', 'entityCycleArrows');
    group.setAttribute('aria-hidden', 'true');
    [0.12, 0.45, 0.78].forEach((fraction)=>{
      const point = cyclePoint(fraction, 76);
      const arrow = document.createElementNS(namespace, 'path');
      arrow.setAttribute('class', 'entityCycleArrow');
      arrow.setAttribute('d', 'M -5 -4 L 2 0 L -5 4');
      arrow.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${270 + (fraction * 360)})`);
      group.appendChild(arrow);
    });
    svg.appendChild(group);
  }

  function appendCycleLeader(layer, kind, anchor, target, color, routeIndex = 0, routeCount = 1){
    const namespace = 'http://www.w3.org/2000/svg';
    const normalizedAngle = (angle)=>{
      let result = angle % (Math.PI * 2);
      if(result < 0) result += Math.PI * 2;
      return result;
    };
    const targetAngle = normalizedAngle(Math.atan2(target.y - 130, target.x - 150));
    const radiusStep = routeCount > 1 ? Math.min(4, 12 / (routeCount - 1)) : 0;
    const routeRadius = 94 + (Math.max(0, routeIndex) * radiusStep);
    const clamp = (value, min, max)=>Math.min(max, Math.max(min, value));
    const projectedX = clamp((anchor.x - 150) / routeRadius, -1, 1);
    const projectedY = clamp((anchor.y - 130) / routeRadius, -1, 1);
    const startAngle = kind === 'process'
      ? normalizedAngle((Math.PI * 2) - Math.acos(projectedX))
      : kind === 'down'
        ? Math.acos(projectedX)
        : kind === 'idle'
          ? normalizedAngle(Math.PI - Math.asin(projectedY))
          : normalizedAngle(Math.asin(projectedY));
    const polar = (angle)=>({
      x:150 + routeRadius * Math.cos(angle),
      y:130 + routeRadius * Math.sin(angle)
    });
    const start = polar(startAngle);
    const outer = polar(targetAngle);
    const directX = target.x - anchor.x;
    const directY = target.y - anchor.y;
    const directLengthSquared = (directX * directX) + (directY * directY);
    const closestFraction = directLengthSquared > 0
      ? clamp((((150 - anchor.x) * directX) + ((130 - anchor.y) * directY)) / directLengthSquared, 0, 1)
      : 0;
    const closestX = anchor.x + (directX * closestFraction);
    const closestY = anchor.y + (directY * closestFraction);
    const clearsDonut = Math.hypot(closestX - 150, closestY - 130) >= 87.5;
    let delta = targetAngle - startAngle;
    while(delta > Math.PI) delta -= Math.PI * 2;
    while(delta < -Math.PI) delta += Math.PI * 2;
    const sweep = delta >= 0 ? 1 : 0;
    let path = `M ${anchor.x} ${anchor.y}`;
    if(clearsDonut){
      path += ` L ${target.x} ${target.y}`;
    }else{
      path += ` L ${start.x} ${start.y}`;
      if(Math.abs(delta) > 0.0001){
        path += ` A ${routeRadius} ${routeRadius} 0 0 ${sweep} ${outer.x} ${outer.y}`;
      }
      path += ` L ${target.x} ${target.y}`;
    }
    const halo = document.createElementNS(namespace, 'path');
    halo.setAttribute('class', `entityCycleLeaderHalo is-${kind}`);
    halo.setAttribute('d', path);
    const line = document.createElementNS(namespace, 'path');
    line.setAttribute('class', `entityCycleLeader is-${kind}`);
    line.setAttribute('d', path);
    if(color) line.style.stroke = color;
    const point = document.createElementNS(namespace, 'circle');
    point.setAttribute('class', `entityCycleLeaderPoint is-${kind}`);
    point.setAttribute('cx', String(target.x));
    point.setAttribute('cy', String(target.y));
    point.setAttribute('r', '3.5');
    if(color) point.style.stroke = color;
    layer.append(halo, line, point);
  }

  function appendCycleFanoutBus(layer, anchors){
    if(!Array.isArray(anchors) || !anchors.length) return;
    const namespace = 'http://www.w3.org/2000/svg';
    const ring = { x:238, y:130 };
    const busX = 270;
    const ys = anchors.map((anchor)=>anchor.y);
    const minY = Math.min(ring.y, ...ys);
    const maxY = Math.max(ring.y, ...ys);
    let path = `M ${ring.x} ${ring.y} H ${busX} M ${busX} ${minY} V ${maxY}`;
    anchors.forEach((anchor)=>{ path += ` M ${busX} ${anchor.y} H ${anchor.x}`; });
    const halo = document.createElementNS(namespace, 'path');
    halo.setAttribute('class', 'entityCycleLeaderHalo is-wait is-fanout');
    halo.setAttribute('d', path);
    const line = document.createElementNS(namespace, 'path');
    line.setAttribute('class', 'entityCycleLeader is-wait is-fanout');
    line.setAttribute('d', path);
    const point = document.createElementNS(namespace, 'circle');
    point.setAttribute('class', 'entityCycleLeaderPoint is-wait');
    point.setAttribute('cx', String(ring.x));
    point.setAttribute('cy', String(ring.y));
    point.setAttribute('r', '3.5');
    layer.append(halo, line, point);
  }

  function connectionLabel(entry, fallback, direction){
    if(!entry) return fallback;
    const remote = entry.otherPortName ? `${entry.title} · ${entry.otherPortName}` : entry.title;
    if(direction === 'downstream') return `${entry.portName} → ${remote}`;
    if(direction === 'upstream') return `${remote} → ${entry.portName}`;
    return remote;
  }

  function renderCycleConnections(host, rows, state, direction){
    const list = rows.length ? rows : [null];
    list.forEach((entry, index)=>{
      const row = document.createElement('div');
      row.className = `entityCycleConnection is-${direction}`;
      const caption = document.createElement('span');
      caption.className = 'entityCycleConnectionCaption';
      const physicalPort = entry?.portName || `${direction === 'upstream' ? 'inPort' : 'outPort'}${index + 1}`;
      caption.textContent = `${direction === 'upstream' ? 'INPUT' : 'OUTPUT'} · ${physicalPort}`;
      const name = document.createElement('strong');
      name.className = 'entityCycleConnectionName';
      name.textContent = connectionLabel(entry, 'Not connected', direction);
      const stateChip = document.createElement('span');
      stateChip.className = `entityCycleState is-${state.toLowerCase()}`;
      stateChip.innerHTML = `<b>${state}</b><small>${state === 'IDLE' ? 'Ready for input' : 'Waiting to release'}</small>`;
      const connector = document.createElement('span');
      connector.className = 'entityCycleConnector';
      connector.textContent = '›';
      connector.setAttribute('aria-hidden', 'true');
      if(direction === 'upstream') row.append(caption, name, stateChip);
      else row.append(stateChip, caption, name);
      row.appendChild(connector);
      host.appendChild(row);
    });
  }

  function renderCycleEditor(node){
    const shell = makeCard('Process Cycle', 'Configure input readiness, processing, downstream release, and recovery as one continuous cycle.');
    shell.card.classList.add('entityCycleCard');
    const props = isObject(node?.properties) ? node.properties : {};
    const processKeys = cycleTimingKeys(node, 'input');
    const downKeys = cycleTimingKeys(node, 'output');
    const upstream = connectedSteps(node, 'upstream');
    const downstream = connectedSteps(node, 'downstream');
    const highFanout = Math.max(downstream.length, downKeys.length) > 3;
    const visual = document.createElement('div');
    visual.className = 'entityCycleVisual';
    visual.classList.toggle('is-high-fanout', highFanout);
    const upstreamHost = document.createElement('div');
    upstreamHost.className = 'entityCycleConnections is-upstream';
    const downstreamHost = document.createElement('div');
    downstreamHost.className = 'entityCycleConnections is-downstream';
    renderCycleConnections(upstreamHost, upstream, 'IDLE', 'upstream');
    renderCycleConnections(downstreamHost, downstream, 'WAIT', 'downstream');

    const donut = document.createElement('div');
    donut.className = 'entityCycleDonut';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 260');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Process cycle time breakdown');
    svg.innerHTML = '<circle class="entityCycleTrack" cx="150" cy="130" r="76" fill="none" stroke="rgba(120,120,128,.13)" stroke-width="24"></circle>';
    const arcLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arcLayer.setAttribute('class', 'entityCycleArcLayer');
    svg.appendChild(arcLayer);
    appendCycleDirectionArrows(svg);
    const leaderLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    leaderLayer.setAttribute('class', 'entityCycleLeaderLayer');
    svg.appendChild(leaderLayer);
    appendCycleLabels(svg);
    const center = document.createElement('div');
    center.className = 'entityCycleCenter';
    const totalLabel = document.createElement('span'); totalLabel.textContent = 'CYCLE TIME';
    const totalValue = document.createElement('strong');
    const totalUnit = document.createElement('small'); totalUnit.textContent = 'seconds';
    center.append(totalLabel, totalValue, totalUnit);
    const direction = document.createElement('span');
    direction.className = 'entityCycleDirection';
    direction.textContent = 'CLOCKWISE ↻';
    direction.setAttribute('aria-hidden', 'true');
    center.appendChild(direction);
    const draftValues = Object.fromEntries([
      ...processKeys.map((key)=>[key, readCycleTiming(node, key)]),
      ...downKeys.map((key)=>[key, readCycleTiming(node, key)])
    ]);

    const updateVisual = ()=>{
      arcLayer.replaceChildren();
      leaderLayer.replaceChildren();
      const processValues = processKeys.map((key)=>Math.max(0, Number(draftValues[key]) || 0));
      const downValues = downKeys.map((key)=>Math.max(0, Number(draftValues[key]) || 0));
      const processTotal = processValues.reduce((sum, value)=>sum + value, 0);
      const downTotal = downValues.reduce((sum, value)=>sum + value, 0);
      const total = processTotal + downTotal;
      let offset = 0;
      let fractionOffset = 0;
      const processSegments = [];
      const downSegments = [];
      processValues.forEach((value, index)=>{
        const color = ['#30d158','#18b94f','#0f9f43','#67d986'][index % 4];
        const segmentFraction = total > 0 ? value / total : 0;
        offset = cycleArc(arcLayer, value, segmentFraction, offset, color, `Process ${index + 1}`);
        processSegments.push({ start:fractionOffset, end:fractionOffset + segmentFraction, color });
        fractionOffset += segmentFraction;
      });
      downValues.forEach((value, index)=>{
        const color = ['#0a84ff','#3a9cff','#006edc','#69b6ff'][index % 4];
        const segmentFraction = total > 0 ? value / total : 0;
        offset = cycleArc(arcLayer, value, segmentFraction, offset, color, `Down ${index + 1}`);
        downSegments.push({ start:fractionOffset, end:fractionOffset + segmentFraction, color });
        fractionOffset += segmentFraction;
      });
      const svgPoint = (element, edge, fallback)=>{
        const svgRect = svg.getBoundingClientRect();
        const elementRect = element?.getBoundingClientRect?.();
        if(!elementRect || !svgRect.width || !svgRect.height) return fallback;
        const viewportX = edge === 'left'
          ? elementRect.left
          : edge === 'right'
            ? elementRect.right
            : elementRect.left + (elementRect.width / 2);
        const viewportY = edge === 'top'
          ? elementRect.top
          : edge === 'bottom'
            ? elementRect.bottom
            : elementRect.top + (elementRect.height / 2);
        return {
          x:(viewportX - svgRect.left) * (300 / svgRect.width),
          y:(viewportY - svgRect.top) * (260 / svgRect.height)
        };
      };
      const processControlStart = 84;
      const controlWidth = 216;
      const processFields = processControls.querySelectorAll('.entityCycleInlineControl');
      processSegments.forEach((segment, index)=>{
        const fallback = { x:processControlStart + ((index + 0.5) * controlWidth / processSegments.length), y:31 };
        const anchor = svgPoint(processFields[index], 'bottom', fallback);
        appendCycleLeader(leaderLayer, 'process', anchor, cyclePoint((segment.start + segment.end) / 2), segment.color, index, processSegments.length);
      });
      if(!highFanout){
        const downFields = downControls.querySelectorAll('.entityCycleInlineControl');
        downSegments.forEach((segment, index)=>{
          const fallback = { x:processControlStart + ((index + 0.5) * controlWidth / downSegments.length), y:230 };
          const anchor = svgPoint(downFields[index], 'top', fallback);
          appendCycleLeader(leaderLayer, 'down', anchor, cyclePoint((segment.start + segment.end) / 2), segment.color, index, downSegments.length);
        });
      }
      const mappedSegment = (segments, index, count)=>{
        if(!segments.length) return null;
        if(count <= 1) return segments[0];
        return segments[Math.round((index * (segments.length - 1)) / (count - 1))];
      };
      const upstreamCount = Math.max(1, upstream.length);
      const upstreamConnectors = upstreamHost.querySelectorAll('.entityCycleConnector');
      for(let index = 0; index < upstreamCount; index += 1){
        const segment = mappedSegment(processSegments, index, upstreamCount);
        const target = cyclePoint(segment?.start ?? 0);
        const fallback = { x:-13, y:((index + 0.5) * 260) / upstreamCount };
        appendCycleLeader(leaderLayer, 'idle', svgPoint(upstreamConnectors[index], 'center', fallback), target, '#c87908', index, upstreamCount);
      }
      if(highFanout){
        const downstreamConnectors = downstreamHost.querySelectorAll('.entityCycleConnector');
        const anchors = Array.from(downstreamConnectors).map((connector, index)=>
          svgPoint(connector, 'center', { x:313, y:((index + 0.5) * 260) / Math.max(1, downstreamConnectors.length) }));
        appendCycleFanoutBus(leaderLayer, anchors);
      }else{
        const downstreamCount = Math.max(1, downstream.length);
        const downstreamConnectors = downstreamHost.querySelectorAll('.entityCycleConnector');
        for(let index = 0; index < downstreamCount; index += 1){
          const segment = mappedSegment(downSegments, index, downstreamCount);
          const fallback = processSegments.at(-1)?.end ?? 0.5;
          const target = cyclePoint(segment?.start ?? fallback);
          const fallbackAnchor = { x:313, y:((index + 0.5) * 260) / downstreamCount };
          appendCycleLeader(leaderLayer, 'wait', svgPoint(downstreamConnectors[index], 'center', fallbackAnchor), target, '#c87908', index, downstreamCount);
        }
      }
      totalValue.textContent = `${formatSeconds(total)} s`;
    };
    const commit = (key, input)=>{
      const next = Math.max(0, Number(input.value) || 0);
      input.value = formatSeconds(next);
      draftValues[key] = next;
      changed(()=>{
        node.properties = isObject(node.properties) ? node.properties : {};
        writeCycleTiming(node, key, next);
        node.setDirtyCanvas?.(true, true);
      });
      updateVisual();
    };
    const makeInlineTimeField = (host, key, label, color, meta)=>{
      const field = document.createElement('label');
      field.className = 'entityCycleInlineControl';
      field.style.setProperty('--cycle-color', color);
      field.title = meta;
      if(label){
        const badge = document.createElement('b');
        badge.textContent = label;
        field.appendChild(badge);
      }else{
        field.classList.add('is-single');
      }
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.step = '0.1';
      input.value = formatSeconds(readCycleTiming(node, key));
      input.disabled = running();
      input.setAttribute('aria-label', `${host.dataset.label} ${label.replace(/^[A-Z]/, '') || '1'} seconds`);
      const unit = document.createElement('small'); unit.textContent = 's';
      input.addEventListener('input', ()=>{
        const next = Math.max(0, Number(input.value) || 0);
        draftValues[key] = next;
        updateVisual();
      });
      input.addEventListener('change', ()=>commit(key, input));
      field.append(input, unit);
      host.appendChild(field);
    };
    const processControls = document.createElement('div');
    processControls.className = 'entityCycleInlineControls is-process';
    processControls.dataset.label = 'PROCESS';
    processControls.style.setProperty('--control-count', String(processKeys.length));
    processKeys.forEach((key, index)=>{
      const related = upstream[index] || upstream[0];
      const portId = parseCycleTimingKey(key).portId;
      const portName = portId ? (node.inputs || []).find((port)=>port?.portId === portId)?.name : '';
      makeInlineTimeField(processControls, key, portName ? `P${index + 1} · ${portName}` : `P${index + 1}`, ['#30d158','#18b94f','#0f9f43','#67d986'][index % 4], connectionLabel(related, 'Processing', 'upstream'));
    });
    const downControls = document.createElement('div');
    downControls.className = 'entityCycleInlineControls is-down';
    downControls.dataset.label = 'DOWN';
    downControls.style.setProperty('--control-count', String(downKeys.length));
    downKeys.forEach((key, index)=>{
      const related = downstream[index] || downstream[0];
      const portId = parseCycleTimingKey(key).portId;
      const portName = portId ? (node.outputs || []).find((port)=>port?.portId === portId)?.name : '';
      makeInlineTimeField(downControls, key, portName ? `D${index + 1} · ${portName}` : `D${index + 1}`, ['#0a84ff','#3a9cff','#006edc','#69b6ff'][index % 4], connectionLabel(related, 'Recovery', 'downstream'));
    });
    donut.append(svg, center, processControls, downControls);
    visual.append(upstreamHost, donut, downstreamHost);
    shell.section.appendChild(visual);
    updateVisual();
    requestAnimationFrame(()=>{
      if(visual.isConnected) updateVisual();
    });
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(()=>{
        if(!visual.isConnected){ observer.disconnect(); return; }
        updateVisual();
      });
      observer.observe(visual);
    }
    return shell.card;
  }

  function renderTypeManager(){
    const host = document.getElementById('entityTypesPanelBody');
    if(!host) return;
    host.innerHTML = '';
    const registry = App.entityModelForGraph?.(App.graph);
    if(!registry){ host.textContent = 'Open a graph to edit Entity Types.'; return; }
    const locked = running();
    const list = document.createElement('div');
    list.className = 'entityTypeList';
    for(const type of registry.list()){
      const row = document.createElement('div');
      row.className = 'entityTypeRow';
      const summary = document.createElement('div');
      summary.className = 'entityTypeSummary';
      const name = document.createElement('strong'); name.textContent = type.name;
      const meta = document.createElement('small');
      meta.textContent = `${type.category}${type.subtype ? ` / ${type.subtype}` : ''} · capacity ${type.capacity}`;
      summary.append(name, meta);
      const actions = document.createElement('div'); actions.className = 'entityTypeActions';
      const edit = button('Edit', ()=>openTypeEditor(type), 'selectionInspectorBtn is-muted');
      const remove = button('Delete', ()=>{
        if(locked) return;
        try{
          changed(()=>registry.remove(type.typeId));
          renderTypeManager();
        }catch(err){ root.alert?.(String(err?.message || err)); }
      }, 'selectionInspectorBtn is-danger');
      edit.disabled = remove.disabled = locked;
      actions.append(edit, remove);
      row.append(summary, actions);
      list.appendChild(row);
    }
    host.appendChild(list);
    const add = button('Add Entity Type', ()=>openTypeEditor(null), 'selectionInspectorBtn is-primary');
    add.disabled = locked;
    host.appendChild(add);
  }

  function openTypeEditor(existing){
    if(running()) return;
    const registry = App.entityModelForGraph?.(App.graph);
    if(!registry) return;
    const modal = document.createElement('div');
    modal.className = 'entityModalBackdrop';
    const dialog = document.createElement('div'); dialog.className = 'entityModal';
    const title = document.createElement('h2'); title.textContent = existing ? 'Edit Entity Type' : 'Add Entity Type';
    const form = document.createElement('div'); form.className = 'entityModalFields';
    const field = (label, control)=>{
      const wrap = document.createElement('label'); wrap.className = 'entityModalField';
      const span = document.createElement('span'); span.textContent = label;
      wrap.append(span, control); form.appendChild(wrap); return control;
    };
    const name = field('Name', document.createElement('input')); name.value = existing?.name || '';
    const category = field('Category', select(['work', 'container', 'carrier'], existing?.category || 'work'));
    const subtype = field('Subtype / tag', document.createElement('input')); subtype.value = existing?.subtype || '';
    const capacity = field('Capacity', document.createElement('input')); capacity.type = 'number'; capacity.min = '0'; capacity.step = '1'; capacity.value = String(existing?.capacity || 0);
    const allowed = field('Allowed contents', document.createElement('select'));
    allowed.multiple = true; allowed.size = Math.min(8, Math.max(3, registry.list().length));
    for(const type of registry.list()){
      if(existing && type.typeId === existing.typeId) continue;
      const option = document.createElement('option'); option.value = type.typeId; option.textContent = type.name;
      option.selected = !!existing?.allowedContentTypeIds?.includes(type.typeId); allowed.appendChild(option);
    }
    const attrs = field('Default attributes (JSON)', document.createElement('textarea'));
    attrs.value = JSON.stringify(existing?.defaultAttributes || {}, null, 2);
    const error = document.createElement('div'); error.className = 'selectionInspectorNotice is-error';
    const actions = document.createElement('div'); actions.className = 'selectionInspectorActionsRow';
    actions.append(button('Cancel', ()=>modal.remove()), button('Save', ()=>{
      try{
        const parsed = JSON.parse(attrs.value || '{}');
        if(!isObject(parsed)) throw new Error('Default attributes must be a JSON object.');
        const selected = Array.from(allowed.selectedOptions).map((entry)=>entry.value);
        changed(()=>registry.upsert({
          typeId: existing?.typeId,
          name: name.value,
          category: category.value,
          subtype: subtype.value,
          capacity: Number(capacity.value),
          allowedContentTypeIds: selected,
          defaultAttributes: parsed
        }));
        modal.remove(); renderTypeManager(); App.selectionInspector?.refresh?.();
      }catch(err){ error.textContent = String(err?.message || err); }
    }, 'selectionInspectorBtn is-primary'));
    dialog.append(title, form, error, actions); modal.appendChild(dialog); document.body.appendChild(modal);
  }

  function installTypePanel(){
    if(document.getElementById('entityTypesPanel')) return;
    const panel = document.createElement('div'); panel.id = 'entityTypesPanel';
    panel.innerHTML = '<div class="panelHeader">Entity Types</div><div id="entityTypesPanelBody" class="entityTypesPanelBody"></div>';
    const anchor = document.getElementById('addNodePanel');
    if(anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    renderTypeManager();
    root.addEventListener?.('factsim:graph-applied', ()=>renderTypeManager());
  }

  function renderFlowEditor(node){
    const registry = App.entityModelForGraph?.(App.graph || node.graph);
    const wrapper = document.createElement('div');
    const inputConditions = [['always','Always'],['space-available','Space available'],['empty','Empty'],['not-full','Not full'],['custom-condition','Custom']];
    const outputConditions = [['available','Available'],['process-complete','Process complete'],['shuttle-group-idle','Shuttle group process complete (Idle)'],['full','Full'],['empty','Empty'],['count-reached','Count reached'],['time-elapsed','Time elapsed'],['downstream-ready','Downstream ready'],['attribute-condition','Attribute condition'],['custom-condition','Custom']];
    const field = (label, content, extraClass)=>{
      const host = document.createElement('label');
      host.className = `entityRuleField${extraClass ? ` ${extraClass}` : ''}`;
      const caption = document.createElement('span'); caption.className = 'entityRuleFieldLabel'; caption.textContent = label;
      host.append(caption, content);
      return host;
    };
    const conditionKind = (condition, fallback)=>isObject(condition) ? (condition.kind || fallback) : (condition || fallback);
    const appendConditionParameter = (host, condition, commit)=>{
      const kind = conditionKind(condition, 'available');
      if(kind === 'shuttle-group-idle'){
        const parameter = document.createElement('input');
        parameter.type = 'text'; parameter.className = 'selectionInspectorInput';
        parameter.value = String(condition.groupId || 'shuttle-1');
        parameter.placeholder = 'Shuttle group ID'; parameter.title = 'Shuttle group ID';
        parameter.setAttribute('aria-label', 'Shuttle group ID'); parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          condition.groupId = String(parameter.value || '').trim() || 'shuttle-1';
          parameter.value = condition.groupId; commit();
        });
        host.appendChild(parameter);
      }else if(kind === 'count-reached' || kind === 'time-elapsed'){
        const parameter = document.createElement('input');
        parameter.type = 'number'; parameter.min = '0'; parameter.step = kind === 'count-reached' ? '1' : '0.1';
        parameter.value = String(kind === 'count-reached' ? (condition.count ?? 1) : (condition.seconds ?? 0));
        parameter.title = kind === 'count-reached' ? 'Count' : 'Seconds';
        parameter.setAttribute('aria-label', parameter.title);
        parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          if(kind === 'count-reached') condition.count = Math.max(0, Math.round(Number(parameter.value) || 0));
          else condition.seconds = Math.max(0, Number(parameter.value) || 0);
          commit();
        });
        host.appendChild(parameter);
      }else if(kind === 'attribute-condition' || kind === 'custom-condition'){
        const parameter = document.createElement('input');
        parameter.type = 'text'; parameter.className = 'selectionInspectorInput';
        parameter.title = kind === 'attribute-condition' ? 'Condition JSON: path/operator/value' : 'Restricted expression AST JSON';
        parameter.setAttribute('aria-label', parameter.title);
        parameter.value = JSON.stringify(kind === 'attribute-condition'
          ? { path:condition.path || '', operator:condition.operator || 'eq', value:condition.value ?? '' }
          : (condition.expression || { op:'compare', path:'', operator:'eq', value:'' }));
        parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          try{
            const parsed = JSON.parse(parameter.value || '{}');
            if(kind === 'attribute-condition') Object.assign(condition, parsed);
            else condition.expression = parsed;
            parameter.setCustomValidity(''); commit();
          }catch(_err){ parameter.setCustomValidity('Enter valid JSON'); parameter.reportValidity(); }
        });
        host.appendChild(parameter);
      }
    };
    const renderSourceSequence = (host, sequenceTarget)=>{
      const section = document.createElement('div');
      section.className = 'entitySourceSequenceInline';
      const heading = document.createElement('strong');
      heading.className = 'entitySourceSequenceInlineTitle';
      heading.textContent = 'Sequence order';
      const hint = document.createElement('p');
      hint.className = 'selectionInspectorHint';
      hint.textContent = 'Generate these Work Types in order, then repeat. Conditions and destinations remain part of this Output Rule.';
      section.append(heading, hint);
      const workTypes = (registry?.list?.() || []).filter((entry)=>entry.category === 'work');
      const rows = Array.isArray(sequenceTarget?.entries) ? sequenceTarget.entries : [];
      const list = document.createElement('div');
      list.className = 'entitySourceSequenceList';
      const replaceRows = (mutator)=>{
        const next = clone(rows, []);
        mutator(next);
        changed(()=>{
          sequenceTarget.entries = next;
          node.onPropertyChanged?.('outputRules');
          node.setDirtyCanvas?.(true, true);
        });
        App.selectionInspector?.refresh?.();
      };
      rows.forEach((entry, index)=>{
        const row = document.createElement('article');
        row.className = 'entitySourceSequenceRow';
        const order = document.createElement('span');
        order.className = 'entitySourceSequenceOrder';
        order.textContent = String(index + 1);
        const type = select(workTypes.map((candidate)=>[candidate.typeId, candidate.name]), entry.typeId);
        type.setAttribute('aria-label', `Sequence ${index + 1} Work Type`);
        type.disabled = running() || !workTypes.length;
        type.addEventListener('change', ()=>replaceRows((next)=>{ next[index].typeId = type.value; }));
        const quantityWrap = document.createElement('label');
        quantityWrap.className = 'entitySourceSequenceQuantity';
        const quantityLabel = document.createElement('span'); quantityLabel.textContent = 'Qty';
        const quantity = document.createElement('input');
        quantity.type = 'number'; quantity.min = '1'; quantity.step = '1'; quantity.value = String(entry.quantity ?? 1);
        quantity.setAttribute('aria-label', `Sequence ${index + 1} quantity`);
        quantity.disabled = running();
        quantity.addEventListener('change', ()=>replaceRows((next)=>{ next[index].quantity = Math.max(1, Math.round(Number(quantity.value) || 1)); }));
        quantityWrap.append(quantityLabel, quantity);
        const controls = document.createElement('div'); controls.className = 'entityRuleControls';
        const up = button('↑', ()=>replaceRows((next)=>{ if(index > 0) next.splice(index - 1, 0, next.splice(index, 1)[0]); }));
        const down = button('↓', ()=>replaceRows((next)=>{ if(index < next.length - 1) next.splice(index + 1, 0, next.splice(index, 1)[0]); }));
        const remove = button('×', ()=>replaceRows((next)=>next.splice(index, 1)), 'selectionInspectorBtn is-danger');
        up.title = 'Move up'; down.title = 'Move down'; remove.title = 'Delete sequence entry';
        up.disabled = running() || index === 0;
        down.disabled = running() || index === rows.length - 1;
        remove.disabled = running();
        controls.append(up, down, remove);
        row.append(order, type, quantityWrap, controls);
        list.appendChild(row);
      });
      if(!rows.length){
        const empty = document.createElement('div'); empty.className = 'selectionInspectorNotice is-error';
        empty.textContent = 'No sequence entries. This Source will not generate Work.';
        list.appendChild(empty);
      }
      section.appendChild(list);
      const add = button('+ Add Work Type', ()=>{
        if(!workTypes.length){
          changed(()=>App.ensureSourceSequence?.(node, { createDefault:true }));
          App.refreshEntityTypeManager?.();
          App.selectionInspector?.refresh?.();
          return;
        }
        replaceRows((next)=>next.push({
          entryId:App.nextSourceSequenceEntryId?.(next) || `source-sequence-${next.length + 1}`,
          typeId:workTypes[0].typeId,
          quantity:1
        }));
      }, 'selectionInspectorBtn is-primary');
      add.disabled = running();
      section.appendChild(add);

      const preview = document.createElement('div'); preview.className = 'entitySourceSequencePreview';
      const previewNames = [];
      for(const entry of rows){
        const typeName = registry?.get?.(entry.typeId)?.name || 'Missing Type';
        const count = Math.max(0, Math.min(24 - previewNames.length, Math.round(Number(entry.quantity) || 0)));
        for(let index = 0; index < count; index++) previewNames.push(typeName);
        if(previewNames.length >= 24) break;
      }
      preview.textContent = previewNames.length ? `${previewNames.join(' → ')} → Repeat` : 'Sequence preview unavailable';
      section.appendChild(preview);

      const validation = App.inspectSourceSequence?.(node, registry);
      if(validation && !validation.ok){
        const notice = document.createElement('div'); notice.className = 'selectionInspectorNotice is-error';
        notice.textContent = validation.errors.map((entry)=>entry.code).join(' · ');
        section.appendChild(notice);
      }
      const runtime = document.createElement('div'); runtime.className = 'entitySourceSequenceRuntime';
      const updateRuntime = ()=>{
        if(!runtime.isConnected) return;
        const current = typeof node._currentSequenceEntry === 'function' ? node._currentSequenceEntry() : null;
        const rowIndex = current ? Math.max(0, Number(node._cursor) || 0) : -1;
        const quantityIndex = current ? Math.max(0, Number(node._sequenceQuantityCursor) || 0) : -1;
        runtime.textContent = current
          ? `Next: ${current.type} · Entry ${rowIndex + 1}/${node._seq?.length || rows.length} · Item ${quantityIndex + 1}/${current.quantity}`
          : 'Next: unavailable';
        root.setTimeout(updateRuntime, 250);
      };
      section.appendChild(runtime);
      root.setTimeout(updateRuntime, 0);
      host.appendChild(section);
    };
    const renderRules = (kind)=>{
      const key = kind === 'input' ? 'inputRules' : 'outputRules';
      const card = makeCard(kind === 'input' ? 'INPUT' : 'OUTPUT', kind === 'input'
        ? 'What the node accepts. Descendants are searched automatically.'
        : 'Rules are evaluated from top to bottom. Combine conditions with AND or OR.');
      const rows = Array.isArray(node.properties?.[key]) ? node.properties[key] : [];
      const list = document.createElement('div'); list.className = 'entityRuleList';
      const commit = ()=>changed(()=>{
        node.properties[key] = rows;
        node.onPropertyChanged?.(key);
        App.syncBasicFlowPorts?.(node, { dirty:false });
        node.setDirtyCanvas?.(true, true);
      });
      const referencesOutside = (direction, portId, excludedRule, excludedIndex)=>{
        if(!portId) return false;
        if(direction === 'input') return (node.properties.inputRules || []).some((candidate)=>candidate !== excludedRule && candidate.fromPortId === portId);
        return (node.properties.outputRules || []).some((candidate)=>{
          const ids = Array.isArray(candidate.toPortIds) ? candidate.toPortIds : [candidate.toPortId];
          return ids.some((value, valueIndex)=>value === portId && (candidate !== excludedRule || valueIndex !== excludedIndex));
        });
      };
      const confirmPortRelease = (direction, portId, excludedRule, excludedIndex)=>{
        if(!portId || referencesOutside(direction, portId, excludedRule, excludedIndex)) return true;
        const ports = direction === 'input' ? node.inputs : node.outputs;
        const port = (ports || []).find((candidate)=>candidate?.portId === portId);
        if(!port || !port.flowManaged) return true;
        const linkCount = direction === 'input' ? (port.link == null ? 0 : 1) : (Array.isArray(port.links) ? port.links.length : 0);
        return !linkCount || root.confirm?.(`Delete ${port.name || portId} and its ${linkCount} connected link${linkCount === 1 ? '' : 's'}?`) !== false;
      };
      const cleanupPort = (direction, portId)=>App.removeOrphanBasicFlowPort?.(node, direction, portId, { confirmLinked:true });
      rows.forEach((rule, index)=>{
        const ruleCard = document.createElement('article'); ruleCard.className = 'entityRuleCard';
        const header = document.createElement('div'); header.className = 'entityRuleHeader';
        const title = document.createElement('strong'); title.className = 'entityRuleTitle'; title.textContent = `Rule ${index + 1}`;
        const controls = document.createElement('div'); controls.className = 'entityRuleControls';
        const up = button('↑', ()=>{ if(index > 0){ rows.splice(index - 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
        const down = button('↓', ()=>{ if(index < rows.length - 1){ rows.splice(index + 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
        const remove = button('×', ()=>{
          const portIds = kind === 'input' ? [rule.fromPortId] : (Array.isArray(rule.toPortIds) ? rule.toPortIds.slice() : [rule.toPortId]);
          if(!portIds.every((portId, portIndex)=>confirmPortRelease(kind, portId, rule, portIndex))) return;
          rows.splice(index, 1); commit(); portIds.forEach((portId)=>cleanupPort(kind, portId)); App.selectionInspector?.refresh?.();
        }, 'selectionInspectorBtn is-danger');
        up.title = 'Move rule up'; down.title = 'Move rule down'; remove.title = 'Delete rule';
        up.disabled = running() || index === 0; down.disabled = running() || index === rows.length - 1; remove.disabled = running();
        controls.append(up, down, remove); header.append(title, controls); ruleCard.appendChild(header);

        const body = document.createElement('div'); body.className = 'entityRuleBody';
        const availableTargets = typeOptions(registry, true, kind === 'output', kind === 'output');
        const targetRows = Array.isArray(rule.targets) && rule.targets.length
          ? rule.targets
          : [rule.target || { mode:'category', category:'work' }];
        const persistTargets = ()=>{
          rule.targets = targetRows;
          rule.target = targetRows[0] || { mode:'category', category:'work' };
          commit();
        };
        const targetsHost = document.createElement('div'); targetsHost.className = 'entityRuleMultiValue';
        const targetList = document.createElement('div'); targetList.className = 'entityRuleMultiValueList';
        targetRows.forEach((targetSpec, targetIndex)=>{
          const targetLine = document.createElement('div'); targetLine.className = 'entityRuleMultiValueLine';
          const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(targetIndex + 1);
          const target = select(availableTargets, targetValue(targetSpec));
          target.disabled = running();
          target.addEventListener('change', ()=>{
          const parsed = parseTarget(target.value);
            if(parsed.mode === 'sequence'){
              parsed.entries = [];
              targetRows.splice(0, targetRows.length, parsed);
            }else if(parsed.mode === 'otherwise') targetRows.splice(0, targetRows.length, parsed);
            else{
              targetRows[targetIndex] = parsed;
              for(let rowIndex = targetRows.length - 1; rowIndex >= 0; rowIndex--){
                if(targetRows[rowIndex]?.mode === 'otherwise') targetRows.splice(rowIndex, 1);
              }
            }
            persistTargets();
            if(parsed.mode === 'sequence') App.ensureSourceSequence?.(node, { createDefault:true });
            App.selectionInspector?.refresh?.();
          });
          const removeTarget = button('×', ()=>{
            targetRows.splice(targetIndex, 1);
            if(!targetRows.length) targetRows.push({ mode:'category', category:'work' });
            persistTargets(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
          removeTarget.title = 'Delete target'; removeTarget.disabled = running() || targetRows.length <= 1;
          targetLine.append(number, target, removeTarget); targetList.appendChild(targetLine);
        });
        targetsHost.appendChild(targetList);
        const addTarget = button('+ Add target', ()=>{
          if(targetRows.length === 1 && targetRows[0]?.mode === 'otherwise') targetRows.splice(0, 1);
          targetRows.push({ mode:'category', category:'work' });
          persistTargets(); App.selectionInspector?.refresh?.();
        }, 'selectionInspectorBtn entityRuleAddCondition');
        addTarget.disabled = running() || targetRows.some((target)=>target?.mode === 'sequence'); targetsHost.appendChild(addTarget);
        body.appendChild(field('Targets (any match)', targetsHost));
        const sequence = targetRows.find((target)=>target?.mode === 'sequence');
        if(kind === 'output' && sequence) renderSourceSequence(body, sequence);

        if(kind === 'input'){
          const ports = (node.inputs || []).filter((port)=>port?.channel !== 'signal')
            .map((port, portIndex)=>[port.portId || `in-${portIndex + 1}`, port.name || `In ${portIndex + 1}`]);
          const inputPort = select([...ports, ['__new__', 'New input port...']], rule.fromPortId || ports[0]?.[0] || '__new__');
          inputPort.disabled = running();
          inputPort.addEventListener('change', ()=>{
            const previous = rule.fromPortId;
            if(!confirmPortRelease('input', previous, rule, 0)){ inputPort.value = previous || ''; return; }
            if(inputPort.value === '__new__'){
              const port = App.createBasicFlowPort?.(node, 'input', rule);
              if(port) rule.fromPortId = port.portId;
            }else rule.fromPortId = inputPort.value;
            commit();
            if(previous && previous !== rule.fromPortId) cleanupPort('input', previous);
            App.selectionInspector?.refresh?.();
          });
          body.appendChild(field('Input from', inputPort));
          const conditionSpec = isObject(rule.acceptWhen) ? rule.acceptWhen : { kind:conditionKind(rule.acceptWhen, 'always') };
          const condition = select(inputConditions, conditionKind(conditionSpec, 'always'));
          condition.disabled = running();
          condition.addEventListener('change', ()=>{ rule.acceptWhen = { kind:condition.value }; commit(); App.selectionInspector?.refresh?.(); });
          const conditionHost = document.createElement('div'); conditionHost.className = 'entityRuleConditionLine'; conditionHost.appendChild(condition);
          appendConditionParameter(conditionHost, conditionSpec, commit);
          body.appendChild(field('Accept when', conditionHost, 'is-wide'));
        }else{
          const stored = rule.releaseWhen;
          const isCompound = isObject(stored) && (stored.kind === 'all' || stored.kind === 'any');
          const compound = {
            kind: isCompound ? stored.kind : 'all',
            conditions: isCompound && Array.isArray(stored.conditions)
              ? stored.conditions
              : [isObject(stored) ? stored : { kind:conditionKind(stored, 'available') }]
          };
          if(!compound.conditions.length) compound.conditions.push({ kind:'available' });
          const persistCompound = ()=>{ rule.releaseWhen = { kind:compound.kind, conditions:compound.conditions }; commit(); };
          const conditionsHost = document.createElement('div'); conditionsHost.className = 'entityRuleConditions';
          const joinRow = document.createElement('div'); joinRow.className = 'entityRuleConditionJoin';
          const joinLabel = document.createElement('span'); joinLabel.textContent = 'Match';
          const join = select([['all','All conditions (AND)'],['any','Any condition (OR)']], compound.kind);
          join.disabled = running();
          join.addEventListener('change', ()=>{ compound.kind = join.value; persistCompound(); });
          joinRow.append(joinLabel, join); conditionsHost.appendChild(joinRow);
          const conditionList = document.createElement('div'); conditionList.className = 'entityRuleConditionList';
          compound.conditions.forEach((conditionSpec, conditionIndex)=>{
            const conditionLine = document.createElement('div'); conditionLine.className = 'entityRuleConditionLine';
            const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(conditionIndex + 1);
            const condition = select(outputConditions, conditionKind(conditionSpec, 'available'));
            condition.disabled = running();
            condition.addEventListener('change', ()=>{
              compound.conditions[conditionIndex] = condition.value === 'shuttle-group-idle'
                ? { kind:condition.value, groupId:String(node.properties?.shuttleGroupId || 'shuttle-1') }
                : { kind:condition.value };
              persistCompound(); App.selectionInspector?.refresh?.();
            });
            const removeCondition = button('×', ()=>{
              compound.conditions.splice(conditionIndex, 1);
              if(!compound.conditions.length) compound.conditions.push({ kind:'available' });
              persistCompound(); App.selectionInspector?.refresh?.();
            }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
            removeCondition.title = 'Delete condition'; removeCondition.disabled = running() || compound.conditions.length <= 1;
            conditionLine.append(number, condition);
            appendConditionParameter(conditionLine, conditionSpec, persistCompound);
            conditionLine.appendChild(removeCondition); conditionList.appendChild(conditionLine);
          });
          conditionsHost.appendChild(conditionList);
          const addCondition = button('+ Add condition', ()=>{
            compound.conditions.push({ kind:'available' }); persistCompound(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn entityRuleAddCondition');
          addCondition.disabled = running(); conditionsHost.appendChild(addCondition);
          body.appendChild(field('Conditions', conditionsHost, 'is-wide'));

          const ports = (node.outputs || []).filter((port)=>port?.channel !== 'signal')
            .map((port, portIndex)=>[port.portId || `out-${portIndex + 1}`, port.name || `Out ${portIndex + 1}`]);
          const portRows = Array.isArray(rule.toPortIds) && rule.toPortIds.length
            ? rule.toPortIds
            : [rule.toPortId || ports[0]?.[0] || ''];
          const persistPorts = ()=>{
            rule.toPortIds = portRows.filter(Boolean);
            rule.toPortId = rule.toPortIds[0] || null;
            commit();
          };
          const portsHost = document.createElement('div'); portsHost.className = 'entityRuleMultiValue';
          const portList = document.createElement('div'); portList.className = 'entityRuleMultiValueList';
          portRows.forEach((portId, portIndex)=>{
            const portLine = document.createElement('div'); portLine.className = 'entityRuleMultiValueLine';
            const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(portIndex + 1);
            const to = select([...ports, ['__new__', 'New output port...']], portId);
            to.disabled = running();
            to.addEventListener('change', ()=>{
              const previous = portRows[portIndex];
              if(!confirmPortRelease('output', previous, rule, portIndex)){ to.value = previous || ''; return; }
              if(to.value === '__new__'){
                const port = App.createBasicFlowPort?.(node, 'output', rule);
                if(port) portRows[portIndex] = port.portId;
              }else portRows[portIndex] = to.value;
              persistPorts();
              if(previous && previous !== portRows[portIndex]) cleanupPort('output', previous);
              App.selectionInspector?.refresh?.();
            });
            const removePort = button('×', ()=>{
              const previous = portRows[portIndex];
              if(!confirmPortRelease('output', previous, rule, portIndex)) return;
              portRows.splice(portIndex, 1);
              if(!portRows.length && ports[0]) portRows.push(ports[0][0]);
              persistPorts(); cleanupPort('output', previous); App.selectionInspector?.refresh?.();
            }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
            removePort.title = 'Delete output destination'; removePort.disabled = running() || portRows.length <= 1;
            portLine.append(number, to, removePort); portList.appendChild(portLine);
          });
          portsHost.appendChild(portList);
          const addPort = button('+ Add output', ()=>{
            const port = App.createBasicFlowPort?.(node, 'output', rule);
            if(port) portRows.push(port.portId);
            persistPorts(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn entityRuleAddCondition');
          addPort.disabled = running();
          portsHost.appendChild(addPort);
          body.appendChild(field('Output to (first ready)', portsHost));
        }
        ruleCard.appendChild(body); list.appendChild(ruleCard);
      });
      card.section.appendChild(list);
      const add = button(`Add ${kind === 'input' ? 'Input' : 'Output'} Rule`, ()=>{
        const next = kind === 'input'
          ? { ruleId:`input-rule-${Date.now()}`, targets:[{ mode:'category', category:'work' }], target:{ mode:'category', category:'work' }, acceptWhen:{ kind:'always' }, fromPortId:null }
          : { ruleId:`output-rule-${Date.now()}`, targets:[{ mode:'otherwise' }], target:{ mode:'otherwise' }, releaseWhen:{ kind:'all', conditions:[{ kind:'available' }] }, toPortIds:[], toPortId:null };
        const port = App.createBasicFlowPort?.(node, kind, next);
        if(kind === 'input') next.fromPortId = port?.portId || null;
        else{ next.toPortIds = port ? [port.portId] : []; next.toPortId = port?.portId || null; }
        rows.push(next);
        commit(); App.selectionInspector?.refresh?.();
      }, 'selectionInspectorBtn is-primary');
      add.disabled = running(); card.section.appendChild(add); wrapper.appendChild(card.card);
    };
    const behavior = App.basicNodeBehavior?.(node) || 'basic';
    if(!App.basicNodeHasSequenceTarget?.(node) && behavior !== 'source') renderRules('input');
    if(behavior !== 'sink') renderRules('output');
    return wrapper;
  }

  function renderRecipeRows(node, rows, host, depth){
    const registry = App.entityModelForGraph?.(App.graph || node.graph);
    rows.forEach((recipe, index)=>{
      const row = document.createElement('div'); row.className = 'entityRecipeRow'; row.style.setProperty('--recipe-depth', String(depth));
      const type = select((registry?.list?.() || []).map((entry)=>[entry.typeId, entry.name]), recipe.typeId);
      const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = String(recipe.quantity || 1);
      const load = select([['empty','Empty'],['full','Full'],['custom','Custom']], recipe.load || 'empty');
      const commit = ()=>changed(()=>{ node.properties.initialContents = node.properties.initialContents; node.__initialContentsDirty = true; });
      type.addEventListener('change', ()=>{ recipe.typeId = type.value; commit(); });
      qty.addEventListener('change', ()=>{ recipe.quantity = Math.max(1, Math.round(Number(qty.value) || 1)); commit(); });
      load.addEventListener('change', ()=>{ recipe.load = load.value; if(load.value === 'empty') recipe.children = []; commit(); App.selectionInspector?.refresh?.(); });
      row.append(type, qty, load);
      const actions = document.createElement('div'); actions.className = 'entityRuleControls';
      const add = button('+ Child', ()=>{ recipe.children = Array.isArray(recipe.children) ? recipe.children : []; const first = registry?.list?.()[0]; if(first) recipe.children.push({ typeId:first.typeId, quantity:1, load:'empty', children:[] }); commit(); App.selectionInspector?.refresh?.(); });
      const remove = button('×', ()=>{ rows.splice(index, 1); commit(); App.selectionInspector?.refresh?.(); }, 'selectionInspectorBtn is-danger');
      add.disabled = remove.disabled = running(); actions.append(add, remove); row.appendChild(actions); host.appendChild(row);
      if(Array.isArray(recipe.children) && recipe.children.length) renderRecipeRows(node, recipe.children, host, depth + 1);
    });
  }

  function renderCurrentTree(tree, depth){
    const row = document.createElement('details'); row.className = 'entityCurrentTree'; row.open = depth < 1;
    const summary = document.createElement('summary'); summary.textContent = `${tree.name} · ${tree.displayId}`; row.appendChild(summary);
    if(tree.children?.length){
      const children = document.createElement('div'); children.className = 'entityCurrentChildren';
      tree.children.forEach((child)=>children.appendChild(renderCurrentTree(child, depth + 1))); row.appendChild(children);
    }
    return row;
  }

  function renderContentsEditor(node){
    const wrapper = document.createElement('div');
    node.properties = isObject(node.properties) ? node.properties : {};
    if(!Array.isArray(node.properties.initialContents)) node.properties.initialContents = [];
    const initial = makeCard('INITIAL', 'Type and quantity recipes are saved. Runtime Instance IDs are generated automatically on Reset.');
    const rows = document.createElement('div'); rows.className = 'entityRecipeList';
    const refreshRows = ()=>{
      rows.innerHTML = '';
      const recipes = Array.isArray(node.properties.initialContents) ? node.properties.initialContents : [];
      if(!recipes.length){
        const empty = document.createElement('div');
        empty.className = 'selectionInspectorNotice';
        empty.textContent = 'None configured. This node starts empty.';
        rows.appendChild(empty);
        return;
      }
      renderRecipeRows(node, recipes, rows, 0);
    };
    refreshRows(); initial.section.appendChild(rows);
    const add = button('Add Initial Content', ()=>{
      try{
        const first = App.entityModelForGraph?.(App.graph || node.graph)?.list?.()[0];
        if(!first) throw new Error('Create an Entity Type first.');
        const nextRows = Array.isArray(node.properties.initialContents) ? node.properties.initialContents.slice() : [];
        nextRows.push({ typeId:first.typeId, quantity:1, load:'empty', children:[] });
        node.properties.initialContents = nextRows;
        node.__initialContentsDirty = true;
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
        refreshRows();
      }catch(err){
        const note = document.createElement('div'); note.className = 'selectionInspectorNotice is-error'; note.textContent = String(err?.message || err);
        initial.section.appendChild(note);
      }
    }, 'selectionInspectorBtn is-primary'); add.disabled = running(); initial.section.appendChild(add);
    if(node.__initialContentsDirty){ const note = document.createElement('div'); note.className = 'selectionInspectorNotice'; note.textContent = 'Reset to apply Initial Contents.'; initial.section.appendChild(note); }
    wrapper.appendChild(initial.card);

    const current = makeCard('CURRENT', 'Runtime / Read only');
    const readCurrent = ()=> typeof node.getCurrentContents === 'function'
      ? node.getCurrentContents({ includeInstances: true })
      : (App.currentContentsForNode?.(node, { includeInstances: true })
        || (()=>{ const store = App.runtimeInstancesForGraph?.(App.graph || node.graph); return { instances:store?.treesAt(node.id)||[] }; })());
    const instancesHost = document.createElement('div'); instancesHost.className = 'entityCurrentInstances';
    let currentSignature = '';
    const refreshCurrent = (force)=>{
      const data = readCurrent();
      const signature = JSON.stringify(data?.instances || []);
      if(!force && signature === currentSignature) return;
      currentSignature = signature;
      instancesHost.replaceChildren();
      for(const tree of data?.instances || []) instancesHost.appendChild(renderCurrentTree(tree, 0));
      if(!instancesHost.children.length) instancesHost.textContent = 'None at this node.';
    };
    refreshCurrent(true);
    const updateWhileOpen = ()=>{
      if(!wrapper.isConnected) return;
      refreshCurrent(false);
      window.setTimeout(updateWhileOpen, 250);
    };
    window.setTimeout(updateWhileOpen, 250);
    current.section.appendChild(instancesHost); wrapper.appendChild(current.card); return wrapper;
  }

  function renderOperationsEditor(node){
    const card = makeCard('Operations', 'Common constrained operations define behavior. No arbitrary JavaScript is executed by Entity Nodes.');
    const kinds = [
      ['process','Process'], ['hold','Hold / Buffer'], ['route','Route'], ['create','Create from Sequence'],
      ['destroy','Destroy at input'], ['clone','Clone to all ready outputs'], ['merge','Merge inputs'],
      ['join','Join inputs'], ['attach','Attach to Container'], ['detach','Detach child'],
      ['synchronized-step','Synchronized step'], ['carrier-transport','Carrier transport'],
      ['station-transfer','Station transfer'], ['transfer','Transfer'], ['set-attribute','Set attribute']
    ];
    const triggers = [['input-accepted','Input accepted'],['process','Process'],['release','Release']];
    const rows = Array.isArray(node.properties?.operations) ? node.properties.operations : (node.properties.operations = []);
    const list = document.createElement('div'); list.className = 'entityRuleList';
    const commit = ()=>changed(()=>{
      node.properties.operations = App.normalizeBasicOperations?.(rows) || rows;
      node.onPropertyChanged?.('operations');
      node.setDirtyCanvas?.(true, true);
    });
    rows.forEach((operation, index)=>{
      const row = document.createElement('article'); row.className = 'entityRuleCard';
      const header = document.createElement('div'); header.className = 'entityRuleHeader';
      const title = document.createElement('strong'); title.className = 'entityRuleTitle'; title.textContent = `Operation ${index + 1}`;
      const controls = document.createElement('div'); controls.className = 'entityRuleControls';
      const up = button('↑', ()=>{ if(index > 0){ rows.splice(index - 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
      const down = button('↓', ()=>{ if(index < rows.length - 1){ rows.splice(index + 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
      const remove = button('×', ()=>{ rows.splice(index, 1); commit(); App.selectionInspector?.refresh?.(); }, 'selectionInspectorBtn is-danger');
      up.disabled = running() || index === 0; down.disabled = running() || index === rows.length - 1; remove.disabled = running();
      controls.append(up, down, remove); header.append(title, controls); row.appendChild(header);
      const body = document.createElement('div'); body.className = 'entityRuleBody';
      const kind = select(kinds, operation.kind || 'process'); kind.disabled = running();
      kind.addEventListener('change', ()=>{ operation.kind = kind.value; commit(); App.selectionInspector?.refresh?.(); });
      const trigger = select(triggers, operation.trigger || 'process'); trigger.disabled = running();
      trigger.addEventListener('change', ()=>{ operation.trigger = trigger.value; commit(); });
      const kindField = document.createElement('label'); kindField.className = 'entityRuleField';
      kindField.innerHTML = '<span class="entityRuleFieldLabel">Operation</span>'; kindField.appendChild(kind);
      const triggerField = document.createElement('label'); triggerField.className = 'entityRuleField';
      triggerField.innerHTML = '<span class="entityRuleFieldLabel">When</span>'; triggerField.appendChild(trigger);
      body.append(kindField, triggerField);
      if(operation.kind === 'synchronized-step'){
        const group = document.createElement('input'); group.className = 'selectionInspectorInput'; group.value = String(operation.groupId || 'shuttle-1'); group.disabled = running();
        group.addEventListener('change', ()=>{ operation.groupId = String(group.value || '').trim() || 'shuttle-1'; commit(); });
        const field = document.createElement('label'); field.className = 'entityRuleField'; field.innerHTML = '<span class="entityRuleFieldLabel">Group ID</span>'; field.appendChild(group); body.appendChild(field);
      }
      if(operation.kind === 'clone'){
        operation.dispatch = operation.dispatch || 'all-ready';
        const dispatch = select([['all-ready','All ready outputs'],['first-ready','First ready output']], operation.dispatch); dispatch.disabled = running();
        dispatch.addEventListener('change', ()=>{ operation.dispatch = dispatch.value; commit(); });
        const field = document.createElement('label'); field.className = 'entityRuleField'; field.innerHTML = '<span class="entityRuleFieldLabel">Dispatch</span>'; field.appendChild(dispatch); body.appendChild(field);
      }
      row.appendChild(body); list.appendChild(row);
    });
    if(!rows.length){ const empty = document.createElement('div'); empty.className = 'selectionInspectorNotice'; empty.textContent = 'No operation. The node only stores matching Entities.'; list.appendChild(empty); }
    card.section.appendChild(list);
    const add = button('+ Add Operation', ()=>{
      rows.push({ operationId:`operation-${Date.now()}`, trigger:'process', kind:'process' });
      commit(); App.selectionInspector?.refresh?.();
    }, 'selectionInspectorBtn is-primary');
    add.disabled = running(); card.section.appendChild(add);
    return card.card;
  }

  function enhanceInspector(){
    const Ctor = App.SelectionInspector;
    if(!Ctor || Ctor.prototype.__entityTabsInstalled) return;
    Ctor.prototype.__entityTabsInstalled = true;
    const raw = Ctor.prototype.renderNode;
    Ctor.prototype.renderNode = function(node){
      raw.call(this, node);
      const main = this.root?.querySelector('.selectionInspectorMain');
      if(!main) return;
      if(node?.type === 'factory/basic' && typeof App.commonBasicNodeProperties === 'function'){
        const commonPropertyCount = Object.keys(App.commonBasicNodeProperties(node.properties)).length;
        const propertyStat = Array.from(this.root.querySelectorAll('.selectionInspectorStat')).find((entry)=>
          entry.querySelector('.selectionInspectorStatLabel')?.textContent?.trim() === 'Properties');
        const propertyValue = propertyStat?.querySelector('.selectionInspectorStatValue');
        if(propertyValue) propertyValue.textContent = String(commonPropertyCount);
      }
      main.querySelectorAll('.entityTreeCard').forEach((entry)=>entry.remove());
      const existingCards = Array.from(main.children);
      const tabBar = document.createElement('div'); tabBar.className = 'entityInspectorTabs';
      const panels = {};
      const entityEnabled = node?.type === 'factory/basic';
      const names = entityEnabled ? ['Basic','Flow','Contents','Advanced'] : ['Basic','Advanced'];
      names.forEach((name)=>{ const panel = document.createElement('div'); panel.className = 'entityInspectorTabPanel'; panel.dataset.tab = name.toLowerCase(); panels[name] = panel; });
      if(existingCards[0]) panels.Basic.appendChild(existingCards[0]);
      if(existingCards[1]){
        const hint = existingCards[1].querySelector('.selectionInspectorHint');
        if(hint) hint.textContent = 'Common node settings are saved immediately and used in the next simulation run.';
        const hiddenPropertyLabels = new Set([
          'basicNodeVersion', 'initialContents', 'inputRules', 'outputRules', 'portTimings', 'flowPortSequence', 'selection', 'stateMachine',
          'inputPolicy', 'operations', 'presetId', 'Preset', 'sourceSequence', 'sequence', 'migratedCarrierConfigs',
          'ratio', 'strictIdMatch', 'stageIndex', 'shuttleGroupId', 'initialCarrier', 'agvIds', 'agvCapacity',
          'palletWorkCapacity', 'transportMode', 'outSequence', 'sourceMode', 'rootKind', 'rootId', 'capacity',
          'accepts', 'preset', 'operation', 'sourceKind', 'targetKind', 'itemKind', 'batchMode', 'quantity',
          'relationMode', 'searchDepth', 'autoRelease', 'script', 'scriptDisabled', 'sigEnabled', 'sigExtra'
        ]);
        for(const field of existingCards[1].querySelectorAll('.selectionInspectorField')){
          const label = field.querySelector('.selectionInspectorFieldLabel')?.textContent?.trim();
          const propertyKey = field.dataset.propertyKey || label;
          if(hiddenPropertyLabels.has(label) || /^processTime(?:\d+)?$/.test(propertyKey) || /^downTime(?:\d+)?$/.test(propertyKey)) field.remove();
        }
      }
      if(basicDerivedNode(node)) panels.Basic.appendChild(renderCycleEditor(node));
      if(existingCards[1]) panels.Basic.appendChild(existingCards[1]);
      existingCards.slice(2).forEach((entry)=>panels.Advanced.appendChild(entry));
      if(entityEnabled){ panels.Flow.appendChild(renderFlowEditor(node)); panels.Contents.appendChild(renderContentsEditor(node)); }
      if(entityEnabled) panels.Advanced.appendChild(renderOperationsEditor(node));
      const state = makeCard('State Machine', 'State Machine remains separate from Input / Output Rules.');
      const stateEditor = document.createElement('textarea');
      stateEditor.className = 'selectionInspectorTextarea entityAdvancedEditor';
      stateEditor.value = JSON.stringify(node.properties?.stateMachine || {}, null, 2);
      stateEditor.readOnly = running();
      const stateNotice = document.createElement('div'); stateNotice.className = 'selectionInspectorNotice';
      const saveState = button('Apply State Machine', ()=>{
        try{
          const parsed = JSON.parse(stateEditor.value || '{}');
          if(!isObject(parsed) || !Array.isArray(parsed.states) || !Array.isArray(parsed.transitions)) throw new Error('states and transitions arrays are required.');
          changed(()=>{ node.properties.stateMachine = parsed; node.setDirtyCanvas?.(true, true); });
          stateNotice.textContent = 'Applied. Reset before the next run.';
        }catch(err){ stateNotice.textContent = String(err?.message || err); stateNotice.classList.add('is-error'); }
      }, 'selectionInspectorBtn is-primary');
      saveState.disabled = running();
      state.section.append(stateEditor, saveState, stateNotice); panels.Advanced.appendChild(state.card);
      const active = names.includes(this._entityTab) ? this._entityTab : 'Basic';
      const activate = (name)=>{ this._entityTab = name; Object.entries(panels).forEach(([key,panel])=>panel.hidden = key !== name); Array.from(tabBar.children).forEach((btn)=>btn.classList.toggle('is-active', btn.dataset.tab === name)); };
      names.forEach((name)=>{ const btn = button(name, ()=>activate(name), 'entityInspectorTab'); btn.dataset.tab = name; tabBar.appendChild(btn); main.appendChild(panels[name]); });
      main.insertBefore(tabBar, main.firstChild); activate(active);
    };
  }

  App.refreshEntityTypeManager = renderTypeManager;
  root.addEventListener('factsim:run-state-changed', ()=>App.selectionInspector?.refresh?.());
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ installTypePanel(); enhanceInspector(); });
  else{ installTypePanel(); enhanceInspector(); }
})(window);
