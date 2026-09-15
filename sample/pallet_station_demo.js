(function(root){root.EXAMPLES=root.EXAMPLES || {};root.EXAMPLES["pallet_station_demo"]={
  "last_node_id": 13,
  "last_link_id": 15,
  "nodes": [
    {
      "id": 2,
      "type": "factory/basic",
      "pos": [
        128.6999969482422,
        322.70013427734375
      ],
      "size": [
        230,
        110
      ],
      "order": 3,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 11,
          "slot_index": 0,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": 15,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            5
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [
            2
          ],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Carrier Route IN",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "inPort2",
              "kind": "inPort",
              "config": {
                "portId": "in-2"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                205
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                1350,
                30
              ]
            },
            {
              "id": "outPort2",
              "kind": "outPort",
              "config": {
                "portId": "out-2"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                1080,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 1.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "dePalletizing1",
              "kind": "DePalletizing",
              "config": {},
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "parentOutPort"
                },
                {
                  "id": "childOutPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            },
            {
              "id": "entityRouter1",
              "kind": "entityRouter",
              "config": {},
              "inputs": [
                {
                  "id": "inPort1"
                }
              ],
              "outputs": [
                {
                  "id": "outPort1",
                  "typeId": "anyType"
                }
              ],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "palletizing1",
              "kind": "Palletizing",
              "config": {},
              "inputs": [
                {
                  "id": "parentInPort"
                },
                {
                  "id": "childInPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                810,
                205
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 0.3
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                1080,
                205
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "dePalletizing1",
              "input": "inPort"
            },
            {
              "from": "dePalletizing1",
              "output": "childOutPort",
              "to": "entityRouter1",
              "input": "inPort1"
            },
            {
              "from": "entityRouter1",
              "output": "outPort1",
              "to": "outPort2",
              "input": "inPort"
            },
            {
              "from": "dePalletizing1",
              "output": "parentOutPort",
              "to": "palletizing1",
              "input": "parentInPort"
            },
            {
              "from": "inPort2",
              "output": "outPort",
              "to": "palletizing1",
              "input": "childInPort"
            },
            {
              "from": "palletizing1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 2,
            "outPort": 2,
            "process": 1,
            "dePalletizing": 1,
            "entityRouter": 1,
            "palletizing": 1,
            "recovery": 1
          }
        },
        "initialContents": [
          {
            "typeId": "type-carrier-in",
            "quantity": 1,
            "load": "custom",
            "children": [
              {
                "typeId": "type-pallet-4",
                "quantity": 1,
                "load": "custom",
                "children": [
                  {
                    "typeId": "type-a",
                    "quantity": 4,
                    "load": "empty",
                    "children": []
                  }
                ]
              }
            ]
          }
        ],
        "flipIO": false,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 9,
      "type": "factory/basic",
      "pos": [
        437,
        320
      ],
      "size": [
        230,
        110
      ],
      "flags": {
        "collapsed": false
      },
      "order": 8,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 5,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": null,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            6
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Transport Route",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 5.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 3.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": false,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 8,
      "type": "factory/basic",
      "pos": [
        779,
        652
      ],
      "size": [
        230,
        110
      ],
      "flags": {
        "collapsed": false
      },
      "order": 7,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 8,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": null,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            9
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Transport Route",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 5.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 3.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 10,
      "type": "factory/basic",
      "pos": [
        467,
        652
      ],
      "size": [
        230,
        110
      ],
      "flags": {
        "collapsed": false
      },
      "order": 9,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 9,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": null,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            10
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Transport Route",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 5.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 3.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 11,
      "type": "factory/basic",
      "pos": [
        151,
        662
      ],
      "size": [
        230,
        110
      ],
      "flags": {
        "collapsed": false
      },
      "order": 10,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 10,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": null,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            11
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Transport Route",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 5.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 3.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 3,
      "type": "factory/basic",
      "pos": [
        763.5360107421875,
        338.4256286621094
      ],
      "size": [
        230,
        110
      ],
      "order": 4,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 6,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": null,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            8
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [],
          "slot_index": 1,
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Carrier Route OUT",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 1.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 0.3
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [
          {
            "typeId": "type-carrier-out",
            "quantity": 1,
            "load": "custom",
            "children": [
              {
                "typeId": "type-pallet-4",
                "quantity": 2,
                "load": "custom",
                "children": [
                  {
                    "typeId": "type-a",
                    "quantity": 4,
                    "load": "empty",
                    "children": []
                  }
                ]
              }
            ]
          }
        ],
        "flipIO": false,
        "initialFlowNodeId": "inPort1"
      }
    },
    {
      "id": 6,
      "type": "factory/basic",
      "pos": [
        124,
        43
      ],
      "size": [
        230,
        110
      ],
      "order": 5,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 1,
          "portId": "in-1",
          "channel": "entity"
        },
        {
          "name": "inPort2",
          "type": "entity",
          "link": 2,
          "portId": "in-2",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            12
          ],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [
            14
          ],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "title": "Store",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "inPort2",
              "kind": "inPort",
              "config": {
                "portId": "in-2"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                205
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                1080,
                30
              ]
            },
            {
              "id": "outPort2",
              "kind": "outPort",
              "config": {
                "portId": "out-2"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                1350,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 1.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "dePalletizing1",
              "kind": "DePalletizing",
              "config": {},
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "parentOutPort"
                },
                {
                  "id": "childOutPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            },
            {
              "id": "entityRouter1",
              "kind": "entityRouter",
              "config": {},
              "inputs": [
                {
                  "id": "inPort1"
                }
              ],
              "outputs": [
                {
                  "id": "outPort1",
                  "typeId": "anyType"
                }
              ],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "palletizing1",
              "kind": "Palletizing",
              "config": {},
              "inputs": [
                {
                  "id": "parentInPort"
                },
                {
                  "id": "childInPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                810,
                205
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 1.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                1080,
                205
              ]
            }
          ],
          "links": [
            {
              "from": "inPort2",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "dePalletizing1",
              "input": "inPort"
            },
            {
              "from": "dePalletizing1",
              "output": "childOutPort",
              "to": "entityRouter1",
              "input": "inPort1"
            },
            {
              "from": "entityRouter1",
              "output": "outPort1",
              "to": "outPort1",
              "input": "inPort"
            },
            {
              "from": "dePalletizing1",
              "output": "parentOutPort",
              "to": "palletizing1",
              "input": "parentInPort"
            },
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "palletizing1",
              "input": "childInPort"
            },
            {
              "from": "palletizing1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort2",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 2,
            "outPort": 2,
            "process": 1,
            "dePalletizing": 1,
            "entityRouter": 1,
            "palletizing": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true,
        "initialFlowNodeId": "inPort2"
      }
    },
    {
      "id": 1,
      "type": "factory/basic",
      "pos": [
        296.8421936035156,
        62.45530319213867
      ],
      "size": [
        230,
        110
      ],
      "order": 2,
      "inputs": [],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            1
          ],
          "__lastSet": null,
          "__animToken": null,
          "portId": "out-1",
          "channel": "entity",
          "flowManaged": true
        }
      ],
      "title": "Source",
      "properties": {
        "basicNodeVersion": 3,
        "role": "source",
        "flow": {
          "version": 2,
          "nodes": [],
          "links": [],
          "counters": {}
        },
        "initialContents": [],
        "flipIO": false,
        "source": {
          "entries": [
            {
              "typeId": "type-a",
              "count": 1,
              "children": []
            },
            {
              "typeId": "type-b",
              "count": 1,
              "children": []
            },
            {
              "typeId": "type-c",
              "count": 1,
              "children": []
            }
          ],
          "intervalSec": 0,
          "repeat": true
        }
      }
    },
    {
      "id": 7,
      "type": "factory/basic",
      "pos": [
        -270,
        35
      ],
      "size": [
        230,
        110
      ],
      "order": 6,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 13,
          "portId": "in-1",
          "channel": "entity",
          "flowManaged": true,
          "entityRole": "item"
        }
      ],
      "outputs": [],
      "title": "Sink",
      "properties": {
        "basicNodeVersion": 3,
        "role": "sink",
        "flow": {
          "version": 2,
          "nodes": [],
          "links": [],
          "counters": {}
        },
        "initialContents": [],
        "flipIO": true
      }
    },
    {
      "id": 12,
      "type": "factory/basic",
      "pos": [
        -90,
        48
      ],
      "size": [
        230,
        110
      ],
      "order": 11,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 12,
          "portId": "in-1",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            13
          ],
          "slot_index": 0,
          "portId": "out-1",
          "channel": "entity"
        }
      ],
      "title": "Equipment",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 2.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 3.0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true
      }
    },
    {
      "id": 13,
      "type": "factory/basic",
      "pos": [
        394.0,
        203.0
      ],
      "size": [
        230,
        110
      ],
      "order": 11,
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 14,
          "portId": "in-1",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            15
          ],
          "slot_index": 0,
          "portId": "out-1",
          "channel": "entity"
        }
      ],
      "title": "Returned pallet buffer",
      "properties": {
        "basicNodeVersion": 3,
        "role": "equipment",
        "flow": {
          "version": 2,
          "nodes": [
            {
              "id": "inPort1",
              "kind": "inPort",
              "config": {
                "portId": "in-1"
              },
              "inputs": [],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                0,
                30
              ]
            },
            {
              "id": "outPort1",
              "kind": "outPort",
              "config": {
                "portId": "out-1"
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [],
              "pos": [
                810,
                30
              ]
            },
            {
              "id": "process1",
              "kind": "process",
              "config": {
                "seconds": 0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                270,
                30
              ]
            },
            {
              "id": "recovery1",
              "kind": "recovery",
              "config": {
                "seconds": 0
              },
              "inputs": [
                {
                  "id": "inPort"
                }
              ],
              "outputs": [
                {
                  "id": "outPort"
                }
              ],
              "pos": [
                540,
                30
              ]
            }
          ],
          "links": [
            {
              "from": "inPort1",
              "output": "outPort",
              "to": "process1",
              "input": "inPort"
            },
            {
              "from": "process1",
              "output": "outPort",
              "to": "recovery1",
              "input": "inPort"
            },
            {
              "from": "recovery1",
              "output": "outPort",
              "to": "outPort1",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 1,
            "process": 1,
            "recovery": 1
          }
        },
        "initialContents": [],
        "flipIO": true
      }
    }
  ],
  "links": [
    [
      1,
      1,
      0,
      6,
      0,
      0
    ],
    [
      2,
      2,
      1,
      6,
      1,
      0
    ],
    [
      5,
      2,
      0,
      9,
      0,
      0
    ],
    [
      6,
      9,
      0,
      3,
      0,
      0
    ],
    [
      8,
      3,
      0,
      8,
      0,
      0
    ],
    [
      9,
      8,
      0,
      10,
      0,
      0
    ],
    [
      10,
      10,
      0,
      11,
      0,
      0
    ],
    [
      11,
      11,
      0,
      2,
      0,
      0
    ],
    [
      12,
      6,
      0,
      12,
      0,
      0
    ],
    [
      13,
      12,
      0,
      7,
      0,
      0
    ],
    [
      14,
      6,
      1,
      13,
      0,
      0
    ],
    [
      15,
      13,
      0,
      2,
      1,
      "entity"
    ]
  ],
  "groups": [],
  "version": 0.4,
  "__factSimView": {
    "version": 1,
    "graph": {
      "scale": 0.9090909090909091,
      "offset": [
        867.3661299511655,
        340.1950640285662
      ]
    },
    "ui": {
      "sidebarHidden": false,
      "timelineHidden": false,
      "timelineView": "chart",
      "timelineHeight": 220
    }
  },
  "__factSimEntityModel": {
    "schemaVersion": 3,
    "types": [
      {
        "typeId": "type-pallet-4",
        "name": "Pallet 4",
        "subtype": "Pallet",
        "tags": [
          "migrated"
        ],
        "capacity": 4,
        "allowedContentTypeIds": [
          "type-a",
          "type-b",
          "type-c"
        ],
        "defaultAttributes": {}
      },
      {
        "typeId": "type-carrier-in",
        "name": "Carrier-IN",
        "subtype": "Carrier",
        "tags": [
          "migrated"
        ],
        "capacity": 1,
        "allowedContentTypeIds": [
          "type-pallet-4"
        ],
        "defaultAttributes": {}
      },
      {
        "typeId": "type-carrier-out",
        "name": "Carrier-OUT",
        "subtype": "Carrier",
        "tags": [
          "migrated"
        ],
        "capacity": 2,
        "allowedContentTypeIds": [
          "type-pallet-4"
        ],
        "defaultAttributes": {}
      },
      {
        "typeId": "type-a",
        "name": "A",
        "subtype": "",
        "tags": [
          "migrated"
        ],
        "capacity": 0,
        "allowedContentTypeIds": [],
        "defaultAttributes": {}
      },
      {
        "typeId": "type-b",
        "name": "B",
        "subtype": "",
        "tags": [
          "migrated"
        ],
        "capacity": 0,
        "allowedContentTypeIds": [],
        "defaultAttributes": {}
      },
      {
        "typeId": "type-c",
        "name": "C",
        "subtype": "",
        "tags": [
          "migrated"
        ],
        "capacity": 0,
        "allowedContentTypeIds": [],
        "defaultAttributes": {}
      }
    ]
  },
  "__factSimFormat": 2,
  "extra": {
    "syncroGroups": [],
    "syncroGroupSequence": 0
  }
};})(typeof window!=="undefined" ? window : globalThis);
