(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const MODES={READ:'read',WRITE:'write',DESTRUCTIVE:'destructive',SIMULATION:'simulation'};
  function fail(message,path='input'){const error=new Error(message);error.name='ToolValidationError';error.path=path;throw error;}
  function validate(schema,value,path='input'){
    if(!schema)return value;
    const type=Array.isArray(value) ? 'array' : value===null ? 'null' : typeof value;
    if(schema.type && type!==schema.type)fail(`${path} must be ${schema.type}.`,path);
    if(schema.enum && !schema.enum.includes(value))fail(`${path} must be one of: ${schema.enum.join(', ')}.`,path);
    if(type==='number'){
      if(!Number.isFinite(value))fail(`${path} must be finite.`,path);
      if(Number.isFinite(schema.minimum) && value<schema.minimum)fail(`${path} must be at least ${schema.minimum}.`,path);
      if(Number.isFinite(schema.maximum) && value>schema.maximum)fail(`${path} must be at most ${schema.maximum}.`,path);
    }
    if(type==='string'){
      if(Number.isFinite(schema.minLength) && value.length<schema.minLength)fail(`${path} is too short.`,path);
      if(Number.isFinite(schema.maxLength) && value.length>schema.maxLength)fail(`${path} is too long.`,path);
    }
    if(type==='array'){
      if(Number.isFinite(schema.minItems) && value.length<schema.minItems)fail(`${path} has too few items.`,path);
      if(Number.isFinite(schema.maxItems) && value.length>schema.maxItems)fail(`${path} has too many items.`,path);
      value.forEach((item,index)=>validate(schema.items,item,`${path}[${index}]`));
    }
    if(type==='object'){
      for(const key of schema.required || [])if(!Object.prototype.hasOwnProperty.call(value,key))fail(`${path}.${key} is required.`,`${path}.${key}`);
      if(schema.additionalProperties===false)for(const key of Object.keys(value))if(!schema.properties?.[key])fail(`${path}.${key} is not allowed.`,`${path}.${key}`);
      for(const [key,child] of Object.entries(schema.properties || {}))if(Object.prototype.hasOwnProperty.call(value,key))validate(child,value[key],`${path}.${key}`);
    }
    return value;
  }
  class ToolRegistry{
    constructor(options={}){this.tools=new Map();this.confirm=options.confirm || null;this.policy=options.policy || (()=>'ask');}
    register(definition){
      if(!definition?.name || typeof definition.execute!=='function')throw new Error('Tool requires name and execute().');
      if(this.tools.has(definition.name))throw new Error(`Tool already registered: ${definition.name}`);
      const tool={risk:'low',mode:MODES.READ,inputSchema:{type:'object',properties:{},additionalProperties:false},outputSchema:{type:'object'},...definition};
      this.tools.set(tool.name,tool);return tool;
    }
    get(name){return this.tools.get(String(name || '')) || null;}
    list(){return [...this.tools.values()].map(({execute,preflight,...definition})=>definition);}
    _editSignature(){
      const data=App.graph.serialize(),configuration={};App.injectEntityModel?.(configuration,App.graph);App.stopGroups?.injectSerializedData?.(configuration,App.graph);
      const ports=items=>(items || []).map(({_data,_pos,_last_time,...config})=>config);
      return JSON.stringify({nodes:data.nodes.map(({id,type,title,pos,properties,inputs,outputs,mode,flags})=>({id,type,title,pos,properties,inputs:ports(inputs),outputs:ports(outputs),mode,flags})),links:data.links,groups:data.groups,configuration},(key,value)=>['__signalCache','__feedbackCache'].includes(key)?undefined:value);
    }
    undoLastAIEdit(){
      const mark=this.lastAIEdit;
      if(!mark)throw new Error('There is no undoable AI edit in this tool session.');
      if(root.isSimRunning?.() || App.graph?.status===root.LGraph?.STATUS_RUNNING)throw new Error('Stop simulation before undoing an AI edit.');
      root.flushHistory?.();const history=App.history;
      if(App.graph!==mark.graph || history?.undo.length!==mark.depth || history.last!==mark.after || history.undo.at(-2)!==mark.before || this._editSignature()!==mark.signature)throw new Error('The model/history changed after the AI edit. Refusing to undo a later manual or unrelated change.');
      root.undo();if(history.last!==mark.before)throw new Error('History undo could not restore the previous AI-edit snapshot.');
      this.lastAIEdit=null;return {success:true,undoneTool:mark.tool,restoredPreviousSnapshot:true,note:'Existing FactSim undo was used. Runtime results may be reset; rerun simulation if needed.'};
    }
    async execute(name,input={},context={}){
      const tool=this.get(name);
      try{
        if(!tool)fail(`Unknown FactSim tool: ${name}`,'tool');
        if(context.signal?.aborted)return {success:false,cancelled:true,stopReason:'cancelled',tool:tool.name,error:'AI request was stopped before tool execution.'};
        validate(tool.inputSchema,input);
        tool.preflight?.(input);
        const policy=typeof this.policy==='function' ? this.policy(tool) : this.policy;
        const needsConfirmation=tool.mode===MODES.DESTRUCTIVE || (tool.mode===MODES.WRITE && policy!=='allow-safe');
        if(needsConfirmation){
          if(typeof this.confirm!=='function' || !(await this.confirm(tool,input)))return {success:false,cancelled:true,tool:tool.name,error:'User cancelled the operation.'};
        }
        if(context.signal?.aborted)return {success:false,cancelled:true,stopReason:'cancelled',tool:tool.name,error:'AI request was stopped before tool execution.'};
        let before,depth;
        if([MODES.WRITE,MODES.DESTRUCTIVE].includes(tool.mode) && name!=='undo_last_ai_edit' && App.history){root.flushHistory?.();before=App.history.last;depth=App.history.undo.length;}
        const result=await tool.execute(input,context);
        if(before && result?.success!==false){root.flushHistory?.();const h=App.history;this.lastAIEdit=h.undo.length===depth+1 && h.undo.at(-2)===before ? {graph:App.graph,before,after:h.last,depth:h.undo.length,tool:name,signature:this._editSignature()} : null;}
        return result && typeof result==='object' ? result : {success:true,value:result};
      }catch(error){
        return {success:false,tool:tool?.name || String(name),error:String(error?.message || error),errorType:error?.name || 'Error',path:error?.path || null};
      }
    }
  }
  AI.ToolModes=MODES;AI.ToolRegistry=ToolRegistry;AI.validateToolInput=validate;
})(typeof window==='undefined' ? globalThis : window);
