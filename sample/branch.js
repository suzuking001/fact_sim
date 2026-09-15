(function(root){root.EXAMPLES=root.EXAMPLES || {};root.EXAMPLES["branch"]={
  "last_node_id": 6,
  "last_link_id": 5,
  "nodes": [
    {
      "id": 1,
      "type": "factory/basic",
      "pos": [
        60,
        240
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
            }
          ],
          "intervalSec": 0,
          "repeat": true
        }
      },
      "inputs": [],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            1
          ],
          "portId": "out-1",
          "channel": "entity",
          "flowManaged": true
        }
      ],
      "size": [
        230,
        110
      ]
    },
    {
      "id": 2,
      "type": "factory/basic",
      "pos": [
        360,
        240
      ],
      "title": "Split",
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
                1080,
                205
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
                  "typeId": "type-a"
                },
                {
                  "id": "outPort2",
                  "typeId": "anyType"
                }
              ],
              "pos": [
                810,
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
              "from": "entityRouter1",
              "output": "outPort2",
              "to": "outPort2",
              "input": "inPort"
            }
          ],
          "counters": {
            "inPort": 1,
            "outPort": 2,
            "process": 1,
            "recovery": 1,
            "entityRouter": 1
          }
        },
        "initialContents": [],
        "flipIO": false
      },
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 1,
          "portId": "in-1",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            2
          ],
          "portId": "out-1",
          "channel": "entity"
        },
        {
          "name": "outPort2",
          "type": "entity",
          "links": [
            3
          ],
          "portId": "out-2",
          "channel": "entity"
        }
      ],
      "size": [
        230,
        110
      ]
    },
    {
      "id": 3,
      "type": "factory/basic",
      "pos": [
        660,
        160
      ],
      "title": "Line A",
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
        "flipIO": false
      },
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 2,
          "portId": "in-1",
          "channel": "entity"
        }
      ],
      "outputs": [
        {
          "name": "outPort1",
          "type": "entity",
          "links": [
            4
          ],
          "portId": "out-1",
          "channel": "entity"
        }
      ],
      "size": [
        230,
        110
      ]
    },
    {
      "id": 4,
      "type": "factory/basic",
      "pos": [
        660,
        320
      ],
      "title": "Line B",
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
        "flipIO": false
      },
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 3,
          "portId": "in-1",
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
          "portId": "out-1",
          "channel": "entity"
        }
      ],
      "size": [
        230,
        110
      ]
    },
    {
      "id": 5,
      "type": "factory/basic",
      "pos": [
        960,
        160
      ],
      "title": "Sink A",
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
        "flipIO": false
      },
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 4,
          "portId": "in-1",
          "channel": "entity",
          "flowManaged": true,
          "entityRole": "item"
        }
      ],
      "outputs": [],
      "size": [
        230,
        110
      ]
    },
    {
      "id": 6,
      "type": "factory/basic",
      "pos": [
        960,
        320
      ],
      "title": "Sink B",
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
        "flipIO": false
      },
      "inputs": [
        {
          "name": "inPort1",
          "type": "entity",
          "link": 5,
          "portId": "in-1",
          "channel": "entity",
          "flowManaged": true,
          "entityRole": "item"
        }
      ],
      "outputs": [],
      "size": [
        230,
        110
      ]
    }
  ],
  "links": [
    [
      1,
      1,
      0,
      2,
      0,
      0
    ],
    [
      2,
      2,
      0,
      3,
      0,
      0
    ],
    [
      3,
      2,
      1,
      4,
      0,
      0
    ],
    [
      4,
      3,
      0,
      5,
      0,
      0
    ],
    [
      5,
      4,
      0,
      6,
      0,
      0
    ]
  ],
  "groups": [],
  "version": 0.4,
  "__factSimEntityModel": {
    "schemaVersion": 3,
    "types": [
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
      }
    ]
  },
  "__factSimFormat": 2,
  "extra": {
    "syncroGroups": [],
    "syncroGroupSequence": 0
  }
};})(typeof window!=="undefined" ? window : globalThis);
