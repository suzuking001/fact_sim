// Workspace presentation only: brand icons and contextual, accessible help.
(function(){
  'use strict';
  const App = window.App || (window.App = {});
  const paths = {
    flow: '<circle cx="4" cy="12" r="2.3"/><path d="M6 12c6 0 7-7 13-8M6 12c6 0 7 7 13 8M12 12c3 0 5-1 8-1"/><circle cx="20" cy="4" r="2"/><circle cx="20" cy="20" r="2"/><circle cx="21" cy="11" r="1.3"/>',
    add: '<circle cx="4" cy="12" r="2.3"/><path d="M6 12c5 0 6-7 12-7M6 12c5 0 6 7 12 7M17 10v6m-3-3h6"/><circle cx="19" cy="5" r="1.8"/><circle cx="19" cy="19" r="1.8"/>',
    group: '<circle cx="4" cy="7" r="2"/><circle cx="4" cy="17" r="2"/><path d="M6 7c4 0 4 5 8 5M6 17c4 0 4-5 8-5M16 6v12m4-12v12"/>',
    image: '<path d="M4 6h16v14H4zM4 16c5 0 5-6 9-6 3 0 4 5 7 5"/><circle cx="8" cy="9" r="1.5"/><circle cx="4" cy="6" r="1.8"/>',
    types: '<circle cx="4" cy="12" r="2"/><path d="M6 12c4 0 4-6 8-6M6 12c4 0 4 6 8 6"/><circle cx="17" cy="6" r="3"/><path d="M14 15h6v6h-6z"/>',
    performance: '<circle cx="4" cy="17" r="2"/><path d="M6 17c6 0 5-10 12-10M10 20v-5m5 5v-8m5 8V4"/><circle cx="19" cy="6" r="2"/>',
    tools: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5c5 0 5 14 10 14M7 19c5 0 5-14 10-14"/>',
    folder: '<path d="M3 8V5h7l3 3h8v12H3zM4 15c5 0 6-4 11-4"/><circle cx="5" cy="15" r="1.7"/><circle cx="17" cy="11" r="1.7"/>',
    play: '<circle cx="4" cy="12" r="2"/><path d="M6 12h4M11 5l10 7-10 7z"/>',
    stop: '<circle cx="4" cy="12" r="2"/><path d="M6 12h4M11 6h10v12H11z"/>',
    reset: '<path d="M6 8a8 8 0 1 1-1 7M3 4v5h6"/><circle cx="5" cy="15" r="1.8"/>',
    save: '<path d="M5 4h14v16H5zM9 4v5h6V4M9 20v-6h6v6"/><circle cx="12" cy="9" r="1.4"/>',
    share: '<circle cx="4" cy="12" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M6 12c5 0 6-7 11-7M6 12c5 0 6 7 11 7"/>',
    export: '<path d="M5 5v15h15M10 14c2-5 5-7 10-8M15 5h6v6"/><circle cx="10" cy="14" r="2"/>',
    timeline: '<path d="M4 4v16h17M6 8h5m0 4h5m0 4h5"/><circle cx="7" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="17" cy="16" r="1.6"/>',
    details: '<path d="M7 5h14M7 12h14M7 19h14"/><circle cx="4" cy="5" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="19" r="1.5"/>'
  };
  const panels = {
    controls: ['flow', 'Choose a model and check the simulation status.'],
    addNodePanel: ['add', 'Choose a node type, then place it on the canvas. Esc cancels placement.'],
    entityTypesPanel: ['types', 'Define the items and resources that move through your model.'],
    addGroupPanel: ['group', 'Draw a group around nodes that share a downtime pattern.'],
    backgroundPanel: ['image', 'Add a floor plan and align the model over it.'],
    advancedPanel: ['performance', 'Adjust the simulation engine, rendering, and diagnostics.'],
    shortcutPanel: ['tools', 'Arrange the graph, undo edits, and find keyboard shortcuts.'],
    fileControls: ['folder', 'Save, open, export, or share your model.']
  };
  App.workspaceIconSvg = function(key){
    const name = panels[key]?.[0] || key;
    return '<svg xmlns="http://www.w3.org/2000/svg" class="workspaceIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (paths[name] || paths.flow) + '</svg>';
  };

  function init(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    // DOM order matches both the visual hierarchy and keyboard navigation.
    const controls = document.getElementById('controls');
    controls.after(document.getElementById('addNodePanel'));
    const helpSource = (id, target)=>{
      const source = document.getElementById(id);
      const trigger = document.querySelector(target);
      if(!source || !trigger) return;
      source.classList.add('workspaceHelpSource');
      trigger.dataset.helpSource = id;
      trigger.removeAttribute('title');
    };
    helpSource('exampleIntroHint', '#exampleSelect');
    helpSource('simModeHint', '#simModeSelect');
    helpSource('bgLayoutEmptyState', '#bgLayoutLoadBtn');
    helpSource('groupKindDescription', '#groupKindSelect');
    helpSource('overviewQuickTip', '#workspaceHelp');
    sidebar.querySelector('.sidebarMetaFooter')?.classList.add('workspaceHelpSource');
    for(const [id, [, description]] of Object.entries(panels)){
      const header = document.querySelector('#' + id + ' .panelHeader');
      if(!header) continue;
      header.dataset.help = description;
      // Summary values still update in ui.js; expose them in contextual help.
      const meta = header.querySelector('.panelHeaderMeta');
      if(meta) meta.setAttribute('aria-hidden', 'true');
    }
    const buttonIcons = {
      btnStart:'play', btnReset:'reset', btnAddNode:'add', btnAddGroup:'group',
      btnSave:'save', btnLoad:'folder', btnShareUrl:'share', btnExportHtml:'export',
      bgLayoutLoadBtn:'image', btnBenchmark:'performance', btnEngineTest:'tools',
      timelineTabChart:'timeline', timelineTabProps:'types', timelineTabInspector:'details'
    };
    const iconUrl = (name)=> 'url("data:image/svg+xml,' + encodeURIComponent(App.workspaceIconSvg(name).replace(/currentColor/g, '#111').replace(/<circle /g, '<circle fill="#111" ')) + '")';
    for(const [id, name] of Object.entries(buttonIcons)){
      const button = document.getElementById(id);
      if(!button) continue;
      button.classList.add('workspaceIconButton');
      button.style.setProperty('--workspace-icon', iconUrl(name));
    }
    document.getElementById('btnStart')?.style.setProperty('--workspace-stop-icon', iconUrl('stop'));
    for(const id of ['btnAddNode', 'btnAddGroup']){
      const button = document.getElementById(id);
      if(button) button.dataset.help = 'Click to begin placing on the canvas. Press Esc to cancel.';
    }

    const tooltip = document.createElement('div');
    tooltip.id = 'workspaceTooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    let active = null;
    let hideTimer = null;
    let pinned = false;
    const getTrigger = (target)=> target instanceof Element ? target.closest('[data-help], [data-help-source]') : null;
    function hide(){
      clearTimeout(hideTimer);
      if(active){
        const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter((id)=>id && id !== tooltip.id);
        if(ids.length) active.setAttribute('aria-describedby', ids.join(' '));
        else active.removeAttribute('aria-describedby');
      }
      active = null;
      pinned = false;
      tooltip.hidden = true;
    }
    function show(trigger){
      clearTimeout(hideTimer);
      if(active !== trigger) hide();
      const source = document.getElementById(trigger.dataset.helpSource || '');
      const summary = trigger.querySelector('.panelHeaderMeta')?.textContent?.trim();
      const description = trigger.classList.contains('is-cancel')
        ? 'Click to cancel placement, or press Esc.' : trigger.dataset.help;
      const text = [description, source?.textContent?.trim(), summary].filter(Boolean).join('\n\n');
      if(!text) return;
      tooltip.textContent = text;
      tooltip.hidden = false;
      active = trigger;
      const ids = new Set((trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(tooltip.id);
      trigger.setAttribute('aria-describedby', [...ids].join(' '));
      const rect = trigger.getBoundingClientRect();
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      const x = rect.right + width + 20 < window.innerWidth ? rect.right + 10 : Math.min(rect.left, window.innerWidth - width - 12);
      const y = rect.right + width + 20 < window.innerWidth ? rect.top : (rect.bottom + height + 20 < window.innerHeight ? rect.bottom + 8 : rect.top - height - 8);
      tooltip.style.left = Math.max(12, x) + 'px';
      tooltip.style.top = Math.max(12, Math.min(y, window.innerHeight - height - 12)) + 'px';
    }
    function scheduleHide(){
      if(!pinned) hideTimer = setTimeout(hide, 180);
    }
    document.addEventListener('pointerover', (event)=>{
      if(event.pointerType === 'touch') return;
      const trigger = getTrigger(event.target);
      if(trigger) show(trigger);
    });
    document.addEventListener('pointerout', (event)=>{
      const trigger = getTrigger(event.target);
      if(trigger && !trigger.contains(event.relatedTarget)) scheduleHide();
    });
    document.addEventListener('focusin', (event)=>{
      const trigger = getTrigger(event.target);
      if(trigger) show(trigger);
      else hide();
    });
    document.addEventListener('focusout', (event)=>{ if(getTrigger(event.target)) scheduleHide(); });
    tooltip.addEventListener('pointerenter', ()=>clearTimeout(hideTimer));
    tooltip.addEventListener('pointerleave', scheduleHide);
    document.addEventListener('keydown', (event)=>{ if(event.key === 'Escape') hide(); });
    document.addEventListener('pointerdown', (event)=>{
      if(active && !active.contains(event.target) && !tooltip.contains(event.target)) hide();
    });
    document.getElementById('workspaceHelp')?.addEventListener('click', (event)=>{
      if(pinned) hide();
      else { show(event.currentTarget); pinned = true; }
    });
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', (event)=>{ if(event.target !== tooltip) hide(); }, true);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
