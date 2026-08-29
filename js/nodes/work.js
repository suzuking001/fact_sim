// Work / AGV data models and shared counters (attach to window scope)
var workCounter = 0;

class Work{
  constructor(id = null, type = 'A', typeId = ''){
    this.id = id;
    this.type = type;
    this.typeId = typeId || '';
    this.__flowCategory = 'work';
  }
  toString(){ return `ID:${this.id},Type:${this.type}`; }
}

class AGV{
  constructor(id, capacity = 1){
    this.id = id;
    this.capacity = Math.max(1, capacity|0);
    this.cargo = [];
    this.meta = {};
  }
  hasCapacity(){
    return this.cargo.length < this.capacity;
  }
  toString(){
    return `AGV(${this.id}) load=${this.cargo.length}/${this.capacity}`;
  }
}

window.Work = Work;
window.AGV = AGV;
