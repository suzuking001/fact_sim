window.EXAMPLES = window.EXAMPLES || {};
window.EXAMPLES.pallet_station_demo = {
  "last_node_id": 12,
  "last_link_id": 14,
  "nodes": [
    {
      "id": 4,
      "type": "factory/palletcarrierconfig",
      "pos": [
        -250,
        261
      ],
      "size": [
        201.60000610351562,
        26
      ],
      "inputs": [],
      "outputs": [],
      "title": "Pallet Carrier Config IN",
      "properties": {
        "carrierId": "Carrier-IN",
        "palletCapacity": 1,
        "palletWorkCapacity": 4,
        "initialPalletIds": "P-1"
      }
    },
    {
      "id": 5,
      "type": "factory/palletcarrierconfig",
      "pos": [
        -233,
        438
      ],
      "size": [
        210,
        26
      ],
      "order": 1,
      "inputs": [],
      "outputs": [],
      "title": "Pallet Carrier Config OUT",
      "properties": {
        "carrierId": "Carrier-OUT",
        "palletCapacity": 2,
        "palletWorkCapacity": 4,
        "initialPalletIds": ""
      }
    },
    {
      "id": 2,
      "type": "factory/carrierroute",
      "pos": [
        128.6999969482422,
        322.70013427734375
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "order": 3,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 11,
          "slot_index": 0
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": 14
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            5
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": [
            2
          ],
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route IN",
      "properties": {
        "processTime": 1,
        "downTime": 0.3,
        "initialCarrier": "Carrier-IN",
        "outSequence": ""
      }
    },
    {
      "id": 9,
      "type": "factory/carrierroute",
      "pos": [
        437,
        320
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "flags": {
        "collapsed": false
      },
      "order": 8,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 5
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": null
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            6
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": null,
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "initialCarrier": "",
        "outSequence": ""
      }
    },
    {
      "id": 8,
      "type": "factory/carrierroute",
      "pos": [
        779,
        652
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "flags": {
        "collapsed": false
      },
      "order": 7,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 8,
          "pos": [
            159.60000610351562,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": null,
          "pos": [
            159.60000610351562,
            34
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            9
          ],
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": null,
          "pos": [
            10,
            34
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "initialCarrier": "",
        "outSequence": "",
        "flipIO": true
      }
    },
    {
      "id": 10,
      "type": "factory/carrierroute",
      "pos": [
        467,
        652
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "flags": {
        "collapsed": false
      },
      "order": 9,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 9,
          "pos": [
            159.60000610351562,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": null,
          "pos": [
            159.60000610351562,
            34
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            10
          ],
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": null,
          "pos": [
            10,
            34
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "initialCarrier": "",
        "outSequence": "",
        "flipIO": true
      }
    },
    {
      "id": 11,
      "type": "factory/carrierroute",
      "pos": [
        151,
        662
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "flags": {
        "collapsed": false
      },
      "order": 10,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 10,
          "pos": [
            159.60000610351562,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": null,
          "pos": [
            159.60000610351562,
            34
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            11
          ],
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": null,
          "pos": [
            10,
            34
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "initialCarrier": "",
        "outSequence": "",
        "flipIO": true
      }
    },
    {
      "id": 3,
      "type": "factory/carrierroute",
      "pos": [
        763.5360107421875,
        338.4256286621094
      ],
      "size": [
        169.60000610351562,
        46
      ],
      "order": 4,
      "inputs": [
        {
          "name": "carrierIn1",
          "type": "AGV",
          "link": 6
        },
        {
          "name": "palletIn1",
          "type": "PALLET",
          "link": null
        }
      ],
      "outputs": [
        {
          "name": "carrierOut1",
          "type": "AGV",
          "links": [
            8
          ],
          "slot_index": 0,
          "__lastSet": null,
          "__animToken": null
        },
        {
          "name": "palletOut1",
          "type": "PALLET",
          "links": null,
          "slot_index": 1,
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Carrier Route OUT",
      "properties": {
        "processTime": 1,
        "downTime": 0.3,
        "initialCarrier": "Carrier-OUT",
        "outSequence": ""
      }
    },
    {
      "id": 6,
      "type": "factory/station",
      "pos": [
        124,
        43
      ],
      "size": [
        152.8000030517578,
        46
      ],
      "order": 5,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 1,
          "pos": [
            142.8000030517578,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "palletIn",
          "type": "PALLET",
          "link": 2,
          "pos": [
            142.8000030517578,
            34
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            12
          ],
          "__lastSet": null,
          "__animToken": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true
        },
        {
          "name": "palletOut",
          "type": "PALLET",
          "links": [
            14
          ],
          "__lastSet": null,
          "__animToken": null,
          "pos": [
            10,
            34
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true
        }
      ],
      "title": "Station",
      "properties": {
        "processTime": 1,
        "downTime": 1,
        "palletWorkCapacity": 4,
        "flipIO": true
      }
    },
    {
      "id": 1,
      "type": "factory/source",
      "pos": [
        296.8421936035156,
        62.45530319213867
      ],
      "size": [
        140,
        26
      ],
      "order": 2,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            1
          ],
          "__lastSet": null,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B,C"
      }
    },
    {
      "id": 7,
      "type": "factory/sink",
      "pos": [
        -270,
        35
      ],
      "size": [
        140,
        26
      ],
      "order": 6,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 13,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [],
      "title": "Sink",
      "properties": {
        "flipIO": true
      }
    },
    {
      "id": 12,
      "type": "factory/equip",
      "pos": [
        -90,
        48
      ],
      "size": [
        140,
        50
      ],
      "order": 11,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 12,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            13
          ],
          "slot_index": 0,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true
        }
      ],
      "title": "Equipment",
      "properties": {
        "processTime": 2,
        "downTime": 3,
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
      "PALLET"
    ],
    [
      5,
      2,
      0,
      9,
      0,
      "AGV"
    ],
    [
      6,
      9,
      0,
      3,
      0,
      "AGV"
    ],
    [
      8,
      3,
      0,
      8,
      0,
      "AGV"
    ],
    [
      9,
      8,
      0,
      10,
      0,
      "AGV"
    ],
    [
      10,
      10,
      0,
      11,
      0,
      "AGV"
    ],
    [
      11,
      11,
      0,
      2,
      0,
      "AGV"
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
      2,
      1,
      "PALLET"
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
  }
};
