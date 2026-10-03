import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FactSimRuntime } from '../dist/fact-sim-runtime.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(repoRoot, 'artifacts/view3d');
const temporary = path.join(repoRoot, 'tmp');
const runtime = new FactSimRuntime({ repoRoot, preferredPort:0 });
const report = { date:new Date().toISOString(), checks:[], pageErrors:[], resourceErrors:[], consoleErrors:[] };
await fs.mkdir(output, { recursive:true });
await fs.mkdir(temporary, { recursive:true });
async function check(name, fn){
  try { const detail = await fn(); report.checks.push({ name, ok:true, detail }); }
  catch(error){ report.checks.push({ name, ok:false, error:error.stack }); throw error; }
}
const counters = page => page.evaluate(() => ({ frames:App.view3d.viewer.frames, snapshots:App.view3d.viewer.snapshots,
  meshes:App.view3d.viewer.scene.meshes.length, textures:App.view3d.viewer.scene.textures.length,
  materials:App.view3d.viewer.scene.materials.length, loops:App.view3d.viewer.engine._activeRenderLoops.length }));

try {
  const page = await runtime.ensureReady();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if(['error','warning'].includes(message.type())) report.consoleErrors.push(message.text()); });
  page.on('response', response => { if(response.status() >= 400) report.resourceErrors.push({ url:response.url(), status:response.status() }); });
  await runtime.reloadPage(); // always test the newly edited scripts
  await runtime.stopSimulation();
  await page.evaluate(() => {
    document.body.classList.add('landing-hidden');
    document.getElementById('appRoot').setAttribute('aria-hidden', 'false');
  });
  await check('lazy Babylon load and empty Scene', async () => {
    assert.equal(await page.evaluate(() => !!window.BABYLON), false);
    await runtime.clearGraph();
    await page.locator('#visualizationTab3D').click();
    await page.waitForFunction(() => App.view3d.viewer?.active);
    const state = await page.evaluate(() => ({ nodes:App.view3d.viewer.nodes.entries.size,
      ground:!!App.view3d.viewer.sceneManager.ground, camera:!!App.view3d.viewer.scene.activeCamera,
      lights:App.view3d.viewer.scene.lights.length }));
    assert.equal(state.nodes, 0); assert.equal(state.ground, true); assert.equal(state.camera, true); assert.ok(state.lights > 0);
    return state;
  });
  await runtime.loadExample('simple');
  await page.waitForFunction(() => App.view3d.viewer.nodes.entries.size === App.graph._nodes.length && App.graph._nodes.length > 0);
  await check('legacy layout, connections, shared palette, read-only plain snapshots', async () => {
    const result = await page.evaluate(() => {
      const before = JSON.stringify(App.serializeGraphData());
      const snapshot = App.getVisualizationState();
      const clone = JSON.parse(JSON.stringify(snapshot));
      const correctPositions = snapshot.nodes.every(node => {
        const position = FactSim3D.nodePosition(node), entry = App.view3d.viewer.nodes.entries.get(node.id);
        return Math.abs(position.x - entry.parent.position.x) < 1e-7 && Math.abs(position.z - entry.parent.position.z) < 1e-7;
      });
      return { unchanged:before === JSON.stringify(App.serializeGraphData()), plain:JSON.stringify(clone) === JSON.stringify(snapshot),
        noGraph:!JSON.stringify(snapshot).includes('_flowRuntime'), correctPositions,
        nodes:snapshot.nodes.length, links:snapshot.connections.length,
        colors:snapshot.nodes.every(node => node.color === _getNodeStatePalette(node.state).accent) };
    });
    for(const key of ['unchanged','plain','noGraph','correctPositions','colors']) assert.equal(result[key], true, key);
    assert.ok(result.nodes > 0); assert.ok(result.links > 0);
    return result;
  });
  await check('2D selection → highlight and 3D click → existing inspector', async () => {
    await page.evaluate(() => App.canvas.selectNodes([App.graph._nodes[1]], false));
    await page.waitForFunction(() => App.view3d.viewer.nodes.entries.get(App.graph._nodes[1].id).mesh.renderOutline);
    await page.locator('[data-camera3d="top"]').click();
    await page.locator('[data-camera3d="fit"]').click();
    const target = await page.evaluate(() => {
      const viewer = App.view3d.viewer, node = App.graph._nodes[0], mesh = viewer.nodes.entries.get(node.id).mesh;
      const engine = viewer.engine, camera = viewer.camera.camera;
      const point = BABYLON.Vector3.Project(mesh.getAbsolutePosition(), BABYLON.Matrix.Identity(), viewer.scene.getTransformMatrix(),
        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      const rect = viewer.canvas.getBoundingClientRect();
      return { id:node.id, x:rect.left + point.x * rect.width / engine.getRenderWidth(), y:rect.top + point.y * rect.height / engine.getRenderHeight() };
    });
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(id => App.canvas.selected_nodes[id] && App.selectionInspector.target.nodeId === id, target.id);
    return { selectedNodeId:target.id };
  });
  await check('camera, labels and connection controls', async () => {
    await page.locator('[data-camera3d="focus"]').click();
    await page.locator('[data-camera3d="fit"]').click();
    assert.equal(await page.evaluate(() => App.view3d.viewer.camera.camera.mode === BABYLON.Camera.ORTHOGRAPHIC_CAMERA), true);
    assert.ok(await page.evaluate(() => App.view3d.viewer.camera.camera.beta < 0.01));
    await page.locator('#view3dLabels').uncheck(); await page.locator('#view3dConnections').uncheck();
    assert.equal(await page.evaluate(() => [...App.view3d.viewer.labels.labels.values()].every(row => !row.mesh.isEnabled()) && !App.view3d.viewer.connections.mesh.isEnabled()), true);
    await page.locator('#view3dLabels').check(); await page.locator('#view3dConnections').check();
    await page.locator('[data-camera3d="perspective"]').click();
    assert.equal(await page.evaluate(() => App.view3d.viewer.camera.camera.mode === BABYLON.Camera.PERSPECTIVE_CAMERA), true);
    assert.ok(await page.evaluate(() => Math.abs(App.view3d.viewer.camera.camera.beta - Math.PI / 3) < 0.01));
  });
  await check('live Work motion, node state and final snapshot', async () => {
    await runtime.setPlaybackSpeed(1, false);
    await runtime.startSimulation();
    await page.waitForFunction(() => App.getVisualizationState().works.some(work => !work.stationary && work.progress > 0 && work.progress < 1));
    const before = await page.evaluate(() => App.getVisualizationState());
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => App.getVisualizationState());
    assert.ok(after.time > before.time);
    assert.ok(after.works.some(work => { const old = before.works.find(row => row.id === work.id); return old && work.from === old.from && work.to === old.to && work.progress > old.progress; }));
    assert.ok(after.nodes.some(node => node.state === 'PROCESS'));
    assert.ok(await page.evaluate(() => [...App.view3d.viewer.works.entries.values()].some(entry => BABYLON.Vector3.Distance(entry.previous, entry.target) > 0)));
    await runtime.stopSimulation();
    await page.waitForFunction(() => App.view3d.viewer.state.time === simNow() / 1000 && !App.view3d.viewer.state.running);
    await page.screenshot({ path:path.join(temporary, 'view3d-perspective.png') });
    return { fromTime:before.time, toTime:after.time, works:after.works.length };
  });
  await check('FASTEST stops snapshot / render and restores final state', async () => {
    await runtime.setPlaybackSpeed(undefined, true); await runtime.startSimulation();
    await page.waitForFunction(() => !App.view3d.viewer.active);
    const before = await counters(page);
    await page.waitForTimeout(220);
    const after = await counters(page);
    assert.equal(after.frames, before.frames); assert.equal(after.snapshots, before.snapshots);
    await runtime.stopSimulation();
    await page.waitForFunction(() => App.view3d.viewer.active && App.view3d.viewer.state.time === simNow() / 1000);
    await runtime.setPlaybackSpeed(1, false);
    return { pausedFrames:after.frames, pausedSnapshots:after.snapshots };
  });
  await check('hidden view has zero 3D update and tab switches reuse resources', async () => {
    const baseline = await counters(page);
    await page.locator('#visualizationTabGraph').click();
    const hiddenBefore = await counters(page); await page.waitForTimeout(200); const hiddenAfter = await counters(page);
    assert.equal(hiddenAfter.frames, hiddenBefore.frames); assert.equal(hiddenAfter.snapshots, hiddenBefore.snapshots);
    assert.equal(hiddenAfter.loops, 0); assert.equal(await page.evaluate(() => App.view3d.timer), null);
    for(let i = 0; i < 8; i++){
      await page.locator('#visualizationTab3D').click(); await page.waitForFunction(() => App.view3d.viewer.active);
      await page.locator('#visualizationTabGraph').click();
    }
    await page.locator('#visualizationTab3D').click(); await page.waitForFunction(() => App.view3d.viewer.active);
    const final = await counters(page);
    for(const key of ['meshes','textures','materials']) assert.equal(final[key], baseline[key], key);
    assert.equal(final.loops, 1);
    return { switches:8, resources:final };
  });
  await check('optional view3d save/load and reset compatibility', async () => {
    const result = await page.evaluate(() => {
      const node = App.graph._nodes[1];
      node.view3d = { height:1.7, rotation:35, scale:1.1 };
      App.graph._nodes[2].properties.view3d = { kind:'buffer', height:0.6 };
      const saved = App.serializeGraphDataForSave();
      const rootAttributes = saved.nodes.find(row => row.id === node.id).view3d;
      App.applyGraphData(saved, { source:'file', fitViewport:false });
      const restored = App.graph.getNodeById(node.id);
      return { rootAttributes, restored:restored.view3d,
        buffer:App.getVisualizationState().nodes.find(row => row.id === App.graph._nodes[2].id).kind };
    });
    assert.deepEqual(result.restored, result.rootAttributes); assert.equal(result.buffer, 'buffer');
    await page.waitForTimeout(120);
    await page.locator('#btnReset').click();
    assert.equal(await page.evaluate(() => simNow()), 0);
    return result;
  });
  await check('actual GLB loader, optional model replacement and disposal', async () => {
    // Minimal valid glTF triangle with an embedded buffer; no downloaded model.
    const binary = Buffer.alloc(36);
    [0,0,0, 1,0,0, 0,1,0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
    const gltf = { asset:{ version:'2.0' }, buffers:[{ byteLength:36 }], bufferViews:[{ buffer:0, byteOffset:0, byteLength:36 }],
      accessors:[{ bufferView:0, componentType:5126, count:3, type:'VEC3', min:[0,0,0], max:[1,1,0] }],
      meshes:[{ primitives:[{ attributes:{ POSITION:0 } }] }], nodes:[{ mesh:0 }], scenes:[{ nodes:[0] }], scene:0 };
    const json = Buffer.from(JSON.stringify(gltf));
    const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
    await fs.writeFile(path.join(temporary, 'view3d-fixture.glb'), Buffer.concat([header, padded, binHeader, binary]));
    await page.evaluate(() => {
      FactSim3D.models.register('test-model', 'tmp/view3d-fixture.glb');
      App.graph._nodes[1].properties.view3d = { model:'test-model' }; delete App.graph._nodes[1].view3d;
    });
    await page.waitForFunction(() => !!App.view3d.viewer.nodes.entries.get(App.graph._nodes[1].id).model);
    // Verify the imported model reaches a ready scene before testing disposal.
    // Removing it during parallel shader compilation can produce driver warnings.
    await page.waitForFunction(() => App.view3d.viewer.scene.isReady());
    await page.evaluate(() => { delete App.graph._nodes[1].properties.view3d; });
    await page.waitForFunction(() => !App.view3d.viewer.nodes.entries.get(App.graph._nodes[1].id).model);
  });
  await check('resize and mobile Graph / 3D / Run / Timeline navigation', async () => {
    await page.locator('#aiPanelClose').click();
    await page.setViewportSize({ width:390, height:844 });
    await page.locator('[data-mobile-panel="3d"]').click();
    await page.waitForFunction(() => App.view3d.viewer.active && App.view3d.canvas.clientWidth > 0 && App.view3d.canvas.clientHeight > 0);
    const size = await page.evaluate(() => {
      const viewer = App.view3d.viewer;
      return { width:viewer.canvas.clientWidth, height:viewer.canvas.clientHeight,
        aspect:viewer.engine.getRenderWidth() / viewer.engine.getRenderHeight() };
    });
    assert.ok(Math.abs(size.aspect - size.width / size.height) < 0.01);
    await page.locator('[data-mobile-panel="run"]').click(); await page.waitForFunction(() => !App.view3d.viewer.active);
    await page.locator('[data-mobile-panel="timeline"]').click();
    await page.locator('[data-mobile-panel="3d"]').click(); await page.waitForFunction(() => App.view3d.viewer.active);
    await page.locator('[data-camera3d="top"]').click();
    await page.screenshot({ path:path.join(temporary, 'view3d-mobile.png') });
    await page.locator('[data-mobile-panel="graph"]').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('view3d-active')), false);
    await page.setViewportSize({ width:1440, height:900 });
    await page.locator('#visualizationTab3D').click();
    await page.waitForFunction(() => App.view3d.viewer.active);
    await page.locator('[data-camera3d="top"]').click(); await page.locator('[data-camera3d="fit"]').click();
    await page.screenshot({ path:path.join(temporary, 'view3d-top.png') });
    return size;
  });
  await check('existing docks and Graph editing still work', async () => {
    for(const id of ['timelineTabChart','timelineTabProps','timelineTabInspector']) await page.locator('#' + id).click();
    await page.locator('#visualizationTabGraph').click();
    const original = await page.evaluate(() => App.graph._nodes[1].pos[0]);
    await page.evaluate(() => { App.graph._nodes[1].pos[0] += 50; App.canvas.setDirty(true, true); });
    await page.locator('#visualizationTab3D').click();
    await page.waitForFunction(x => App.view3d.viewer.state.nodes[1].position[0] === x + 50, original);
  });
  await check('resource and browser console cleanliness', async () => {
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceErrors, []); assert.deepEqual(report.consoleErrors, []);
  });
  await check('failed Babylon load is isolated; Retry recovers', async () => {
    const failurePage = await page.context().newPage();
    await failurePage.route('**/js/vendor/babylon/babylon.js', route => route.abort());
    await failurePage.goto(page.url());
    await failurePage.waitForFunction(() => App.graph && App.view3d);
    await failurePage.evaluate(() => { stopSimulation(); document.body.classList.add('landing-hidden'); });
    await failurePage.locator('#visualizationTab3D').click();
    await failurePage.waitForFunction(() => !document.getElementById('view3dRetry').hidden);
    assert.match(await failurePage.locator('#view3dMessage').innerText(), /could not be initialized/);
    await failurePage.locator('#visualizationTabGraph').click();
    assert.equal(await failurePage.evaluate(() => getComputedStyle(document.getElementById('graph')).visibility), 'visible');
    await failurePage.locator('#visualizationTab3D').click();
    await failurePage.waitForFunction(() => !document.getElementById('view3dRetry').hidden);
    await failurePage.unroute('**/js/vendor/babylon/babylon.js');
    await failurePage.locator('#view3dRetry').click();
    await failurePage.waitForFunction(() => App.view3d.viewer?.active);
    await failurePage.close();
  });
  report.status = 'PASS';
}catch(error){ report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
  await runtime.close();
}
console.log(JSON.stringify({ status:report.status, checks:report.checks.map(({ name, ok, error }) => ({ name, ok, error })),
  errors:report.error, report:'artifacts/view3d/verification.json' }, null, 2));
