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
    list(){return [...this.tools.values()].map(({execute,...definition})=>definition);}
    async execute(name,input={},context={}){
      const tool=this.get(name);
      try{
        if(!tool)fail(`Unknown FactSim tool: ${name}`,'tool');
        validate(tool.inputSchema,input);
        const policy=typeof this.policy==='function' ? this.policy(tool) : this.policy;
        const needsConfirmation=tool.mode===MODES.DESTRUCTIVE || (tool.mode===MODES.WRITE && policy!=='allow-safe');
        if(needsConfirmation){
          if(typeof this.confirm!=='function' || !(await this.confirm(tool,input)))return {success:false,cancelled:true,tool:tool.name,error:'User cancelled the operation.'};
        }
        const result=await tool.execute(input,context);
        return result && typeof result==='object' ? result : {success:true,value:result};
      }catch(error){
        return {success:false,tool:tool?.name || String(name),error:String(error?.message || error),errorType:error?.name || 'Error',path:error?.path || null};
      }
    }
  }
  AI.ToolModes=MODES;AI.ToolRegistry=ToolRegistry;AI.validateToolInput=validate;
})(typeof window==='undefined' ? globalThis : window);
