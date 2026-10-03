(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const fields=[
    {key:'temperature',id:'aiTemperature',label:'Temperature',hint:'低いほど回答が安定します。',min:0,max:2,step:0.05,default:0.2},
    {key:'maxOutputTokens',id:'aiMaxOutputTokens',label:'生成トークン上限',hint:'空欄：プロバイダー既定（Browser AIは512、再試行時768）。',min:1,max:131072,step:1,default:null},
    {key:'maxToolIterations',id:'aiMaxToolIterations',label:'ツール呼び出しのラウンド上限',hint:'1ラウンドに複数のツールを呼ぶ場合があります。上限後は結果を要約します。',min:1,max:100,step:1,default:16},
    {key:'requestTimeoutSeconds',id:'aiRequestTimeoutSeconds',label:'応答タイムアウト（秒）',hint:'1回のAI生成の待ち時間・読込時間を含む上限。0：無制限。',min:0,max:86400,step:1,default:90,provider:'ollama'},
    {key:'numCtx',id:'aiOllamaNumCtx',label:'コンテキスト長（num_ctx）',hint:'空欄：Ollama既定。大きくするとメモリ使用量が増えます。',min:128,max:1048576,step:1,default:null,provider:'ollama'},
    {key:'topP',id:'aiOllamaTopP',label:'Top P',hint:'空欄：Ollama既定。候補語の累積確率を調整します。',min:0,max:1,step:0.01,default:null,provider:'ollama'},
    {key:'topK',id:'aiOllamaTopK',label:'Top K',hint:'空欄：Ollama既定。候補語の数を調整します。',min:1,max:1000,step:1,default:null,provider:'ollama'},
    {key:'repeatPenalty',id:'aiOllamaRepeatPenalty',label:'繰り返し抑制（repeat_penalty）',hint:'空欄：Ollama既定。1より大きい値で繰り返しを抑えます。',min:0,max:4,step:0.05,default:null,provider:'ollama'},
    {key:'seed',id:'aiOllamaSeed',label:'乱数シード',hint:'空欄：Ollama既定。固定値で生成の再現性を調整します。',min:0,max:2147483647,step:1,default:null,provider:'ollama'},
    {key:'keepAliveSeconds',id:'aiOllamaKeepAliveSeconds',label:'モデル保持時間（秒）',hint:'空欄：Ollama既定。0：生成後に解放、-1：保持を継続。',min:-1,max:86400,step:1,default:null,provider:'ollama'}
  ];
  function normalize(values={}){
    const settings={};
    for(const field of fields){
      const raw=values?.[field.key],value=raw==null || raw==='' ? field.default : Number(raw);
      settings[field.key]=value===null || (Number.isFinite(value) && value>=field.min && value<=field.max && (field.step!==1 || Number.isInteger(value))) ? value : field.default;
    }
    return settings;
  }
  function requestOptions(values){
    const settings=normalize(values),ollamaOptions={};
    for(const [key,name] of [['numCtx','num_ctx'],['topP','top_p'],['topK','top_k'],['repeatPenalty','repeat_penalty'],['seed','seed']])if(settings[key]!==null)ollamaOptions[name]=settings[key];
    if(settings.maxOutputTokens!==null)ollamaOptions.num_predict=settings.maxOutputTokens;
    // Keep explicit nulls so a request snapshot also preserves blank/default fields
    // when the UI changes provider defaults during an active multi-round response.
    return {temperature:settings.temperature,maxTokens:settings.maxOutputTokens,requestTimeoutMs:settings.requestTimeoutSeconds*1000,ollamaOptions,keepAlive:settings.keepAliveSeconds===null ? null : settings.keepAliveSeconds===-1 ? -1 : `${settings.keepAliveSeconds}s`};
  }
  AI.GenerationSettings={fields,normalize,requestOptions};
})(typeof window==='undefined' ? globalThis : window);
