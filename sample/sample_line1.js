window.EXAMPLES = window.EXAMPLES || {};
window.EXAMPLES.sample_line1 = {
  "last_node_id": 68,
  "last_link_id": 65,
  "nodes": [
    {
      "id": 8,
      "type": "factory/equip",
      "pos": {
        "0": 2229,
        "1": 430,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 31,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 42
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            8
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 9,
      "type": "factory/equip",
      "pos": {
        "0": 2559,
        "1": 429,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 33,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 8
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            9
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 11,
      "type": "factory/source",
      "pos": {
        "0": 42,
        "1": 756,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 0,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            10
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 13,
      "type": "factory/equip",
      "pos": {
        "0": 304,
        "1": 752,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 8,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 10
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            11
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 14,
      "type": "factory/equip",
      "pos": {
        "0": 619,
        "1": 749,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 16,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 11
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            12
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 15,
      "type": "factory/equip",
      "pos": {
        "0": 934,
        "1": 745,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 19,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 12
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            14
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 22,
      "type": "factory/source",
      "pos": {
        "0": 56,
        "1": 1585,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 1,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            17
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 25,
      "type": "factory/equip",
      "pos": {
        "0": 285,
        "1": 1584,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 9,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 17
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            18
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 24,
      "type": "factory/equip",
      "pos": {
        "0": 586,
        "1": 1573,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 17,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 18
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            19
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 23,
      "type": "factory/equip",
      "pos": {
        "0": 918,
        "1": 1576,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 20,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 19
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            20
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 27,
      "type": "factory/equip",
      "pos": {
        "0": 938,
        "1": 1127,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 10,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 21
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            22
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 12,
      "type": "factory/source",
      "pos": {
        "0": 706,
        "1": 1130,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 2,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            21
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 28,
      "type": "factory/equip",
      "pos": {
        "0": 927,
        "1": 1964,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 11,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 24
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            23
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 29,
      "type": "factory/source",
      "pos": {
        "0": 669,
        "1": 1964,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 3,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            24
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 26,
      "type": "factory/merge2",
      "pos": {
        "0": 1268,
        "1": 1783,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 23,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn1",
          "type": 0,
          "link": 20
        },
        {
          "name": "workIn2",
          "type": 0,
          "link": 23
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            25
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "processTime2": 2
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 30,
      "type": "factory/equip",
      "pos": {
        "0": 1588,
        "1": 956,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 25,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 26
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            27
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 31,
      "type": "factory/equip",
      "pos": {
        "0": 1583,
        "1": 1766,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 26,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 25
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            28
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 32,
      "type": "factory/merge2",
      "pos": {
        "0": 1925,
        "1": 1320,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 28,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn1",
          "type": 0,
          "link": 27
        },
        {
          "name": "workIn2",
          "type": 0,
          "link": 28
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            29
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "processTime2": 2
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 34,
      "type": "factory/equip",
      "pos": {
        "0": 2269,
        "1": 1319,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 30,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 29
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            30
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 33,
      "type": "factory/equip",
      "pos": {
        "0": 2598,
        "1": 1317,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 32,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 30
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            31
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 10,
      "type": "factory/equip",
      "pos": {
        "0": 2942,
        "1": 423,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 35,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 9
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            32
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 35,
      "type": "factory/equip",
      "pos": {
        "0": 2906,
        "1": 1320,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 34,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 31
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            33
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 36,
      "type": "factory/merge2",
      "pos": {
        "0": 3406,
        "1": 897,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 36,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn1",
          "type": 0,
          "link": 32
        },
        {
          "name": "workIn2",
          "type": 0,
          "link": 33
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            34
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "processTime2": 2
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 39,
      "type": "factory/equip",
      "pos": {
        "0": 3734,
        "1": 893,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 37,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 34
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            35
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 37,
      "type": "factory/equip",
      "pos": {
        "0": 4024,
        "1": 889,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 38,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 35
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            36
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 20,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 38,
      "type": "factory/equip",
      "pos": {
        "0": 4322,
        "1": 886,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 39,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 36
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            37
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 4,
      "type": "factory/equip",
      "pos": {
        "0": 716.6039428710938,
        "1": 36.83048629760742,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 168
      },
      "flags": {},
      "order": 18,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 2
        },
        {
          "name": "sigIn0",
          "type": "string",
          "link": 43
        },
        {
          "name": "sigIn1",
          "type": "string",
          "link": 44
        },
        {
          "name": "sigIn2",
          "type": "string",
          "link": null
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            3
          ],
          "slot_index": 0,
          "__animToken": null
        },
        {
          "name": "sigOut0",
          "type": "string",
          "links": null,
          "__animToken": null
        },
        {
          "name": "sigOut1",
          "type": "string",
          "links": null,
          "__animToken": null
        },
        {
          "name": "sigOut2",
          "type": "string",
          "links": null,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 3,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 5,
      "type": "factory/equip",
      "pos": {
        "0": 1246,
        "1": 70,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 24,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 4
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            5
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 6,
      "type": "factory/equip",
      "pos": {
        "0": 1557,
        "1": 70,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 27,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 5
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            39
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 43,
      "type": "factory/source",
      "pos": {
        "0": 1259,
        "1": 472,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 4,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            40
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 44,
      "type": "factory/equip",
      "pos": {
        "0": 1517,
        "1": 466,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 12,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 40
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            41
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 42,
      "type": "factory/merge2",
      "pos": {
        "0": 1914,
        "1": 265,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 29,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn1",
          "type": 0,
          "link": 39
        },
        {
          "name": "workIn2",
          "type": 0,
          "link": 41
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            42
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "processTime2": 2
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 40,
      "type": "factory/equip",
      "pos": {
        "0": 4672,
        "1": 890,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 40,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 37
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            45
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 2,
      "type": "factory/equip",
      "pos": {
        "0": 383.6045227050781,
        "1": 31.830482482910156,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 152
      },
      "flags": {},
      "order": 14,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 1
        },
        {
          "name": "sigIn0",
          "type": "string",
          "link": null
        },
        {
          "name": "sigIn1",
          "type": "string",
          "link": null
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            2
          ],
          "slot_index": 0,
          "__animToken": null
        },
        {
          "name": "sigOut0",
          "type": "string",
          "links": [
            43
          ],
          "slot_index": 1,
          "__animToken": null
        },
        {
          "name": "sigOut1",
          "type": "string",
          "links": [
            44
          ],
          "slot_index": 2,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 4,
        "downTime": 0.5,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\n\n\n// work: Work object (work.id, work.type など)\n// signalArr: sigIn の配列\n\nif(work.type === 'A'){\n  this.properties.processTime = 2.0;\n  this.properties.downTime = 1.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 0.5;\n}else{\n  // デフォルト\n  this.properties.processTime = 3.0;\n  this.properties.downTime = 0.8;\n}\n\n// true を返すとこのワークを受け入れて PROCESS に入る\nreturn true;\n",
        "sigExtra": 2,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 3,
      "type": "factory/equip",
      "pos": {
        "0": 958,
        "1": 74,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 181.71395874023438,
        "1": 120
      },
      "flags": {},
      "order": 21,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 3
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            4
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 45,
      "type": "factory/sink",
      "pos": {
        "0": 4992,
        "1": 894,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": [
        224.38664646749476,
        161.39725084967085
      ],
      "flags": {},
      "order": 41,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 45
        }
      ],
      "outputs": [],
      "title": "Sink",
      "properties": {
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 54,
      "type": "factory/source",
      "pos": {
        "0": 97.52685546875,
        "1": -1671.826171875,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 5,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            55
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 52,
      "type": "factory/equip",
      "pos": {
        "0": 378.9729309082031,
        "1": -1700.261962890625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 13,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 55
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            52
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Equipment",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 53,
      "type": "factory/equip",
      "pos": {
        "0": 1424.9732666015625,
        "1": -1716.261962890625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 48,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 53
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            54
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Equipment",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 55,
      "type": "factory/sink",
      "pos": {
        "0": 1657.9732666015625,
        "1": -1729.261962890625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": [
        209.16690163555427,
        138.49815741408554
      ],
      "flags": {},
      "order": 49,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 54
        }
      ],
      "outputs": [],
      "title": "Sink",
      "properties": {
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 51,
      "type": "factory/agvroute",
      "pos": {
        "0": 1166.97314453125,
        "1": -1436.26171875,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 47,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 46,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            49
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 2,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 48,
      "type": "factory/agvroute",
      "pos": {
        "0": 948.9732055664062,
        "1": -1407.26171875,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 44,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 49,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            50
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 2,
        "agvIds": "AGV-1"
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 1,
      "type": "factory/source",
      "pos": {
        "0": 193,
        "1": 40,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 6,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            1
          ],
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 50,
      "type": "factory/agvroute",
      "pos": {
        "0": 667.8871459960938,
        "1": -1714.907958984375,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 46,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 52
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 51
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": null,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            48
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 2,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 46,
      "type": "factory/agvroute",
      "pos": {
        "0": 678.974365234375,
        "1": -1431.2000732421875,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 42,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 50,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            51
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 2,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 66,
      "type": "factory/sink",
      "pos": {
        "0": 1536.1170654296875,
        "1": -815.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": [
        220,
        170
      ],
      "flags": {},
      "order": 57,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 56
        }
      ],
      "outputs": [],
      "title": "Sink",
      "properties": {
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 63,
      "type": "factory/equip",
      "pos": {
        "0": 1290.1170654296875,
        "1": -820.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 56,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 57
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            56
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "title": "Equipment",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 61,
      "type": "factory/agvroute",
      "pos": {
        "0": 594.1168823242188,
        "1": -584.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 54,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 60,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            61
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 1,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 64,
      "type": "factory/equip",
      "pos": {
        "0": 318.1170654296875,
        "1": -824.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 15,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 63,
          "slot_index": 0
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            62
          ],
          "__animToken": null
        }
      ],
      "title": "Equipment",
      "properties": {
        "processTime": 5,
        "downTime": 3,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 57,
      "type": "factory/agvroute",
      "pos": {
        "0": 814.1168823242188,
        "1": -835.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 51,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 64
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": null,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            65
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 1,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 56,
      "type": "factory/agvroute",
      "pos": {
        "0": 1078.1170654296875,
        "1": -552.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 50,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "slot_index": 0,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 58,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            59
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 1,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 60,
      "type": "factory/agvroute",
      "pos": {
        "0": 850.1168823242188,
        "1": -560.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 53,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null,
          "pos": [
            130,
            14
          ],
          "_flipPrevDir": null,
          "dir": 4,
          "__flipActive": true
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 59,
          "pos": [
            130,
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
          "links": null,
          "pos": [
            10,
            14
          ],
          "_flipPrevDir": null,
          "dir": 3,
          "__flipActive": true,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            60
          ],
          "slot_index": 1,
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
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": true,
        "agvCapacity": 1,
        "agvIds": "AGV-2"
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 65,
      "type": "factory/source",
      "pos": {
        "0": 132.11709594726562,
        "1": -828.11181640625,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 26
      },
      "flags": {},
      "order": 7,
      "mode": 0,
      "inputs": [],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            63
          ],
          "__animToken": null
        }
      ],
      "title": "Source",
      "properties": {
        "sequence": "A,B",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false
      },
      "color": "#f39c12",
      "bgcolor": "#fff6e6"
    },
    {
      "id": 59,
      "type": "factory/agvroute",
      "pos": {
        "0": 1079,
        "1": -821,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 52,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 65
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            57
          ],
          "slot_index": 0,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            58
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 1,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
    },
    {
      "id": 47,
      "type": "factory/agvroute",
      "pos": {
        "0": 1142,
        "1": -1714,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 43,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 47
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            53
          ],
          "slot_index": 0,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            46
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 2,
        "agvIds": ""
      },
      "color": "#3498db",
      "bgcolor": "#e8f1fb"
    },
    {
      "id": 62,
      "type": "factory/agvroute",
      "pos": {
        "0": 581,
        "1": -826,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 55,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": 62,
          "slot_index": 0
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 61
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": null,
          "slot_index": 0,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            64
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 1,
        "agvIds": ""
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 17,
      "type": "factory/merge2",
      "pos": {
        "0": 1294,
        "1": 966,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 210,
        "1": 120
      },
      "flags": {},
      "order": 22,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn1",
          "type": 0,
          "link": 14
        },
        {
          "name": "workIn2",
          "type": 0,
          "link": 22
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": [
            26
          ],
          "slot_index": 0,
          "__animToken": null
        }
      ],
      "properties": {
        "processTime": 2,
        "downTime": 3,
        "script": "// work: Work object, signalArr: array of signals\n// this._state values: IDLE, PROCESS, WAIT, DOWN\n// Return true to accept work into PROCESS state.\n\n// Default: すべて受け入れる（必要ならここに条件を記述）\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "processTime2": 2
      },
      "color": "#2ecc71",
      "bgcolor": "#e8f8f2"
    },
    {
      "id": 49,
      "type": "factory/agvroute",
      "pos": {
        "0": 930,
        "1": -1704,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0
      },
      "size": {
        "0": 140,
        "1": 120
      },
      "flags": {},
      "order": 45,
      "mode": 0,
      "inputs": [
        {
          "name": "workIn",
          "type": 0,
          "link": null
        },
        {
          "name": "agvIn",
          "type": "AGV",
          "link": 48
        }
      ],
      "outputs": [
        {
          "name": "workOut",
          "type": 0,
          "links": null,
          "__animToken": null
        },
        {
          "name": "agvOut",
          "type": "AGV",
          "links": [
            47
          ],
          "slot_index": 1,
          "__animToken": null
        }
      ],
      "title": "AGV Route",
      "properties": {
        "processTime": 3,
        "downTime": 0.5,
        "script": "// work: Work object (work.id, work.type, etc.)\n// signalArr: array of sigIn values\n\nif(work.type === 'A'){\n  this.properties.processTime = 5.0;\n  this.properties.downTime = 3.0;\n}else if(work.type === 'B'){\n  this.properties.processTime = 4.0;\n  this.properties.downTime = 2.0;\n}else{\n  // default\n  this.properties.processTime = 10.0;\n  this.properties.downTime = 2.0;\n}\n\n// Return true to accept this work item into PROCESS\nreturn true;",
        "sigExtra": 0,
        "sigEnabled": true,
        "flipIO": false,
        "agvCapacity": 2,
        "agvIds": ""
      },
      "color": "#f1c40f",
      "bgcolor": "#fff9db"
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
      4,
      0,
      0
    ],
    [
      3,
      4,
      0,
      3,
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
      5,
      0,
      6,
      0,
      0
    ],
    [
      8,
      8,
      0,
      9,
      0,
      0
    ],
    [
      9,
      9,
      0,
      10,
      0,
      0
    ],
    [
      10,
      11,
      0,
      13,
      0,
      0
    ],
    [
      11,
      13,
      0,
      14,
      0,
      0
    ],
    [
      12,
      14,
      0,
      15,
      0,
      0
    ],
    [
      14,
      15,
      0,
      17,
      0,
      0
    ],
    [
      17,
      22,
      0,
      25,
      0,
      0
    ],
    [
      18,
      25,
      0,
      24,
      0,
      0
    ],
    [
      19,
      24,
      0,
      23,
      0,
      0
    ],
    [
      20,
      23,
      0,
      26,
      0,
      0
    ],
    [
      21,
      12,
      0,
      27,
      0,
      0
    ],
    [
      22,
      27,
      0,
      17,
      1,
      0
    ],
    [
      23,
      28,
      0,
      26,
      1,
      0
    ],
    [
      24,
      29,
      0,
      28,
      0,
      0
    ],
    [
      25,
      26,
      0,
      31,
      0,
      0
    ],
    [
      26,
      17,
      0,
      30,
      0,
      0
    ],
    [
      27,
      30,
      0,
      32,
      0,
      0
    ],
    [
      28,
      31,
      0,
      32,
      1,
      0
    ],
    [
      29,
      32,
      0,
      34,
      0,
      0
    ],
    [
      30,
      34,
      0,
      33,
      0,
      0
    ],
    [
      31,
      33,
      0,
      35,
      0,
      0
    ],
    [
      32,
      10,
      0,
      36,
      0,
      0
    ],
    [
      33,
      35,
      0,
      36,
      1,
      0
    ],
    [
      34,
      36,
      0,
      39,
      0,
      0
    ],
    [
      35,
      39,
      0,
      37,
      0,
      0
    ],
    [
      36,
      37,
      0,
      38,
      0,
      0
    ],
    [
      37,
      38,
      0,
      40,
      0,
      0
    ],
    [
      39,
      6,
      0,
      42,
      0,
      0
    ],
    [
      40,
      43,
      0,
      44,
      0,
      0
    ],
    [
      41,
      44,
      0,
      42,
      1,
      0
    ],
    [
      42,
      42,
      0,
      8,
      0,
      0
    ],
    [
      43,
      2,
      1,
      4,
      1,
      "string"
    ],
    [
      44,
      2,
      2,
      4,
      2,
      "string"
    ],
    [
      45,
      40,
      0,
      45,
      0,
      0
    ],
    [
      46,
      47,
      1,
      51,
      1,
      "AGV"
    ],
    [
      47,
      49,
      1,
      47,
      1,
      "AGV"
    ],
    [
      48,
      50,
      1,
      49,
      1,
      "AGV"
    ],
    [
      49,
      51,
      1,
      48,
      1,
      "AGV"
    ],
    [
      50,
      48,
      1,
      46,
      1,
      "AGV"
    ],
    [
      51,
      46,
      1,
      50,
      1,
      "AGV"
    ],
    [
      52,
      52,
      0,
      50,
      0,
      0
    ],
    [
      53,
      47,
      0,
      53,
      0,
      0
    ],
    [
      54,
      53,
      0,
      55,
      0,
      0
    ],
    [
      55,
      54,
      0,
      52,
      0,
      0
    ],
    [
      56,
      63,
      0,
      66,
      0,
      0
    ],
    [
      57,
      59,
      0,
      63,
      0,
      0
    ],
    [
      58,
      59,
      1,
      56,
      1,
      "AGV"
    ],
    [
      59,
      56,
      1,
      60,
      1,
      "AGV"
    ],
    [
      60,
      60,
      1,
      61,
      1,
      "AGV"
    ],
    [
      61,
      61,
      1,
      62,
      1,
      "AGV"
    ],
    [
      62,
      64,
      0,
      62,
      0,
      0
    ],
    [
      63,
      65,
      0,
      64,
      0,
      0
    ],
    [
      64,
      62,
      1,
      57,
      1,
      "AGV"
    ],
    [
      65,
      57,
      1,
      59,
      1,
      "AGV"
    ]
  ],
  "groups": [
    {
      "title": "Group",
      "bounding": [
        20,
        -1853,
        2054,
        759
      ],
      "color": "#3f789e"
    },
    {
      "title": "Group",
      "bounding": [
        94,
        -927,
        1825,
        653
      ],
      "color": "#3f789e"
    }
  ],
  "config": {},
  "extra": {},
  "version": 0.4
};

