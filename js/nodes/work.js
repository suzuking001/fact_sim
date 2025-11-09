// Work data model and global counter (browser global scope)
// Keep 'var' so it attaches to window and is shared across files
var workCounter = 0;

class Work{
  constructor(id = null, type = 'A'){
    this.id = id;
    this.type = type;
  }
  toString(){ return `ID:${this.id},Type:${this.type}`; }
}

// expose for other scripts (optional – class is also global in browsers)
window.Work = Work;

