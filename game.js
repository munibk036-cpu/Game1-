(() => {
  const sceneRoot = document.getElementById('scene');
  const speedEl = document.getElementById('speed');
  const scoreEl = document.getElementById('score');
  const messageEl = document.getElementById('message');
  const cameraBtn = document.getElementById('cameraBtn');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  let scene, camera, renderer, player, roadGroup, traffic = [], scenery = [];
  let running = false, gameOver = false, firstPerson = false;
  let speed = 0, score = 0, playerX = 0, steer = 0;
  let lastTime = 0, spawnTimer = 0, roadOffset = 0;
  const keys = {left:false,right:false,gas:false,brake:false};
  const ROAD_WIDTH = 12;
  const clamp = (v,min,max) => Math.max(min, Math.min(max,v));

  function mat(color, roughness=0.8) { return new THREE.MeshStandardMaterial({color, roughness}); }
  function box(w,h,d, material, x=0,y=0,z=0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
    mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  function buildCar(color, isPlayer=false) {
    const group = new THREE.Group();
    const body = box(1.55,0.48,2.65,mat(color),0,0.58,0);
    const cabin = box(1.12,0.48,1.2,mat(0x9dddf2,0.25),0,1.02,-0.12);
    group.add(body,cabin);
    const bumperMat = mat(0x20252b);
    group.add(box(1.48,0.15,0.2,bumperMat,0,0.43,1.31));
    group.add(box(1.48,0.15,0.2,bumperMat,0,0.43,-1.31));
    const tireMat = mat(0x17191c);
    for (const x of [-0.82,0.82]) for (const z of [-0.85,0.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.18,16), tireMat);
      wheel.rotation.z = Math.PI/2; wheel.position.set(x,0.31,z); wheel.castShadow=true; group.add(wheel);
    }
    const lightMat = mat(isPlayer ? 0xfff3a0 : 0xffeeee,0.3);
    group.add(box(0.32,0.12,0.06,lightMat,-0.48,0.62,1.34));
    group.add(box(0.32,0.12,0.06,lightMat,0.48,0.62,1.34));
    return group;
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ed0f2);
    scene.fog = new THREE.Fog(0x8ed0f2, 45, 190);
    camera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 300);
    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sceneRoot.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdff5ff,0x63734b,2.0));
    const sun = new THREE.DirectionalLight(0xffffff,2.1);
    sun.position.set(-20,35,10); sun.castShadow=true; scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500),mat(0x4c9b4b));
    ground.rotation.x=-Math.PI/2; ground.position.y=-0.12; ground.receiveShadow=true; scene.add(ground);

    roadGroup = new THREE.Group(); scene.add(roadGroup);
    roadGroup.add(box(ROAD_WIDTH,0.12,240,mat(0x343a40),0,-0.02,-75));
    // road edges and dashed center markings
    for (const x of [-ROAD_WIDTH/2+0.18, ROAD_WIDTH/2-0.18]) {
      roadGroup.add(box(0.12,0.025,240,mat(0xffffff),x,0.055,-75));
    }
    for(let i=0;i<24;i++) roadGroup.add(box(0.13,0.035,3.0,mat(0xfff6cf),0,0.06,-i*10));
    // roadside trees and lamps
    for(let i=0;i<36;i++) {
      for(const side of [-1,1]) {
        const z=-i*7-8;
        const x=side*(9+Math.random()*8);
        const trunk=box(0.38,2.3,0.38,mat(0x72502e),x,1.05,z);
        const crown=new THREE.Mesh(new THREE.ConeGeometry(1.5,3.4,7),mat(i%2?0x1e713e:0x2b8246));
        crown.position.set(x,3.2,z); crown.castShadow=true;
        scene.add(trunk,crown); scenery.push(trunk,crown);
      }
    }
    player=buildCar(0xff3d38,true); player.position.set(0,0,4); scene.add(player);
    resetTraffic();
    updateCamera();
    window.addEventListener('resize',onResize);
    bindControls();
    animate(0);
  }

  function resetTraffic() {
    for(const car of traffic) scene.remove(car.mesh);
    traffic=[];
    for(let i=0;i<5;i++) spawnTraffic(-35-i*28);
  }
  function spawnTraffic(z=-150) {
    const colors=[0x2684ff,0xffb52e,0xe7e7e7,0x8e54d8,0x27b36a,0xe74b91];
    const lanes=[-3.5,0,3.5];
    const mesh=buildCar(colors[Math.floor(Math.random()*colors.length)]);
    mesh.position.set(lanes[Math.floor(Math.random()*lanes.length)],0,z);
    scene.add(mesh); traffic.push({mesh, lane:mesh.position.x, speed: 8+Math.random()*13});
  }
  function bindPress(id,key) {
    const el=document.getElementById(id);
    const down=e=>{e.preventDefault(); keys[key]=true;};
    const up=e=>{e.preventDefault(); keys[key]=false;};
    el.addEventListener('pointerdown',down);
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,up));
  }
  function bindControls() {
    bindPress('leftBtn','left'); bindPress('rightBtn','right');
    bindPress('gasBtn','gas'); bindPress('brakeBtn','brake');
    startBtn.addEventListener('click',()=>{if(gameOver) resetGame(); running=true; startBtn.textContent='Ⅱ PAUSE RACE'; messageEl.textContent='Race started! Avoid other cars.';});
    startBtn.addEventListener('dblclick',()=>{running=false;startBtn.textContent='▶ RESUME RACE';messageEl.textContent='Race paused';});
    restartBtn.addEventListener('click',resetGame);
    cameraBtn.addEventListener('click',()=>{firstPerson=!firstPerson;updateCamera();});
    window.addEventListener('keydown',e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=true;
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=true;
      if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')keys.gas=true;
      if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')keys.brake=true;
      if(e.key.toLowerCase()==='c'){firstPerson=!firstPerson;updateCamera();}
      if(e.code==='Space'){running=!running;startBtn.textContent=running?'Ⅱ PAUSE RACE':'▶ RESUME RACE';messageEl.textContent=running?'Race resumed':'Race paused';}
    });
    window.addEventListener('keyup',e=>{
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;
      if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')keys.gas=false;
      if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')keys.brake=false;
    });
  }
  function updateCamera() {
    cameraBtn.textContent=firstPerson?'📷 Camera: First Person':'📷 Camera: Third Person';
    if(firstPerson) {
      camera.position.set(player.position.x,1.55,player.position.z+0.25);
      camera.rotation.set(-0.04,0,0);
    } else {
      camera.position.set(player.position.x,5.6,player.position.z+10.8);
      camera.lookAt(player.position.x,0.8,player.position.z-12);
    }
  }
  function resetGame() {
    running=false;gameOver=false;speed=0;score=0;playerX=0;steer=0;spawnTimer=0;
    player.position.set(0,0,4);player.rotation.set(0,0,0);
    resetTraffic();speedEl.textContent='0';scoreEl.textContent='0';
    startBtn.textContent='▶ START RACE';messageEl.textContent='Press START RACE to begin';
    updateCamera();
  }
  function crash() {
    gameOver=true;running=false;speed=0;
    startBtn.textContent='↻ TRY AGAIN';
    messageEl.textContent='🚧 Crash! Press TRY AGAIN or Restart.';
  }
  function onResize() {
    camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  }
  function animate(now) {
    requestAnimationFrame(animate);
    const dt=Math.min((now-lastTime)/1000||0,0.04);lastTime=now;
    if(running&&!gameOver) {
      if(keys.gas) speed=Math.min(170,speed+65*dt);
      else speed=Math.max(35,speed-9*dt);
      if(keys.brake) speed=Math.max(0,speed-100*dt);
      steer=(keys.left?-1:0)+(keys.right?1:0);
      playerX=clamp(playerX+steer*dt*(2.7+speed*0.018),-4.6,4.6);
      player.position.x=playerX;
      player.rotation.z=-steer*0.12;
      roadOffset += speed*dt*0.42;
      roadGroup.children.forEach(obj=>{
        if(obj.geometry && obj.geometry.parameters && obj.geometry.parameters.depth===3) {
          obj.position.z+=speed*dt*0.55;
          if(obj.position.z>8)obj.position.z-=240;
        }
      });
      for(const tree of scenery){tree.position.z+=speed*dt*0.55;if(tree.position.z>18)tree.position.z-=260;}
      spawnTimer+=dt;
      if(spawnTimer>2.2&&traffic.length<8){spawnTraffic(-155);spawnTimer=0;}
      for(const t of traffic) {
        t.mesh.position.z+= (speed*0.38-t.speed)*dt;
        if(t.mesh.position.z>15){scene.remove(t.mesh);traffic=traffic.filter(x=>x!==t);score+=100;}
        if(Math.abs(t.mesh.position.z-player.position.z)<2.5&&Math.abs(t.mesh.position.x-player.position.x)<1.45){crash();}
      }
      score+=Math.floor(speed*dt*0.08);
      speedEl.textContent=Math.round(speed);scoreEl.textContent=score;
    }
    updateCamera();
    renderer.render(scene,camera);
  }
  init();
})();