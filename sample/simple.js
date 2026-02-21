window.EXAMPLES = window.EXAMPLES || {};
window.EXAMPLES.simple = {
  "last_node_id": 4,
  "last_link_id": 3,
  "nodes": [
    {
      "id": 1,
      "type": "factory/source",
      "pos": [60, 200],
      "title": "Source",
      "properties": { "sequence": "A,B" }
    },
    {
      "id": 2,
      "type": "factory/equip",
      "pos": [360, 200],
      "title": "Equipment",
      "properties": { "processTime": 1, "downTime": 3 }
    },
    {
      "id": 3,
      "type": "factory/equip",
      "pos": [660, 200],
      "title": "Equipment",
      "properties": { "processTime": 1, "downTime": 3 }
    },
    {
      "id": 4,
      "type": "factory/sink",
      "pos": [960, 200],
      "title": "Sink",
      "properties": {}
    }
  ],
  "links": [
    [1, 1, 0, 2, 0, 0],
    [2, 2, 0, 3, 0, 0],
    [3, 3, 0, 4, 0, 0]
  ],
  "groups": [],
  "version": 0.4
};
