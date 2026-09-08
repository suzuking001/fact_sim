// Presentation helpers for Details. Listeners travel with the panel when popped out.
(function(){
  'use strict';
  const tooltips = new WeakMap();
  function tooltipFor(doc){
    if(tooltips.has(doc)) return tooltips.get(doc);
    const bubble = doc.createElement('div');
    bubble.className = 'detailsTooltip';
    bubble.id = 'detailsTooltip';
    bubble.setAttribute('role', 'tooltip');
    bubble.hidden = true;
    doc.body.appendChild(bubble);
    let active = null;
    let timer;
    const hide = ()=>{
      clearTimeout(timer);
      active?.removeAttribute('aria-describedby');
      active = null;
      bubble.hidden = true;
    };
    const show = (button)=>{
      clearTimeout(timer);
      if(active !== button) hide();
      active = button;
      bubble.textContent = button.dataset.detailsHelp;
      bubble.hidden = false;
      button.setAttribute('aria-describedby', bubble.id);
      const rect = button.getBoundingClientRect();
      const win = doc.defaultView;
      bubble.style.left = Math.max(12, Math.min(rect.left, win.innerWidth - bubble.offsetWidth - 12)) + 'px';
      bubble.style.top = Math.max(12, Math.min(
        rect.bottom + bubble.offsetHeight + 16 < win.innerHeight ? rect.bottom + 8 : rect.top - bubble.offsetHeight - 8,
        win.innerHeight - bubble.offsetHeight - 12)) + 'px';
    };
    const later = ()=>{ clearTimeout(timer); timer = setTimeout(hide, 180); };
    bubble.addEventListener('pointerenter', ()=>clearTimeout(timer));
    bubble.addEventListener('pointerleave', later);
    doc.addEventListener('keydown', (event)=>{ if(event.key === 'Escape') hide(); });
    doc.addEventListener('pointerdown', (event)=>{
      if(active && !active.contains(event.target) && !bubble.contains(event.target)) hide();
    });
    doc.addEventListener('scroll', (event)=>{ if(event.target !== bubble) hide(); }, true);
    doc.defaultView.addEventListener('resize', hide);
    const api = { show, hide, later };
    tooltips.set(doc, api);
    return api;
  }
  function help(host, text, name){
    if(!host || !text.trim()) return;
    let button = host.querySelector(':scope > .detailsHelp');
    if(button){ button.dataset.detailsHelp += '\n\n' + text; return; }
    button = host.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'detailsHelp';
    button.textContent = '?';
    button.setAttribute('aria-label', (name || 'Details') + ' help');
    button.dataset.detailsHelp = text;
    button.addEventListener('pointerenter', (event)=>{
      if(event.pointerType !== 'touch') tooltipFor(button.ownerDocument).show(button);
    });
    button.addEventListener('focus', ()=>tooltipFor(button.ownerDocument).show(button));
    button.addEventListener('click', (event)=>{ event.preventDefault(); event.stopPropagation(); tooltipFor(button.ownerDocument).show(button); });
    button.addEventListener('pointerleave', ()=>tooltipFor(button.ownerDocument).later());
    button.addEventListener('blur', ()=>tooltipFor(button.ownerDocument).later());
    host.appendChild(button);
  }
  function icon(host, key){
    if(!host || host.querySelector(':scope > .detailsIcon') || !window.App?.workspaceIconSvg) return;
    const span = host.ownerDocument.createElement('span');
    span.className = 'detailsIcon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = App.workspaceIconSvg(key);
    host.prepend(span);
  }
  function decorate(panel){
    const doc = panel.ownerDocument;
    panel.querySelectorAll('.entityFlowGuide:not([data-details-ready])').forEach((guide)=>{
      guide.dataset.detailsReady = 'true';
      const copy = Array.from(guide.children).map((child)=>child.textContent.trim()).join(' ');
      guide.textContent = '';
      const heading = doc.createElement('h3');
      heading.textContent = 'Flow rules';
      guide.appendChild(heading);
      icon(heading, 'flow');
      help(heading, copy, 'Flow rules');
    });
    panel.querySelectorAll('.selectionInspectorHint:not([data-details-ready]), .entityRuleTimingHint:not([data-details-ready]), .entityFlowRulePanelHeading > small:not([data-details-ready])').forEach((hint)=>{
      if(!hint.textContent.trim()) return;
      // Put help on a section heading, never inside a form label.
      const section = hint.closest('.selectionInspectorSection');
      const heading = section?.querySelector(':scope > .selectionInspectorSectionTitle')
        || hint.closest('.entityFlowRulePanelHeading');
      if(!heading) return;
      hint.dataset.detailsReady = 'true';
      help(heading, hint.textContent.trim(), heading.firstChild?.textContent?.trim() || 'Settings');
      hint.classList.add('detailsHelpSource');
    });
    panel.querySelectorAll('.nodeDetailsCard .selectionInspectorStatGrid:not([data-details-ready])').forEach((stats)=>{
      stats.dataset.detailsReady = 'true';
      const fold = doc.createElement('details');
      fold.className = 'detailsSecondary';
      const summary = doc.createElement('summary'); summary.textContent = 'Node info';
      stats.before(fold); fold.append(summary, stats);
    });
    panel.querySelectorAll('.entityCycleCard:not([data-details-ready])').forEach((card)=>{
      card.dataset.detailsReady = 'true';
      const section = card.querySelector('.selectionInspectorSection');
      if(!section) return;
      const fold = doc.createElement('details'); fold.className = 'detailsSecondary detailsCycle';
      const summary = doc.createElement('summary'); summary.textContent = 'Cycle overview';
      icon(summary, 'reset');
      card.appendChild(fold); fold.append(summary, section);
    });
    panel.querySelectorAll('.entityFlowPhase .selectionInspectorSectionTitle').forEach((heading)=>{
      const phase = heading.closest('.entityFlowPhase');
      const key = phase.classList.contains('is-input') ? 'types' : phase.classList.contains('is-output') ? 'export' : phase.classList.contains('is-process') ? 'play' : 'reset';
      icon(heading, key);
    });
    panel.querySelectorAll('.entityInspectorTab:not([data-details-ready])').forEach((button)=>{
      button.dataset.detailsReady = 'true';
      icon(button, {Flow:'flow', Contents:'types', Advanced:'tools'}[button.dataset.tab]);
    });
    panel.querySelectorAll('button[title]:not([aria-label])').forEach((button)=>{
      button.setAttribute('aria-label', button.title);
    });
    panel.querySelectorAll('.entityRuleConditionRemove:not([aria-label])').forEach((button)=>button.setAttribute('aria-label', 'Delete condition'));
    panel.querySelectorAll('.selectionInspectorEmpty:not([data-details-ready])').forEach((empty)=>{
      empty.dataset.detailsReady = 'true';
      const paragraphs = empty.querySelectorAll('p');
      if(paragraphs[0]) paragraphs[0].textContent = 'Select a node or group to edit.';
      if(paragraphs[1]){ help(empty.querySelector('h3'), paragraphs[1].textContent, 'Details'); paragraphs[1].remove(); }
      icon(empty.querySelector('h3'), 'details');
    });
  }
  function init(){
    const panel = document.getElementById('selectionInspectorPanel');
    if(!panel) return;
    decorate(panel);
    // Ignore changing runtime text. Only new UI elements need presentation work.
    const observer = new MutationObserver((records)=>{
      if(records.some((record)=>Array.from(record.addedNodes).some((node)=>node.nodeType === 1))) decorate(panel);
    });
    observer.observe(panel, {childList:true, subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
