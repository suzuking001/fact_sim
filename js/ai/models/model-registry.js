(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const models=[
    {
      id:'Llama-3.2-1B-Instruct-q4f16_1-MLC',label:'Llama 3.2 1B',category:'fast',
      description:'Lightweight chat model for devices with limited GPU memory.',
      recommendedFor:['General chat','Quick explanations'],estimatedMemoryGB:0.9,supportsTools:false
    },
    {
      id:'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',label:'Hermes 2 Pro 8B',category:'standard',
      description:'Function-calling model recommended for FactSim operations.',
      recommendedFor:['Tool calling','FactSim operation'],estimatedMemoryGB:5.0,supportsTools:true
    },
    {
      id:'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',label:'Hermes-3 Llama 3.1 8B',category:'standard',
      description:'Instruction-following model for conversation and structured FactSim operations.',
      recommendedFor:['General chat','FactSim operation'],estimatedMemoryGB:4.9,supportsTools:true
    },
    {
      id:'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',label:'DeepSeek-R1-Distill-Qwen-7B',category:'reasoning',
      description:'Analysis-oriented model with higher memory requirements.',
      recommendedFor:['Analysis','Improvement hypotheses'],estimatedMemoryGB:5.1,supportsTools:false
    },
    {
      id:'Llama-3.1-8B-Instruct-q4f16_1-MLC',label:'Llama 3.1 8B Instruct',category:'standard',
      description:'General-purpose instruction model using the structured FactSim conversation protocol.',
      recommendedFor:['General chat','Model explanations'],estimatedMemoryGB:5.0,supportsTools:false
    },
    {
      id:'Phi-4-mini-instruct-q4f16_1-MLC',label:'Phi-4-mini-instruct',category:'fast',
      description:'Compact instruction model using the structured FactSim conversation protocol.',
      recommendedFor:['General chat','Quick explanations'],estimatedMemoryGB:3.4,supportsTools:false
    }
  ];
  AI.WebLLMModelRegistry={
    list:()=>models.map(item=>({...item,recommendedFor:item.recommendedFor.slice()})),
    get:id=>models.find(item=>item.id===id) || null,
    defaultId:'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC'
  };
})(typeof window==='undefined' ? globalThis : window);
