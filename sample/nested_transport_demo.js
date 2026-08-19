window.EXAMPLES = window.EXAMPLES || {};
window.EXAMPLES.nested_transport_demo = {
  "last_node_id": 9,
  "last_link_id": 8,
  "nodes": [
    {
      "id": 1,
      "type": "factory/entitysource",
      "pos": [40, 300],
      "size": [280, 165],
      "title": "① ワーク入りパレット P-1",
      "properties": {
        "rootKind": "pallet",
        "rootId": "P-1",
        "capacity": 4,
        "accepts": "work",
        "initialContents": "work:W-101\nwork:W-102\nwork:W-103\nwork:W-104"
      }
    },
    {
      "id": 2,
      "type": "factory/entitysource",
      "pos": [380, 40],
      "size": [280, 165],
      "title": "空AGV AGV-1",
      "properties": {
        "rootKind": "carrier",
        "rootId": "AGV-1",
        "capacity": 1,
        "accepts": "pallet",
        "initialContents": ""
      }
    },
    {
      "id": 3,
      "type": "factory/transferstation",
      "pos": [380, 300],
      "size": [300, 190],
      "title": "② パレットをAGVへ積載",
      "properties": {
        "preset": "pallet_to_agv",
        "operation": "load",
        "sourceKind": "any",
        "targetKind": "carrier",
        "itemKind": "pallet",
        "batchMode": "until-full",
        "quantity": 1,
        "relationMode": "towed",
        "searchDepth": "direct",
        "processTime": 1,
        "downTime": 0.2,
        "autoRelease": true
      }
    },
    {
      "id": 4,
      "type": "factory/carrierroute",
      "pos": [740, 300],
      "size": [280, 150],
      "title": "③ AGV搬送区間（4秒）",
      "properties": {
        "processTime": 4,
        "downTime": 0.5,
        "initialCarrier": "",
        "outSequence": "",
        "sigExtra": 0,
        "sigEnabled": true
      }
    },
    {
      "id": 5,
      "type": "factory/transferstation",
      "pos": [1080, 300],
      "size": [300, 190],
      "title": "④ AGVからパレットを荷降ろし",
      "properties": {
        "preset": "unload_one",
        "operation": "unload",
        "sourceKind": "carrier",
        "targetKind": "any",
        "itemKind": "pallet",
        "batchMode": "one",
        "quantity": 1,
        "relationMode": "inside",
        "searchDepth": "direct",
        "processTime": 1,
        "downTime": 0.2,
        "autoRelease": true
      }
    },
    {
      "id": 6,
      "type": "factory/entitysource",
      "pos": [1440, 40],
      "size": [280, 165],
      "title": "空コンテナ C-1",
      "properties": {
        "rootKind": "container",
        "rootId": "C-1",
        "capacity": 1,
        "accepts": "pallet",
        "initialContents": ""
      }
    },
    {
      "id": 7,
      "type": "factory/transferstation",
      "pos": [1440, 300],
      "size": [300, 190],
      "title": "⑤ パレットをコンテナへ格納",
      "properties": {
        "preset": "pallet_to_container",
        "operation": "load",
        "sourceKind": "any",
        "targetKind": "container",
        "itemKind": "pallet",
        "batchMode": "until-full",
        "quantity": 1,
        "relationMode": "inside",
        "searchDepth": "direct",
        "processTime": 1,
        "downTime": 0.2,
        "autoRelease": true
      }
    },
    {
      "id": 8,
      "type": "factory/entitysource",
      "pos": [1800, 40],
      "size": [280, 165],
      "title": "空の船 Ship-1",
      "properties": {
        "rootKind": "ship",
        "rootId": "Ship-1",
        "capacity": 1,
        "accepts": "container",
        "initialContents": ""
      }
    },
    {
      "id": 9,
      "type": "factory/transferstation",
      "pos": [1800, 300],
      "size": [320, 205],
      "title": "⑥ コンテナを船へ積載（最終状態）",
      "properties": {
        "preset": "container_to_ship",
        "operation": "load",
        "sourceKind": "any",
        "targetKind": "ship",
        "itemKind": "container",
        "batchMode": "until-full",
        "quantity": 1,
        "relationMode": "loaded",
        "searchDepth": "direct",
        "processTime": 1,
        "downTime": 0.2,
        "autoRelease": false
      }
    }
  ],
  "links": [
    [1, 1, 0, 3, 2, 0],
    [2, 2, 0, 3, 1, 0],
    [3, 3, 1, 4, 0, "AGV"],
    [4, 4, 0, 5, 0, "AGV"],
    [5, 5, 2, 7, 2, 0],
    [6, 6, 0, 7, 1, 0],
    [7, 7, 1, 9, 2, 0],
    [8, 8, 0, 9, 1, 0]
  ],
  "groups": [
    {
      "title": "STEP 1: ワーク入りパレットを準備",
      "bounding": [0, 0, 340, 560],
      "color": "#2d8f6f"
    },
    {
      "title": "STEP 2: パレットをAGVで搬送して荷降ろし",
      "bounding": [340, 0, 1080, 560],
      "color": "#3f789e"
    },
    {
      "title": "STEP 3: パレットをコンテナへ格納",
      "bounding": [1400, 0, 360, 560],
      "color": "#9a6b2f"
    },
    {
      "title": "STEP 4: コンテナを船へ積載",
      "bounding": [1760, 0, 400, 560],
      "color": "#7656a8"
    }
  ],
  "version": 0.4
};
