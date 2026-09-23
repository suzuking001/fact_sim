(function(root){
  root.NODE_DEFINITIONS = {
    version: 1,
    items: [
      {
        kind: 'machine',
        label: 'Machine',
        baseKind: 'machine',
        templateId: 'machine',
        icon: 'machine',
        nodeType: 'factory/basic',
        variant: '',
        snapshot: {
          type: 'factory/basic',
          title: 'Machine',
          size: [230, 110],
          properties: {
            basicNodeVersion: 3,
            role: 'equipment',
            initialContents: [],
            flow: {
              version: 2,
              nodes: [
                {id:'inPort1',kind:'inPort',config:{portId:'in-1'},inputs:[],outputs:[{id:'outPort'}],pos:[16,16]},
                {id:'inPort2',kind:'inPort',config:{portId:'in-2'},inputs:[],outputs:[{id:'outPort'}],pos:[276,176]},
                {id:'outPort1',kind:'outPort',config:{portId:'out-1'},inputs:[{id:'inPort'}],outputs:[],pos:[1056,16]},
                {id:'process1',kind:'process',config:{seconds:2},inputs:[{id:'inPort'}],outputs:[{id:'outPort'}],pos:[276,16]},
                {id:'palletizing1',kind:'Palletizing',config:{},inputs:[{id:'parentInPort'},{id:'childInPort'}],outputs:[{id:'outPort'}],pos:[536,16]},
                {id:'process2',kind:'process',config:{seconds:3},inputs:[{id:'inPort'}],outputs:[{id:'outPort'}],pos:[796,16]}
              ],
              links: [
                {from:'inPort1',output:'outPort',to:'process1',input:'inPort'},
                {from:'process1',output:'outPort',to:'palletizing1',input:'parentInPort'},
                {from:'inPort2',output:'outPort',to:'palletizing1',input:'childInPort'},
                {from:'palletizing1',output:'outPort',to:'process2',input:'inPort'},
                {from:'process2',output:'outPort',to:'outPort1',input:'inPort'}
              ],
              counters: {inPort:2,outPort:1,process:2,palletizing:1}
            },
            flipIO: false,
            description: ''
          },
          inputs: [
            {name:'inPort1',type:'entity',link:null,portId:'in-1',channel:'entity'},
            {name:'inPort2',type:'entity',link:null,portId:'in-2',channel:'entity'}
          ],
          outputs: [
            {name:'outPort1',type:'entity',links:null,portId:'out-1',channel:'entity'}
          ]
        }
      }
    ]
  };
})(typeof window === 'undefined' ? globalThis : window);
