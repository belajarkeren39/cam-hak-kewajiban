/* Pelacakan 21 landmark telapak, diadaptasi dari PalmOnlyDetector pada index.html pengguna.
   Semua koordinat hit-test menggunakan piksel viewport aktual dari arena 16:9. */
class PalmOnlyDetector {
  constructor(video,canvas){this.video=video;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.stream=null;this.model=null;this.modelPromise=null;this.ready=false;this.hands=[];this.lastVideoTime=-1;this.lastInference=-Infinity;this.generation=0;}
  async initModel(){
    if(this.model)return this.model;
    if(this.modelPromise)return this.modelPromise;
    this.modelPromise=(async()=>{
      const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:4,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
      try{this.model=await HandLandmarker.createFromOptions(files,options);}catch(error){options.baseOptions.delegate='CPU';this.model=await HandLandmarker.createFromOptions(files,options);}
      return this.model;
    })();
    try{return await this.modelPromise;}finally{this.modelPromise=null;}
  }
  async start(){
    const generation=++this.generation;this.ready=false;this.hands=[];
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Browser ini belum menyediakan kamera. Buka melalui HTTPS atau gunakan kontrol sentuh.');
    this.stream?.getTracks().forEach(track=>track.stop());
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}});
    if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return false;}
    this.stream=stream;this.video.srcObject=stream;await this.video.play();
    let timeout;
    try{await Promise.race([this.initModel(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Sensor belum selesai dimuat. Periksa internet, lalu coba lagi.')),25000);})]);}finally{clearTimeout(timeout);}
    if(generation!==this.generation)return false;
    this.lastVideoTime=-1;this.lastInference=-Infinity;this.ready=true;return true;
  }
  stop(){this.generation++;this.ready=false;this.hands=[];this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.video.srcObject=null;this.draw();}
  getVideoDisplayBox(){
    const rect=this.video.getBoundingClientRect();const vw=this.video.videoWidth||1280,vh=this.video.videoHeight||720;
    const scale=Math.max(rect.width/vw,rect.height/vh);
    return {renderW:vw*scale,renderH:vh*scale,offsetX:rect.left+(rect.width-vw*scale)/2,offsetY:rect.top+(rect.height-vh*scale)/2};
  }
  isValidPalmGeometry(lm){if(!lm||lm.length!==21)return false;const length=Math.hypot(lm[9].x-lm[0].x,lm[9].y-lm[0].y);const width=Math.hypot(lm[17].x-lm[5].x,lm[17].y-lm[5].y);return length>.012&&length<.65&&width>.01&&width<.65;}
  readHands(now){
    if(!this.ready||!this.model||this.video.readyState<2){this.hands=[];return [];}
    if(now-this.lastInference>=50&&this.video.currentTime!==this.lastVideoTime){
      this.lastVideoTime=this.video.currentTime;this.lastInference=now;
      try{
        const result=this.model.detectForVideo(this.video,now);const box=this.getVideoDisplayBox();const old=this.hands;
        this.hands=(result.landmarks||[]).filter(lm=>this.isValidPalmGeometry(lm)).map(lm=>{
          const points=lm.map(p=>({x:box.offsetX+(1-p.x)*box.renderW,y:box.offsetY+p.y*box.renderH}));
          const ids=[0,5,9,13,17];let x=ids.reduce((sum,i)=>sum+points[i].x,0)/5,y=ids.reduce((sum,i)=>sum+points[i].y,0)/5;
          const previous=old.find(hand=>Math.hypot(hand.x-x,hand.y-y)<this.video.clientWidth*.12);
          if(previous){x=previous.x*.25+x*.75;y=previous.y*.25+y*.75;}
          return{x,y,points,lastSeen:now};
        });
      }catch(error){this.hands=[];this.ready=false;this.error='Sensor terhenti. Gunakan sentuh atau aktifkan ulang dari beranda.';}
    }
    // Memori kursor tidak boleh memilih jawaban jika video membeku atau telapak hilang.
    this.hands=this.hands.filter(hand=>now-hand.lastSeen<140);return this.hands;
  }
  hitTest(rects,hands){
    const hits=new Set();
    for(const hand of hands){let chosen=-1,best=Infinity;
      rects.forEach((r,i)=>{const pad=Math.min(r.width,r.height)*.04;
        if(hand.x>=r.left+pad&&hand.x<=r.right-pad&&hand.y>=r.top+pad&&hand.y<=r.bottom-pad){const distance=Math.hypot(hand.x-(r.left+r.right)/2,hand.y-(r.top+r.bottom)/2);if(distance<best){chosen=i;best=distance;}}});
      if(chosen!==-1)hits.add(chosen);
    }
    return hits.size===1?[...hits][0]:-1;
  }
  hitTestCircles(circles,hands){
    const hits=new Set();
    for(const hand of hands){let chosen=-1,best=Infinity;
      circles.forEach((c,i)=>{if(c.r<2)return;const d=Math.hypot(hand.x-c.x,hand.y-c.y);if(d<=c.r*.88&&d<best){chosen=i;best=d;}});
      if(chosen!==-1)hits.add(chosen);
    }
    return hits.size===1?[...hits][0]:-1;
  }
  draw(){
    const r=this.canvas.getBoundingClientRect();const ratio=Math.min(window.devicePixelRatio||1,2);
    const width=Math.round(r.width*ratio),height=Math.round(r.height*ratio);if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const c=this.ctx;c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,r.width,r.height);
    const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
    for(const hand of this.hands){c.strokeStyle='#74f3ceaa';c.lineWidth=Math.max(1.5,r.width/600);for(const [a,b]of connections){c.beginPath();c.moveTo(hand.points[a].x-r.left,hand.points[a].y-r.top);c.lineTo(hand.points[b].x-r.left,hand.points[b].y-r.top);c.stroke();}
      const radius=Math.max(6,r.width*.009);c.beginPath();c.fillStyle='#ffd66b';c.arc(hand.x-r.left,hand.y-r.top,radius,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();}
  }
}
// Unité sensor: waktu tahan hanya bertambah ketika target benar-benar terdeteksi.
class HoldSelector {
  constructor(duration=2000){this.duration=duration;this.reset();this.needsRelease=false;this.quietMs=0;}
  reset(){this.target=-1;this.elapsed=0;this.gap=0;}
  requireRelease(){this.reset();this.needsRelease=true;this.quietMs=0;}
  step(target,delta,enabled=true){
    const dt=Math.min(100,Math.max(0,delta));
    if(this.needsRelease){this.quietMs=target===-1?this.quietMs+dt:0;if(this.quietMs>=400){this.needsRelease=false;this.quietMs=0;}return -1;}
    if(!enabled){this.reset();return -1;}
    if(target===-1){this.gap+=dt;if(this.gap>180)this.reset();return -1;}
    if(target!==this.target){this.target=target;this.elapsed=0;}else{this.elapsed+=dt;}
    this.gap=0;return this.elapsed>=this.duration?this.target:-1;
  }
  get progress(){return Math.min(1,this.elapsed/this.duration);}
}
